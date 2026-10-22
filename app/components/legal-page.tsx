import { notFound } from "next/navigation";
import { publicSite } from "../../lib/site-content";
import { legalReady } from "../../lib/legal-content";

export async function LegalPage({ kind }: { kind: "privacyText" | "termsText" | "deletionText" }) {
  const { content } = await publicSite();
  const legal = content.legal;
  if (!legalReady(legal)) notFound();
  const title = { privacyText: "Política de privacidad", termsText: "Términos y condiciones del servicio", deletionText: "Eliminación de datos" }[kind];
  return <div className="legal-site">
    <header><a href="/plans">{content.hero.brand}</a><a href="/">Ingresar a la plataforma</a></header>
    <main>
      <h1>{title}</h1>
      <p className="legal-app">PULPO ANALISIS Y AUTO · Plataforma de generación de imágenes y análisis Meta Ads</p>
      <dl><div><dt>Responsable</dt><dd>{legal.operatorName}</dd></div><div><dt>Contacto de privacidad y atención</dt><dd><a href="/solicitudes-de-privacidad">Formulario de consultas y solicitudes de privacidad</a>{legal.contactEmail && <> · <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a></>}</dd></div><div><dt>Última actualización</dt><dd><time dateTime={legal.updatedOn}>{legal.updatedOn.split("-").reverse().join("/")}</time></dd></div></dl>
      <article>{legal[kind].split(/\n\s*\n/).map((block, index) => {
        const [heading, ...lines] = block.split("\n");
        return lines.length ? <section key={index}><h2>{heading}</h2><p>{lines.join("\n")}</p></section> : <p key={index}>{heading}</p>;
      })}</article>
    </main>
    <footer><nav aria-label="Documentos legales"><a href="/privacidad">Política de privacidad</a><a href="/terminos">Términos del servicio</a><a href="/eliminacion-de-datos">Eliminación de datos</a><a href="/solicitudes-de-privacidad">Contacto y seguimiento</a></nav><a href="/plans">Volver a la página pública</a></footer>
  </div>;
}
