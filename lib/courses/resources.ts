import { z } from "zod";
export const resourceKinds = [
  "video",
  "audio",
  "slides",
  "guide",
  "workshop",
  "exam",
  "book",
  "bibliography",
  "infographic",
  "illustrations",
  "videoScenes",
] as const;
export const resourceLabels: Record<string, string> = {
  video: "Videoclase",
  audio: "Audio de la clase",
  slides: "Presentación",
  guide: "Guía",
  workshop: "Taller",
  exam: "Cuestionario / Examen",
  book: "Libro",
  bibliography: "Bibliografía",
  infographic: "Infografía",
  illustrations: "Ilustraciones IA",
  videoScenes: "Escenas de video IA",
};
export const resourceSchema = z
  .object({
    kind: z.enum(resourceKinds),
    modules: z
      .union([
        z.literal("all"),
        z.array(z.string().min(1).max(200)).min(1).max(200),
      ])
      .default("all"),
    count: z.number().int().min(1).max(5).default(1),
    instructions: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine(
    (r) =>
      ["guide", "workshop", "exam", "book"].includes(r.kind) || r.count === 1,
    "Solo los libros, guías, talleres y exámenes admiten varias versiones.",
  );
export const resourcePlanSchema = z
  .array(resourceSchema)
  .max(12)
  .refine(
    (v) => new Set(v.map((r) => r.kind)).size === v.length,
    "Hay recursos repetidos.",
  );
export type ResourceChoice = z.infer<typeof resourceSchema>;
export const defaultResources: ResourceChoice[] = [
  "video",
  "audio",
  "slides",
].map((kind) => ({
  kind: kind as ResourceChoice["kind"],
  modules: "all",
  count: 1,
  instructions: "",
}));
export function parseModuleSelection(
  value: string,
  modules: { id: string }[],
): "all" | string[] {
  if (!value.trim() || /^todos$/i.test(value.trim())) return "all";
  const result = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw Error("Usa números como 1, 3-5 o Todos.");
    const a = Number(match[1]),
      b = Number(match[2] ?? a);
    if (a < 1 || b < a || b > modules.length)
      throw Error("Elige números de módulos existentes.");
    for (let i = a; i <= b; i++) result.add(i);
  }
  return [...result].sort((a, b) => a - b).map((n) => modules[n - 1].id);
}

export function resourceSelectionState(
  resource: ResourceChoice | undefined,
  modules: { id: string }[],
  selection: "all" | string[],
) {
  if (!resource) return "none";
  if (!modules.length) return resource.modules === "all" ? "all" : "none";
  const target = selection === "all" ? modules.map((m) => m.id) : selection;
  const count = target.filter(
    (id) => resource.modules === "all" || resource.modules.includes(id),
  ).length;
  return count && count === target.length ? "all" : count ? "some" : "none";
}
export function updateResourceSelection(
  plan: ResourceChoice[],
  kind: ResourceChoice["kind"],
  modules: { id: string }[],
  selection: "all" | string[],
  enabled: boolean,
): ResourceChoice[] {
  const current = plan.find((r) => r.kind === kind);
  const all = modules.map((m) => m.id),
    target = selection === "all" ? all : selection;
  if (selection !== "all" && !target.length) return plan;
  const ids = new Set(
    current?.modules === "all" ? all : (current?.modules ?? []),
  );
  for (const id of target) {
    if (enabled) ids.add(id);
    else ids.delete(id);
  }
  const others = plan.filter((r) => r.kind !== kind);
  if (!ids.size && !(enabled && selection === "all" && !all.length))
    return others;
  const scope = all.every((id) => ids.has(id))
    ? ("all" as const)
    : all.filter((id) => ids.has(id));
  return [
    ...others,
    {
      kind,
      count: current?.count ?? 1,
      instructions: current?.instructions ?? "",
      modules: scope,
    },
  ];
}

/** Remove only the deleted module from scoped plans; all-module defaults remain reusable. */
export function withoutResourceModule(
  plan: ResourceChoice[],
  moduleId: string,
): ResourceChoice[] {
  return plan.flatMap((r) => {
    if (r.modules === "all") return [r];
    const modules = r.modules.filter((id) => id !== moduleId);
    return modules.length ? [{ ...r, modules }] : [];
  });
}
