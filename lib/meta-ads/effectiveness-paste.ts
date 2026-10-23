import { countryOptions, isCountryCode } from "./countries";
const normalize = (s: string) =>
  s
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function resolveCountry(value: string): string | null {
  const s = value.trim();
  if (!s) return "";
  const code = s.toUpperCase();
  if (isCountryCode(code)) return code;
  return (
    countryOptions.find(
      (c) =>
        normalize(c.name) === normalize(s) ||
        normalize(`${c.code} · ${c.name}`) === normalize(s),
    )?.code ?? null
  );
}
export function parseEffectivenessPaste(
  text: string,
  country = "",
  currency = "PEN",
  csv = false,
) {
  if (text.length > 100000)
    throw Error("La lista admite hasta 100 000 caracteres.");
  let delimiter = "\t";
  if (csv) {
    const counts = new Map([
      ["\t", 0],
      [";", 0],
      [",", 0],
    ]);
    let inside = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inside && text[i + 1] === '"') i++;
        else inside = !inside;
      } else if (!inside) {
        if (ch === "\n" || ch === "\r") break;
        if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
      }
    }
    delimiter =
      [...counts].sort((a, b) => b[1] - a[1])[0][1] > 0
        ? [...counts].sort((a, b) => b[1] - a[1])[0][0]
        : ",";
  }
  const records: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (csv && ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && ch === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c.trim())) records.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw Error("Hay comillas sin cerrar en el archivo.");
  row.push(field);
  if (row.some((c) => c.trim())) records.push(row);
  if (!records.length || records.length > 500)
    throw Error("Pega entre 1 y 500 filas.");
  return records.map((r, i) => {
    if (r.length > 3)
      throw Error(`Fila ${i + 1}: usa Nombre, País y Moneda como máximo.`);
    const name = r[0].replace(/^\uFEFF/, "").trim();
    if (!name || name.length > 150 || /[\r\n]/.test(name))
      throw Error(
        `Fila ${i + 1}: el nombre debe tener entre 1 y 150 caracteres.`,
      );
    const code = resolveCountry(r[1] ?? country);
    if (code === null) throw Error(`Fila ${i + 1}: país no reconocido.`);
    const unit = (r[2] ?? currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(unit))
      throw Error(
        `Fila ${i + 1}: indica una moneda de 3 letras, por ejemplo PEN.`,
      );
    return { name, country: code, currency: unit };
  });
}
