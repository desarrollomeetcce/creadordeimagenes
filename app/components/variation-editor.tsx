"use client";
import { useEffect, useState, useRef } from "react";
import {
  ExecutionChoice,
  ProductionControls,
  useProductionController,
  type ExecutionMode,
} from "./production-controls";
import type { Design } from "@/lib/design";
type EditorData = {
  revision: number;
  document: Design | null;
  hasBackground: boolean;
  versions: { number: number; createdAt: string; editable: boolean }[];
};
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(result.error ?? "No se pudo completar la operación.");
  return result;
}
export function VariationEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<EditorData | null>(null),
    [draft, setDraft] = useState<Design | null>(null),
    [history, setHistory] = useState<Design[]>([]),
    [redo, setRedo] = useState<Design[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [prompt, setPrompt] = useState(""),
    [charge, setCharge] = useState(false),
    [kind, setKind] = useState<"background" | "full">("background"),
    [action, setAction] = useState<"edit-ai" | "regenerate">("edit-ai");
  const box = useRef<HTMLDivElement>(null);
  const load = async () => {
    const r = await api("variations/" + id + "/design");
    setData(r);
    setDraft(r.document);
    setHistory([]);
    setRedo([]);
    setSelected(r.document?.layers[0]?.id ?? "");
    setCharge(false);
  };
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("queue");
  const [queued, setQueued] = useState(false);
  const production = useProductionController(load);
  const run = async (
    fn: () => Promise<unknown>,
    success = "Cambios guardados",
  ) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(load, "");
  }, [id]);
  const edit = (next: Design) => {
    if (draft) setHistory([...history.slice(-49), draft]);
    setRedo([]);
    setDraft(next);
  };
  const change = (values: Record<string, unknown>) => {
    if (draft)
      edit({
        ...draft,
        layers: draft.layers.map((l) =>
          l.id === selected ? ({ ...l, ...values } as typeof l) : l,
        ),
      });
  };
  const layer = draft?.layers.find((l) => l.id === selected);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    id: string;
  } | null>(null);
  if (!data)
    return (
      <section className="panel">
        <p>Cargando editor…</p>
        <p role="status">{message}</p>
        <button onClick={onClose}>Cerrar</button>
      </section>
    );
  return (
    <section className="panel stack editor">
      <div className="row spread">
        <div>
          <h2>Ajustar afiche · versión {data.revision}</h2>
          <p className="muted">
            Los ajustes manuales no consumen IA. El original y las versiones
            anteriores se conservan.
          </p>
        </div>
        <button onClick={onClose}>Cerrar editor</button>
      </div>
      {draft ? (
        <div className="editor-grid">
          <div
            className="editor-canvas"
            ref={box}
            style={{
              aspectRatio: `${draft.width}/${draft.height}`,
              background: draft.backgroundColor,
            }}
            onPointerMove={(e) => {
              if (!drag.current || !box.current) return;
              const r = box.current.getBoundingClientRect(),
                d = drag.current;
              const active = draft.layers.find((l) => l.id === d.id);
              if (!active) return;
              const x = Math.max(
                  0,
                  Math.min(
                    draft.width - active.width,
                    Math.round(
                      d.startX + ((e.clientX - d.x) * draft.width) / r.width,
                    ),
                  ),
                ),
                y = Math.max(
                  0,
                  Math.min(
                    draft.height -
                      (active.type === "logo"
                        ? active.height
                        : active.fontSize),
                    Math.round(
                      d.startY + ((e.clientY - d.y) * draft.height) / r.height,
                    ),
                  ),
                );
              setDraft({
                ...draft,
                layers: draft.layers.map((l) =>
                  l.id === d.id ? { ...l, x, y } : l,
                ),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {data.hasBackground && (
              <img
                className="editor-bg"
                src={`/api/variations/${id}/background?version=${data.revision}`}
                alt="Fondo del afiche"
              />
            )}
            {draft.layers.map((l) => (
              <div
                key={l.id}
                role="button"
                tabIndex={0}
                aria-label={"Seleccionar " + l.id}
                className={
                  "editor-layer " + (selected === l.id ? "selected" : "")
                }
                style={{
                  left: (l.x / draft.width) * 100 + "%",
                  top: (l.y / draft.height) * 100 + "%",
                  width: (l.width / draft.width) * 100 + "%",
                  ...(l.type === "text"
                    ? {
                        fontSize: `${(l.fontSize / draft.width) * 100}cqw`,
                        color: l.color,
                        fontFamily: l.font,
                        textAlign: l.align,
                        whiteSpace: "pre-wrap",
                      }
                    : { height: (l.height / draft.height) * 100 + "%" }),
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(l.id);
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setSelected(l.id);
                  setHistory([...history.slice(-49), draft]);
                  setRedo([]);
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    startX: l.x,
                    startY: l.y,
                    id: l.id,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
              >
                {l.type === "text" ? (
                  l.text
                ) : (
                  <img
                    src={`/api/variations/${id}/logos/${l.attachmentId}`}
                    alt="Logo autorizado"
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="stack">
            <label>
              Elemento
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {draft.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.type === "text"
                      ? l.text.slice(0, 45) || l.id
                      : "Logo " + l.id}
                  </option>
                ))}
              </select>
            </label>
            {layer && (
              <>
                <div className="fields">
                  {(["x", "y", "width"] as const).map((k) => (
                    <label key={k}>
                      {k === "x"
                        ? "Posición horizontal"
                        : k === "y"
                          ? "Posición vertical"
                          : "Ancho"}
                      <input
                        type="number"
                        min={k === "width" ? 20 : 0}
                        max={4096}
                        value={layer[k]}
                        onChange={(e) =>
                          change({ [k]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
                {layer.type === "text" ? (
                  <>
                    <label>
                      Texto
                      <textarea
                        value={layer.text}
                        maxLength={1000}
                        onChange={(e) => change({ text: e.target.value })}
                      />
                    </label>
                    <div className="fields">
                      <label>
                        Tamaño
                        <input
                          type="number"
                          min={12}
                          max={240}
                          value={layer.fontSize}
                          onChange={(e) =>
                            change({ fontSize: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Color
                        <input
                          type="color"
                          value={layer.color}
                          onChange={(e) => change({ color: e.target.value })}
                        />
                      </label>
                      <label>
                        Fuente
                        <select
                          value={layer.font}
                          onChange={(e) => change({ font: e.target.value })}
                        >
                          {[
                            "DejaVu Sans",
                            "DejaVu Serif",
                            "DejaVu Sans Mono",
                          ].map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Alineación
                        <select
                          value={layer.align}
                          onChange={(e) => change({ align: e.target.value })}
                        >
                          <option value="left">Izquierda</option>
                          <option value="center">Centrado</option>
                          <option value="right">Derecha</option>
                        </select>
                      </label>
                    </div>
                  </>
                ) : (
                  <label>
                    Alto del área del logo
                    <input
                      type="number"
                      min={20}
                      max={4096}
                      value={layer.height}
                      onChange={(e) =>
                        change({ height: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
              </>
            )}
            <div className="row">
              <button
                disabled={!history.length}
                onClick={() => {
                  const previous = history.at(-1)!;
                  setHistory(history.slice(0, -1));
                  setRedo([...redo, draft]);
                  setDraft(previous);
                }}
              >
                Deshacer
              </button>
              <button
                disabled={!redo.length}
                onClick={() => {
                  const next = redo.at(-1)!;
                  setRedo(redo.slice(0, -1));
                  setHistory([...history, draft]);
                  setDraft(next);
                }}
              >
                Rehacer
              </button>
              <button
                disabled={busy}
                className="primary"
                onClick={() =>
                  void run(async () => {
                    await api("variations/" + id + "/manual", "POST", {
                      expectedRevision: data.revision,
                      document: draft,
                    });
                    await load();
                  }, "Nueva versión guardada sin consumo de IA.")
                }
              >
                Guardar versión
              </button>
            </div>
            <p className="hint">
              Arrastra los elementos para moverlos. La vista es orientativa; el
              servidor valida márgenes y textos cortados al guardar. El logo
              conserva sus proporciones.
            </p>
          </div>
        </div>
      ) : (
        <div className="notice">
          Esta versión es una imagen aplanada. Sus textos no se pueden mover
          individualmente. Puedes editarla con IA o regenerarla en modo
          editable.
        </div>
      )}
      <details>
        <summary>Historial de versiones y restauración</summary>
        <div className="inside row">
          {data.versions.map((v) => (
            <div key={v.number} className="version-item">
              <a
                href={`/api/variations/${id}/versions/${v.number}`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`/api/variations/${id}/versions/${v.number}`}
                  alt={"Versión " + v.number}
                />
              </a>
              <p>
                Versión {v.number} · {v.editable ? "Editable" : "Aplanada"}
              </p>
              <button
                disabled={busy || v.number === data.revision}
                onClick={() =>
                  void run(async () => {
                    await api("variations/" + id + "/restore-version", "POST", {
                      expectedRevision: data.revision,
                      number: v.number,
                    });
                    await load();
                  }, "Versión restaurada como una copia nueva.")
                }
              >
                Restaurar
              </button>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary>Editar o regenerar con inteligencia artificial</summary>
        <div className="inside stack">
          <div className="fields">
            <label>
              Operación
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value as typeof action);
                  setCharge(false);
                }}
              >
                <option value="edit-ai">
                  Editar esta imagen con un prompt
                </option>
                <option value="regenerate">
                  Otra variación · mantener instrucciones originales
                </option>
              </select>
            </label>
            {action === "edit-ai" && (
              <label>
                Qué modificar
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setCharge(false);
                  }}
                >
                  {draft && (
                    <option value="background">
                      Fondo o fotografía · conservar capas
                    </option>
                  )}
                  <option value="full">
                    Imagen completa · resultado aplanado
                  </option>
                </select>
              </label>
            )}
          </div>
          <p className="notice">
            {action === "regenerate"
              ? "La nueva variación conserva las instrucciones originales. Puedes dejar el campo vacío o añadir una especificación; el original se conserva."
              : "Describe qué cambiar en esta imagen. Se conservan el contexto original y las versiones anteriores."}
          </p>
          <label>
            {action === "regenerate"
              ? "Indicaciones adicionales · opcional"
              : "Qué deseas cambiar · prompt"}
            <textarea
              value={prompt}
              maxLength={12000}
              onChange={(e) => {
                setPrompt(e.target.value);
                setCharge(false);
              }}
              placeholder={
                action === "regenerate"
                  ? "Opcional: otra composición, con fondo claro y los mismos textos."
                  : "Ejemplo: cambia solo el fondo por un laboratorio; conserva el resto."
              }
            />
          </label>
          <p className="hint">
            Los adjuntos de esta variación están disponibles en la galería. La
            operación conserva las versiones anteriores.
          </p>
          <label className="row">
            <input
              type="checkbox"
              checked={charge}
              onChange={(e) => setCharge(e.target.checked)}
            />
            He revisado mis instrucciones y autorizo el posible cargo de API.
            Para conservar ajustes manuales, guárdalos antes de generar.
          </label>
          <ExecutionChoice
            value={executionMode}
            onChange={setExecutionMode}
            disabled={busy || production.active || production.dispatching}
          />
          <button
            disabled={
              busy ||
              production.active ||
              production.dispatching ||
              production.uncertainDispatch ||
              !charge ||
              (action === "edit-ai" && !prompt.trim())
            }
            className="primary"
            onClick={() =>
              void run(async () => {
                const result = await api(`variations/${id}/${action}`, "POST", {
                  expectedRevision: data.revision,
                  prompt,
                  confirmCharge: true,
                  reviewedInstructions: true,
                  requestId: crypto.randomUUID(),
                  editKind: draft ? kind : "full",
                });
                setCharge(false);
                setQueued(true);
                await production.start(result.jobs, executionMode);
              }, "Operación registrada solo para esta imagen. Revisa el resultado en Biblioteca → Producción.")
            }
          >
            Autorizar IA solo para esta imagen
          </button>
        </div>
      </details>
      <ProductionControls controller={production} />
      {queued && (
        <a
          className="button"
          target="_blank"
          rel="noopener"
          href={(() => {
            const p = new URLSearchParams(window.location.search);
            p.set("view", "library");
            p.set("tab", "production");
            p.delete("folder");
            return "?" + p;
          })()}
        >
          Revisar resultado en Producción ↗
        </a>
      )}
      <div className="row">
        <button
          disabled={busy}
          onClick={() => void run(load, "Editor actualizado")}
        >
          Recargar versión actual
        </button>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
