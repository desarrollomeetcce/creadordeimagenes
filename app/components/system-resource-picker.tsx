"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Library } from "./library-explorer";
import { engineRequest as api } from "./generation-engine";
type Selection = {
  selection: string;
  purpose: string;
  name: string;
  available?: boolean;
};
const purposes = [
  "Referencia visual",
  "Fotografía principal",
  "Fondo",
  "Logo",
  "Material de contexto",
];
export function SystemResourcePicker({
  scope,
  id,
  onChanged,
  external,
}: {
  scope: string;
  id: string;
  onChanged?: () => void;
  external?: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId();
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
  if (!valid) return <>{external}</>;
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  return (
    <>
      <div className="attachment-source-fields">
        {external}
        <div className="stack attachment-system-field">
          <strong>Archivo del sistema</strong>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
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
            Seleccionar en Biblioteca{saved.length ? ` (${saved.length})` : ""}
          </button>
          <small>Elige carpetas o archivos existentes.</small>
        </div>
      </div>
      {saved.length > 0 && (
        <div className="attachment-system-list">
          {saved.map((s) => (
            <span key={s.selection}>
              {s.name} · {s.purpose}
              {s.available === false ? " · No disponible" : ""}
            </span>
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
                        purpose: "Referencia visual",
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
                  disabled={busy || s.selection.startsWith("n:")}
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
