"use client";
import { resizeLayer, type ResizeHandle } from "../../lib/editor-geometry";
import { CreativeFinish } from "./creative-finish";
import { useEffect, useState, useRef } from "react";
import {
  ExecutionChoice,
  ProductionControls,
  useProductionController,
  type ExecutionMode,
} from "./production-controls";
import { orderRequest, driveOrder } from "./order-progress";
import type { Design } from "@/lib/design";
type EditorData = {
  jobId: string;
  orderId: string | null;
  orderMode: string | null;
  canApprove: boolean;
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
  const [reasoningLevel,setReasoningLevel]=useState<"low"|"medium"|"high">("medium");
  const [designMode,setDesignMode]=useState<"professional"|"editable">("professional");
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
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("background");
  const [queued, setQueued] = useState(false);
  const production = useProductionController();
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
    handle?: ResizeHandle;
    layer: Design["layers"][number];
    height: number;
  } | null>(null);
  const [contextMenu,setContextMenu]=useState<{id:string;x:number;y:number}|null>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!contextMenu)return;const close=(event:PointerEvent)=>{if(!menuRef.current?.contains(event.target as Node))setContextMenu(null);};const key=(event:KeyboardEvent)=>{if(event.key==="Escape")setContextMenu(null);};window.addEventListener("pointerdown",close);window.addEventListener("keydown",key);return()=>{window.removeEventListener("pointerdown",close);window.removeEventListener("keydown",key);};},[contextMenu]);
  const reorder=(id:string,direction:"front"|"back"|"up"|"down")=>{
    if(!draft)return;const layers=[...draft.layers],index=layers.findIndex(l=>l.id===id);if(index<0)return;
    const next=direction==="front"?layers.length-1:direction==="back"?0:Math.max(0,Math.min(layers.length-1,index+(direction==="up"?1:-1)));
    if(index!==next){const [item]=layers.splice(index,1);layers.splice(next,0,item);edit({...draft,layers});}setContextMenu(null);
  };
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
        <div className="row">
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "¿Enviar esta imagen a la papelera? Se conserva el historial y no se devuelve el gasto de IA.",
                )
              )
                void run(async () => {
                  await api(`variations/${id}`, "DELETE");
                  onClose();
                }, "Imagen enviada a la papelera.");
            }}
          >
            Eliminar imagen
          </button>
          <button onClick={onClose}>Cerrar editor</button>
        </div>
      </div>
      {contextMenu&&<div ref={menuRef} role="menu" aria-label="Orden de capas" className="editor-context-menu" style={{left:Math.max(4,contextMenu.x),top:Math.max(4,contextMenu.y)}} onKeyDown={e=>{if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();const buttons=[...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")],i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==="Home"?0:e.key==="End"?buttons.length-1:(i+(e.key==="ArrowDown"?1:buttons.length-1))%buttons.length]?.focus();}}}>{([["front","Traer al frente"],["up","Subir una capa"],["down","Bajar una capa"],["back","Enviar al fondo"]] as const).map(([direction,label])=><button type="button" role="menuitem" key={direction} onClick={()=>reorder(contextMenu.id,direction)}>{label}</button>)}</div>}
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
              if(d.handle){const changed=resizeLayer(d.layer,d.handle,((e.clientX-d.x)*draft.width)/r.width,((e.clientY-d.y)*draft.height)/r.height,draft,d.height);setDraft({...draft,layers:draft.layers.map(l=>l.id===d.id?changed:l)});return;}
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
                      (active.type !== "text"
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
                role="group"
                tabIndex={0}
                aria-label={"Seleccionar " + l.id}
                className={
                  "editor-layer " +
                  (l.type === "shape" ? "shape " : "") +
                  (selected === l.id ? "selected" : "")
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
                        fontWeight: l.fontWeight??"normal",
                        textAlign: l.align,
                        whiteSpace: "pre-wrap",
                      }
                    : {
                        height: (l.height / draft.height) * 100 + "%",
                        ...(l.type === "shape"
                          ? {
                              background: l.color,
                              borderRadius: l.kind === "ellipse" ? "50%" : "0",
                            }
                          : {}),
                      }),
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(l.id);
                }}
                onContextMenu={e=>{e.preventDefault();setSelected(l.id);setContextMenu({id:l.id,x:Math.min(e.clientX,innerWidth-210),y:Math.min(e.clientY,innerHeight-190)});}}
                onPointerDown={(e) => {
                  if(e.button!==0)return;
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
                    layer: {...l},
                    height: e.currentTarget.getBoundingClientRect().height*draft.height/box.current!.getBoundingClientRect().height,
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
              >
                {l.type === "text" ? (
                  l.text
                ) : l.type === "logo" ? (
                  <img
                    src={`/api/variations/${id}/logos/${l.attachmentId}`}
                    alt="Logo autorizado"
                    draggable={false}
                  />
                ) : null}
                {selected===l.id && (["nw","n","ne","e","se","s","sw","w"] as ResizeHandle[]).map(handle=><button key={handle} type="button" className={"resize-handle handle-"+handle} aria-label={"Redimensionar "+handle+" "+l.id} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();setHistory([...history.slice(-49),draft]);setRedo([]);drag.current={x:e.clientX,y:e.clientY,startX:l.x,startY:l.y,id:l.id,layer:{...l},height:e.currentTarget.parentElement!.getBoundingClientRect().height*draft.height/box.current!.getBoundingClientRect().height,handle};e.currentTarget.setPointerCapture(e.pointerId);}} onKeyDown={e=>{const delta=e.shiftKey?10:2;if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();e.stopPropagation();const h=e.currentTarget.parentElement!.getBoundingClientRect().height*draft.height/box.current!.getBoundingClientRect().height;const changed=resizeLayer(l,handle,e.key==="ArrowRight"?delta:e.key==="ArrowLeft"?-delta:0,e.key==="ArrowDown"?delta:e.key==="ArrowUp"?-delta:0,draft,h);edit({...draft,layers:draft.layers.map(item=>item.id===l.id?changed:item)});}} />)}
              </div>
            ))}
          </div>
          <div className="stack">
            <div className="editor-add-actions">
              <button
                type="button"
                disabled={busy || draft.layers.length >= 40}
                onClick={() => {
                  const layer = {
                    id: crypto.randomUUID(),
                    type: "text" as const,
                    x: 30,
                    y: 30,
                    width: Math.min(600, draft.width - 60),
                    text: "Nuevo texto",
                    fontSize: 32,
                    color: "#123456",
                    font: "DejaVu Sans" as const,
                    align: "left" as const,
                  };
                  edit({ ...draft, layers: [...draft.layers, layer] });
                  setSelected(layer.id);
                }}
              >
                ＋ Texto
              </button>
              <button
                type="button"
                disabled={busy || draft.layers.length >= 40}
                onClick={() => {
                  const layer = {
                    id: crypto.randomUUID(),
                    type: "shape" as const,
                    kind: "rectangle" as const,
                    x: 30,
                    y: 30,
                    width: Math.min(240, draft.width - 60),
                    height: 100,
                    color: "#ffffff",
                  };
                  edit({ ...draft, layers: [...draft.layers, layer] });
                  setSelected(layer.id);
                }}
              >
                ＋ Forma
              </button>
              <button
                type="button"
                disabled={busy || !layer}
                onClick={() => {
                  const layers = draft.layers.filter((l) => l.id !== selected);
                  edit({ ...draft, layers });
                  setSelected(layers[0]?.id ?? "");
                }}
              >
                Eliminar elemento
              </button>
            </div>
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
                    {layer.type === "shape"
                      ? "Alto de la forma"
                      : "Alto del área del logo"}
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
            {layer?.type === "shape" && (
              <div className="fields">
                <label>
                  Color de la forma
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => change({ color: e.target.value })}
                  />
                </label>
                <label>
                  Forma
                  <select
                    value={layer.kind}
                    onChange={(e) => change({ kind: e.target.value })}
                  >
                    <option value="rectangle">Rectángulo</option>
                    <option value="ellipse">Elipse</option>
                  </select>
                </label>
              </div>
            )}
            {layer && (
              <div className="editor-add-actions">
                <button
                  type="button"
                  onClick={() => reorder(selected,"front")}
                >
                  Traer delante
                </button>
                <button
                  type="button"
                  onClick={() => reorder(selected,"back")}
                >
                  Enviar detrás
                </button>
              </div>
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
              {data.canApprove && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`variations/${id}/manual`, "POST", {
                        expectedRevision: data.revision,
                        document: draft,
                      });
                      if (data.orderId) {
                        await orderRequest(`/${data.orderId}/approve`, {
                          jobId: data.jobId,
                        });
                        if (data.orderMode === "immediate")
                          void driveOrder(data.orderId, async () => {}).catch(
                            (e) => setMessage(e.message),
                          );
                      } else await api(`jobs/${data.jobId}/approve`, "POST");
                      await load();
                    }, "Cambios guardados e imagen aprobada.")
                  }
                >
                  Guardar y aprobar
                </button>
              )}
            </div>
            <p className="hint">
              Arrastra los elementos para moverlos y sus tiradores para redimensionarlos. Usa clic derecho para ordenar las capas. La vista es orientativa; el
              servidor valida márgenes y textos cortados al guardar. El logo
              conserva sus proporciones.
            </p>
          </div>
        </div>
      ) : (
        <div className="stack">
          <img
            className="flat-image-preview"
            src={`/api/variations/${id}?thumbnail=true`}
            alt="Imagen que estás editando"
          />
          <p className="notice">
            Puedes añadir textos y formas editables encima de esta imagen, sin
            usar IA. Los textos que ya forman parte de la fotografía no son
            capas separadas; para cambiarlos puedes cubrirlos y añadir texto
            nuevo, o usar la edición con IA.
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`variations/${id}/enable-layers`, "POST", {
                  expectedRevision: data.revision,
                });
                await load();
              }, "Editor listo: añade texto o formas encima del original.")
            }
          >
            Añadir textos y objetos · sin IA
          </button>
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
          {action==="regenerate"&&<CreativeFinish label="Acabado de la nueva variación" designMode={designMode} reasoning={reasoningLevel} onChange={(mode,level)=>{setDesignMode(mode);setReasoningLevel(level);setCharge(false);}} />}
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
                  designMode,
                  reasoningLevel,
                });
                setCharge(false);
                setQueued(true);
                await production.start(result.jobs, executionMode);
              }, "Operación registrada solo para esta imagen. Revisa el resultado en Biblioteca.")
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
          Revisar resultado en Biblioteca ↗
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
