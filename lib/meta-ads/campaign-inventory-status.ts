import { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import {
  authorizeFinancialRequest,
  financialAccess,
  scopePermission,
} from "./financial-access";
import { inventoryMetaStatusChange } from "./inventory-sheet-activation";
import { isCountryCode } from "./countries";
import { metaEditorUserWhere } from "./workspace-access";
import type { Actor } from "./service";

type Tx = Prisma.TransactionClient;
type LinkedCampaign = {
  id: string;
  level: string;
  aliasId: string | null;
  aliasCountry: string | null;
};

/** A pending pause is an internal intent, never evidence that Meta stopped delivery. */
export async function prepareCampaignInventoryStatus(
  actor: Actor,
  object: LinkedCampaign,
  status: "ACTIVE" | "PAUSED",
) {
  if (
    object.level !== "campaign" ||
    !object.aliasId ||
    !isCountryCode(object.aliasCountry ?? "")
  )
    return null;
  const alias = await db.metaAlias.findUnique({
    where: { id: object.aliasId },
  });
  if (!alias?.inventorySheetId || !alias.tableId) return null;
  const scope = {
    listId: alias.inventorySheetId,
    tableId: alias.tableId,
    aliasId: alias.id,
    name: alias.name,
    country: object.aliasCountry!,
  };
  const authorized = await authorizeFinancialRequest(
    actor,
    "inventory/sheet-activation",
    "PATCH",
    new URLSearchParams(),
    { listId: scope.listId, tableId: scope.tableId },
    "TAB:" + scope.listId,
  );
  const revision = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      demand(
        await tx.user.findFirst({ where: metaEditorUserWhere(actor.id) }),
        "Ya no tienes permiso para modificar Meta.",
        403,
      );
      demand(
        await tx.metaAdObject.findFirst({
          where: {
            id: object.id,
            aliasId: scope.aliasId,
            aliasCountry: scope.country,
          },
        }),
        "La vinculación cambió. Actualiza antes de continuar.",
        409,
      );
      if (status === "PAUSED")
        return inventoryMetaStatusChange(tx, authorized, scope, {
          active: true,
          campaignTask: "STOP",
        });
      return (
        (
          await tx.metaEffectivenessState.findUnique({
            where: {
              aliasId_country: {
                aliasId: scope.aliasId,
                country: scope.country,
              },
            },
            select: { revision: true },
          })
        )?.revision ?? 0
      );
    },
    { timeout: 120000 },
  );
  return { authorized, scope, revision };
}

export type PreparedCampaignInventoryStatus = Awaited<
  ReturnType<typeof prepareCampaignInventoryStatus>
>;

export async function checkCampaignInventoryStatus(
  tx: Tx,
  prepared: PreparedCampaignInventoryStatus,
  objectId: string,
) {
  if (!prepared) return;
  const { scope, revision } = prepared;
  demand(
    await tx.metaAdObject.findFirst({
      where: {
        id: objectId,
        aliasId: scope.aliasId,
        aliasCountry: scope.country,
        alias: {
          is: {
            tableId: scope.tableId,
            inventorySheetId: scope.listId,
            name: scope.name,
          },
        },
      },
    }),
    "La vinculación cambió. Actualiza antes de continuar.",
    409,
  );
  const state = await tx.metaEffectivenessState.findUnique({
    where: {
      aliasId_country: { aliasId: scope.aliasId, country: scope.country },
    },
    select: { revision: true },
  });
  demand(
    (state?.revision ?? 0) === revision,
    "El estado interno cambió. Actualiza antes de continuar.",
    409,
  );
  // Revalidate the current financial grant before any external write.
  const access = await financialAccess(prepared.authorized, tx);
  demand(
    scopePermission(access, "TAB:" + scope.listId) === "EDIT",
    "El permiso de edición del Inventario cambió.",
    403,
  );
}

/** Called only after the successful Meta receipt, in the same local transaction. */
export async function confirmCampaignInventoryStatus(
  tx: Tx,
  prepared: PreparedCampaignInventoryStatus,
  status: "ACTIVE" | "PAUSED",
) {
  if (!prepared) return {};
  const { scope } = prepared;
  // One diploma can have several campaigns. A single paused campaign cannot switch all of them off.
  const outstanding =
    status === "PAUSED" &&
    (await tx.metaAdObject.count({
      where: {
        aliasId: scope.aliasId,
        aliasCountry: scope.country,
        level: "campaign",
        OR: [
          { status: null },
          { status: { notIn: ["PAUSED", "ARCHIVED", "DELETED"] } },
        ],
      },
    }));
  const active = status === "ACTIVE" || !!outstanding,
    campaignTask = outstanding ? ("STOP" as const) : ("NONE" as const);
  await inventoryMetaStatusChange(tx, prepared.authorized, scope, {
    active,
    campaignTask,
  });
  return { inventoryActive: active, inventoryCampaignTask: campaignTask };
}

/** Read only the requested row controls, after current financial authorization. No Graph calls. */
export async function campaignInventoryTasks(
  actor: Actor,
  objects: (LinkedCampaign & {
    alias: { inventorySheetId: string | null } | null;
  })[],
) {
  const access = await financialAccess(actor),
    pairs = new Map<
      string,
      { listId: string; aliasId: string; country: string }
    >();
  for (const o of objects) {
    const listId = o.alias?.inventorySheetId;
    if (
      o.level === "campaign" &&
      listId &&
      o.aliasId &&
      o.aliasCountry &&
      scopePermission(access, "TAB:" + listId)
    )
      pairs.set(o.aliasId + "|" + o.aliasCountry, {
        listId,
        aliasId: o.aliasId,
        country: o.aliasCountry,
      });
  }
  const result = new Map<string, "STOP" | "CREATE" | "NONE">();
  if (!pairs.size) return result;
  const values = Prisma.join(
    [...pairs.values()].map(
      (p) => Prisma.sql`(${p.listId},${p.aliasId},${p.country})`,
    ),
  );
  const rows = await db.$queryRaw<
    { aliasId: string; country: string; task: string | null }[]
  >(Prisma.sql`
    SELECT p."aliasId",p.country,jsonb_extract_path_text(s.config,'inventoryActivation','rows',p."aliasId"||'|'||p.country,'campaignTask') AS task
    FROM (VALUES ${values}) AS p("listId","aliasId",country)
    JOIN "MetaEffectivenessSheet" s ON s.id=p."listId" AND s.kind='INVENTORY' AND s."archivedAt" IS NULL
  `);
  for (const r of rows)
    if (r.task === "STOP" || r.task === "CREATE" || r.task === "NONE")
      result.set(r.aliasId + "|" + r.country, r.task);
  return result;
}
