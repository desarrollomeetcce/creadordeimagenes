"use client";
import { useEffect, useRef, useState } from "react";
type Reference = {
  id: string;
  name: string;
  url: string | null;
  characters: number;
};
export function CourseReferences({
  courseId,
  disabled,
  changed,
}: {
  courseId: string;
  disabled: boolean;
  changed: () => Promise<void>;
}) {
  const [items, setItems] = useState<Reference[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Cargando referencias…"),
    [mode, setMode] = useState("file");
  const controller = useRef<AbortController | null>(null);
  const path =
    "/api/courses-ai/" + encodeURIComponent(courseId) + "/references";
  async function call(suffix = "", init?: RequestInit, signal?: AbortSignal) {
    const r = await fetch(path + suffix, {
        ...init,
        signal,
        cache: "no-store",
      }),
      b = await r.json();
    if (!r.ok) throw Error(b.error ?? "No se pudo guardar la referencia.");
    return b;
  }
  useEffect(() => {
    const ac = new AbortController();
    controller.current = ac;
    void fetch(path, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        return b;
      })
      .then((b) => {
        setItems(b);
        setStatus("");
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [path]);
  async function run(
    operation: (
      signal: AbortSignal,
    ) => Promise<{ duplicate?: boolean } | unknown>,
  ) {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setStatus("Procesando referencia…");
    const ac = new AbortController();
    controller.current = ac;
    try {
      const r = (await operation(ac.signal)) as { duplicate?: boolean };
      if (ac.signal.aborted) return;
      setItems(await call("", undefined, ac.signal));
      await changed();
      setStatus(
        r?.duplicate
          ? "Esta información ya estaba guardada; no se duplicó."
          : "Banco de texto actualizado. El archivo original no se archiva.",
      );
    } catch (e) {
      if (!ac.signal.aborted) {
        setStatus("");
        setError(e instanceof Error ? e.message : "No se pudo procesar.");
      }
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File, signal: AbortSignal) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (["txt", "csv", "md"].includes(ext ?? "")) {
      const reader = file.stream().getReader(),
        decoder = new TextDecoder("utf-8", { fatal: true });
      let text = "";
      try {
        while (true) {
          if (signal.aborted) throw Error("Cancelado");
          const part = await reader.read();
          if (part.done) break;
          text += decoder.decode(part.value, { stream: true });
          if (text.length > 1_000_000)
            throw Error(
              "El texto supera un millón de caracteres. Selecciona las secciones relevantes o divídelo en referencias.",
            );
        }
        text += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return call(
        "",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name.slice(0, 200), text }),
        },
        signal,
      );
    }
    if (!["pdf", "docx"].includes(ext ?? ""))
      throw Error(
        "Usa TXT, CSV, MD, PDF o DOCX. Para imágenes escaneadas, extrae primero el texto con OCR.",
      );
    if (file.size > 16 * 1024 * 1024)
      throw Error(
        "Este PDF/Word supera 16 MB. Extrae las secciones relevantes a TXT para conservar la información sin subir el original.",
      );
    return call(
      "/file",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      },
      signal,
    );
  }
  return (
    <section
      className="course-reference-bank"
      aria-label="Banco de referencias"
    >
      <p>
        Opcional: guarda información para generar el temario, las clases y los
        materiales. Conservamos texto y procedencia; los archivos originales no
        se archivan ni se pueden descargar después.
      </p>
      <div
        className="course-toolbar"
        role="group"
        aria-label="Tipo de referencia"
      >
        {[
          ["file", "Adjuntar archivo"],
          ["web", "Enlace web"],
          ["text", "Pegar texto"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            disabled={busy}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <label>
          Archivo de referencia
          <input
            type="file"
            accept=".txt,.csv,.md,.pdf,.docx"
            disabled={busy || disabled}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void run((signal) => upload(file, signal));
            }}
          />
          <small>
            Texto UTF-8: hasta 1 millón de caracteres por referencia. PDF/Word:
            hasta 16 MB, 100 páginas PDF y 100 000 caracteres extraídos. Sin OCR
            automático. Para documentos mayores, adjunta un extracto en texto.
          </small>
        </label>
      ) : (
        <form
          className="course-form"
          key={mode}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            void run(async (signal) => {
              const r = await call(
                mode === "web" ? "/web" : "",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: f.get("name"),
                    [mode === "web" ? "url" : "text"]: f.get(
                      mode === "web" ? "url" : "text",
                    ),
                  }),
                },
                signal,
              );
              form.reset();
              return r;
            });
          }}
        >
          <label>
            Nombre de la referencia
            <input
              required
              name="name"
              maxLength={200}
              disabled={busy || disabled}
            />
          </label>
          {mode === "web" ? (
            <label>
              Enlace HTTPS público
              <input
                required
                type="url"
                name="url"
                maxLength={2000}
                placeholder="https://…"
                disabled={busy || disabled}
              />
              <small>
                Se lee solo al añadirlo. No se actualiza automáticamente. Para
                páginas con acceso privado, video o contenido no legible, pega
                el texto.
              </small>
            </label>
          ) : (
            <label>
              Contenido
              <textarea
                required
                name="text"
                rows={6}
                minLength={30}
                maxLength={1_000_000}
                disabled={busy || disabled}
              />
            </label>
          )}
          <button className="course-primary" disabled={busy || disabled}>
            {mode === "web"
              ? "Leer enlace y guardar información"
              : "Guardar información"}
          </button>
        </form>
      )}
      {busy && (
        <button
          type="button"
          onClick={() => {
            controller.current?.abort();
            setStatus(
              "Lectura cancelada. Si el guardado ya terminó, vuelve a abrir Referencias para comprobarlo.",
            );
          }}
        >
          Cancelar lectura
        </button>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="course-inline-error">
          {error}
        </p>
      )}
      <ul className="course-reference-list">
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.characters.toLocaleString("es")} caracteres guardados
                {item.url && (
                  <>
                    {" "}
                    ·{" "}
                    <a href={item.url} target="_blank" rel="noreferrer">
                      Ver fuente
                    </a>
                  </>
                )}
              </small>
            </div>
            <button
              type="button"
              disabled={busy || disabled}
              aria-label={"Retirar referencia " + item.name}
              onClick={() =>
                void run((signal) =>
                  call("/" + item.id, { method: "DELETE" }, signal),
                )
              }
            >
              Retirar
            </button>
          </li>
        ))}
      </ul>
      {!items.length && !busy && (
        <p className="muted">Puedes crear un curso sin referencias.</p>
      )}
      <p className="muted">
        La IA recibe fragmentos relevantes del banco, no todos los documentos
        completos. Revisa sus citas y resultados. Retirar una referencia elimina
        su texto guardado del banco; no reescribe clases ya generadas.
      </p>
    </section>
  );
}
