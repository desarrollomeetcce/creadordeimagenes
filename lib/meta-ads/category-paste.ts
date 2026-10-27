export type CategoryImportRow = { primary: string; secondary: string };
export const categoryKey = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
export function splitCategoryNames(text: string) {
  const names = [
    ...new Map(
      text
        .split(/[,;\n]+/)
        .map((s) => s.trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .map((s) => [categoryKey(s), s]),
    ).values(),
  ];
  if (
    names.length > 20 ||
    names.some(
      (n) =>
        n.length > 80 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(n),
    )
  )
    throw Error(
      "Cada celda admite hasta 20 categorías de hasta 80 caracteres cada una.",
    );
  return names;
}
export function categoryRows(records: string[][]): CategoryImportRow[] {
  if (records.length > 501) throw Error("Se admiten hasta 500 filas.");
  if (records.reduce((n, r) => n + r.join("").length, 0) > 200000)
    throw Error("Las categorías superan 200 000 caracteres.");
  const normalize = (s: string) =>
    categoryKey(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const rows = records.filter((r) => r.some((v) => v.trim()));
  if (
    rows[0] &&
    /^(categoria[s]? principal(es)?|principal(es)?)$/.test(
      normalize(rows[0][0] ?? ""),
    ) &&
    /^(categoria[s]? secundaria[s]?|secundaria[s]?)$/.test(
      normalize(rows[0][1] ?? ""),
    )
  )
    rows.shift();
  if (!rows.length || rows.length > 500)
    throw Error("Incluye entre 1 y 500 filas de categorías.");
  return rows.map((r, i) => {
    if (r.slice(2).some((s) => s.trim()))
      throw Error(
        `Fila ${i + 1}: usa solo Categoría principal y Categorías secundarias.`,
      );
    const primary = (r[0] ?? "").replace(/^\uFEFF/, "").trim(),
      secondary = (r[1] ?? "").trim();
    const p = splitCategoryNames(primary),
      s = splitCategoryNames(secondary);
    if (!p.length && !s.length)
      throw Error(`Fila ${i + 1}: incluye al menos una categoría.`);
    return { primary, secondary };
  });
}
export function parseCategoryText(
  text: string,
  csv = false,
): CategoryImportRow[] {
  if (text.length > 200000)
    throw Error("La lista admite hasta 200 000 caracteres.");
  text = text.replace(/^\uFEFF/, "");
  let delimiter = "\t";
  if (csv) {
    const counts = new Map([
      ["\t", 0],
      [";", 0],
      [",", 0],
    ]);
    let quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quote && text[i + 1] === '"') i++;
        else quote = !quote;
      } else if (!quote) {
        if (c === "\r" || c === "\n") break;
        if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
      }
    }
    delimiter = counts.get("\t") ? "\t" : counts.get(";") ? ";" : ",";
  }
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || !field)) {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw Error("Hay comillas sin cerrar.");
  row.push(field);
  records.push(row);
  return categoryRows(records);
}
