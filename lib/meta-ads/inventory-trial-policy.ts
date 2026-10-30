export type TrialItem = {
  id: string;
  name: string;
  primaryIds: string[];
  primaryNames: string[];
  secondaryNames?: string[];
  sheets?: { id: string; name: string }[];
};
export type TrialMember = { slotId: string; itemId: string; name: string };
export type TrialCycle = {
  id: string;
  slotId: string;
  itemId: string;
  name: string;
  country: string;
  since: string;
  until: string | null;
  pauses: { since: string; until: string | null }[];
  decision: "AUTO" | "KEEP" | "REPLACE";
};
export type TrialPayload = {
  requestHash?: string;
  members: TrialMember[];
  countries: string[];
  reserve: boolean;
  cycles: TrialCycle[];
  rules: { zero: number; perSale: number };
};
export function trialLimit(
  sales: number,
  rules: { zero: number; perSale: number },
) {
  return sales === 0 ? rules.zero : sales * rules.perSale;
}
export function trialAssessment(
  sales: number | null,
  amount: number | null,
  complete: boolean,
  rules: { zero: number; perSale: number },
) {
  const limit = sales === null ? null : trialLimit(sales, rules),
    usage = amount === null || limit === null ? null : amount / limit;
  return {
    limit,
    usage,
    status:
      !complete || sales === null || amount === null
        ? "PENDING"
        : amount >= limit!
          ? sales === 0
            ? "CRITICAL"
            : "ALERT"
          : sales === 0
            ? "TESTING"
            : "WITHIN",
  } as const;
}
export function trialDays(
  since: string,
  until: string,
  pauses: TrialCycle["pauses"],
) {
  const days: string[] = [];
  for (let n = Date.parse(since); n <= Date.parse(until); n += 86400000) {
    const d = new Date(n).toISOString().slice(0, 10);
    if (!pauses.some((p) => p.since <= d && (!p.until || d <= p.until)))
      days.push(d);
  }
  return days;
}
/** One primary area per candidate; secondary categories never constrain the draw. */
export function diverseTrialItems(
  items: TrialItem[],
  count: number,
  excluded: string[] = [],
  random = Math.random,
) {
  const pool = items.filter(
    (i) => i.primaryIds.length && !excluded.includes(i.id),
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const used = new Set<string>(),
    out: TrialItem[] = [];
  for (const item of pool) {
    if (item.primaryIds.some((id) => used.has(id))) continue;
    out.push(item);
    item.primaryIds.forEach((id) => used.add(id));
    if (out.length === count) break;
  }
  return out;
}
export const trialStatusNames = {
  PENDING: "Datos pendientes",
  CRITICAL: "Alerta grave",
  ALERT: "Revisar",
  TESTING: "En prueba",
  WITHIN: "En rango",
};
