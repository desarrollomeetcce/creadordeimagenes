import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import {
  activationSettings,
  inventoryActivationReplaceBatch,
  inventoryReplacementBatchSchema,
} from "./inventory-sheet-activation";
import { accountWhere, type Actor } from "./service";
import { metaEditorOnly } from "./workspace-access";
import { categoryKey } from "./category-paste";
import { setMetaStatus } from "./manage";

/** Commit the atomic replacement once. External pauses have individual receipts, never rollback/retry spend. */
export async function inventoryMetaReplace(actor: Actor, input: unknown) {
  const b = inventoryReplacementBatchSchema
    .extend({ pauseNow: z.array(z.string().min(1).max(150)).max(100) })
    .strict()
    .parse(input);
  const names = new Set(b.replacements.map((r) => categoryKey(r.from.name)));
  demand(
    b.pauseNow.every((n) => names.has(categoryKey(n))),
    "Solo puedes pausar los diplomados salientes.",
  );
  const wanted = new Set(b.pauseNow.map(categoryKey));
  if (wanted.size) await metaEditorOnly(actor);
  const aliases = await db.metaAlias.findMany({
    where: { inventorySheetId: b.listId, tableId: b.tableId },
    select: { id: true, name: true },
  });
  const campaignScope = {
    level: "campaign",
    aliasCountry: b.country,
    aliasId: {
      in: aliases
        .filter((a) => names.has(categoryKey(a.name)))
        .map((a) => a.id),
    },
  };
  const sourceCampaigns = await db.metaAdObject.findMany({
    where: campaignScope,
    take: 1001,
    select: {
      id: true,
      name: true,
      status: true,
      aliasId: true,
      account: { select: { id: true } },
    },
  });
  demand(
    sourceCampaigns.length <= 1000,
    "Demasiadas campañas vinculadas. Reduce la selección.",
  );
  const campaigns = sourceCampaigns.filter((c) =>
    aliases.some((a) => a.id === c.aliasId && wanted.has(categoryKey(a.name))),
  );
  const allowed = await db.metaAdAccount.findMany({
    where: await accountWhere(actor),
    select: { id: true },
  });
  demand(
    campaigns.every((c) => allowed.some((a) => a.id === c.account.id)),
    "Hay campañas vinculadas fuera de tus cuentas autorizadas. Revisa el acceso antes de desactivar.",
    403,
  );
  const { pauseNow: _, ...replacement } = b;
  const saved = await db.$transaction(
    async (tx) => {
      const result = await inventoryActivationReplaceBatch(
        actor,
        replacement,
        tx,
      );
      const list = await tx.metaEffectivenessSheet.findUniqueOrThrow({
          where: { id: b.listId },
        }),
        settings = activationSettings(list.config);
      for (const pair of result.results) {
        const incoming = await tx.metaAlias.findFirstOrThrow({
          where: {
            inventorySheetId: b.listId,
            tableId: b.tableId,
            name: pair.to,
          },
        });
        const outgoing = aliases
          .filter((a) => categoryKey(a.name) === categoryKey(pair.from))
          .map((a) => a.id);
        const sources = sourceCampaigns.filter(
          (c) =>
            c.aliasId &&
            outgoing.includes(c.aliasId) &&
            allowed.some((a) => a.id === c.account.id),
        );
        const key = incoming.id + "|" + b.country;
        if (sources.length)
          settings.rows[key] = {
            ...settings.rows[key],
            pinned: settings.rows[key]?.pinned ?? false,
            metaOrigin: {
              accountIds: [...new Set(sources.map((c) => c.account.id))],
              campaignIds: sources.map((c) => c.id),
            },
          };
      }
      await tx.metaEffectivenessSheet.update({
        where: { id: list.id },
        data: {
          config: {
            ...(list.config as Record<string, Prisma.JsonValue>),
            inventoryActivation: settings as unknown as Prisma.InputJsonValue,
          },
          revision: { increment: 1 },
        },
      });
      return result;
    },
    { timeout: 120000 },
  );
  const warnings: string[] = [],
    receipts = [];
  for (const name of b.pauseNow)
    if (
      !campaigns.some((c) =>
        aliases.find(
          (a) =>
            a.id === c.aliasId && categoryKey(a.name) === categoryKey(name),
        ),
      )
    )
      warnings.push(
        `«${name}» sigue por desactivar: no hay una campaña vinculada para confirmar la pausa.`,
      );
  for (const c of campaigns) {
    if (c.status !== "ACTIVE" && c.status !== "PAUSED") {
      warnings.push(
        `«${c.name}» sigue por desactivar: primero verifica su estado en Meta.`,
      );
      continue;
    }
    try {
      receipts.push(
        await setMetaStatus(actor, c.id, "PAUSED", c.status, {
          confirmPaused: true,
          aliasId: c.aliasId!,
          country: b.country,
        }),
      );
    } catch {
      warnings.push(
        `Meta no confirmó la pausa de «${c.name}». El diplomado sigue por desactivar; no se repetirá automáticamente.`,
      );
      break;
    }
  }
  return { ...saved, receipts, warnings };
}
