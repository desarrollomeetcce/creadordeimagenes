import { db } from "../db";

export async function financialNavigationAccess(userId: string, role: string) {
  if (role === "OWNER") return { salesShared: true, inventoryShared: true, advisorsShared: true };
  const [access] = await db.$queryRaw<{
    salesShared: boolean;
    inventoryShared: boolean;
    advisorsShared: boolean;
  }[]>`
    WITH scope_kinds AS (
      SELECT CASE WHEN g.scope = 'ALL' THEN 'ALL' WHEN t.id IS NOT NULL THEN 'TABLE' ELSE s.kind END AS kind
      FROM "EffectivenessGrant" g
      LEFT JOIN "MetaAliasTable" t ON g.scope = 'TABLE:' || t.id
      LEFT JOIN "MetaEffectivenessSheet" s ON g.scope = 'TAB:' || s.id AND s."archivedAt" IS NULL
      WHERE g."userId" = ${userId}
    )
    SELECT
      coalesce(bool_or(kind IN ('ALL', 'TABLE', 'TOTALS')), false) AS "salesShared",
      coalesce(bool_or(kind IN ('ALL', 'INVENTORY')), false) AS "inventoryShared",
      coalesce(bool_or(kind IN ('ALL', 'ADVISORS')), false) AS "advisorsShared"
    FROM scope_kinds
  `;
  return access;
}
