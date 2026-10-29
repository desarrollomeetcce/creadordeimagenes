import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
type Actor = { id: string; role: string };
type Client = Prisma.TransactionClient;
const capability = Symbol("authorized-effectiveness-request");
type Context = {
  scope: string;
  write: boolean;
  kind: string;
  tableIds: string[];
  fullTableIds?: string[];
  inventoryIds?: string[];
  access: Awaited<ReturnType<typeof financialAccess>>;
};
type FinancialActor = Actor & { [capability]: Context };
export const isFinancialActor = (actor: Actor): actor is FinancialActor =>
  capability in actor;
export const financialContext = (actor: Actor) =>
  isFinancialActor(actor) ? actor[capability] : null;
export function ownerOnly(actor: Actor) {
  demand(
    actor.role === "OWNER" || isFinancialActor(actor),
    "No tienes acceso a este documento de Efectividad.",
    403,
  );
}
export async function financialAccess(actor: Actor, tx: Client = db) {
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: {
      role: true,
      status: true,
      effectivenessGrants: { select: { scope: true, permission: true } },
    },
  });
  demand(user?.status === "APPROVED", "La cuenta no está habilitada.", 403);
  return { isOwner: user.role === "OWNER", grants: user.effectivenessGrants };
}
export function scopePermission(
  a: Awaited<ReturnType<typeof financialAccess>>,
  scope: string,
) {
  if (a.isOwner) return "EDIT";
  const grants = a.grants.filter((g) => g.scope === "ALL" || g.scope === scope);
  return grants.some((g) => g.permission === "EDIT")
    ? "EDIT"
    : grants.length
      ? "VIEW"
      : null;
}
export async function checkFinancialContext(actor: Actor, tx: Client = db) {
  const a = await financialAccess(actor, tx),
    ctx = financialContext(actor);
  if (!ctx) {
    demand(a.isOwner, "Sin permiso de Efectividad.", 403);
    return;
  }
  const p = scopePermission(a, ctx.scope);
  demand(
    p && (ctx.write ? p === "EDIT" : true),
    "El acceso al documento cambió. Actualiza la vista.",
    403,
  );
}
/** Destination grants are checked again under the financial write lock. */
export async function financialDestinationEdit(
  actor: Actor,
  tableIds: string[],
  tx: Client = db,
) {
  const ctx = financialContext(actor);
  if (!ctx) return;
  const access = await financialAccess(actor, tx);
  for (const id of tableIds)
    demand(
      scopePermission(access, "TABLE:" + id) === "EDIT",
      "El permiso para vincular una hoja de destino cambió.",
      403,
    );
}
export function financialUserWhere(actor: Actor): Prisma.UserWhereInput {
  const ctx = financialContext(actor);
  if (!ctx) return { id: actor.id, role: "OWNER", status: "APPROVED" };
  return {
    id: actor.id,
    status: "APPROVED",
    OR: [
      { role: "OWNER" },
      {
        effectivenessGrants: {
          some: {
            scope: { in: ["ALL", ctx.scope] },
            ...(ctx.write ? { permission: "EDIT" } : {}),
          },
        },
      },
    ],
  };
}
export const scopeSchema = z
  .string()
  .max(120)
  .regex(/^(ALL|TAB:[A-Za-z0-9_-]+|TABLE:[A-Za-z0-9_-]+)$/);
export async function financialScope(scope: string) {
  scopeSchema.parse(scope);
  if (scope === "ALL")
    return {
      name: "Toda Efectividad",
      kind: "ALL",
      config: {} as Record<string, unknown>,
    };
  const [type, id] = scope.split(":");
  if (type === "TAB") {
    const row = await db.metaEffectivenessSheet.findFirst({
      where: { id, archivedAt: null },
    });
    demand(row, "Documento no disponible.", 404);
    return {
      name: row.name,
      kind: row.kind,
      config: row.config as Record<string, unknown>,
    };
  }
  const row = await db.metaAliasTable.findUnique({ where: { id } });
  demand(row, "Hoja no disponible.", 404);
  return { name: row.name, kind: "TABLE", config: {} };
}
export async function financialCapabilities(actor: Actor) {
  const a = await financialAccess(actor);
  return {
    isOwner: a.isOwner,
    global: scopePermission(a, "ALL"),
    grants: a.grants,
  };
}
async function shareOwner(actor: Actor, tx: Client = db) {
  demand(
    (await financialAccess(actor, tx)).isOwner,
    "Solo el OWNER administra los accesos compartidos.",
    403,
  );
}
export async function readFinancialSharing(actor: Actor, scope: string) {
  await shareOwner(actor);
  const doc = await financialScope(scope);
  const [state, users, grants, inherited] = await Promise.all([
    db.effectivenessSharing.findUnique({ where: { scope } }),
    db.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    db.effectivenessGrant.findMany({
      where: { scope },
      select: { userId: true, permission: true },
    }),
    scope === "ALL"
      ? Promise.resolve([])
      : db.effectivenessGrant.findMany({
          where: { scope: "ALL" },
          select: { userId: true, permission: true },
        }),
  ]);
  return {
    scope,
    name: doc.name,
    revision: state?.revision ?? 0,
    users,
    grants,
    inherited,
  };
}
const shared = z
  .object({
    scope: scopeSchema,
    revision: z.number().int().nonnegative(),
    grants: z
      .array(
        z
          .object({
            userId: z.string().min(1).max(100),
            permission: z.enum(["VIEW", "EDIT"]),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export async function saveFinancialSharing(actor: Actor, input: unknown) {
  await shareOwner(actor);
  const b = shared.parse(input);
  await financialScope(b.scope);
  demand(
    new Set(b.grants.map((g) => g.userId)).size === b.grants.length,
    "Hay personas repetidas.",
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      await shareOwner(actor, tx);
      const state = await tx.effectivenessSharing.upsert({
        where: { scope: b.scope },
        create: { scope: b.scope },
        update: {},
      });
      demand(
        state.revision === b.revision,
        "Los accesos cambiaron. Vuelve a abrir Compartir.",
        409,
      );
      const users = await tx.user.count({
        where: {
          id: { in: b.grants.map((g) => g.userId) },
          status: "APPROVED",
          role: { not: "OWNER" },
        },
      });
      demand(
        users === b.grants.length,
        "Selecciona cuentas habilitadas; los OWNER ya tienen acceso.",
        409,
      );
      await tx.effectivenessGrant.deleteMany({
        where: {
          scope: b.scope,
          userId: { notIn: b.grants.map((g) => g.userId) },
        },
      });
      for (const g of b.grants)
        await tx.effectivenessGrant.upsert({
          where: { scope_userId: { scope: b.scope, userId: g.userId } },
          create: { scope: b.scope, ...g, grantedById: actor.id },
          update: { permission: g.permission, grantedById: actor.id },
        });
      await tx.effectivenessSharing.update({
        where: { scope: b.scope },
        data: { revision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "EFECTIVIDAD_COMPARTIDA",
          resourceId: b.scope,
          detail: { count: b.grants.length },
        },
      });
      return { ok: true };
    },
    { timeout: 30000 },
  );
}
const metadata = new Set([
  "workbook-sheets",
  "alias-tables",
  "aliases",
  "alias-table-options",
  "advisors",
]);
const permitted =
  /^(inventory(?:\/|$)|workbook-sheets(?:\/|$)|effectiveness(?:\/|$)|advisors(?:\/|$)|manual-base(?:\/|$)|advisor-base(?:\/|$)|aliases(?:\/|$)|alias-tables(?:\/|$)|alias-table-options$|exchange-rates(?:\/|$))/;
function references(value: unknown) {
  const result: { key: string; value: string }[] = [];
  const visit = (v: unknown, key = "") => {
    if (Array.isArray(v)) {
      for (const x of v) visit(x, key);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) visit(x, k);
    } else if (typeof v === "string" && v && /(Id|Ids|^id$|^ids$)$/.test(key))
      result.push({ key, value: v });
  };
  visit(value);
  return result;
}
export async function authorizeFinancialRequest(
  actor: Actor,
  path: string,
  method: string,
  query: URLSearchParams,
  body: unknown,
  requestedScope: string | null,
): Promise<FinancialActor> {
  demand(
    permitted.test(path),
    "Esta operación no pertenece a Efectividad.",
    403,
  );
  const a = await financialAccess(actor),
    write = method !== "GET";
  if (a.isOwner)
    return {
      ...actor,
      [capability]: {
        scope: "ALL",
        write,
        kind: "ALL",
        tableIds: [],
        access: a,
      },
    };
  demand(
    a.grants.length,
    "No tienes documentos compartidos de Efectividad.",
    403,
  );
  const values = references({
    ...Object.fromEntries(query),
    ...(body && typeof body === "object" ? body : {}),
  });
  let scope = requestedScope ?? "";
  if (!scope) {
    const list = values.find((v) =>
      ["listId", "sheetId", "totalsSheetId"].includes(v.key),
    );
    if (list) scope = "TAB:" + list.value;
    else {
      const table = values.find((v) => v.key === "tableId");
      if (table && table.value !== "all") scope = "TABLE:" + table.value;
    }
  }
  const isMetadata = method === "GET" && metadata.has(path);
  const global = scopePermission(a, "ALL");
  if (global === "EDIT" || (!write && global)) scope = "ALL";
  if (isMetadata && !global) {
    scope = "";
    for (const grant of a.grants) {
      try {
        await financialScope(grant.scope);
        scope = grant.scope;
        break;
      } catch {}
    }
  }
  if (!scope && isMetadata) {
    const global = scopePermission(a, "ALL");
    scope = global ? "ALL" : a.grants[0].scope;
  }
  demand(scope, "Selecciona un documento compartido.", 403);
  const p = scopePermission(a, scope);
  demand(
    p && (!write || p === "EDIT"),
    "Este documento es de solo lectura o no está compartido contigo.",
    403,
  );
  const doc = await financialScope(scope);
  const allTables = await db.metaAliasTable.findMany({ select: { id: true } });
  let tableIds = allTables.map((t) => t.id);
  if (scope.startsWith("TABLE:")) tableIds = [scope.slice(6)];
  else if (doc.kind === "TOTALS" && Array.isArray(doc.config.selected))
    tableIds = tableIds.filter((id) =>
      (doc.config.selected as unknown[]).includes(id),
    );
  else if (
    doc.kind === "ADVISORS" &&
    typeof doc.config.tableId === "string" &&
    doc.config.tableId !== "all"
  )
    tableIds = tableIds.filter((id) => id === doc.config.tableId);
  else if (doc.kind === "INVENTORY")
    tableIds = a.grants
      .filter((g) => g.scope.startsWith("TABLE:"))
      .map((g) => g.scope.slice(6));
  let fullTableIds: string[] | undefined, inventoryIds: string[] | undefined;
  if (isMetadata && scope !== "ALL") {
    const visible = new Set(
      a.grants
        .filter((g) => g.scope.startsWith("TABLE:"))
        .map((g) => g.scope.slice(6)),
    );
    const tabs = await db.metaEffectivenessSheet.findMany({
      where: {
        id: {
          in: a.grants
            .filter((g) => g.scope.startsWith("TAB:"))
            .map((g) => g.scope.slice(4)),
        },
        archivedAt: null,
      },
    });
    for (const tab of tabs) {
      const config = tab.config as Record<string, unknown>;
      if (tab.kind === "TOTALS")
        for (const id of allTables
          .map((t) => t.id)
          .filter(
            (id) =>
              !Array.isArray(config.selected) || config.selected.includes(id),
          ))
          visible.add(id);
      if (tab.kind === "ADVISORS")
        for (const id of allTables
          .map((t) => t.id)
          .filter(
            (id) =>
              !config.tableId ||
              config.tableId === "all" ||
              config.tableId === id,
          ))
          visible.add(id);
    }
    fullTableIds = [...visible];
    inventoryIds = tabs.filter((t) => t.kind === "INVENTORY").map((t) => t.id);
    if (inventoryIds.length) {
      const links = await db.metaAlias.findMany({
        where: { inventorySheetId: { in: inventoryIds } },
        select: { tableId: true },
      });
      for (const link of links) visible.add(link.tableId);
    }
    tableIds = [...visible];
  }
  if (!isMetadata && scope !== "ALL") {
    if (write && /^(effectiveness\/(sync|links)|inventory\/package)/.test(path))
      demand(
        false,
        "Comparte toda Efectividad con permiso de edición para vincular o copiar entre documentos.",
        403,
      );
    if (
      doc.kind === "TABLE" &&
      path.startsWith("aliases/") &&
      (method === "DELETE" || path.endsWith("delete-preview"))
    )
      demand(
        false,
        "Eliminar un inventario completo requiere compartir su pestaña de Inventario con edición.",
        403,
      );
    if (doc.kind === "INVENTORY")
      demand(
        /^(inventory(?:\/|$)|aliases(?:\/|$)|alias-table-options$)/.test(path),
        "Comparte también la hoja correspondiente para abrir ese detalle.",
        403,
      );
    if (doc.kind === "ADVISORS") {
      demand(
        /^(advisors(?:\/(sheet|detail|periods|period-history|attendance|absence))?$|effectiveness\/advisor(?:-|$)|manual-base\/advisor$)/.test(
          path,
        ),
        "Comparte también la hoja financiera para consultar ese detalle.",
        403,
      );
      if (path === "advisors/sheet" || path === "advisors/detail")
        demand(
          values.some(
            (v) => v.key === "advisorListId" && "TAB:" + v.value === scope,
          ),
          "Indica la pestaña de asesores compartida.",
          403,
        );
    }
    for (const ref of values)
      if (ref.key === "tableId" && ref.value === "all")
        demand(
          tableIds.length === allTables.length,
          "Elige una hoja de origen incluida en el documento compartido.",
          403,
        );
    if (path.startsWith("workbook-sheets"))
      demand(
        path === "workbook-sheets/" + scope.slice(4),
        "No puedes modificar otras pestañas.",
        403,
      );
    const config =
      body && typeof body === "object"
        ? (body as { config?: { selected?: unknown; tableId?: unknown } })
            .config
        : undefined;
    if (write && config) {
      if (Array.isArray(config.selected))
        for (const id of config.selected)
          demand(
            typeof id === "string" &&
              (tableIds.includes(id) || !!scopePermission(a, "TABLE:" + id)),
            "No puedes añadir hojas de origen que no estén compartidas contigo.",
            403,
          );
      if (config.selected === null || config.tableId === "all")
        demand(
          tableIds.length === allTables.length || !!scopePermission(a, "ALL"),
          "No puedes ampliar el documento a hojas no compartidas.",
          403,
        );
    }
    if (write && ["inventory/sheets", "inventory/sheets/batch"].includes(path))
      for (const ref of values.filter((v) => v.key === "tableIds"))
        demand(
          scopePermission(a, "TABLE:" + ref.value) === "EDIT",
          "Vincular una hoja requiere permiso de edición en ella.",
          403,
        );
    for (const ref of values) {
      if (
        [
          "listId",
          "sheetId",
          "totalsSheetId",
          "advisorSheetId",
          "advisorListId",
          "inventorySheetId",
        ].includes(ref.key)
      )
        demand(
          scope === "TAB:" + ref.value,
          "El documento solicitado no coincide con el compartido.",
          403,
        );
      if (
        ["tableId", "tableIds", "sourceTableId", "targetTableId"].includes(
          ref.key,
        ) &&
        ref.value !== "all"
      )
        demand(
          tableIds.includes(ref.value),
          "Una hoja de origen no está compartida en este documento.",
          403,
        );
    }
    const aliasValues = values
      .filter((v) => ["aliasId", "aliasIds", "inventoryId"].includes(v.key))
      .map((v) => v.value);
    if (path.startsWith("aliases/")) aliasValues.push(path.split("/")[1]);
    if (aliasValues.length) {
      const aliases = await db.metaAlias.findMany({
        where: { id: { in: aliasValues } },
        select: { tableId: true, inventorySheetId: true },
      });
      for (const alias of aliases)
        demand(
          doc.kind === "INVENTORY"
            ? "TAB:" + alias.inventorySheetId === scope
            : tableIds.includes(alias.tableId),
          "Hay un inventario de otro documento.",
          403,
        );
    }
    const advisorIds = values
      .filter((v) => v.key === "advisorId" || v.key === "advisorIds")
      .map((v) => v.value);
    if (path.startsWith("advisors/")) advisorIds.push(path.split("/")[1]);
    if (path === "advisors" && write) {
      const id = values.find((v) => v.key === "id");
      if (id) advisorIds.push(id.value);
    }
    if (advisorIds.length) {
      const allowedAlias =
        doc.kind === "INVENTORY"
          ? { inventorySheetId: scope.slice(4) }
          : { tableId: { in: tableIds } };
      const people = await db.metaAdvisor.findMany({
        where: { id: { in: advisorIds } },
        select: {
          id: true,
          sheetId: true,
          rows: {
            where: { alias: allowedAlias },
            select: { id: true },
            take: 1,
          },
          objects: {
            where: { alias: allowedAlias },
            select: { id: true },
            take: 1,
          },
        },
      });
      for (const person of people)
        demand(
          doc.kind === "ADVISORS"
            ? scope === "TAB:" + person.sheetId
            : person.rows.length > 0 || person.objects.length > 0,
          "Ese asesor no pertenece al documento compartido.",
          403,
        );
    }
    if (path.startsWith("alias-tables/"))
      demand(
        scope === "TABLE:" + path.split("/")[1],
        "No puedes editar otra hoja.",
        403,
      );
    if (write && ["workbook-sheets", "alias-tables"].includes(path))
      demand(
        false,
        "Compartir toda Efectividad permite crear nuevas hojas.",
        403,
      );
  }
  return {
    ...actor,
    [capability]: {
      scope,
      write,
      kind: doc.kind,
      tableIds,
      fullTableIds,
      inventoryIds,
      access: a,
    },
  };
}
export function sharedTabWhere(
  actor: Actor,
): Prisma.MetaEffectivenessSheetWhereInput {
  const c = financialContext(actor);
  if (!c || c.access.isOwner || scopePermission(c.access, "ALL")) return {};
  return {
    id: {
      in: c.access.grants
        .filter((g) => g.scope.startsWith("TAB:"))
        .map((g) => g.scope.slice(4)),
    },
  };
}
export function sharedTableWhere(
  actor: Actor,
): Prisma.MetaAliasTableWhereInput {
  const c = financialContext(actor);
  if (!c || c.access.isOwner || scopePermission(c.access, "ALL")) return {};
  return { id: { in: c.tableIds } };
}

export function sharedAliasWhere(actor: Actor): Prisma.MetaAliasWhereInput {
  const c = financialContext(actor);
  if (!c || c.access.isOwner || scopePermission(c.access, "ALL")) return {};
  return {
    OR: [
      { tableId: { in: c.fullTableIds ?? c.tableIds } },
      {
        inventorySheetId: {
          in:
            c.inventoryIds ??
            (c.kind === "INVENTORY" ? [c.scope.slice(4)] : []),
        },
      },
    ],
  };
}
