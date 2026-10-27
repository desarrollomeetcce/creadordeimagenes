"use client";
import { useEffect, useRef, useState } from "react";
import {
  inventoryNameConflicts,
  type InventoryNamed,
  type InventoryNameDecision,
  type InventoryNameConflict,
} from "../../lib/meta-ads/inventory-duplicates";
const kindName = (kind: string) =>
  kind === "PRIMARY"
    ? "Categoría principal"
    : kind === "SECONDARY"
      ? "Categoría secundaria"
      : "Inventario";
function DuplicateReview({
  conflicts,
  onChoose,
}: {
  conflicts: InventoryNameConflict[];
  onChoose: (choices: InventoryNameDecision[] | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [choices, setChoices] = useState<Record<number, string>>({});
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="meta-detail inventory-duplicate-review"
      aria-label="Revisar nombres similares"
      onCancel={(e) => {
        e.preventDefault();
        onChoose(null);
      }}
    >
      <header>
        <h2>Ya hay nombres similares</h2>
        <button className="ui-close-button"
          type="button"
          aria-label="Cerrar revisión de nombres"
          onClick={() => onChoose(null)}
        >
          ×
        </button>
      </header>
      <p>
        Compara el nombre existente y el nuevo. Elige reutilizar el existente o
        conservarlos como registros distintos.
      </p>
      <div className="inventory-duplicate-list">
        {conflicts.map((c, i) => (
          <section key={c.kind + ":" + c.name}>
            <strong>{kindName(c.kind)}</strong>
            <p>
              Nuevo: <b>{c.name}</b>
            </p>
            <p>
              Existente: <b>{c.similar.join(" · ")}</b>
            </p>
            <label>
              Qué deseas conservar
              <select
                aria-label={`Resolver ${kindName(c.kind)} ${c.name}`}
                value={choices[i] ?? ""}
                onChange={(e) =>
                  setChoices({ ...choices, [i]: e.target.value })
                }
              >
                <option value="">Elige una opción…</option>
                {c.similar.map((n) => (
                  <option key={n} value={n}>
                    Usar el existente: {n}
                  </option>
                ))}
                <option value={c.name}>
                  Mantener ambos: guardar también {c.name}
                </option>
              </select>
            </label>
          </section>
        ))}
      </div>
      <footer className="row">
        <button type="button" onClick={() => onChoose(null)}>
          Cancelar guardado
        </button>
        <button
          type="button"
          className="primary"
          disabled={conflicts.some((_, i) => !choices[i])}
          onClick={() =>
            onChoose(
              conflicts.map((c, i) => ({
                kind: c.kind,
                name: c.name,
                useName: choices[i],
              })),
            )
          }
        >
          Confirmar nombres y guardar
        </button>
      </footer>
    </dialog>
  );
}
export function useInventoryDuplicateReview() {
  const [conflicts, setConflicts] = useState<InventoryNameConflict[] | null>(
      null,
    ),
    resolve = useRef<((v: InventoryNameDecision[]) => void) | null>(null),
    reject = useRef<((e: Error) => void) | null>(null);
  useEffect(
    () => () => {
      reject.current?.(Error("Se cerró la revisión sin guardar."));
    },
    [],
  );
  const review = (incoming: InventoryNamed[], existing: InventoryNamed[]) => {
    const next = inventoryNameConflicts(incoming, existing);
    if (!next.length) return Promise.resolve([] as InventoryNameDecision[]);
    return new Promise<InventoryNameDecision[]>((yes, no) => {
      resolve.current = yes;
      reject.current = no;
      setConflicts(next);
    });
  };
  const dialog = conflicts ? (
    <DuplicateReview
      conflicts={conflicts}
      onChoose={(choices) => {
        setConflicts(null);
        const yes = resolve.current,
          no = reject.current;
        resolve.current = null;
        reject.current = null;
        if (choices) yes?.(choices);
        else
          no?.(
            Error(
              "Guardado cancelado; los datos se conservan en el formulario.",
            ),
          );
      }}
    />
  ) : null;
  return { review, dialog };
}
