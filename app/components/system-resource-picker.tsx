"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AttachmentFileChip } from "./attachment-file-chip";
import { Library } from "./library-explorer";
import { engineRequest as api } from "./generation-engine";
type Selection = {
  selection: string;
  purpose: string;
  name: string;
  available?: boolean;
  href?: string;
  labelPath?: string;
};
const purposes = [
  "Referencia visual",
  "Fotografía principal",
  "Fondo",
  "Logo",
  "Material de contexto",
  "Logo institucional",
  "Fotografía obligatoria",
  "Información comercial",
  "Manual de marca",
];
export function SystemResourcePicker({
  scope,
  id,
  onChanged,
  visible = false,
}: {
  scope: string;
  id: string;
  onChanged?: () => void;
  visible?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const [purpose, setPurpose] = useState("Material de contexto");
  const [open, setOpen] = useState(false),
    [full, setFull] = useState(false),
    [saved, setSaved] = useState<Selection[]>([]),
    [selected, setSelected] = useState<Selection[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const valid = ["project", "category", "subproduct"].includes(scope),
    path = `system-resources/${scope}/${id}`;
  useEffect(() => {
    if (!valid) return;
    let live = true;
    api(path)
      .then((rows) => {
        if (live) setSaved(rows);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, valid]);
  if (!valid) return null;
  const persist = async (rows: Selection[]) => {
    setBusy(true);
    setMessage("");
    try {
      await api(path, "PUT", {
        selections: rows.map(({ selection, purpose }) => ({
          selection,
          purpose,
        })),
      });
      setSaved(await api(path));
      onChanged?.();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  return (
    <>
      {(visible || saved.length > 0) && (
        <div className="stack">
          {[
            ...new Set([
              ...saved.map((s) => s.purpose),
              ...(visible ? [purpose] : []),
            ]),
          ].map((groupPurpose) => (
            <div className="fields attachment-source-row" key={groupPurpose}>
              <div className="stack">
                <div className="row">
                  <strong>Archivo del sistema</strong>
                  <a
                    href="/?view=library"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver Biblioteca ↗
                  </a>
                </div>
                <div className="attachment-file-box">
                  {saved
                    .filter((s) => s.purpose === groupPurpose)
                    .map((s) => (
                      <AttachmentFileChip
                        key={s.selection}
                        name={
                          s.name +
                          (s.available === false ? " · No disponible" : "")
                        }
                        href={s.href}
                        title={s.labelPath ?? s.name}
                        disabled={busy}
                        onRemove={() =>
                          void persist(
                            saved.filter(
                              (row) => row.selection !== s.selection,
                            ),
                          )
                        }
                      />
                    ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setPurpose(groupPurpose);
                      setBusy(true);
                      setMessage("");
                      try {
                        const rows = await api(path);
                        setSaved(rows);
                        setSelected(rows);
                        setFull(false);
                        setOpen(true);
                        dialog.current?.showModal();
                      } catch (e) {
                        setMessage((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Seleccionar en Biblioteca
                  </button>
                </div>
              </div>
              <label>
                Uso del archivo del sistema
                <select
                  value={groupPurpose}
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPurpose(next);
                    if (saved.some((s) => s.purpose === groupPurpose))
                      void persist(
                        saved.map((s) =>
                          s.purpose === groupPurpose
                            ? { ...s, purpose: next }
                            : s,
                        ),
                      );
                  }}
                >
                  {purposes.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <small>Se aplica a los archivos de este recuadro.</small>
              </label>
            </div>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className={"attachment-library-dialog" + (full ? " is-fullscreen" : "")}
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
      >
        <div className="attachment-library-header row">
          <h3 id={titleId}>Archivo del sistema · Biblioteca</h3>
          <button type="button" onClick={() => setFull(!full)}>
            {full ? "Reducir ventana" : "Pantalla completa"}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            Cerrar
          </button>
        </div>
        {open && (
          <Library
            picker={{
              selected: selected.map((s) => s.selection),
              onChange: (ids, names) =>
                setSelected((old) =>
                  ids.map(
                    (selection) =>
                      old.find((s) => s.selection === selection) ?? {
                        selection,
                        name: names[selection] ?? "Archivo",
                        purpose,
                      },
                  ),
                ),
            }}
          />
        )}
        <details className="attachment-library-selection">
          <summary>Seleccionados · {selected.length}/30</summary>
          {selected.map((s) => (
            <div className="row" key={s.selection}>
              <span>{s.name}</span>
              <label>
                Uso
                <select
                  value={s.purpose}
                  disabled={busy}
                  onChange={(e) =>
                    setSelected((old) =>
                      old.map((row) =>
                        row.selection === s.selection
                          ? { ...row, purpose: e.target.value }
                          : row,
                      ),
                    )
                  }
                >
                  {purposes.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setSelected((old) =>
                    old.filter((row) => row.selection !== s.selection),
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))}
        </details>
        <footer className="attachment-library-footer row">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await api(path, "PUT", {
                  selections: selected.map(({ selection, purpose }) => ({
                    selection,
                    purpose,
                  })),
                });
                setSaved(await api(path));
                onChanged?.();
                close();
                setMessage("Archivos del sistema guardados.");
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Guardando…" : `Adjuntar selección (${selected.length})`}
          </button>
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <small>
            Hasta nueve imágenes por afiche. Las carpetas incluyen recursos de
            sus subcarpetas según las herencias activas. No se mueven los
            originales.
          </small>
        </footer>
        {message && <p role="status">{message}</p>}
      </dialog>
      {message && !open && <p role="status">{message}</p>}
    </>
  );
}
