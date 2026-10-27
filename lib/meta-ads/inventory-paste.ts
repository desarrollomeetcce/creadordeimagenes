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
export function inventoryRows(records: string[][]): InventoryImportRow[] {
  if (
    records.length > 501 ||
    records.reduce((n, r) => n + r.join("").length, 0) > 200000
  )
    throw Error("Usa hasta 500 filas y 200 000 caracteres.");
  const rows = records.filter((r) => r.some((v) => v?.trim()));
  if (
    rows[0] &&
    /^(categorias? principal(es)?|principal(es)?)$/.test(
      categoryKey(rows[0][0] ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    ) &&
    /^(inventario|item|nombre)$/.test(categoryKey(rows[0][2] ?? ""))
  )
    rows.shift();
  if (!rows.length || rows.length > 500)
    throw Error("Incluye entre 1 y 500 filas de inventario.");
  return rows.map((r, i) => {
    if (r.slice(4).some((v) => v.trim()))
      throw Error(`Fila ${i + 1}: usa solo cuatro columnas.`);
    const [primary, secondary, name, sheets] = [0, 1, 2, 3].map((n) =>
      (r[n] ?? "").trim(),
    );
    splitCategoryNames(primary);
    splitCategoryNames(secondary);
    splitCategoryNames(sheets);
    if (!name || name.length > 150 || /[\u0000-\u001f\u007f]/.test(name))
      throw Error(
        `Fila ${i + 1}: escribe un inventario válido de hasta 150 caracteres.`,
      );
    if (!sheets)
      throw Error(`Fila ${i + 1}: indica al menos una hoja existente.`);
    return { primary, secondary, name, sheets };
  });
}
export const parseInventoryText = (text: string, csv = false) =>
  inventoryRows(parseDelimitedRecords(text, csv));
