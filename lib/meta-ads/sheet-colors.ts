import { z } from "zod";
export const sheetPalette = [
  { id: "purple", name: "Morado", hex: "#a78bfa" },
  { id: "blue", name: "Azul", hex: "#60a5fa" },
  { id: "cyan", name: "Celeste", hex: "#22d3ee" },
  { id: "green", name: "Verde", hex: "#4ade80" },
  { id: "teal", name: "Turquesa", hex: "#2dd4bf" },
  { id: "yellow", name: "Amarillo", hex: "#facc15" },
  { id: "orange", name: "Naranja", hex: "#fb923c" },
  { id: "red", name: "Rojo", hex: "#f87171" },
  { id: "pink", name: "Rosado", hex: "#f472b6" },
  { id: "gray", name: "Gris", hex: "#94a3b8" },
] as const;
export const colorRulesSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(80),
        value: z.union([z.number().finite().min(0).max(1e9), z.literal("NA")]),
        color: z.enum([
          "purple",
          "blue",
          "cyan",
          "green",
          "teal",
          "yellow",
          "orange",
          "red",
          "pink",
          "gray",
        ]),
        metrics: z
          .array(z.enum(["sales", "budget", "base", "spend", "fixedCost"]))
          .min(1)
          .max(5)
          .refine((v) => new Set(v).size === v.length, "Parámetro repetido."),
        since: z.string().date(),
        until: z.string().date(),
        pinned: z.boolean(),
      })
      .strict()
      .refine(
        (v) =>
          v.since <= v.until &&
          (Date.parse(v.until) - Date.parse(v.since)) / 86400000 < 31,
        "Elige hasta 31 días.",
      ),
  )
  .max(30)
  .refine(
    (v) => new Set(v.map((r) => r.id)).size === v.length,
    "Regla repetida.",
  );
export type SheetColorRule = z.infer<typeof colorRulesSchema>[number];
export function sheetCellColor(
  rules: SheetColorRule[],
  metric: string,
  day: string,
  value: number | "NA" | null,
  currency?: string,
) {
  if (
    typeof value === "number" &&
    currency &&
    ["budget", "spend", "fixedCost"].includes(metric)
  ) {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
    value = Number(value.toFixed(digits));
  }
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (
      r.metrics.includes(metric as SheetColorRule["metrics"][number]) &&
      r.since <= day &&
      day <= r.until &&
      r.value === value
    )
      return sheetPalette.find((c) => c.id === r.color)?.hex;
  }
  return undefined;
}
