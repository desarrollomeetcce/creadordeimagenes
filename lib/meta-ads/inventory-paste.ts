import {
  syllabiSchema,
  type InventorySyllabus,
} from "./inventory-syllabi-policy";
import {
  categoryKey,
  parseDelimitedRecords,
  splitCategoryNames,
} from "./category-paste";
export const INVENTORY_IMPORT_LIMIT = 1500;
export type InventoryImportRow = {
  primary: string;
  secondary: string;
  name: string;
  sheets: string;
  syllabi?: InventorySyllabus[];
};
export const inventoryImportFields = [
  "name",
  "primary",
  "secondary",
  "sheets",
] as const;
const fields = inventoryImportFields;
const normalize = (v: string) =>
  categoryKey(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const header = (v: string) => {
  const k = normalize(v);
  if (/^(categorias? principal(es)?|principal(es)?)$/.test(k)) return 1;
  if (/^(categorias? secundarias?|secundarias?)$/.test(k)) return 2;
  if (/^(inventario|item|nombre|diplomados?)$/.test(k)) return 0;
  if (/^hojas?$/.test(k)) return 3;
  const m = k.match(/^temarios?(?:\s*(\d+))?$/);
  return m && (!m[1] || (Number(m[1]) >= 1 && Number(m[1]) <= 50))
    ? 3 + Number(m[1] ?? 1)
    : -1;
};
/** A plain cell is one syllabus. The template optionally names its button and scope. */
export function syllabusFromCell(
  text: string,
  index: number,
): InventorySyllabus {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  let title = `Temario ${index}`,
    scope = "Todo el mundo";
  if (
    /^(nombre(?: del bot[oó]n)?|bot[oó]n|t[ií]tulo)\s*:/i.test(lines[0] ?? "")
  ) {
    title = lines
      .shift()!
      .replace(/^[^:]+:\s*/, "")
      .trim();
    if (/^(?:[aá]mbito|pa[ií]s|alcance)\s*:/i.test(lines[0] ?? ""))
      scope = lines
        .shift()!
        .replace(/^[^:]+:\s*/, "")
        .trim();
  }
  const result = syllabiSchema.safeParse([
    { id: crypto.randomUUID(), title, scope, content: lines.join("\n").trim() },
  ]);
  if (!result.success)
    throw Error(
      `Temario ${index}: completa un nombre de hasta 100 caracteres, ámbito y contenido de hasta 30 000 caracteres.`,
    );
  return result.data[0];
}
export function inventoryRows(records: string[][]): InventoryImportRow[] {
  if (
    records.length > INVENTORY_IMPORT_LIMIT + 1 ||
    records.reduce((n, r) => n + r.slice(0, 4).join("").length, 0) > 200000
  )
    throw Error(
      "Usa hasta 1.500 filas y 200 000 caracteres en las cuatro primeras columnas.",
    );
  const rows = records.filter((r) => r.some((v) => v?.trim()));
  if (!rows.length || rows.length > INVENTORY_IMPORT_LIMIT)
    throw Error("Incluye entre 1 y 1.500 filas.");
  let total = 0;
  return rows.map((r, i) => {
    if (r.slice(54).some((v) => v?.trim()))
      throw Error(`Fila ${i + 1}: se admiten hasta 50 columnas de temarios.`);
    const [name, primary, secondary, sheets] = [0, 1, 2, 3].map((n) =>
      (r[n] ?? "").trim(),
    );
    splitCategoryNames(primary);
    splitCategoryNames(secondary, 100);
    splitCategoryNames(sheets);
    if (name.length > 150 || /[\u0000-\u001f\u007f]/.test(name))
      throw Error(
        `Fila ${i + 1}: escribe un inventario válido de hasta 150 caracteres.`,
      );
    const syllabi = r
      .slice(4, 54)
      .flatMap((v, n) => (v?.trim() ? [syllabusFromCell(v, n + 1)] : []));
    if (syllabi.length && !name)
      throw Error(
        `Fila ${i + 1}: escribe el nombre del inventario antes de añadir temarios.`,
      );
    const parsed = syllabiSchema.safeParse(syllabi);
    if (!parsed.success)
      throw Error(
        `Fila ${i + 1}: los temarios superan los límites por inventario.`,
      );
    total += syllabi.reduce((n, s) => n + s.content.length, 0);
    if (total > 3000000)
      throw Error(
        "Los temarios superan 3 000 000 de caracteres. Divide la carga.",
      );
    return {
      primary,
      secondary,
      name,
      sheets,
      ...(syllabi.length ? { syllabi } : {}),
    };
  });
}
export function inventoryGrid(records: string[][], startColumn?: number) {
  let rows = records.filter((r) => r.some((v) => v?.trim()));
  if (rows.length > INVENTORY_IMPORT_LIMIT + 1)
    throw Error("Se admiten hasta 1.500 filas.");
  const first = rows[0] ?? [],
    named =
      first.length > 0 &&
      first.some((v) => v.trim()) &&
      first.every((v) => !v.trim() || header(v) >= 0);
  let columns: number[];
  if (named) {
    columns = first.map(header);
    if (
      new Set(columns.filter((c) => c >= 0)).size !==
      columns.filter((c) => c >= 0).length
    )
      throw Error("Hay encabezados repetidos.");
    rows = rows.slice(1);
  } else {
    const count = Math.max(1, ...rows.map((r) => r.length)),
      offset = startColumn ?? 0;
    if (count + offset > 54)
      throw Error(
        "El pegado supera las cuatro columnas iniciales y los 50 temarios.",
      );
    columns = Array.from({ length: count }, (_, n) => n + offset);
  }
  const mapped = rows.map((r) => {
    if (
      r.length > columns.length &&
      r.slice(columns.length).some((v) => v.trim())
    )
      throw Error("Hay datos sin encabezado.");
    const out = Array.from(
      { length: Math.max(4, ...columns.map((c) => c + 1)) },
      () => "",
    );
    r.forEach((v, n) => {
      const col = columns[n];
      if (col >= 0) out[col] = v;
      else if (v.trim())
        throw Error("Hay datos en una columna sin encabezado.");
    });
    return out;
  });
  return {
    rows: inventoryRows(mapped),
    columns: columns.filter((c) => c >= 0 && c < 4).map((c) => fields[c]),
    ...(columns.some((c) => c >= 4) ? { hasSyllabi: true } : {}),
  };
}
export const parseInventoryGrid = (
  text: string,
  csv = false,
  startColumn?: number,
) => inventoryGrid(parseDelimitedRecords(text, csv, 6000000), startColumn);
export const parseInventoryText = (
  text: string,
  csv = false,
  startColumn?: number,
) => parseInventoryGrid(text, csv, startColumn).rows;
export function inventoryDraftRows(
  input: InventoryImportRow[],
): InventoryImportRow[] {
  const populated = input.filter(
    (r) => fields.some((k) => r[k].trim()) || r.syllabi?.length,
  );
  let total = 0;
  for (const [i, row] of input.entries()) {
    if (row.syllabi?.length && !row.name.trim())
      throw Error(
        `Fila ${i + 1}: escribe el nombre del inventario antes de añadir temarios.`,
      );
    const parsed = syllabiSchema.safeParse(row.syllabi ?? []);
    if (!parsed.success)
      throw Error(
        `Fila ${i + 1}: revisa nombre, ámbito y contenido de los temarios. Máximo 50 versiones por inventario.`,
      );
    total += parsed.data.reduce((n, s) => n + s.content.length, 0);
  }
  if (total > 3000000)
    throw Error(
      "Los temarios superan 3 000 000 de caracteres. Divide la carga.",
    );
  return inventoryRows(populated.map((r) => fields.map((k) => r[k]))).map(
    (r, i) =>
      populated[i].syllabi?.length
        ? { ...r, syllabi: syllabiSchema.parse(populated[i].syllabi) }
        : r,
  );
}
