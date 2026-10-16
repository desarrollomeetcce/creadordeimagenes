export type Layer = { name: string; prompt: string };
const price = /(?:S\/\s*|USD\s*|US\$\s*|EUR\s*|\$\s*|€\s*)\d+(?:[.,]\d+)?/gi;
const countries =
  /(?<!\p{L})(?:Perú|Ecuador|Colombia|Chile|Bolivia|México|Argentina|España)(?!\p{L})/giu;
// Conservative conventional resolver. Unknown semantic conflicts require human confirmation.
export function resolveInstructions(layers: Layer[]) {
  let clauses: { source: string; text: string }[] = [];
  const warnings: string[] = [];
  const overrides: string[] = [];
  for (const layer of layers) {
    const parts = layer.prompt
      .split(/(?<=[.!?;])\s+|\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    const ps = [...new Set(layer.prompt.match(price) ?? [])];
    const target = parts
      .filter((p) => !/(?:logo|exclu|no utilizar)/i.test(p))
      .join(" ");
    const cs = [
      ...new Set(
        (target.match(countries) ?? []).map((x) => x.toLocaleLowerCase()),
      ),
    ];
    if (ps.length > 1)
      warnings.push(
        `${layer.name}: hay varios precios; confirma el importe autorizado.`,
      );
    if (cs.length > 1)
      warnings.push(`${layer.name}: hay varios mercados; confirma el destino.`);
    if (ps.length === 1)
      clauses = clauses.filter((p) => {
        price.lastIndex = 0;
        const match = price.test(p.text);
        if (match)
          overrides.push(
            `Precio de ${p.source} reemplazado por ${layer.name}.`,
          );
        return !match;
      });
    if (cs.length === 1)
      clauses = clauses.filter((p) => {
        countries.lastIndex = 0;
        const match =
          countries.test(p.text) && !/(?:logo|exclu|no utilizar)/i.test(p.text);
        if (match)
          overrides.push(
            `Mercado de ${p.source} reemplazado por ${layer.name}.`,
          );
        return !match;
      });
    if (
      /(?:en lugar de|exclusivamente).*(?:paleta|tonos|colores)|(?:paleta|tonos|colores).*(?:en lugar de|exclusivamente)/i.test(
        layer.prompt,
      )
    )
      clauses = clauses.filter(
        (p) => !/(?:paleta|tonos|colores)/i.test(p.text),
      );
    clauses.push(...parts.map((text) => ({ source: layer.name, text })));
  }
  return {
    text: [...new Set(clauses.map((x) => x.text))].join("\n"),
    warnings,
    overrides,
    needsReview: true,
  };
}
export const defaults = {
  count: 1,
  textCount: 0,
  imageTextCount: 1,
  imageCount: 0,
  format: "1:1",
  style: "Profesional",
  editable: true,
};
export function effectiveSettings(category: unknown, subproduct: unknown) {
  return { ...defaults, ...(category as object), ...(subproduct as object) };
}
export function validateDistribution(s: typeof defaults) {
  if (!Number.isInteger(s.count) || s.count < 1 || s.count > 12)
    throw new Error("Selecciona entre 1 y 12 variaciones.");
  const values = [s.textCount, s.imageTextCount, s.imageCount];
  if (
    values.some((x) => !Number.isInteger(x) || x < 0) ||
    values.reduce((a, b) => a + b, 0) !== s.count
  )
    throw new Error("La distribución debe sumar el total de variaciones.");
}
