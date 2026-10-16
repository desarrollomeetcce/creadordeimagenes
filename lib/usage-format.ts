export function usdMicros(value: string | bigint | null) {
  if (value === null) return "No informado";
  const n = BigInt(value),
    positive = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${positive / 1000000n}.${String(positive % 1000000n).padStart(6, "0")}`;
}
