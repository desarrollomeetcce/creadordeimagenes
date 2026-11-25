import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { actor } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryKey } from "@/lib/meta-ads/category-paste";
import { catalog } from "@/lib/meta-ads/inventory-trials";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
export async function GET(request: NextRequest) {
  const viewer = await actor().catch(() => null);
  if (!viewer)
    return json(
      { error: "Inicia sesión para consultar las observaciones." },
      401,
    );
  if (viewer.role !== "OWNER")
    return json({ error: "Observaciones reservadas al propietario." }, 403);
  const q = request.nextUrl.searchParams;
  const aliasId = q.get("alias") ?? "",
    tableId = q.get("table") ?? "";
  const country = q.get("country") ?? "",
    offset = Number(q.get("offset") ?? 0);
  if (
    ![aliasId, tableId].every((id) => /^[\w:-]{1,200}$/.test(id)) ||
    !/^[A-Z]{2}$/.test(country) ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  )
    return json({ error: "Selecciona una ficha y un país válidos." }, 400);
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    return json(
      {
        error:
          "La conexión de observaciones con Mensajería aún no está configurada.",
      },
      503,
    );
  try {
    const external = await db.$transaction(
      async (tx) => {
        const alias = await tx.metaAlias.findFirst({
          where: {
            id: aliasId,
            tableId,
            inventorySheet: { kind: "INVENTORY", archivedAt: null },
          },
          select: { id: true, name: true, inventorySheetId: true },
        });
        if (!alias) return null;
        const item = (await catalog(tx, alias.inventorySheetId)).find(
          (row) => categoryKey(row.name) === categoryKey(alias.name),
        );
        return item?.sheets?.some((sheet) => sheet.id === tableId)
          ? { list: alias.inventorySheetId, item: item.id }
          : null;
      },
      { timeout: 10000 },
    );
    if (!external) return json({ notes: [], next: null });
    const payload = Buffer.from(
      JSON.stringify({
        ...external,
        country,
        offset,
        email: viewer.email.trim().toLowerCase(),
        exp: Math.floor(Date.now() / 1000) + 30,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", Buffer.from(key, "hex"))
      .update("pulpo-observations:v1:" + payload)
      .digest("base64url");
    const response = await fetch(
      "https://pulpo.agenciamagneto.org/api/integrations/generator-observations",
      {
        headers: { Authorization: "Pulpo " + payload + "." + signature },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(6000),
      },
    );
    if (response.status === 403)
      return json(
        {
          error:
            "El mismo correo necesita acceso de propietario o superadministrador en Mensajería.",
        },
        403,
      );
    if (!response.ok)
      return json(
        { error: "Mensajería todavía no pudo entregar las observaciones." },
        502,
      );
    return json(await response.json());
  } catch {
    return json(
      { error: "No se pudieron consultar las observaciones de Mensajería." },
      503,
    );
  }
}
