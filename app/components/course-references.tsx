"use client";
import { useEffect, useRef, useState } from "react";
type Kind = "FILE" | "WEB" | "TEXT";
type Reference = {
  id: string;
  name: string;
  url: string | null;
  kind: Kind;
  revision: number;
  characters: number;
};
type Draft = {
  key: string;
  id?: string;
  revision?: number;
  value: string;
  error?: string;
};
type PendingFile = { key: string; file: File; error?: string };
export function splitReferenceLinks(value: string) {
  return [
    ...new Set(
      value
        .split(/\s+|,(?=\s*https?:\/\/)/i)
        .map((s) => s.trim().replace(/,+$/g, ""))
        .filter(Boolean),
    ),
  ];
}
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
    [mode, setMode] = useState<Kind | null>(null),
    [files, setFiles] = useState<PendingFile[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [bulk, setBulk] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null),
    flight = useRef(false),
    alive = useRef(true);
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
  async function reload(signal?: AbortSignal) {
    const refs = await call("", undefined, signal);
    if (alive.current) setItems(refs);
  }
  useEffect(() => {
    alive.current = true;
    const ac = new AbortController();
    void reload(ac.signal).catch((e) => {
      if (!ac.signal.aborted) setError(e.message);
    });
    return () => {
      alive.current = false;
      ac.abort();
      controller.current?.abort();
    };
  }, [path]);
  useEffect(() => {
    if (mode && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [mode]);
  function open(kind: Kind) {
    setError("");
    setStatus("");
    setMode(kind);
    setDrafts([]);
    setFiles([]);
    setBulk("");
    if (kind === "TEXT" && !items.some((i) => i.kind === "TEXT"))
      setDrafts([{ key: crypto.randomUUID(), value: "" }]);
  }
  function close() {
    if (busy) return;
    dialog.current?.close();
    setMode(null);
  }
  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (flight.current || disabled) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    const ac = new AbortController();
    controller.current = ac;
    try {
      await operation(ac.signal);
      await reload(ac.signal);
      await changed();
    } catch (e) {
      if (!ac.signal.aborted && alive.current)
        setError(e instanceof Error ? e.message : "No se pudo completar.");
      if (ac.signal.aborted && alive.current) {
        setError(
          "Operación detenida. Vuelve a abrir las referencias para comprobar lo guardado.",
        );
        await reload().catch(() => {});
      }
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
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
          const p = await reader.read();
          if (p.done) break;
          text += decoder.decode(p.value, { stream: true });
          if (text.length > 1_000_000)
            throw Error(
              "El texto supera la capacidad por referencia. Divide el contenido.",
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
          body: JSON.stringify({
            name: file.name.slice(0, 200),
            kind: "FILE",
            text,
          }),
        },
        signal,
      );
    }
    if (!["pdf", "docx"].includes(ext ?? ""))
      throw Error("Usa TXT, CSV, MD, PDF o DOCX.");
    if (file.size > 16 * 1024 * 1024)
      throw Error("El PDF o Word supera 16 MB. Divide el documento.");
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
  function addLinks(text = bulk) {
    const urls = splitReferenceLinks(text);
    setDrafts((prev) => {
      const seen = new Set([
        ...items.filter((i) => i.kind === "WEB").map((i) => i.url),
        ...prev.map((d) => d.value),
      ]);
      return [
        ...prev,
        ...urls
          .filter((url) => !seen.has(url))
          .map((value) => ({ key: crypto.randomUUID(), value })),
      ];
    });
    setBulk("");
  }
  async function save() {
    await run(async (signal) => {
      let count = 0;
      if (mode === "FILE") {
        for (const entry of files) {
          if (signal.aborted) throw Error("Cancelado");
          try {
            await upload(entry.file, signal);
            setFiles((p) => p.filter((f) => f.key !== entry.key));
            count++;
          } catch (e) {
            if (signal.aborted) throw e;
            setFiles((p) =>
              p.map((f) =>
                f.key === entry.key
                  ? {
                      ...f,
                      error:
                        e instanceof Error ? e.message : "No se pudo procesar.",
                    }
                  : f,
              ),
            );
          }
        }
      } else {
        let pending = drafts;
        if (mode === "WEB" && bulk.trim()) {
          pending = [
            ...pending,
            ...splitReferenceLinks(bulk).map((value) => ({
              key: crypto.randomUUID(),
              value,
            })),
          ];
          setDrafts(pending);
          setBulk("");
        }
        for (const draft of pending) {
          if (signal.aborted) throw Error("Cancelado");
          try {
            const body =
              mode === "WEB" ? { url: draft.value } : { text: draft.value };
            await call(
              draft.id ? "/" + draft.id : mode === "WEB" ? "/web" : "",
              {
                method: draft.id ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...body,
                  ...(draft.id ? { revision: draft.revision } : {}),
                }),
              },
              signal,
            );
            setDrafts((p) => p.filter((d) => d.key !== draft.key));
            count++;
          } catch (e) {
            if (signal.aborted) throw e;
            setDrafts((p) =>
              p.map((d) =>
                d.key === draft.key
                  ? {
                      ...d,
                      error:
                        e instanceof Error ? e.message : "No se pudo guardar.",
                    }
                  : d,
              ),
            );
          }
        }
      }
      setStatus(
        count +
          " referencias guardadas. Los elementos con error quedan en esta ventana.",
      );
    });
  }
  async function edit(item: Reference) {
    if (item.kind === "WEB") {
      setDrafts((p) =>
        p.some((d) => d.id === item.id)
          ? p
          : [
              ...p,
              {
                key: item.id,
                id: item.id,
                revision: item.revision,
                value: item.url ?? "",
              },
            ],
      );
      return;
    }
    setError("");
    try {
      const r = await call("/" + item.id);
      setDrafts((p) =>
        p.some((d) => d.id === item.id)
          ? p
          : [
              ...p,
              {
                key: item.id,
                id: item.id,
                revision: r.revision,
                value: r.text,
              },
            ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir.");
    }
  }
  const group = items.filter((i) => i.kind === mode),
    titles = {
      FILE: "Archivos adjuntos",
      WEB: "Enlaces web",
      TEXT: "Textos pegados",
    };
  return (
    <section
      className="course-reference-bank"
      aria-label="Referencias del curso"
    >
      <div className="course-reference-shortcuts">
        {(["FILE", "WEB", "TEXT"] as Kind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => open(kind)}
            disabled={busy || disabled}
          >
            {titles[kind]} ({items.filter((i) => i.kind === kind).length})
          </button>
        ))}
      </div>
      <small>PDF/Word: 16 MB por archivo · PDF: 100 páginas</small>
      {!mode && error && <p role="alert">{error}</p>}
      {mode && (
        <dialog
          ref={dialog}
          className="course-reference-dialog"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <header>
            <h3>{titles[mode]}</h3>
            <button
              type="button"
              aria-label="Cerrar referencias"
              disabled={busy}
              onClick={close}
            >
              ×
            </button>
          </header>
          <div className="course-reference-dialog-body">
            {mode === "FILE" && (
              <>
                <label>
                  Añadir documentos
                  <input
                    type="file"
                    multiple
                    accept=".txt,.csv,.md,.pdf,.docx"
                    disabled={busy || disabled}
                    onChange={(e) => {
                      const incoming = Array.from(e.currentTarget.files ?? []);
                      setFiles((p) => [
                        ...p,
                        ...incoming.map((file) => ({
                          key: crypto.randomUUID(),
                          file,
                        })),
                      ]);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                <small>PDF/Word: 16 MB por archivo · PDF: 100 páginas</small>
              </>
            )}
            {mode === "WEB" && (
              <label>
                Pega enlaces separados por comas, espacios o saltos de línea
                <textarea
                  rows={3}
                  value={bulk}
                  disabled={busy}
                  onChange={(e) => setBulk(e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    addLinks(e.clipboardData.getData("text"));
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !bulk.trim()}
                  onClick={() => addLinks()}
                >
                  Añadir a la lista
                </button>
              </label>
            )}
            <ul className="course-saved-references">
              {group.map((item, i) => (
                <li key={item.id}>
                  <span>
                    {mode === "FILE"
                      ? item.name
                      : mode === "WEB"
                        ? item.url
                        : "Texto pegado " + (i + 1)}
                  </span>
                  {mode !== "FILE" && (
                    <button
                      type="button"
                      disabled={busy || disabled}
                      onClick={() => void edit(item)}
                    >
                      Editar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || disabled}
                    aria-label={"Quitar referencia " + (i + 1)}
                    onClick={() =>
                      void run(async (signal) => {
                        await call("/" + item.id, { method: "DELETE" }, signal);
                        setDrafts((p) => p.filter((d) => d.id !== item.id));
                      })
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            {files.map((f) => (
              <div key={f.key} className="course-reference-draft">
                <span>{f.file.name}</span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={"Quitar archivo pendiente " + f.file.name}
                  onClick={() =>
                    setFiles((p) => p.filter((v) => v.key !== f.key))
                  }
                >
                  ×
                </button>
                {f.error && <p role="alert">{f.error}</p>}
              </div>
            ))}
            {drafts.map((d, i) => (
              <div key={d.key} className="course-reference-draft">
                <label>
                  {mode === "WEB" ? "Enlace " : "Texto pegado "}
                  {i + 1}
                  {mode === "WEB" ? (
                    <input
                      value={d.value}
                      disabled={busy}
                      maxLength={2000}
                      onChange={(e) =>
                        setDrafts((p) =>
                          p.map((v) =>
                            v.key === d.key
                              ? { ...v, value: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  ) : (
                    <textarea
                      rows={5}
                      value={d.value}
                      disabled={busy}
                      maxLength={1_000_000}
                      onChange={(e) =>
                        setDrafts((p) =>
                          p.map((v) =>
                            v.key === d.key
                              ? { ...v, value: e.target.value }
                              : v,
                          ),
                        )
                      }
                    />
                  )}
                </label>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={"Quitar borrador " + (i + 1)}
                  onClick={() =>
                    setDrafts((p) => p.filter((v) => v.key !== d.key))
                  }
                >
                  ×
                </button>
                {d.error && <p role="alert">{d.error}</p>}
              </div>
            ))}
            {mode === "TEXT" && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setDrafts((p) => [
                    ...p,
                    { key: crypto.randomUUID(), value: "" },
                  ])
                }
              >
                + Otro texto pegado
              </button>
            )}
            {error && <p role="alert">{error}</p>}
            {status && <p role="status">{status}</p>}
          </div>
          <footer>
            {busy ? (
              <button type="button" onClick={() => controller.current?.abort()}>
                Detener
              </button>
            ) : (
              <button type="button" onClick={close}>
                Cerrar
              </button>
            )}
            <button
              className="course-primary"
              type="button"
              disabled={
                busy ||
                disabled ||
                !(mode === "FILE" ? files.length : drafts.length || bulk.trim())
              }
              onClick={() => void save()}
            >
              {busy ? "Guardando…" : "Guardar referencias"}
            </button>
          </footer>
        </dialog>
      )}
    </section>
  );
}
