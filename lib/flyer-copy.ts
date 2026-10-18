export type FlyerCopy = {
  title: string;
  offer: string;
  price: string;
  phrase: string;
  benefits: string[];
  cta: string;
  brands: string[];
};
const norm = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
const clean = (text: string) =>
  text
    .replace(/^[\s>*\-•]+/, "")
    .replace(/\*\*|__/g, "")
    .trim();
export function oneFlyerBrief(prompt: string, mode: string, index: number) {
  const tailAt = prompt.indexOf("\nEJE TEMÁTICO OBLIGATORIO");
  const tail = tailAt >= 0 ? prompt.slice(tailAt) : "";
  const source = tailAt >= 0 ? prompt.slice(0, tailAt) : prompt;
  const chunks = source.split(/(?=^\s*#{1,6}\s*VARIACI[ÓO]N\s+\d+)/gim);
  if (chunks.length < 2) return prompt;
  const global = chunks.shift()!;
  const wanted = chunks.filter((chunk) => {
    const title = norm(
      chunk.split("\n").find((line) => /VARIACI[ÓO]N/i.test(line)) ?? "",
    );
    return mode === "Texto"
      ? /SOLO TEXTO|SIN IMAGEN/.test(title)
      : mode === "Imagen + Texto"
        ? /CON IMAGEN/.test(title)
        : false;
  });
  return (
    global +
    "\n" +
    (wanted.length
      ? wanted[Math.abs(index) % wanted.length]
      : chunks[Math.abs(index) % chunks.length]) +
    tail
  );
}
/** Explicit copy only; no paraphrasing, inferred offers or instruction-to-ad copying. */
export function extractFlyerCopy(prompt: string, index = 0): FlyerCopy | null {
  const sections = new Map<string, string[]>();
  let section = "";
  for (const line of prompt.split("\n")) {
    const heading = line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      section = norm(heading[1].replace(/\*\*/g, ""));
      sections.delete(section);
      sections.set(section, []);
    } else if (section) sections.get(section)!.push(line);
  }
  const get = (name: RegExp) =>
    [...sections.entries()]
      .filter(([key]) => name.test(key))
      .reverse()
      .flatMap(([, lines]) => lines);
  const literal = (lines: string[]) => {
    const bold = lines.flatMap((line) =>
      [...line.matchAll(/\*\*([^*\n]+)\*\*/g)].map((match) => clean(match[1])),
    );
    return bold.length
      ? bold
      : lines
          .filter((line) => /^\s*[-•]\s/.test(line))
          .map(clean)
          .filter(
            (line) =>
              line &&
              !/^(?:No |Usar |Colocar|Destacar|Puedes |Diseña|Entregar|Incluir|Mantener)/i.test(
                line,
              ),
          );
  };
  const title = literal(get(/^TEXTO PRINCIPAL$|^TITULO PRINCIPAL$/))[0];
  const offer = literal(get(/^OFERTA$/))[0],
    price = literal(get(/^PRECIO$/))[0];
  if (
    !title ||
    !offer ||
    !price ||
    [title, offer, price].some((s) => s.length > 200)
  )
    return null;
  const choose = (list: string[]) =>
    list.length ? list[Math.abs(index) % list.length] : "";
  const brands: string[] = [];
  const lines = prompt.split("\n");
  let collecting = false;
  for (const line of lines) {
    if (/incluir (?:los )?logos? de\s*:/i.test(line)) {
      collecting = true;
      continue;
    }
    if (!collecting || !line.trim()) continue;
    if (!/^\s*[-•]\s/.test(line) || /^No\s/i.test(clean(line))) {
      collecting = false;
      continue;
    }
    const name = clean(line);
    if (name.length <= 100 && brands.length < 6) brands.push(name);
  }
  const result = {
    title,
    offer,
    price,
    phrase: choose(literal(get(/^FRASE DE IMPACTO$/))),
    benefits: literal(get(/^BENEFICIOS$/)).slice(0, 4),
    cta: choose(literal(get(/^LLAMADO A LA ACCION$/))),
    brands,
  };
  if(result.phrase.length>200||result.cta.length>120||result.benefits.join("\n").length>850)return null;
  return result;
}
