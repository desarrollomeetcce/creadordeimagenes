export function usdMicros(value: string | bigint | null) {
  if (value === null) return "No informado";
  const n = BigInt(value),
    positive = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${positive / 1000000n}.${String(positive % 1000000n).padStart(6, "0")}`;
}

// Decimal input is converted with integer arithmetic; never infer prices from usage tokens.
export function parseUsdMicros(value: string): bigint | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}
