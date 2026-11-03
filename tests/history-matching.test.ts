import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareHistoryChoices,
  historyMatches,
  type HistoryOptions,
} from "../lib/meta-ads/history-matching";
import type { HistoryFile } from "../lib/meta-ads/financial-history-import";
const file = (
  names: string[],
  people: string[] = [],
  country = "PE",
): HistoryFile => ({
  version: 1,
  source: {
    url: "https://example.test",
    title: "Sintético",
    salesSince: "2026-10-01",
    salesUntil: "2026-10-30",
    marketingSince: "2026-10-13",
    marketingUntil: "2026-10-31",
    notes: [],
  },
  diplomas: names.map((name) => ({
    name,
    country,
    day: "2026-10-01",
    sales: 1,
    administrator: "Admin",
  })),
  advisors: people.map((name) => ({
    name,
    country,
    day: "2026-10-01",
    sales: 1,
  })),
  totals: [],
  manual: [],
});
const options = (titles: string[]): HistoryOptions => ({
  sheets: [
    { id: "inv", kind: "INVENTORY", name: "Lista de Diplomados" },
    { id: "people", kind: "ADVISORS", name: "Asesores" },
    { id: "totals", kind: "TOTALS", name: "POR TOTALES DE DIA" },
  ],
  tables: [{ id: "pe", name: "PERÚ", defaultCountry: "PE" }],
  items: titles.map((name, i) => ({ id: "item" + i, name, sheetId: "inv" })),
  aliases: [],
  people: [],
});
test("Nombres abreviados reconocen los títulos completos indicados por el usuario", () => {
  const cases = [
    ["ACERO", "Diseño para construcción en acero"],
    ["CONSTRUCCION ACERO", "Diseño para construcción en acero"],
    ["CRIMINALISTICA", "Criminalística Internacional"],
    ["DEPORTIVA", "Psicología deportiva"],
    ["DERMATOLOGIA", "Dermatología veterinaria"],
    ["ECONOMIA AMBIENTAL", "Economía ambiental y desarrollo sostenible"],
    ["IA", "Evaluación de impacto ambiental"],
    ["EIA", "Evaluación de impacto ambiental"],
    ["FORENSE", "Psicología forense"],
    ["GESTION DE RESTAURANTE", "Dirección y gestión de restaurantes"],
    ["GESTION DE RESTURANTE", "Dirección y gestión de restaurantes"],
    ["ARQUITECTURA", "Arquitectura y diseño de interiores"],
    ["MATEMATICAS", "Didáctica de la matemática"],
    ["MEDICINA VETERINARIA", "Medicina veterinaria"],
    ["VETERINARIA", "Medicina veterinaria"],
    ["PERIODISMO", "Periodismo"],
    ["INOCUIDAD", "Gestión de calidad e inocuidad alimentaria ISO 22000:2018"],
    ["LECTOESCRITUA", "Metodología para el aprendizaje de la lectoescritura"],
  ];
  const o = options([...new Set(cases.map((c) => c[1]))]);
  const f = file(cases.map((c) => c[0]));
  const p = prepareHistoryChoices(f, o),
    rows = historyMatches(f, o, p).diplomas;
  for (const [source, target] of cases)
    assert.equal(
      rows.find((r) => r.source === source)?.selected,
      target,
      source,
    );
});
test("Únicos asesores: Gregory/i/y, nombres cortos y acentos reutilizan identidades existentes", () => {
  const o = options([]);
  o.people = [
    { id: "g", name: "Gregory", sheetId: "people" },
    { id: "p", name: "Pilar Ramírez", sheetId: "people" },
    { id: "k", name: "Kevin", sheetId: "people" },
    { id: "d", name: "Donasis", sheetId: "people" },
    { id: "j", name: "Jonathan", sheetId: "people" },
  ];
  const f = file(
    [],
    [
      "GREGORICK",
      "GREGORI",
      "GREGORY",
      "PILAR",
      "KEVIN HERNANDEZ",
      "DONASYS",
      "YONATAN",
    ],
  );
  const p = prepareHistoryChoices(f, o);
  assert.deepEqual(Object.values(p.people), [
    "g",
    "g",
    "g",
    "p",
    "k",
    "d",
    "j",
  ]);
  o.people.push({ id: "k2", name: "Kevin Pérez", sheetId: "people" });
  const ambiguous = prepareHistoryChoices(file([], ["KEVIN HERNANDEZ"]), o);
  assert(!ambiguous.people["kevin hernandez"]);
});
test("País y catálogo: coincidencia local primero; nuevo país reutiliza título del catálogo, no abreviatura", () => {
  const o = options(["Criminalística Internacional"]);
  o.aliases = [
    {
      id: "bo",
      name: "Criminalística Internacional",
      tableId: "bo",
      inventorySheetId: "inv",
    },
    {
      id: "pe-other",
      name: "Criminalística aplicada",
      tableId: "pe",
      inventorySheetId: "inv",
    },
  ];
  o.tables.push({ id: "bo", name: "BOLIVIA", defaultCountry: "BO" });
  let f = file(["CRIMINALISTICA"], [], "BO"),
    p = prepareHistoryChoices(f, o);
  assert.equal(p.aliases["BO|criminalistica"], "bo");
  f = file(["CRIMINALISTICA"], [], "SV");
  p = prepareHistoryChoices(f, o);
  assert.equal(p.tables[0].tableId, null);
  assert.equal(historyMatches(f, o, p).diplomas[0].candidates.length, 2);
  o.aliases.pop();
  p = prepareHistoryChoices(f, o);
  assert.equal(p.catalog["SV|criminalistica"], "item:item0");
  o.sheets.push({ id: "other", name: "Otra", kind: "INVENTORY" });
  assert.equal(prepareHistoryChoices(f, o).inventoryListId, "inv");
});
test("Varias fichas reales quedan por revisar; no usa una coincidencia parcial insuficiente", () => {
  const o = options([
    "Didáctica de la matemática",
    "Didáctica de la matemática para primaria",
    "Psicología forense",
    "Odontología forense",
  ]);
  const f = file(["MATEMATICAS", "FORENSE", "IA", "CURSO DESCONOCIDO"]);
  const p = prepareHistoryChoices(f, o),
    r = historyMatches(f, o, p).diplomas;
  assert.equal(r[0].candidates.length, 2);
  assert.equal(r[0].selected, null);
  assert.equal(r[1].selected, "Psicología forense");
  assert.equal(r[2].candidates.length, 0);
  assert.equal(r[3].candidates.length, 0);
});
