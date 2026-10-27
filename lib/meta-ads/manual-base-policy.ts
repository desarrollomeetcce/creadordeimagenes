import { z } from "zod";
export const manualBaseAllocationsSchema = z
  .array(
    z
      .object({
        advisorId: z.string().min(1).max(100).nullable(),
        quantity: z.number().int().min(0).max(100000000),
      })
      .strict(),
  )
  .max(1000)
  .superRefine((rows, ctx) => {
    if (new Set(rows.map((r) => r.advisorId)).size !== rows.length)
      ctx.addIssue({
        code: "custom",
        message: "Cada asesor solo puede aparecer una vez.",
      });
    if (rows.reduce((n, r) => n + r.quantity, 0) > 1000000000)
      ctx.addIssue({
        code: "custom",
        message: "La base total supera el límite permitido.",
      });
  });
export type ManualBaseAllocation = z.infer<
  typeof manualBaseAllocationsSchema
>[number];
export function manualBaseValue(
  state: string,
  allocations: ManualBaseAllocation[],
) {
  return state === "VALUE"
    ? allocations.reduce((n, r) => n + r.quantity, 0)
    : state === "NA"
      ? ("NA" as const)
      : null;
}
export function replaceManualBaseAdvisor(
  allocations: ManualBaseAllocation[],
  advisorId: string,
  quantity: number | null,
) {
  const next = allocations.filter((r) => r.advisorId !== advisorId);
  if (quantity !== null) next.push({ advisorId, quantity });
  return manualBaseAllocationsSchema.parse(next);
}
