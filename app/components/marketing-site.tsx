import type { SiteDocument } from "../../lib/site-content";
import { PublicPlans } from "./membership-plans";
import { legalReady } from "../../lib/legal-content";
export function MarketingSite({
  content: c,
  plans,
}: {
  content: SiteDocument;
  plans: any[];
}) {
  return (
    <div className="marketing-site">
      <header className="marketing-nav">
        <a className="marketing-brand" href="/plans">
          <span>✳</span>
          {c.hero.brand}
        </a>
        <nav aria-label="Página pública">
          {c.features.enabled && <a href="#funcionalidades">Funcionalidades</a>}
          {c.workflow.enabled && <a href="#como-funciona">Cómo funciona</a>}
          {c.plans.enabled && <a href="#planes">Planes</a>}
          <a className="button" href="/">
            Ingresar →
          </a>
        </nav>
      </header>
      <main>
        <section className="marketing-hero">
          <div className="hero-copy">
            <div className="marketing-kicker">{c.hero.eyebrow}</div>
            <h1>{c.hero.title}</h1>
            <p>{c.hero.text}</p>
            <div className="row">
              <a
                href={c.plans.enabled ? "#planes" : "/"}
                className="button primary"
              >
                {c.hero.cta} →
              </a>
              {c.features.enabled && (
                <a className="text-link" href="#funcionalidades">
                  Explora las funcionalidades ↓
                </a>
              )}
            </div>
          </div>
          <div
            className="hero-campaign"
            aria-label="Ejemplo ilustrativo de una campaña organizada"
          >
            <div className="campaign-label">
              Una idea. Tu identidad. Muchas posibilidades.
            </div>
            <div className="campaign-poster poster-back">
              <span>ESTUDIO / CAMPAÑA</span>
              <strong>
                Tu próxima
                <br />
                gran idea.
              </strong>
              <div className="poster-orbit" />
              <small>UNA NUEVA PERSPECTIVA</small>
            </div>
            <div className="campaign-poster poster-front">
              <span>CREA / COMPARTE / CONECTA</span>
              <strong>
                Haz espacio
                <br />
                para crear.
              </strong>
              <div className="poster-shape" />
              <small>TU MARCA, EN CADA VARIACIÓN</small>
            </div>
            <div className="campaign-caption">
              Ejemplo de organización visual · Proyecto → Producto → Variaciones
            </div>
          </div>
        </section>
        {c.benefits.enabled && (
          <section className="marketing-section benefits-section">
            <div className="section-heading">
              <span className="marketing-kicker">
                DISEÑADO PARA TU DÍA A DÍA
              </span>
              <h2>{c.benefits.title}</h2>
              <p>{c.benefits.text}</p>
            </div>
            <div className="marketing-grid">
              {c.benefits.items.map((i, n) => (
                <article key={n} className="benefit-card">
                  <span className="feature-number">0{n + 1}</span>
                  <h3>{i.title}</h3>
                  <p>{i.text}</p>
                </article>
              ))}
            </div>
          </section>
        )}
        {c.features.enabled && (
          <section className="marketing-section" id="funcionalidades">
            <div className="section-heading">
              <span className="marketing-kicker">
                DEL BRIEFING A LA ENTREGA
              </span>
              <h2>{c.features.title}</h2>
              <p>{c.features.text}</p>
            </div>
            <div className="marketing-grid features-grid">
              {c.features.items.map((i, n) => (
                <article key={n} className="feature-card">
                  <span className="feature-icon" aria-hidden>
                    {["▦", "✳", "◈", "→", "▧", "◎"][n % 6]}
                  </span>
                  <h3>{i.title}</h3>
                  <p>{i.text}</p>
                </article>
              ))}
            </div>
          </section>
        )}
        {c.workflow.enabled && (
          <section
            className="marketing-section workflow-section"
            id="como-funciona"
          >
            <div className="section-heading">
              <span className="marketing-kicker">UN FLUJO CLARO</span>
              <h2>{c.workflow.title}</h2>
            </div>
            <ol className="marketing-grid workflow-grid">
              {c.workflow.items.map((i, n) => (
                <li key={n}>
                  <span className="step-number">{n + 1}</span>
                  <h3>{i.title}</h3>
                  <p>{i.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
        {c.testimonials.enabled && c.testimonials.items.length > 0 && (
          <section className="marketing-section" id="testimonios">
            <div className="section-heading">
              <h2>{c.testimonials.title}</h2>
            </div>
            <div className="marketing-grid">
              {c.testimonials.items.map((i, n) => (
                <figure className="testimonial-card" key={n}>
                  <blockquote>“{i.quote}”</blockquote>
                  <figcaption>
                    <strong>{i.name}</strong>
                    {i.role && <span>{i.role}</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
        {c.plans.enabled && (
          <section className="marketing-section pricing-section" id="planes">
            <div className="section-heading">
              <span className="marketing-kicker">CRECE A TU RITMO</span>
              <h2>{c.plans.title}</h2>
              <p>{c.plans.text}</p>
            </div>
            {plans.length ? (
              <PublicPlans embedded initialPlans={plans} />
            ) : (
              <p>Consulta con el equipo los planes disponibles.</p>
            )}
          </section>
        )}
        {c.faq.enabled && (
          <section className="marketing-section faq-section">
            <div className="section-heading">
              <span className="marketing-kicker">PREGUNTAS FRECUENTES</span>
              <h2>{c.faq.title}</h2>
            </div>
            <div>
              {c.faq.items.map((i, n) => (
                <details key={n}>
                  <summary>{i.question}</summary>
                  <p>{i.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
        <section className="marketing-closing">
          <span className="marketing-kicker">CREA LO QUE SIGUE</span>
          <h2>{c.closing.title}</h2>
          <p>{c.closing.text}</p>
          <a className="button" href="/">
            {c.closing.cta} →
          </a>
        </section>
      </main>
      <footer className="marketing-footer">
        <strong>{c.hero.brand}</strong>
        <span>Tu espacio de producción creativa.</span>
        {c.closing.contactEmail && (
          <a href={"mailto:" + c.closing.contactEmail}>Contacto</a>
        )}
        <a href="/">Acceder a la plataforma →</a>
        {legalReady(c.legal) && <nav aria-label="Información legal"><a href="/privacidad">Privacidad</a> · <a href="/terminos">Términos del servicio</a> · <a href="/eliminacion-de-datos">Eliminación de datos</a></nav>}
      </footer>
    </div>
  );
}
