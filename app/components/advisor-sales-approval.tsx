"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
type Review = {
  aliasId: string;
  country: string;
  day: string;
  name: string;
  total: number | null;
  token: string;
  revision: number;
  status: string;
  advisors: { id: string; name: string; label?: string }[];
  allocations: { advisorId: string | null; sales: number | null }[];
};
export function AdvisorSalesApproval({
  aliasId,
  country,
  day,
  onClose,
  onApproved,
}: {
  aliasId: string;
  country: string;
  day: string;
  onClose: () => void;
  onApproved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Review | null>(null),
    [entries, setEntries] = useState<
      { advisorId: string | null; sales: string }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setData(null);
    setMessage("");
    void api(
      "meta-ads/effectiveness/advisor-sales?" +
        new URLSearchParams({ aliasId, country, day }),
    )
      .then((v: Review) => {
        if (active) {
          setData(v);
          setEntries(
            v.allocations.map((e) => ({
              advisorId: e.advisorId,
              sales: e.sales === null ? "" : String(e.sales),
            })),
          );
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [aliasId, country, day, version]);
  const valid =
    entries.length > 0 &&
    entries.every(
      (e) => /^\d+$/.test(e.sales) && Number.isSafeInteger(Number(e.sales)),
    );
  const total = valid ? entries.reduce((s, e) => s + Number(e.sales), 0) : null;
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-sales-approval"
      aria-label="Reparto de ventas por asesor"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>
          {day ===
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Lima",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())
            ? "Hoy hubo cambio de asesor"
            : "Hubo cambio de asesor"}
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </header>
      <p>
        <b>
          {data?.name ?? "Inventario"} · {country} · {day}
        </b>
      </p>
      <p>
        El reparto registrado se propone automáticamente. Puedes añadir ventas
        al asesor que las consiguió, aunque ya haya cambiado el responsable.
      </p>
      {!data && !message && <p role="status">Cargando reparto…</p>}
      {data && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valid || total === null) return;
            setBusy(true);
            setMessage("");
            let committed = false;
            try {
              await api("meta-ads/effectiveness/advisor-sales", "POST", {
                aliasId,
                country,
                day,
                token: data.token,
                revision: data.revision,
                allocations: entries.map((p) => ({
                  advisorId: p.advisorId,
                  sales: Number(p.sales),
                })),
              });
              committed = true;
              setSaved(true);
              notifyAdvisorSalesChanged();
              await onApproved();
              onClose();
            } catch (error) {
              setMessage(
                committed
                  ? "Reparto aprobado. Actualiza la página para ver los datos guardados."
                  : (error as Error).message,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || saved}>
            {entries.map((entry, index) => (
              <div className="advisor-sales-entry" key={index}>
                <label>
                  Asesor {index + 1}
                  <SheetSearchSelect
                    label={`Asesor ${index + 1} del reparto`}
                    value={entry.advisorId ?? ""}
                    placeholder="Sin asesor"
                    options={[
                      { value: "", label: "Sin asesor" },
                      ...data.advisors.map((a) => ({
                        value: a.id,
                        label: a.label ?? a.name,
                      })),
                    ]}
                    onSelect={(id) =>
                      setEntries((old) =>
                        old.map((p, i) =>
                          i === index ? { ...p, advisorId: id || null } : p,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Ventas
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    aria-label={`Ventas del asesor ${index + 1}`}
                    value={entry.sales}
                    disabled={busy || saved}
                    onChange={(e) =>
                      setEntries((old) =>
                        old.map((p, i) =>
                          i === index ? { ...p, sales: e.target.value } : p,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || saved || entries.length <= 1}
                  aria-label={`Quitar asesor ${index + 1} del reparto`}
                  onClick={() =>
                    setEntries((old) => old.filter((_, i) => i !== index))
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={busy || saved || entries.length >= 1000}
              onClick={() =>
                setEntries((old) => [...old, { advisorId: null, sales: "0" }])
              }
            >
              + Asesor
            </button>
          </fieldset>
          <p className="advisor-sales-total">
            V registrada: <b>{data.total ?? "—"}</b> → Total del reparto:{" "}
            <b>{total ?? "—"}</b>
          </p>
          <p>
            Al aprobar, V de esta fecha se actualizará a la suma del reparto y
            Asesores se actualizará automáticamente. Solo afecta a este
            inventario y país.
          </p>
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={busy || saved || !valid}
            >
              {busy ? "Aprobando…" : "Aprobar"}
            </button>
            <button
              type="button"
              disabled={busy || saved}
              onClick={() => setVersion((v) => v + 1)}
            >
              Actualizar reparto
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="sheet-message" role="alert">
          {message}
        </p>
      )}
    </dialog>
  );
}
