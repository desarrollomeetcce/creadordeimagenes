"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import type { InventorySyllabus } from "../../lib/meta-ads/inventory-syllabi-policy";
type Data = { revision: number; syllabi: InventorySyllabus[] };
export function InventorySyllabi({
  listId,
  name,
  initialId,
  onClose,
  onChanged,
}: {
  listId: string;
  name: string;
  initialId?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<Data | null>(null),
    [draft, setDraft] = useState<InventorySyllabus | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const add = () =>
    setDraft({
      id: crypto.randomUUID(),
      title: "Todo el mundo " + ((data?.syllabi.length ?? 0) + 1),
      scope: "Todo el mundo",
      content: "",
    });
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    api("meta-ads/inventory/syllabi?" + new URLSearchParams({ listId, name }))
      .then((d: Data) => {
        if (active) {
          setData(d);
          setDraft(
            initialId === "__new"
              ? {
                  id: crypto.randomUUID(),
                  title: "Todo el mundo " + (d.syllabi.length + 1),
                  scope: "Todo el mundo",
                  content: "",
                }
              : (d.syllabi.find((s) => s.id === initialId) ??
                  d.syllabi[0] ??
                  null),
          );
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId, name, initialId]);
  async function save(next: InventorySyllabus[]) {
    if (!data) return;
    setBusy(true);
    setMessage("");
    let committed = false;
    try {
      const saved: Data = await api("meta-ads/inventory/syllabi", "PUT", {
        listId,
        name,
        revision: data.revision,
        syllabi: next,
      });
      committed = true;
      setData(saved);
      setDraft(
        (old) =>
          saved.syllabi.find((s) => s.id === old?.id) ??
          saved.syllabi[0] ??
          null,
      );
      await onChanged();
      setMessage("Temarios guardados.");
    } catch (e) {
      setMessage(
        committed
          ? "Guardado. Actualiza el inventario para ver los cambios."
          : e instanceof Error
            ? e.message
            : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-syllabi-dialog"
      aria-label={`Temarios de ${name}`}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <div>
          <h2>Temarios</h2>
          <p>{name}</p>
        </div>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      {message && <p role="status">{message}</p>}
      {!data && !message ? <p role="status">Cargando temarios…</p> : null}
      {data && (
        <div className="syllabi-layout">
          <aside aria-label="Versiones de temario">
            {data.syllabi.map((s) => (
              <button
                type="button"
                key={s.id}
                aria-pressed={draft?.id === s.id}
                disabled={busy}
                onClick={() => setDraft(s)}
              >
                {s.title}
                <small>{s.scope}</small>
              </button>
            ))}
            <button
              type="button"
              disabled={busy || data.syllabi.length >= 50}
              onClick={add}
            >
              + Añadir temario
            </button>
          </aside>
          <section>
            {draft ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save([
                    ...data.syllabi.filter((s) => s.id !== draft.id),
                    draft,
                  ]);
                }}
              >
                <div className="row">
                  <label>
                    Nombre del botón
                    <input
                      required
                      maxLength={100}
                      value={draft.title}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft({ ...draft, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ámbito
                    <input
                      required
                      maxLength={80}
                      list="syllabus-scopes"
                      value={draft.scope}
                      disabled={busy}
                      onChange={(e) =>
                        setDraft({ ...draft, scope: e.target.value })
                      }
                    />
                    <datalist id="syllabus-scopes">
                      {[
                        "Todo el mundo",
                        "Perú",
                        "Colombia",
                        "Ecuador",
                        "Bolivia",
                        "México",
                        "Guatemala",
                        "El Salvador",
                        "Honduras",
                        "Paraguay",
                        "Uruguay",
                        "Adicional",
                      ].map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </label>
                </div>
                <label>
                  Contenido del temario
                  <textarea
                    required
                    rows={15}
                    maxLength={30000}
                    value={draft.content}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, content: e.target.value })
                    }
                  />
                </label>
                {draft.source && <p className="hint">Origen: {draft.source}</p>}
                <div className="row">
                  <button disabled={busy} className="primary">
                    Guardar cambios
                  </button>
                  {data.syllabi.some((s) => s.id === draft.id) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void save(data.syllabi.filter((s) => s.id !== draft.id))
                      }
                    >
                      Eliminar este temario
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <p>No hay temarios. Pulsa «Añadir temario» para registrar uno.</p>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
