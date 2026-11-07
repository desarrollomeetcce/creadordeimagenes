// Shared pure helpers: no database or credentials in client bundles.
export const costKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export function convertedCost(
  amount: string,
  bonus: string,
  rate: string | null,
  currency: string,
  target: string,
): string | null {
  const cents = (v: string) =>
    /^\d+(\.\d{1,2})?$/.test(v)
      ? BigInt(v.split(".")[0]) * 100n +
        BigInt((v.split(".")[1] ?? "").padEnd(2, "0"))
      : null;
  const a = cents(amount),
    b = cents(bonus);
  if (a === null || b === null) return null;
  let total = a + b;
  if (currency !== target) {
    if (!rate || !/^\d+(\.\d{1,6})?$/.test(rate)) return null;
    const factor =
      BigInt(rate.split(".")[0]) * 1000000n +
      BigInt((rate.split(".")[1] ?? "").padEnd(6, "0"));
    if (factor <= 0n) return null;
    total = (total * factor + 500000n) / 1000000n;
  }
  return String(total / 100n) + "." + String(total % 100n).padStart(2, "0");
}
