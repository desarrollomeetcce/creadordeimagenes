import { categoryKey } from "./category-paste";
import { countryName } from "./countries";
import type { HistoryFile } from "./financial-history-import";
export type HistoryOptions = {
  people: { id: string; name: string; sheetId: string }[];
  tables: { id: string; name: string; defaultCountry: string }[];
  sheets: { id: string; name: string; kind: string }[];
  aliases: {
    id: string;
    name: string;
    tableId: string;
    inventorySheetId: string;
  }[];
  items: { id: string; name: string; sheetId: string }[];
};
export type HistoryChoices = {
  inventoryListId: string;
  advisorListId: string;
  totalsListId: string;
  tables: { country: string; tableId: string | null }[];
  aliases: Record<string, string>;
  people: Record<string, string>;
  catalog: Record<string, string>;
};
export const historyName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const words = (s: string) =>
  historyName(s)
    .split(" ")
    .filter(
      (w) =>
        ![
          "de",
          "del",
          "la",
          "las",
          "el",
          "los",
          "y",
          "en",
          "para",
          "diplomado",
          "diplomados",
          "curso",
          "cursos",
          "internacional",
        ].includes(w),
    )
    .map((w) =>
      w.length > 4 ? w.replace(/ciones$/, "cion").replace(/s$/, "") : w,
    );
const families: [RegExp, string[]][] = [
  [/^(acero|construccion acero|diseno construccion acero)$/, ["acero"]],
  [/^criminalistica$/, ["criminalistica"]],
  [/^deportiva$/, ["psicologia", "deportiva"]],
  [
    /^(ia|eia|impacto ambiental|evaluacion impacto ambiental)$/,
    ["impacto", "ambiental"],
  ],
  [/^forense$/, ["psicologia", "forense"]],
  [/^matematicas?$/, ["didactica", "matematica"]],
  [/^veterinaria$/, ["medicina", "veterinaria"]],
  [/^produccion$/, ["ingenieria", "produccion"]],
  [/^inocuidad$/, ["inocuidad"]],
  [/^instrumentacion$/, ["instrumentacion"]],
  [/^lectoescritua$/, ["lectoescritura"]],
  [/^gestion (de )?resturante$/, ["restaurante"]],
  [/^(gestion|direccion) (de )?restaurantes?$/, ["restaurante"]],
  [/^oratoria$/, ["oratoria"]],
  [/^sig$/, ["informacion", "geografica"]],
];
function diplomaCandidates<T extends { name: string }>(
  source: string,
  list: T[],
): T[] {
  const normalized = historyName(source),
    exact = list.filter((x) => historyName(x.name) === normalized);
  const rule = families.find(([pattern]) => pattern.test(normalized));
  const tokens = words(rule ? rule[1].join(" ") : source);
  if (!tokens.length) return [];
  const matched = list.filter((x) => {
    const target = words(x.name);
    return tokens.every((w) => target.includes(w));
  });
  if (rule && normalized.split(" ").length <= 2) {
    const expanded = matched.filter((x) => historyName(x.name) !== normalized);
    if (expanded.length) return expanded;
  }
  return exact.length ? exact : matched;
}
const personKey = (s: string) =>
  historyName(s)
    .replace(/\by\b/g, "i")
    .replace(/y/g, "i")
    .replace(/h/g, "")
    .split(" ")[0]
    .replace(/^[ij]onatan$/, "yonatan")
    .replace(/^gregor(?:i|ick|ik|ich|iy).*$/, "gregori");
function personCandidates<T extends { name: string }>(
  name: string,
  list: T[],
): T[] {
  const exact = list.filter((p) => historyName(p.name) === historyName(name));
  if (exact.length) return exact;
  const first = personKey(name);
  return list.filter(
    (p) =>
      personKey(p.name) === first ||
      (first === "fran" && /^fran/.test(personKey(p.name))),
  );
}
const sourceKey = (r: { country: string; name: string }) =>
  r.country + "|" + categoryKey(r.name);
export function prepareHistoryChoices(
  file: HistoryFile,
  options: HistoryOptions,
  seed?: HistoryChoices,
): HistoryChoices {
  const countries = [
    ...new Set(
      [...file.diplomas, ...file.advisors, ...file.totals, ...file.manual].map(
        (r) => r.country,
      ),
    ),
  ].sort();
  const preferred: Record<string, string[]> = {
    INVENTORY: [
      "lista de diplomados",
      "lista de diplomados vigentes",
      "diplomados vigentes",
      "inventario",
    ],
    ADVISORS: ["asesores"],
    TOTALS: ["por totales de dia", "por totales del dia", "totales"],
  };
  const pick = (kind: string) => {
    const found = options.sheets.filter((s) => s.kind === kind);
    if (found.length === 1) return found[0].id;
    for (const label of preferred[kind]) {
      const exact = found.filter((s) => historyName(s.name) === label);
      if (exact.length === 1) return exact[0].id;
    }
    return "";
  };
  const result: HistoryChoices = seed
    ? {
        ...seed,
        aliases: { ...seed.aliases },
        catalog: { ...seed.catalog },
        people: { ...seed.people },
      }
    : {
        inventoryListId: pick("INVENTORY"),
        advisorListId: pick("ADVISORS"),
        totalsListId: pick("TOTALS"),
        tables: countries.map((country) => {
          const exact = options.tables.filter(
              (t) => historyName(t.name) === historyName(countryName(country)),
            ),
            found = exact.length
              ? exact
              : options.tables.filter((t) => t.defaultCountry === country);
          return { country, tableId: found.length === 1 ? found[0].id : null };
        }),
        aliases: {},
        catalog: {},
        people: {},
      };
  const matches = historyMatches(file, options, result);
  for (const row of matches.diplomas) {
    if (
      !result.aliases[row.key] &&
      !result.catalog[row.key] &&
      row.candidates.length === 1
    ) {
      const c = row.candidates[0];
      const tableId = result.tables.find(
        (t) => t.country === row.country,
      )?.tableId;
      const local = options.aliases.filter(
        (a) =>
          a.tableId === tableId && historyName(a.name) === historyName(c.name),
      );
      if (local.length === 1) result.aliases[row.key] = local[0].id;
      else result.catalog[row.key] = c.ref;
    }
  }
  for (const row of matches.people)
    if (!result.people[row.key] && row.candidates.length === 1)
      result.people[row.key] = row.candidates[0].id;
  return result;
}
export function historyMatches(
  file: HistoryFile,
  options: HistoryOptions,
  choices: HistoryChoices,
) {
  const catalog = new Map<string, { name: string; ref: string }>();
  // One diploma across several countries is one candidate, preferring its canonical inventory item.
  for (const a of options.aliases.filter(
    (a) => a.inventorySheetId === choices.inventoryListId,
  ))
    catalog.set(historyName(a.name), { name: a.name, ref: "alias:" + a.id });
  for (const i of (options.items ?? []).filter(
    (i) => i.sheetId === choices.inventoryListId,
  )) {
    catalog.delete(historyName(i.name));
    catalog.set("item:" + i.id, { name: i.name, ref: "item:" + i.id });
  }
  const diplomas = [
    ...new Map(file.diplomas.map((r) => [sourceKey(r), r])).entries(),
  ].map(([key, r]) => {
    const destination = choices.tables.find(
      (t) => t.country === r.country,
    )?.tableId;
    const local = options.aliases.filter((a) => a.tableId === destination);
    // Destination aliases can belong to an older inventory list; explicitly reuse, never duplicate them.
    const localFound = diplomaCandidates(
      r.name,
      local.map((a) => ({ name: a.name, ref: "alias:" + a.id })),
    );
    const found = localFound.length
      ? localFound
      : diplomaCandidates(r.name, [...catalog.values()]);
    const ref = choices.catalog[key];
    const selected = choices.aliases[key]
      ? local.find((a) => a.id === choices.aliases[key])?.name
      : ref?.startsWith("item:")
        ? options.items.find(
            (i) =>
              i.id === ref.slice(5) && i.sheetId === choices.inventoryListId,
          )?.name
        : ref?.startsWith("alias:")
          ? options.aliases.find(
              (a) =>
                a.id === ref.slice(6) &&
                a.inventorySheetId === choices.inventoryListId,
            )?.name
          : undefined;
    return {
      key,
      source: r.name,
      country: r.country,
      candidates: found,
      selected: selected ?? null,
    };
  });
  const people = [
    ...new Map(
      file.advisors.map((r) => [categoryKey(r.name), r.name]),
    ).entries(),
  ].map(([key, name]) => ({
    key,
    source: name,
    candidates: personCandidates(
      name,
      options.people.filter((p) => p.sheetId === choices.advisorListId),
    ),
    selected:
      options.people.find(
        (p) =>
          p.sheetId === choices.advisorListId && p.id === choices.people[key],
      )?.name ?? null,
  }));
  return { diplomas, people };
}
