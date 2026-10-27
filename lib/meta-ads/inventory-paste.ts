import {
  categoryKey,
  parseDelimitedRecords,
  splitCategoryNames,
} from "./category-paste";
export type InventoryImportRow = {
  primary: string;
  secondary: string;
  name: string;
  sheets: string;
};
const fields = ["primary", "secondary", "name", "sheets"] as const;
const header = (v: string) => {
  const k = categoryKey(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /^(categorias? principal(es)?|principal(es)?)$/.test(k)
    ? 0
    : /^(categorias? secundarias?|secundarias?)$/.test(k)
      ? 1
      : /^(inventario|item|nombre)$/.test(k)
        ? 2
        : /^hojas?$/.test(k)
          ? 3
          : -1;
};
export function inventoryRows(records: string[][]): InventoryImportRow[] {
  if (
    records.length > 501 ||
    records.reduce((n, r) => n + r.join("").length, 0) > 200000
  )
    throw Error("Usa hasta 500 filas y 200 000 caracteres.");
  const rows = records.filter((r) => r.some((v) => v?.trim()));
  if (!rows.length || rows.length > 500)
    throw Error("Incluye entre 1 y 500 filas.");
  return rows.map((r, i) => {
    if (r.slice(4).some((v) => v.trim()))
      throw Error(`Fila ${i + 1}: usa solo cuatro columnas.`);
    const [primary, secondary, name, sheets] = [0, 1, 2, 3].map((n) =>
      (r[n] ?? "").trim(),
    );
    splitCategoryNames(primary);
    splitCategoryNames(secondary);
    splitCategoryNames(sheets);
    if (name.length > 150 || /[\u0000-\u001f\u007f]/.test(name))
      throw Error(
        `Fila ${i + 1}: escribe un inventario válido de hasta 150 caracteres.`,
      );
    return { primary, secondary, name, sheets };
  });
}
/** Header names select their columns; otherwise clipboard starts in the focused cell. Without headers, columns keep their displayed order. */
export function inventoryGrid(records: string[][], startColumn?: number) {
  let rows = records.filter((r) => r.some((v) => v?.trim()));
  if (rows.length > 501) throw Error("Se admiten hasta 500 filas.");
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
    const count = Math.max(1, ...rows.map((r) => r.length));
    const offset = startColumn ?? 0;
    if (count + offset > 4)
      throw Error(
        "El pegado supera las cuatro columnas. Comienza en la columna correspondiente.",
      );
    columns = Array.from({ length: count }, (_, n) => n + offset);
  }
  const mapped = rows.map((r) => {
    if (
      r.length > columns.length &&
      r.slice(columns.length).some((v) => v.trim())
    )
      throw Error("Hay datos sin encabezado.");
    const out = ["", "", "", ""];
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
    columns: columns.filter((c) => c >= 0).map((c) => fields[c]),
  };
}
export const parseInventoryGrid = (
  text: string,
  csv = false,
  startColumn?: number,
) => inventoryGrid(parseDelimitedRecords(text, csv), startColumn);
export const parseInventoryText = (
  text: string,
  csv = false,
  startColumn?: number,
) => parseInventoryGrid(text, csv, startColumn).rows;
