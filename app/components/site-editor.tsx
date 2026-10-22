"use client";
import { useEffect, useState } from "react";
import { PrivacyRequestInbox } from "./privacy-request-form";
import { PlanSettings } from "./membership-plans";
import type { SiteDocument } from "../../lib/site-content";
const names: Record<string, string> = {
  legal: "Privacidad, términos y eliminación de datos · Meta",
  hero: "Presentación y título principal",
  benefits: "Beneficios",
  features: "Funcionalidades",
  workflow: "Cómo funciona",
  testimonials: "Testimonios",
  plans: "Encabezado de planes",
  faq: "Preguntas frecuentes",
  closing: "Cierre y contacto",
};
const labels: Record<string, string> = {
  brand: "Nombre de la plataforma",
  eyebrow: "Frase superior",
  title: "Título",
  text: "Texto",
  cta: "Texto del botón",
  enabled: "Mostrar esta sección",
  name: "Nombre",
  role: "Cargo o empresa",
  quote: "Testimonio real",
  question: "Pregunta",
  answer: "Respuesta",
  contactEmail: "Correo público de contacto · opcional",
  operatorName: "Responsable legal",
  updatedOn: "Fecha de actualización",
  privacyText: "Política de privacidad",
  termsText: "Términos y condiciones del servicio",
  deletionText: "Instrucciones de eliminación de datos",
};
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/site/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo guardar la página.");
  return b;
}
export function SiteEditor() {
  const [content, setContent] = useState<SiteDocument | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [inboxOpen, setInboxOpen] = useState(false);
  useEffect(() => {
    let active = true;
    void request("admin")
      .then((r) => {
        if (active) {
          setContent(r.content);
          setRevision(r.revision);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const set = (section: string, key: string, value: unknown) =>
    setContent((old) =>
      old
        ? {
            ...old,
            [section]: { ...old[section as keyof SiteDocument], [key]: value },
          }
        : old,
    );
  return (
    <section className="stack site-editor">
      <div className="heading">
        <div>
          <h1>Página web</h1>
          <p>
            Edita los textos de la página pública y administra sus planes desde
            aquí.
          </p>
        </div>
        <a className="button" href="/plans" target="_blank" rel="noreferrer">
          Ver página pública ↗
        </a>
      </div>
      <p className="hint">
        Guarda cada sección para publicarla. Los botones de la página llevan a
        planes o al ingreso de la plataforma. No se admite código HTML.
      </p>
      <details className="panel" onToggle={e => { if (e.currentTarget.open) setInboxOpen(true); }}><summary>Solicitudes de privacidad y eliminación de datos</summary><div className="inside">{inboxOpen && <PrivacyRequestInbox />}</div></details>
      {content &&
        Object.entries(content).map(([section, raw]) => {
          const value = raw as Record<string, any>;
          return (
            <details
              className="panel site-section-editor"
              key={section}
              data-site-section={section}
            >
              <summary>{names[section]}</summary>
              <form
                className="inside stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy(true);
                  setMessage("");
                  void request(section, "PUT", { revision, value })
                    .then((r) => {
                      setRevision(r.revision);
                      setMessage(
                        names[section] + " guardado. Ya está publicado.",
                      );
                    })
                    .catch((e) => setMessage(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                <div className="fields">
                  {Object.entries(value)
                    .filter(([k]) => k !== "items")
                    .map(([key, v]) =>
                      typeof v === "boolean" ? (
                        <label className="row" key={key}>
                          <input
                            type="checkbox"
                            name={section + "-" + key}
                            disabled={busy}
                            checked={v}
                            onChange={(e) =>
                              set(section, key, e.target.checked)
                            }
                          />
                          {labels[key]}
                        </label>
                      ) : (
                        <label key={key}>
                          {section === "legal" && key === "contactEmail" ? "Correo público de privacidad · opcional, el formulario siempre está disponible" : labels[key] ?? key}
                          {["text", "privacyText", "termsText", "deletionText"].includes(key) ? (
                            <textarea
                              name={section + "-" + key}
                              value={v}
                              required
                              maxLength={section === "legal" ? key === "deletionText" ? 8000 : 18000 : 1500}
                              rows={section === "legal" ? 12 : 4}
                              disabled={busy}
                              onChange={(e) =>
                                set(section, key, e.target.value)
                              }
                            />
                          ) : (
                            <input
                              name={section + "-" + key}
                              type={key === "contactEmail" ? "email" : key === "updatedOn" ? "date" : "text"}
                              value={v}
                              maxLength={key === "contactEmail" ? 200 : 180}
                              required={key !== "contactEmail"}
                              disabled={busy}
                              onChange={(e) =>
                                set(section, key, e.target.value)
                              }
                            />
                          )}
                        </label>
                      ),
                    )}
                </div>
                {section === "legal" && <div className="stack">
                  <p>Documentos de PULPO ANALISIS Y AUTO. Se publican sin exigir inicio de sesión; guarda esta sección con el responsable correcto; el correo es opcional porque hay un formulario público funcional. Los textos también describen la generación de imágenes y los servicios externos configurados.</p>
                  <div className="row"><a href="/privacidad" target="_blank" rel="noopener noreferrer">Ver política de privacidad ↗</a><a href="/terminos" target="_blank" rel="noopener noreferrer">Ver términos del servicio ↗</a><a href="/eliminacion-de-datos" target="_blank" rel="noopener noreferrer">Ver eliminación de datos ↗</a><a href="/solicitudes-de-privacidad" target="_blank" rel="noopener noreferrer">Ver formulario de privacidad ↗</a></div>
                  <p>Para Meta, usa las páginas del dominio que ya publicaste: generator.agenciamagneto.org. Las mismas rutas están disponibles en el dominio de Vercel al actualizar ese despliegue.</p>
                </div>}
                {section === "testimonials" && (
                  <p className="notice">
                    Añade solo testimonios reales con autorización para
                    publicarlos. La sección comienza oculta y vacía; no se han
                    inventado clientes ni opiniones.
                  </p>
                )}
                {Array.isArray(value.items) && (
                  <div className="stack">
                    {value.items.map(
                      (item: Record<string, string>, index: number) => (
                        <fieldset key={index} className="site-item-row">
                          <legend>
                            {section === "testimonials"
                              ? "Testimonio"
                              : "Elemento"}{" "}
                            {index + 1}
                          </legend>
                          <div className="fields">
                            {Object.entries(item).map(([key, v]) => (
                              <label key={key}>
                                {labels[key] ?? key}
                                {["text", "quote", "answer"].includes(key) ? (
                                  <textarea
                                    required
                                    disabled={busy}
                                    maxLength={1500}
                                    value={v}
                                    onChange={(e) =>
                                      set(
                                        section,
                                        "items",
                                        value.items.map(
                                          (row: any, i: number) =>
                                            i === index
                                              ? {
                                                  ...row,
                                                  [key]: e.target.value,
                                                }
                                              : row,
                                        ),
                                      )
                                    }
                                  />
                                ) : (
                                  <input
                                    required={key !== "role"}
                                    disabled={busy}
                                    maxLength={180}
                                    value={v}
                                    onChange={(e) =>
                                      set(
                                        section,
                                        "items",
                                        value.items.map(
                                          (row: any, i: number) =>
                                            i === index
                                              ? {
                                                  ...row,
                                                  [key]: e.target.value,
                                                }
                                              : row,
                                        ),
                                      )
                                    }
                                  />
                                )}
                              </label>
                            ))}
                          </div>
                          <button
                            className="danger"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              set(
                                section,
                                "items",
                                value.items.filter(
                                  (_: unknown, i: number) => i !== index,
                                ),
                              )
                            }
                          >
                            Eliminar elemento
                          </button>
                        </fieldset>
                      ),
                    )}
                    <button
                      type="button"
                      disabled={
                        busy ||
                        value.items.length >=
                          (section === "features"
                            ? 10
                            : section === "faq"
                              ? 12
                              : section === "workflow"
                                ? 6
                                : 8)
                      }
                      onClick={() =>
                        set(section, "items", [
                          ...value.items,
                          section === "testimonials"
                            ? { name: "", role: "", quote: "" }
                            : section === "faq"
                              ? { question: "", answer: "" }
                              : { title: "", text: "" },
                        ])
                      }
                    >
                      + Añadir{" "}
                      {section === "testimonials" ? "testimonio" : "elemento"}
                    </button>
                  </div>
                )}
                <button className="primary" disabled={busy}>
                  Guardar {names[section].toLowerCase()}
                </button>
              </form>
            </details>
          );
        })}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <PlanSettings />
    </section>
  );
}
