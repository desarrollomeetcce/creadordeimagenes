import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import { effectivenessLock } from "./effectiveness";
import { financialAccess } from "./financial-access";
import { activationSettings } from "./inventory-sheet-activation";
import { inventoryNamedCountry } from "./inventory-sheet-column-policy";
import { sheetCountryIdentities } from "./sheet-country-identity";
import { countryName, isCountryCode } from "./countries";
import { categoryKey } from "./category-paste";
import type { Actor } from "./service";

type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(100);
const request = z
  .object({
    listId: id,
    items: z
      .array(
        z
          .object({ aliasId: id, country: z.string().refine(isCountryCode) })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
const confirmation = request.extend({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export type CountryCorrectionInput = z.infer<typeof request>;

async function plan(tx: Tx, actor: Actor, input: CountryCorrectionInput) {
  await effectivenessLock(tx, actor);
  demand(
    (await financialAccess(actor, tx)).isOwner,
    "Solo el propietario puede trasladar asociaciones entre hojas.",
    403,
  );
  const list = await tx.metaEffectivenessSheet.findFirst({
    where: { id: input.listId, kind: "INVENTORY", archivedAt: null },
  });
  demand(list, "Inventario no disponible.", 404);
  const settings = activationSettings(list.config);
  const tables = await tx.metaAliasTable.findMany({ orderBy: { id: "asc" } });
  const identities = await sheetCountryIdentities(
    tx,
    tables.map((t) => t.id),
  );
  const countries = new Map(
    tables.map((t) => [
      t.id,
      inventoryNamedCountry({
        ...t,
        ...(identities.has(t.id)
          ? { identityCountry: identities.get(t.id)! }
          : {}),
      }),
    ]),
  );
  const linked = await tx.metaAlias.findMany({
    where: { inventorySheetId: list.id },
    select: { tableId: true },
  });
  const local = new Set([...settings.sheets, ...linked.map((a) => a.tableId)]);
  const claimed = new Set<string>();
  const seen = new Set<string>();
  const plans = [];
  for (const item of input.items) {
    const key = item.aliasId + "|" + item.country;
    demand(!seen.has(key), "Hay asociaciones repetidas.", 400);
    seen.add(key);
    const source = await tx.metaAlias.findFirst({
      where: { id: item.aliasId, inventorySheetId: list.id },
      include: {
        table: true,
        categoryAssignments: { orderBy: { categoryId: "asc" } },
      },
    });
    demand(source, "La asociación no pertenece a este inventario.", 404);
    const rows = await tx.metaEffectivenessRow.findMany({
      where: { aliasId: source.id, country: item.country },
      include: {
        days: {
          select: { day: true, revision: true },
          orderBy: { day: "asc" },
        },
        _count: { select: { salesApprovals: true, legacySources: true } },
      },
      orderBy: { id: "asc" },
    });
    const states = await tx.metaEffectivenessState.findMany({
      where: { aliasId: source.id, country: item.country },
      include: { events: { select: { id: true }, orderBy: { id: "asc" } } },
    });
    const matching = tables.filter(
      (t) => countries.get(t.id) === item.country && t.id !== source.tableId,
    );
    const localMatches = matching.filter((t) => local.has(t.id));
    const candidates = localMatches.length ? localMatches : matching;
    const target = candidates.length === 1 ? candidates[0] : null;
    const targetName =
      target?.name ?? countryName(item.country).toLocaleUpperCase("es");
    const targetAliases = target
      ? await tx.metaAlias.findMany({ where: { tableId: target.id } })
      : [];
    const matches = targetAliases.filter(
      (a) => categoryKey(a.name) === categoryKey(source.name),
    );
    const destination = matches.length === 1 ? matches[0] : null;
    const destinationRows = destination
      ? await tx.metaEffectivenessRow.findMany({
          where: { aliasId: destination.id, country: item.country },
          include: {
            days: {
              select: { day: true, revision: true },
              orderBy: { day: "asc" },
            },
            _count: { select: { salesApprovals: true, legacySources: true } },
          },
          orderBy: { id: "asc" },
        })
      : [];
    const destinationStates = destination
      ? await tx.metaEffectivenessState.findMany({
          where: { aliasId: destination.id, country: item.country },
          include: { events: { select: { id: true }, orderBy: { id: "asc" } } },
        })
      : [];
    const objects = await tx.metaAdObject.findMany({
      where: { aliasId: source.id, aliasCountry: item.country },
      select: { id: true, advisorId: true },
      orderBy: { id: "asc" },
    });
    const assignments = await tx.metaAdvisorAssignment.findMany({
      where: { aliasId: source.id, country: item.country },
      orderBy: { id: "asc" },
    });
    const supports = await tx.metaAdvisorSupport.findMany({
      where: { aliasId: source.id, country: item.country },
      orderBy: { id: "asc" },
    });
    const links = await tx.metaEffectivenessLink.findMany({
      where: {
        tableId: { in: [source.tableId, ...(target ? [target.id] : [])] },
      },
    });
    const duplicates = destinationRows.filter((d) =>
      rows.some((r) => r.currency === d.currency),
    );
    const empty = (r: (typeof destinationRows)[number]) =>
      !r.days.length &&
      !r._count.salesApprovals &&
      !r._count.legacySources &&
      !r.legacy &&
      !r.presentationRowId &&
      !r.advisorId &&
      !r.hidden &&
      r.revision === 0 &&
      r.metaHistoryMode === "ALL" &&
      !r.metaHistorySince;
    const sourceState = states[0],
      targetState = destinationStates[0];
    const sourceControl = settings.rows[key],
      targetControl = destination
        ? settings.rows[destination.id + "|" + item.country]
        : undefined;
    let reason =
      !countries.get(source.tableId) ||
      countries.get(source.tableId) === item.country
        ? "Esta asociación ya no requiere corrección. Actualiza la lista."
        : !rows.length && !states.length
          ? "No hay registros del país indicado."
          : candidates.length > 1
            ? "Varias hojas representan este país. Revisa sus identidades antes de trasladar."
            : !target &&
                tables.some(
                  (t) => categoryKey(t.name) === categoryKey(targetName),
                )
              ? "El nombre de destino ya existe con otra identidad de país."
              : matches.length > 1
                ? "Hay varias fichas equivalentes en el destino."
                : destination && destination.inventorySheetId !== list.id
                  ? "El diplomado de destino pertenece a otra lista de inventario."
                  : links.length
                    ? "Hay columnas vinculadas en estas hojas. Revisa sus fuentes antes de trasladar."
                    : duplicates.some((r) => !empty(r))
                      ? "El destino ya tiene registros de este diplomado, país y moneda. Se conserva todo; requiere conciliación de ambos históricos."
                      : sourceState &&
                          targetState &&
                          (targetState.events.length ||
                            sourceState.active !== targetState.active)
                        ? "El destino tiene un estado o historial de activación diferente. Requiere conciliación."
                        : sourceControl &&
                            targetControl &&
                            JSON.stringify(sourceControl) !==
                              JSON.stringify(targetControl)
                          ? "El destino tiene controles de campaña o asesor diferentes."
                          : "";
    // Shared targets with existing advisor history must not change historical attribution silently.
    if (!reason && destination) {
      const count = await tx.metaAdvisorAssignment.count({
        where: { aliasId: destination.id, country: item.country },
      });
      const supportCount = await tx.metaAdvisorSupport.count({
        where: { aliasId: destination.id, country: item.country },
      });
      if (count || supportCount)
        reason =
          "El destino tiene asignaciones de asesor; requiere conciliación de sus históricos.";
    }
    const claim = item.country + "|" + categoryKey(source.name);
    if (!reason && claimed.has(claim))
      reason =
        "Otra asociación elegida tiene el mismo diplomado y destino. Corrige una y vuelve a revisar.";
    if (!reason) claimed.add(claim);
    plans.push({
      item,
      source,
      target,
      targetName,
      destination,
      rows,
      states,
      destinationRows,
      destinationStates,
      objects,
      assignments,
      supports,
      sourceControl,
      reason,
      emptyRowIds: duplicates.filter(empty).map((r) => r.id),
    });
  }
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        list: {
          id: list.id,
          revision: list.revision,
          categoryRevision: list.categoryRevision,
          config: list.config,
        },
        plans,
      }),
    )
    .digest("hex");
  return { list, settings, plans, token };
}
function view(p: Awaited<ReturnType<typeof plan>>) {
  return {
    token: p.token,
    items: p.plans.map((x) => ({
      aliasId: x.source.id,
      name: x.source.name,
      country: x.item.country,
      sourceTable: x.source.table.name,
      targetTable: x.targetName,
      createsTable: !x.target,
      rows: x.rows.length,
      days: x.rows.reduce((n, r) => n + r.days.length, 0),
      objects: x.objects.length,
      reason: x.reason,
      ready: !x.reason,
    })),
  };
}
export type CountryCorrectionPreview = ReturnType<typeof view>;
export async function previewInventoryCountryCorrection(
  actor: Actor,
  input: unknown,
) {
  const b = request.parse(input);
  return db.$transaction(async (tx) => view(await plan(tx, actor, b)), {
    timeout: 30000,
  });
}
/** Move financial row/state IDs, not copies of sales. Provider facts and row-bound approvals stay untouched. */
export async function correctInventoryCountries(actor: Actor, input: unknown) {
  const b = confirmation.parse(input);
  return db.$transaction(
    async (tx) => {
      await effectivenessLock(tx, actor);
      demand(
        (await financialAccess(actor, tx)).isOwner,
        "Solo el propietario puede corregir asociaciones.",
        403,
      );
      demand(
        await tx.metaEffectivenessSheet.count({
          where: { id: b.listId, kind: "INVENTORY", archivedAt: null },
        }),
        "Inventario no disponible.",
        404,
      );
      const previous = await tx.auditEvent.findFirst({
        where: {
          actorId: actor.id,
          resourceId: b.listId,
          action: "META_INVENTORY_COUNTRY_CORRECTED",
          detail: { path: ["token"], equals: b.token },
        },
      });
      if (previous) {
        const detail = previous.detail as Prisma.JsonObject;
        demand(
          JSON.stringify(
            request
              .parse({ listId: b.listId, items: detail.items })
              .items.map((i) => [i.aliasId, i.country]),
          ) === JSON.stringify(b.items.map((i) => [i.aliasId, i.country])),
          "La confirmación corresponde a otra selección.",
          409,
        );
        return {
          corrected: z.array(z.unknown()).parse(detail.results),
          blocked: z.array(z.unknown()).parse(detail.blocked),
          historyPreserved: true,
        };
      }
      const p = await plan(tx, actor, { listId: b.listId, items: b.items });
      demand(
        p.token === b.token,
        "Los datos cambiaron. Revisa de nuevo los destinos antes de corregir.",
        409,
      );
      demand(
        p.plans.some((x) => !x.reason),
        "No hay asociaciones listas para trasladar.",
        409,
      );
      const config = p.list.config as Prisma.JsonObject;
      const oldActivation = (config.inventoryActivation ??
        {}) as Prisma.JsonObject;
      const controls = { ...p.settings.rows },
        detached = new Set(p.settings.detachedAliases),
        sheets = new Set(p.settings.sheets);
      const results = [];
      for (const x of p.plans) {
        if (x.reason) continue;
        const target =
          x.target ??
          (await tx.metaAliasTable.upsert({
            where: { name: x.targetName },
            create: {
              name: x.targetName,
              defaultCountry: x.item.country,
              defaultCurrency: x.source.table.defaultCurrency,
            },
            update: {},
          }));
        const destination =
          x.destination ??
          (await tx.metaAlias.upsert({
            where: {
              tableId_name: { tableId: target.id, name: x.source.name },
            },
            create: {
              tableId: target.id,
              name: x.source.name,
              inventorySheetId: p.list.id,
            },
            update: {},
          }));
        demand(
          destination.inventorySheetId === p.list.id,
          "El destino cambió de inventario.",
          409,
        );
        if (x.emptyRowIds.length)
          await tx.metaEffectivenessRow.deleteMany({
            where: { id: { in: x.emptyRowIds } },
          });
        await tx.metaEffectivenessRow.updateMany({
          where: { id: { in: x.rows.map((r) => r.id) } },
          data: { aliasId: destination.id, revision: { increment: 1 } },
        });
        if (x.states.length && x.destinationStates.length)
          await tx.metaEffectivenessState.deleteMany({
            where: { id: { in: x.destinationStates.map((s) => s.id) } },
          });
        await tx.metaEffectivenessState.updateMany({
          where: { id: { in: x.states.map((s) => s.id) } },
          data: { aliasId: destination.id, revision: { increment: 1 } },
        });
        await tx.metaAdObject.updateMany({
          where: {
            id: { in: x.objects.map((o) => o.id) },
            aliasId: x.source.id,
            aliasCountry: x.item.country,
          },
          data: { aliasId: destination.id },
        });
        await tx.metaAdvisorAssignment.updateMany({
          where: { id: { in: x.assignments.map((a) => a.id) } },
          data: { aliasId: destination.id },
        });
        await tx.metaAdvisorSupport.updateMany({
          where: { id: { in: x.supports.map((s) => s.id) } },
          data: { aliasId: destination.id },
        });
        await tx.metaInventoryCategoryAssignment.createMany({
          data: x.source.categoryAssignments.map((c) => ({
            aliasId: destination.id,
            categoryId: c.categoryId,
          })),
          skipDuplicates: true,
        });
        const oldKey = x.source.id + "|" + x.item.country,
          newKey = destination.id + "|" + x.item.country;
        if (x.sourceControl) controls[newKey] = x.sourceControl;
        delete controls[oldKey];
        sheets.add(target.id);
        const remaining =
          (await tx.metaEffectivenessRow.count({
            where: { aliasId: x.source.id },
          })) +
          (await tx.metaEffectivenessState.count({
            where: { aliasId: x.source.id },
          })) +
          (await tx.metaAdObject.count({ where: { aliasId: x.source.id } }));
        if (!remaining) detached.add(x.source.id);
        if (p.settings.detachedAliases.includes(x.source.id))
          detached.add(destination.id);
        else detached.delete(destination.id);
        results.push({
          sourceAliasId: x.source.id,
          aliasId: destination.id,
          country: x.item.country,
          sourceTableId: x.source.tableId,
          targetTableId: target.id,
          targetTable: target.name,
          rowIds: x.rows.map((r) => r.id),
          stateIds: x.states.map((s) => s.id),
          objectIds: x.objects.map((o) => o.id),
        });
      }
      await tx.metaEffectivenessSheet.update({
        where: { id: p.list.id },
        data: {
          revision: { increment: 1 },
          config: {
            ...config,
            inventoryActivation: {
              ...oldActivation,
              sheets: [...sheets],
              rows: controls as Prisma.InputJsonValue,
              detachedAliases: [...detached],
            },
          },
        },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_INVENTORY_COUNTRY_CORRECTED",
          resourceId: p.list.id,
          detail: {
            results,
            token: b.token,
            items: b.items,
            blocked: view(p).items.filter((x) => !x.ready),
          },
        },
      });
      return {
        corrected: results,
        blocked: view(p).items.filter((x) => !x.ready),
        historyPreserved: true,
      };
    },
    { timeout: 30000 },
  );
}
