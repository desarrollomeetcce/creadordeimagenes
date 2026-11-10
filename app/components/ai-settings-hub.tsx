"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { PasswordInput } from "./password-input";
import "./ai-settings-hub.css";
const CourseConfiguration = dynamic(
  () => import("./courses-ai").then((m) => m.CourseConfiguration),
  { loading: () => <p role="status">Cargando parámetros de cursos…</p> },
);
const providers = [
  {
    id: "openai",
    name: "OpenAI",
    uses: "Afiches · texto · voz",
    link: "https://platform.openai.com/api-keys",
  },
  {
    id: "google",
    name: "Google AI / Gemini",
    uses: "Afiches · texto · voz · video",
    link: "https://aistudio.google.com/apikey",
  },
  {
    id: "fal",
    name: "fal.ai",
    uses: "Imágenes FLUX y otros · video · varios fabricantes",
    link: "https://fal.ai/dashboard/keys",
  },
  {
    id: "replicate",
    name: "Replicate",
    uses: "Afiches",
    link: "https://replicate.com/account/api-tokens",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    uses: "Texto y materiales",
    link: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    uses: "Texto y materiales",
    link: "https://console.mistral.ai/api-keys",
  },
  {
    id: "cartesia",
    name: "Cartesia / Sonic",
    uses: "Voz",
    link: "https://play.cartesia.ai/keys",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    uses: "Voz y clonación",
    link: "https://elevenlabs.io/app/settings/api-keys",
  },
];
async function api(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/" + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ?? AbortSignal.timeout(90000),
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
export function AISettingsHub({ posters }: { posters: ReactNode }) {
  const [tab, setTab] = useState("connections"),
    [posterOpen, setPosterOpen] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("aiTab");
    if (["connections", "posters", "courses"].includes(value ?? ""))
      setTab(value!);
  }, []);
  return (
    <section className="ai-hub">
      <header className="ai-hub-hero">
        <div>
          <span>ESPACIO DE INTELIGENCIA ARTIFICIAL</span>
          <h1>
            Ajustes IA <b>✦</b>
          </h1>
          <p>
            Una conexión por proveedor. Parámetros independientes para cada uso.
          </p>
        </div>
        <a href="/?view=courses-ai">Ir a Cursos IA →</a>
      </header>
      <nav className="ai-hub-tabs" aria-label="Secciones de Ajustes IA">
        {[
          ["connections", "⚡ Conexiones"],
          ["posters", "▧ Afiches"],
          ["courses", "▣ Cursos · texto, voz y video"],
        ].map(([id, name]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === "connections" ? (
        <UnifiedConnections />
      ) : tab === "posters" ? (
        <section>
          <button
            type="button"
            aria-expanded={posterOpen}
            onClick={() => setPosterOpen(!posterOpen)}
          >
            {posterOpen
              ? "▴ Plegar parámetros de afiches"
              : "▾ Proveedor, modelo, calidad y resolución de afiches"}
          </button>
          {posterOpen && posters}
        </section>
      ) : (
        <CourseConfiguration />
      )}
    </section>
  );
}
function UnifiedConnections() {
  const [rows, setRows] = useState<any[]>([]),
    [course, setCourse] = useState<any[]>([]),
    [open, setOpen] = useState(""),
    [key, setKey] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = async (signal?: AbortSignal) => {
    const r = await Promise.allSettled([
      api("ai/connections", undefined, undefined, signal),
      api("courses-ai/providers", undefined, undefined, signal),
    ]);
    for (const [i, v] of r.entries()) {
      if (v.status === "rejected") throw v.reason;
      if (i === 0) setRows(v.value);
      else setCourse(v.value);
    }
  };
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal).catch((e) => {
      if (!c.signal.aborted) setError(e.message);
    });
    return () => c.abort();
  }, []);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="ai-hub-hint">
        Abre un proveedor para guardar su clave o consultar modelos. Guardar una
        clave y consultar catálogos no inicia generaciones.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="ai-hub-hint">
          Procesando solicitud…
        </p>
      )}
      {message && (
        <p role="status" className="notice success">
          {message}
        </p>
      )}
      <div className="ai-connection-grid" aria-busy={busy}>
        {providers.map((p) => {
          const cp = p.id === "google" ? "gemini" : p.id,
            profile = rows.find((r) => r.provider === p.id),
            catalog = course.find((c) => c.provider === cp),
            isShared = ["openai", "google", "fal", "replicate"].includes(p.id),
            configured = isShared ? profile?.configured : !!catalog?.maskedKey;
          return (
            <details
              key={p.id}
              className="ai-provider-card"
              data-provider={p.id}
              open={open === p.id}
            >
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  setOpen(open === p.id ? "" : p.id);
                  setKey("");
                  setQuery("");
                  setError("");
                  setMessage("");
                }}
              >
                <span className={"ai-provider-icon ai-provider-" + p.id}>
                  {p.name[0]}
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.uses}</small>
                </span>
                <span
                  className={"ai-key-state" + (configured ? " connected" : "")}
                >
                  {configured ? "Conectado" : "Sin clave"}
                </span>
              </summary>
              {open === p.id && (
                <div className="ai-provider-body">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        if (isShared)
                          await api(
                            "ai/connections",
                            { provider: p.id, apiKey: key },
                            "PUT",
                          );
                        else
                          await api("courses-ai/providers", {
                            provider: cp,
                            key,
                          });
                        setKey("");
                        setMessage(
                          "Clave guardada. Consulta los modelos antes de generar.",
                        );
                      });
                    }}
                  >
                    <label>
                      {configured ? "Reemplazar clave compartida" : "Clave API"}
                      <PasswordInput
                        name={"key-" + p.id}
                        autoComplete="off"
                        value={key}
                        maxLength={1000}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={
                          (isShared
                            ? profile?.maskedKey
                            : catalog?.maskedKey) ?? "Pega tu clave"
                        }
                      />
                    </label>
                    <div className="ai-provider-actions">
                      <button
                        type="submit"
                        className="primary"
                        disabled={busy || !key}
                      >
                        Guardar clave
                      </button>
                      <a href={p.link} target="_blank" rel="noreferrer">
                        Obtener clave ↗
                      </a>
                    </div>
                  </form>
                  {p.id === "elevenlabs" && (
                    <div className="ai-provider-actions">
                      <button
                        type="button"
                        disabled={busy || !configured}
                        onClick={() =>
                          void action(async () => {
                            await api(
                              "courses-ai/providers/elevenlabs/discover",
                              {},
                            );
                            setMessage(
                              "Voces de ElevenLabs actualizadas. Ya puedes elegirlas en Voz del curso.",
                            );
                          })
                        }
                      >
                        Actualizar mis voces
                      </button>
                      <small>
                        Incluye las voces propias o clonadas disponibles con
                        esta clave.
                      </small>
                    </div>
                  )}
                  {catalog?.voices?.length > 0 && (
                    <details>
                      <summary>
                        Voces disponibles ({catalog.voices.length})
                      </summary>
                      <ul>
                        {catalog.voices.map((v: any) => (
                          <li key={v.id}>{v.name}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <details>
                    <summary>Modelos disponibles y opciones</summary>
                    {p.id === "fal" && (
                      <label>
                        Buscar modelos de imágenes o video
                        <input
                          value={query}
                          maxLength={100}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="FLUX, Wan, Kling, LTX, Veo…"
                        />
                      </label>
                    )}
                    <div className="ai-provider-actions">
                      {isShared && (
                        <button
                          type="button"
                          disabled={busy || !configured}
                          onClick={() =>
                            void action(async () => {
                              await api("ai/connections/" + p.id + "/verify", {
                                query: p.id === "fal" ? query : "",
                              });
                              setMessage("Catálogo de afiches actualizado.");
                            })
                          }
                        >
                          Consultar modelos para afiches
                        </button>
                      )}
                      {p.id !== "replicate" && (
                        <button
                          type="button"
                          disabled={busy || !(configured || catalog?.maskedKey)}
                          onClick={() =>
                            void action(async () => {
                              await api(
                                "courses-ai/providers/" + cp + "/discover",
                                { query },
                              );
                              setMessage(
                                "Catálogo de cursos actualizado. Elige el modelo en Proveedores para cursos o en cada curso.",
                              );
                            })
                          }
                        >
                          Consultar modelos y voces para cursos
                        </button>
                      )}
                    </div>
                    <p className="muted">
                      Afiches: {profile?.modelCount ?? 0} modelos · Cursos:{" "}
                      {catalog?.models?.length ?? 0} modelos. Solo aparecen
                      opciones compatibles devueltas por la cuenta.
                    </p>
                    {catalog?.models?.length > 0 && (
                      <ul className="ai-model-list">
                        {catalog.models.map((m: any) => (
                          <li key={m.id}>
                            <span>{m.name}</span>
                            <small>
                              {
                                (
                                  {
                                    text: "Texto",
                                    speech: "Voz",
                                    image: "Imagen",
                                    video: "Video",
                                  } as any
                                )[m.kind]
                              }
                            </small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                  {isShared && catalog?.shared === false && (
                    <div className="notice">
                      <p>
                        Cursos conserva una clave anterior ({catalog.maskedKey}
                        ). Puedes conservarla o pasar a la clave compartida de{" "}
                        {p.name}.
                      </p>
                      <button
                        type="button"
                        disabled={busy || !configured}
                        onClick={() => {
                          if (
                            !confirm(
                              "¿Usar la clave compartida en Cursos IA? Se conservarán los cursos; tendrás que consultar de nuevo sus modelos.",
                            )
                          )
                            return;
                          void action(async () => {
                            await api(
                              "courses-ai/providers/" + cp + "/shared",
                              {},
                            );
                            setMessage(
                              "Cursos usa ahora la clave compartida. Consulta su catálogo.",
                            );
                          });
                        }}
                      >
                        Usar clave compartida en Cursos IA
                      </button>
                    </div>
                  )}
                  {p.id === "elevenlabs" && (
                    <VoiceCloning
                      disabled={!configured}
                      onCloned={async () => {
                        await api(
                          "courses-ai/providers/elevenlabs/discover",
                          {},
                        );
                        await load();
                      }}
                    />
                  )}
                </div>
              )}
            </details>
          );
        })}
      </div>
      <details className="ai-help">
        <summary>¿Qué necesito para empezar y ahorrar?</summary>
        <p>
          Una clave de Google puede cubrir las funciones compatibles de texto,
          imagen, voz y video; la disponibilidad depende de tu cuenta. OpenAI
          combina texto, voz e imagen. fal.ai reúne modelos de varios
          fabricantes: compara sus tarifas antes de generar.
        </p>
        <p>
          Empieza con clips cortos y resolución moderada. La presentación
          narrada local sigue disponible sin pagar una IA de video. Una
          suscripción de chat no equivale a saldo de API.
        </p>
      </details>
    </>
  );
}
function VoiceCloning({
  disabled,
  onCloned,
}: {
  disabled: boolean;
  onCloned: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details>
      <summary>Clonar una voz autorizada</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/courses-ai/voices/clone", {
              method: "POST",
              body: new FormData(form),
              signal: AbortSignal.timeout(150000),
            });
            const b = await r.json();
            if (!r.ok) throw Error(b.error);
            form.reset();
            try {
              await onCloned();
            } catch {
              setMessage(
                "Voz creada. No se pudo importar la lista; usa Actualizar mis voces antes de volver a clonar.",
              );
              return;
            }
            setMessage(
              b.requiresVerification
                ? "Voz creada; completa la verificación de ElevenLabs."
                : "Voz creada e importada. Ya puedes elegirla en el curso.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "No se pudo clonar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nombre
          <input name="name" required maxLength={100} />
        </label>
        <label>
          Audio
          <input name="file" type="file" accept="audio/*" required />
        </label>
        <label className="ai-consent">
          <input type="checkbox" required name="consent" value="yes" /> Es mi
          voz o tengo autorización expresa.
        </label>
        <button disabled={busy || disabled}>
          Clonar voz · servicio de pago
        </button>
      </form>
      <p role="status">{message}</p>
    </details>
  );
}
