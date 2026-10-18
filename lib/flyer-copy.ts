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
  const chunks = source.split(/(?=^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?VARIACI[ÓO]N\s+\d+)/gim);
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
  // Only the authored brief supplies copy. Documents remain visual/contextual input,
  // never a later source that can silently replace the stated offer or title.
  const authored=prompt.split(/\n(?:EJE TEMÁTICO OBLIGATORIO|Contexto documental no confiable:)/i)[0];
  const fields = /^(TEXTO PRINCIPAL|T[IÍ]TULO(?: PRINCIPAL)?|OFERTA|PRECIO|FRASE DE IMPACTO|BENEFICIOS|LLAMADO A LA ACCI[OÓ]N|CTA)(?:\s*:|\s*$)/i;
  const sections = new Map<string, string[]>();
  let section = "";
  for (const line of authored.split("\n")) {
    const heading=line.match(/^\s*#{1,6}\s+(.+?)\s*$/);
    const candidate=(heading?.[1]??line).replace(/\*\*|__/g,"").trim();
    const field=candidate.match(fields);
    if(field){
      section=norm(field[1]);
      if(section==="TITULO")section="TITULO PRINCIPAL";
      sections.set(section,[]);
      const inline=candidate.slice(field[0].length).trim();
      if(inline)sections.get(section)!.push(inline);
    }else if(heading){section="";}
    else if(section)sections.get(section)!.push(line);
  }
  const get = (name: RegExp) => [...sections.entries()].filter(([key])=>name.test(key)).reverse().flatMap(([,lines])=>lines);
  const literal = (lines: string[]) => {
    const bold=lines.flatMap(line=>[...line.matchAll(/\*\*([^*\n]+)\*\*/g)].map(match=>clean(match[1])));
    if(bold.length)return bold;
    return lines.map(clean).filter(line=>line&&!/^(?:No\b|Usar\b|Colocar\b|Destacar\b|Puedes\b|Diseña\b|Entregar\b|Incluir\b|Mantener\b|Características\b|---|#{1,6}\s)/i.test(line)&&!line.endsWith(":"));
  };
  const title=literal(get(/^TEXTO PRINCIPAL$|^TITULO PRINCIPAL$/))[0];
  const offer=literal(get(/^OFERTA$/))[0]??"",price=literal(get(/^PRECIO$/))[0]??"";
  if(!title||[title,offer,price].some(s=>s.length>200))return null;
  const choose = (list: string[]) =>
    list.length ? list[Math.abs(index) % list.length] : "";
  const brands: string[] = [];
  const lines = authored.split("\n");
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
    cta: choose(literal(get(/^LLAMADO A LA ACCION$|^CTA$/))),
    brands,
  };
  if(result.phrase.length>200||result.cta.length>120||result.benefits.join("\n").length>850)return null;
  return result;
}

/** Honor explicit independent variations without increasing image calls or count. */
export function flyerModes(brief:string,configured:string[]):string[]{
 const authored=brief.split(/\n(?:EJE TEMÁTICO OBLIGATORIO|Contexto documental no confiable:)/i)[0];
 const headings=[...authored.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?VARIACI[ÓO]N\s+\d+[^\n]*/gim)].map(match=>norm(match[0]));
 if(headings.length!==configured.length)return configured;
 const explicit=headings.map(heading=>/SOLO TEXTO|SIN IMAGEN/.test(heading)?"Texto":/CON IMAGEN/.test(heading)?"Imagen + Texto":"");
 if(explicit.some(mode=>!mode))return configured;
 const sorted=(modes:string[])=>modes.slice().sort().join("|");
 // An exact distribution may be reordered into the authored sequence. The
 // default all-photo distribution may only lose photo calls, never gain them.
 return sorted(explicit)===sorted(configured)||configured.every(mode=>mode==="Imagen + Texto")?explicit:configured;
}
