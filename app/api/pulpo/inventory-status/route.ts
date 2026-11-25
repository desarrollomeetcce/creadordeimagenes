import { z } from "zod";
import { actor, rateLimit } from "@/lib/auth";
import { db } from "@/lib/db";
import { localDay } from "@/lib/meta-ads/analytics";
import {
  authorizeFinancialRequest,
  financialContext,
} from "@/lib/meta-ads/financial-access";
import { inventoryActivationReport } from "@/lib/meta-ads/inventory-sheet-activation";
import { catalog } from "@/lib/meta-ads/inventory-trials";
import { accountWhere } from "@/lib/meta-ads/service";
import { categoryKey } from "@/lib/meta-ads/category-paste";

const messagingOrigin = "https://pulpo.agenciamagneto.org";
const headers = {
  "Access-Control-Allow-Origin": messagingOrigin,
  "Access-Control-Allow-Credentials": "true",
  "Cache-Control": "private, no-store",
  Vary: "Origin",
};
const id = z.string().regex(/^[\w:-]{1,200}$/);
const input = z.object({
  since: z.iso.date(),
  until: z.iso.date(),
  links: z
    .array(
      z.object({
        listId: id,
        itemId: id,
        country: z.string().regex(/^[A-Z]{2}$/),
      }),
    )
    .max(100),
});

export function OPTIONS(request: Request) {
  if (request.headers.get("origin") !== messagingOrigin)
    return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== messagingOrigin)
    return new Response(null, { status: 403 });
  const viewer = await actor().catch(() => null);
  if (!viewer)
    return Response.json(
      { error: "Inicia sesión en Generador." },
      { status: 401, headers },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json(
      { error: "Consulta inválida." },
      { status: 415, headers },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { error: "Consulta inválida." },
      { status: 400, headers },
    );
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 48_000) {
      await reader.cancel();
      return Response.json(
        { error: "Consulta demasiado grande." },
        { status: 413, headers },
      );
    }
    chunks.push(chunk.value);
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    body = null;
  }
  const parsed = input.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Consulta inválida." },
      { status: 400, headers },
    );
  const { since, until, links } = parsed.data;
  if (
    since > until ||
    until > localDay("America/Lima") ||
    Date.parse(until) - Date.parse(since) >= 31 * 86400000
  ) {
    return Response.json(
      { error: "Elige un periodo de hasta 31 días." },
      { status: 400, headers },
    );
  }
  const byList = new Map<string, typeof links>();
  for (const link of links) {
    const list = byList.get(link.listId) ?? [];
    list.push(link);
    byList.set(link.listId, list);
  }
  if (byList.size > 8)
    return Response.json(
      { error: "La consulta supera ocho inventarios." },
      { status: 400, headers },
    );

  try {
    await rateLimit("pulpo-inventory-status:" + viewer.id, 25);
  } catch {
    return Response.json(
      { error: "No se pudo consultar el estado en este momento." },
      { status: 429, headers },
    );
  }

  const statuses = [];
  for (const [listId, entries] of byList) {
    if (request.signal.aborted) break;
    const path = "inventory/sheet-activation/report";
    const authorized = await authorizeFinancialRequest(
      viewer,
      path,
      "GET",
      new URLSearchParams({ listId }),
      null,
      null,
    ).catch(() => null);
    if (!authorized) continue;
    const items = await catalog(db, listId);
    const byId = new Map(items.map((item) => [item.id, item]));
    const sheets = [
      ...new Set(
        entries.flatMap(({ itemId }) =>
          (byId.get(itemId)?.sheets ?? []).map(({ id }) => id),
        ),
      ),
    ];
    const scope = financialContext(authorized);
    const allowedSheets =
      scope && scope.scope !== "ALL"
        ? sheets.filter((sheet) => scope.tableIds.includes(sheet))
        : sheets;
    if (!allowedSheets.length || allowedSheets.length > 20) continue;
    const report = await inventoryActivationReport(authorized, {
      listId,
      tableIds: allowedSheets.join(","),
      since,
      until,
      byCountry: "true",
      summary: "true",
    }).catch(() => null);
    if (!report) continue;
    const activeCampaigns = await db.metaAdObject.findMany({
      where: {
        level: "campaign",
        effectiveStatus: "ACTIVE",
        aliasId: {
          in: [
            ...new Set(
              report.rows.flatMap((row) =>
                row.targets.map((target) => target.aliasId),
              ),
            ),
          ],
        },
        account: await accountWhere(authorized),
      },
      select: { aliasId: true, aliasCountry: true },
      distinct: ["aliasId", "aliasCountry"],
    });
    const activeAliases = new Set(
      activeCampaigns.map(({ aliasId, aliasCountry }) =>
        JSON.stringify([aliasId, aliasCountry]),
      ),
    );
    const byProductCountry = new Map<
      string,
      { states: Set<string>; inventoryActive: boolean; metaActive: boolean }
    >();
    for (const row of report.rows) {
      if (!row.country) continue;
      const key = JSON.stringify([categoryKey(row.name), row.country]);
      const entry = byProductCountry.get(key) ?? {
        states: new Set<string>(),
        inventoryActive: false,
        metaActive: false,
      };
      entry.states.add(row.cac?.meta.assessment.status ?? "PENDING");
      entry.inventoryActive ||=
        row.activation === "ACTIVE" || row.activation === "MIXED";
      entry.metaActive ||= row.targets.some(
        (target) =>
          target.country === row.country &&
          activeAliases.has(JSON.stringify([target.aliasId, target.country])),
      );
      byProductCountry.set(key, entry);
    }
    for (const entry of entries) {
      const item = byId.get(entry.itemId);
      if (!item) continue;
      const evaluation = byProductCountry.get(
        JSON.stringify([categoryKey(item.name), entry.country]),
      );
      statuses.push({
        ...entry,
        status:
          evaluation?.states.size === 1 ? [...evaluation.states][0] : "PENDING",
        inventoryActive: !!evaluation?.inventoryActive,
        metaActive: !!evaluation?.metaActive,
      });
    }
  }
  return Response.json({ statuses }, { headers });
}
