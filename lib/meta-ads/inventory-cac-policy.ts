export type CacRules = {
  review: number;
  severe: number;
  critical: number;
  zero: number;
};
export const defaultCacRules = (): CacRules => ({
  review: 35,
  severe: 50,
  critical: 65,
  zero: 25,
});
export const cacStatusNames = {
  WITHIN: "Normal",
  ALERT: "Revisar",
  SEVERE: "Grave",
  CRITICAL: "Crítico",
  TESTING: "Sin ventas",
  PENDING: "Datos pendientes",
};
export type CacStatus = keyof typeof cacStatusNames;
export function readCacRules(v: unknown): CacRules {
  const r = v as CacRules | undefined;
  return r &&
    [r.review, r.severe, r.critical, r.zero].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
    ) &&
    r.review < r.severe &&
    r.severe < r.critical
    ? { review: r.review, severe: r.severe, critical: r.critical, zero: r.zero }
    : defaultCacRules();
}
export function cacWindow(today: string) {
  return {
    since: new Date(Date.parse(today) - 13 * 86400000)
      .toISOString()
      .slice(0, 10),
    until: today,
  };
}
export function cacAssessment(
  sales: number | null,
  amount: number | null,
  complete: boolean,
  rules: CacRules = defaultCacRules(),
) {
  const value =
    sales !== null && sales > 0 && amount !== null ? amount / sales : null;
  const status: CacStatus =
    !complete || sales === null || amount === null
      ? "PENDING"
      : sales === 0
        ? amount >= rules.zero
          ? "ALERT"
          : "TESTING"
        : value! >= rules.critical
          ? "CRITICAL"
          : value! >= rules.severe
            ? "SEVERE"
            : value! >= rules.review
              ? "ALERT"
              : "WITHIN";
  return { value, limit: rules.review, usage: value, status };
}
