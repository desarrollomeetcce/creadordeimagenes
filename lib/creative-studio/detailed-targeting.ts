import { z } from "zod";
// SDK Targeting: these fields accept IDName lists. Numeric-only demographics
// and retired/sensitive categories are deliberately not inferred from a name.
export const detailedTargetingFields = [
  "interests",
  "behaviors",
  "education_majors",
  "education_schools",
  "family_statuses",
  "industries",
  "life_events",
  "work_employers",
  "work_positions",
] as const;
export const detailedFieldSchema = z.enum(detailedTargetingFields);
export const detailedSelectionSchema = z
  .object({
    id: z.string().regex(/^\d{1,40}$/),
    name: z.string().trim().min(1).max(250),
    field: detailedFieldSchema,
  })
  .strict();
export const detailedFieldNames: Record<
  z.infer<typeof detailedFieldSchema>,
  string
> = {
  interests: "Intereses",
  behaviors: "Comportamientos",
  education_majors: "Campos de estudio",
  education_schools: "Centros de estudios",
  family_statuses: "Padres y familia",
  industries: "Sectores laborales",
  life_events: "Acontecimientos",
  work_employers: "Empresas",
  work_positions: "Cargos",
};
export const browseCategories = {
  interests: "Intereses",
  behaviors: "Comportamientos",
  demographics: "Datos demográficos",
} as const;
export type BrowseCategory = keyof typeof browseCategories;
export const audienceSearchDelay = 650;
export const audienceSearchCacheMs = 120000;
export function detailedGroups(
  interests: { id: string; name: string }[] | undefined,
  selections: z.infer<typeof detailedSelectionSchema>[] | undefined,
) {
  const groups: Record<string, { id: string; name: string }[]> = {};
  for (const row of [
    ...(interests ?? []).map((i) => ({ ...i, field: "interests" })),
    ...(selections ?? []),
  ]) {
    const values = (groups[row.field] ??= []);
    if (!values.some((i) => i.id === row.id))
      values.push({ id: row.id, name: row.name });
    groups[row.field] = values;
  }
  return Object.keys(groups).length ? { flexible_spec: [groups] } : {};
}

/** Some category responses use a dictionary keyed by targeting field. */
export function detailedMetaRows(data: unknown): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let visited = 0;
  function walk(value: unknown, field?: string, depth = 0) {
    if (
      ++visited > 2000 ||
      rows.length >= 50 ||
      depth > 8 ||
      !value ||
      typeof value !== "object"
    )
      return;
    if (Array.isArray(value)) {
      for (const row of value) walk(row, field, depth + 1);
      return;
    }
    const row = value as Record<string, unknown>;
    if (row.id !== undefined && typeof row.name === "string") {
      rows.push({ ...row, ...(!row.type && field ? { type: field } : {}) });
      return;
    }
    for (const [key, child] of Object.entries(row))
      walk(
        child,
        detailedFieldSchema.safeParse(key).success ? key : field,
        depth + 1,
      );
  }
  walk(data);
  return rows;
}
