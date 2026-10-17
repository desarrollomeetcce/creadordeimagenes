import { creativeSchema, planToDesign, type CreativePlan } from "./design";

/** Repairs transport formatting locally; never treats partial JSON as a full plan. */
export function usableLayeredPlan(
  text: string,
  format: string,
  logos: string[],
): CreativePlan | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const start = trimmed.indexOf("{"),
    end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of new Set(candidates)) {
    try {
      const parsed = creativeSchema.safeParse(JSON.parse(candidate));
      if (!parsed.success) continue;
      planToDesign(parsed.data, format, logos);
      return parsed.data;
    } catch {
      /* Try another local representation; no request or paid retry. */
    }
  }
  return null;
}

/** Preserve the authorized brief even when the creative stage omits details. */
export function completePosterPrompt(
  brief: string,
  text: string,
  incomplete = false,
) {
  const direction = text.trim();
  if (
    incomplete ||
    !direction ||
    direction.startsWith("{") ||
    direction.startsWith("```")
  )
    return { prompt: brief, recovered: true };
  return {
    prompt: `${brief}\n\nPROPUESTA DE COMPOSICIÓN\n${direction}\n\nLa propuesta orienta la composición; las instrucciones y datos autorizados anteriores prevalecen. No añadas ofertas, precios, marcas ni otros datos que no estén autorizados en el brief original.`,
    recovered: false,
  };
}
