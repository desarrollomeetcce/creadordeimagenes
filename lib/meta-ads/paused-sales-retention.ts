import type { Prisma } from "@prisma/client";
import { isCountryCode } from "./countries";
import { activationSettings } from "./inventory-sheet-activation";
import { recordActivity } from "../activity";

export const pausedCampaignStatuses = ["PAUSED", "ARCHIVED", "DELETED"];
export function allCampaignsStopped(statuses: (string | null)[]) {
  return (
    statuses.length > 0 &&
    statuses.every((status) => pausedCampaignStatuses.includes(status ?? ""))
  );
}

/**
 * Called inside the existing authorized metadata transaction/884411 lock.
 * Reflect only confirmed stops of currently visible rows, never missing data.
 */
export async function retainPausedSalesRows(
  tx: Prisma.TransactionClient,
  objectIds: string[],
  observedAt: Date,
) {
  if (!objectIds.length) return 0;
  const changed = await tx.metaAdObject.findMany({
    where: {
      id: { in: [...new Set(objectIds)] },
      level: "campaign",
      status: { in: pausedCampaignStatuses },
      seenAt: observedAt,
      aliasId: { not: null },
      account: { connection: { disconnectedAt: null } },
    },
    select: {
      aliasId: true,
      aliasCountry: true,
      account: { select: { connection: { select: { ownerId: true } } } },
    },
  });
  const pairs = new Map<
    string,
    { aliasId: string; country: string; ownerId: string }
  >();
  for (const row of changed)
    if (row.aliasId && row.aliasCountry && isCountryCode(row.aliasCountry))
      pairs.set(row.aliasId + "|" + row.aliasCountry, {
        aliasId: row.aliasId,
        country: row.aliasCountry,
        ownerId: row.account.connection.ownerId,
      });
  if (!pairs.size) return 0;
  const owners = await tx.user.findMany({
    where: {
      id: { in: [...new Set([...pairs.values()].map((p) => p.ownerId))] },
      role: "OWNER",
      status: "APPROVED",
      archivedAt: null,
    },
    select: { id: true },
  });
  const ownerIds = new Set(owners.map((o) => o.id));
  const targets = [...pairs.values()].filter((p) => ownerIds.has(p.ownerId));
  if (!targets.length) return 0;
  const aliases = await tx.metaAlias.findMany({
    where: { id: { in: [...new Set(targets.map((p) => p.aliasId))] } },
    select: {
      id: true,
      inventorySheetId: true,
      effectivenessRows: {
        where: { legacy: false, hidden: false },
        select: { country: true },
      },
      effectivenessStates: {
        select: {
          id: true,
          country: true,
          active: true,
          revision: true,
          events: {
            take: 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { createdAt: true },
          },
        },
      },
    },
  });
  const lists = await tx.metaEffectivenessSheet.findMany({
    where: {
      id: { in: [...new Set(aliases.map((a) => a.inventorySheetId))] },
      kind: "INVENTORY",
      archivedAt: null,
    },
    select: { id: true, config: true },
  });
  const settings = new Map(
    lists.map((list) => [list.id, activationSettings(list.config)]),
  );
  const known = await tx.metaAdObject.groupBy({
    by: ["aliasId", "aliasCountry", "status"],
    where: {
      level: "campaign",
      OR: targets.map((p) => ({ aliasId: p.aliasId, aliasCountry: p.country })),
    },
  });
  const statuses = new Map<string, (string | null)[]>();
  for (const row of known) {
    const key = row.aliasId + "|" + row.aliasCountry;
    const values = statuses.get(key) ?? [];
    values.push(row.status);
    statuses.set(key, values);
  }
  const blocked = new Set(
    targets
      .filter(
        (p) =>
          !allCampaignsStopped(statuses.get(p.aliasId + "|" + p.country) ?? []),
      )
      .map((p) => p.aliasId + "|" + p.country),
  );
  const touched = new Set<string>();
  let count = 0;
  for (const target of targets) {
    const key = target.aliasId + "|" + target.country;
    const alias = aliases.find((a) => a.id === target.aliasId);
    if (!alias || blocked.has(key)) continue;
    const config = settings.get(alias.inventorySheetId);
    const control = config?.rows[key];
    const state = alias.effectivenessStates.find(
      (s) => s.country === target.country,
    );
    if (
      !config ||
      config.detachedAliases.includes(alias.id) ||
      control?.campaignTask === "CREATE" ||
      state?.active === false ||
      !alias.effectivenessRows.some((r) => r.country === target.country) ||
      (state?.events[0] && state.events[0].createdAt > observedAt)
    )
      continue;
    const next = await tx.metaEffectivenessState.upsert({
      where: {
        aliasId_country: { aliasId: alias.id, country: target.country },
      },
      create: {
        aliasId: alias.id,
        country: target.country,
        active: false,
        revision: 1,
      },
      update: { active: false, revision: { increment: 1 } },
    });
    await tx.metaEffectivenessEvent.create({
      data: {
        stateId: next.id,
        actorId: target.ownerId,
        active: false,
        snapshot: {
          source: "META_STATUS_SYNC",
          observedAt: observedAt.toISOString(),
          pinned: true,
          ...(state ? { priorActive: state.active } : {}),
        },
      },
    });
    config.rows[key] = { ...control, pinned: true, campaignTask: "NONE" };
    await tx.metaEffectivenessRow.updateMany({
      where: { aliasId: alias.id, country: target.country, legacy: false },
      data: { hidden: false, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: target.ownerId,
        action: "META_EFECTIVIDAD_ESTADO",
        resourceId: next.id,
        detail: {
          source: "META_STATUS_SYNC",
          country: target.country,
          active: false,
          pinned: true,
        },
      },
    });
    touched.add(alias.inventorySheetId);
    count++;
  }
  for (const list of lists.filter((l) => touched.has(l.id)))
    await tx.metaEffectivenessSheet.update({
      where: { id: list.id },
      data: {
        config: {
          ...(list.config as Prisma.JsonObject),
          inventoryActivation: settings.get(
            list.id,
          ) as unknown as Prisma.InputJsonValue,
        },
        revision: { increment: 1 },
      },
    });
  return count;
}
