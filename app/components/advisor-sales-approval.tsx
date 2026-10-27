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
  linked: boolean;
  na: boolean;
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
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false),
    keepDraft = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    autoPaused = useRef(false),
    latest = useRef<{
      entries: { advisorId: string | null; sales: string }[];
      data: Review | null;
    }>({ entries: [], data: null }),
    lastSaved = useRef(""),
    inFlight = useRef<Promise<boolean> | null>(null);
  const signature = (items: { advisorId: string | null; sales: string }[]) =>
    JSON.stringify(
      items
        .map((p) => [p.advisorId, Number(p.sales)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  useEffect(
    () => () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    },
    [],
  );
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
    latest.current.data = null;
    setMessage("");
    void api(
      "meta-ads/effectiveness/advisor-sales?" +
        new URLSearchParams({ aliasId, country, day }),
    )
      .then((v: Review) => {
        if (active) {
          setData(v);
          latest.current.data = v;
          setSaved(false);
          autoPaused.current = false;
          const loaded = (
            v.allocations.length
              ? v.allocations
              : [{ advisorId: null, sales: v.total }]
          ).map((e) => ({
            advisorId: e.advisorId,
            sales: e.sales === null ? "" : String(e.sales),
          }));
          lastSaved.current = loaded.every((e) => e.sales !== "")
            ? signature(loaded)
            : "";
          if (!keepDraft.current)
            setEntries(
              (v.allocations.length
                ? v.allocations
                : [{ advisorId: null, sales: v.total }]
              ).map((e) => ({
                advisorId: e.advisorId,
                sales: e.sales === null ? "" : String(e.sales),
              })),
            );
          keepDraft.current = false;
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [aliasId, country, day, version]);
  latest.current.entries = entries;
  if (data && !latest.current.data) latest.current.data = data;
  const saveEntries = async (close = false): Promise<boolean> => {
    if (pending.current) {
      const done = await inFlight.current;
      if (
        done &&
        close &&
        lastSaved.current === signature(latest.current.entries)
      )
        onClose();
      return !!done;
    }
    const current = latest.current,
      review = current.data;
    if (!review || review.linked) return false;
    const valid =
      current.entries.length > 0 &&
      current.entries.every(
        (e) => /^\d+$/.test(e.sales) && Number.isSafeInteger(Number(e.sales)),
      ) &&
      new Set(current.entries.map((e) => e.advisorId)).size ===
        current.entries.length;
    if (!valid) {
      if (close)
        setMessage(
          "Completa las cantidades o quita las filas vacías antes de guardar.",
        );
      return false;
    }
    const stamp = signature(current.entries);
    if (stamp === lastSaved.current) {
      if (close) onClose();
      return true;
    }
    pending.current = true;
    setBusy(true);
    setMessage("");
    let committed = false;
    const task = (async () => {
      try {
        const result = await api(
          "meta-ads/effectiveness/advisor-sales",
          "POST",
          {
            aliasId,
            country,
            day,
            token: review.token,
            revision: review.revision,
            allocations: current.entries.map((p) => ({
              advisorId: p.advisorId,
              sales: Number(p.sales),
            })),
          },
        );
        committed = true;
        lastSaved.current = stamp;
        const fresh = {
          ...review,
          token: result.token,
          revision: result.revision,
          total: result.total,
          na: false,
          status: result.status,
          allocations: current.entries.map((p) => ({
            advisorId: p.advisorId,
            sales: Number(p.sales),
          })),
        };
        latest.current.data = fresh;
        setData(fresh);
        notifyAdvisorSalesChanged();
        await onApproved();
        setMessage("Ventas guardadas");
        if (close) onClose();
        return true;
      } catch (e) {
        autoPaused.current = true;
        if (committed) setSaved(true);
        setMessage(
          committed
            ? "Ventas guardadas. No se pudo recargar la tabla; revisa los últimos datos antes de continuar."
            : e instanceof Error
              ? e.message
              : "No se pudieron guardar las ventas.",
        );
        return false;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    })();
    inFlight.current = task;
    return task;
  };
  const scheduleSave = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      if (!autoPaused.current) void saveEntries(false);
    }, 200);
  };
  const valid =
    entries.length > 0 &&
    entries.every(
      (e) => /^\d+$/.test(e.sales) && Number.isSafeInteger(Number(e.sales)),
    ) &&
    new Set(entries.map((e) => e.advisorId)).size === entries.length;
  const total = valid ? entries.reduce((s, e) => s + Number(e.sales), 0) : null;
  const clearSales = async (value: "NA" | null) => {
    if (!data || pending.current || data.linked) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoPaused.current = true;
    pending.current = true;
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
        value,
      });
      committed = true;
      setSaved(true);
      notifyAdvisorSalesChanged();
      await onApproved();
      onClose();
    } catch (e) {
      setMessage(
        committed
          ? "Ventas guardadas. Actualiza la página para ver el resultado."
          : e instanceof Error
            ? e.message
            : "No se pudieron guardar las ventas.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-sales-approval"
      aria-label="Reparto de ventas por asesor"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else {
          if (autoTimer.current) clearTimeout(autoTimer.current);
          onClose();
        }
      }}
    >
      <header className="row">
        <h2>Ventas por asesor</h2>
        <button className="ui-close-button"
          type="button"
          disabled={busy}
          onClick={() => {
            if (autoTimer.current) clearTimeout(autoTimer.current);
            onClose();
          }}
        >
          Cerrar
        </button>
      </header>
      <p>
        <b>
          {data?.name ?? "Inventario"} · {country} · {day}
        </b>
      </p>
      <p>
        El reparto guardado se conserva al reabrir. Se guarda al salir del campo
        de cantidad o pulsar Enter. Puedes añadir ventas al asesor que las
        consiguió, aunque ya haya cambiado el responsable.
      </p>
      {!data && !message && <p role="status">Cargando reparto…</p>}
      {data?.linked && (
        <p role="status">
          Estas ventas están vinculadas. Edita el origen o desvincula las
          columnas para registrarlas aquí.
        </p>
      )}
      {data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (autoTimer.current) clearTimeout(autoTimer.current);
            void saveEntries(true);
          }}
        >
          <fieldset disabled={busy || saved || data.linked}>
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
                    onSelect={(id) => {
                      setEntries((old) =>
                        old.map((p, i) =>
                          i === index ? { ...p, advisorId: id || null } : p,
                        ),
                      );
                      scheduleSave();
                    }}
                  />
                </label>
                <label>
                  Ventas
                  <input
                    type="number"
                    min="0"
                    max="2147483647"
                    step="1"
                    required
                    aria-label={`Ventas del asesor ${index + 1}`}
                    onBlur={scheduleSave}
                    value={entry.sales}
                    disabled={busy || saved || data.linked}
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
                  onClick={() => {
                    setEntries((old) => old.filter((_, i) => i !== index));
                    scheduleSave();
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={busy || saved || entries.length >= 1000}
              onClick={() =>
                setEntries((old) => [...old, { advisorId: null, sales: "" }])
              }
            >
              + Asesor
            </button>
          </fieldset>
          {new Set(entries.map((e) => e.advisorId)).size !== entries.length && (
            <p role="alert">
              Cada asesor debe aparecer una sola vez. Edita su cantidad en la
              línea existente o elige otro asesor.
            </p>
          )}
          <p className="advisor-sales-total">
            V registrada: <b>{data.total ?? "—"}</b> → Total del reparto:{" "}
            <b>{total ?? "—"}</b>
          </p>
          <p>
            Al guardar, V de esta fecha se actualizará a la suma del reparto y
            Asesores se actualizará automáticamente. Solo afecta a este
            inventario y país.
          </p>
          <p className="hint">
            Cada línea muestra un asesor y su cantidad. Cambiar este reparto no
            cambia al responsable de la fila ni las fechas de asignación.
          </p>
          <details className="sales-saved-review">
            <summary>Reparto guardado para comparar</summary>
            <ul>
              {data.allocations.map((a, i) => (
                <li key={i}>
                  {data.advisors.find((p) => p.id === a.advisorId)?.label ??
                    "Sin asesor"}
                  : {a.sales ?? "Sin dato"}
                </li>
              ))}
            </ul>
          </details>
          <div className="row">
            <button
              type="submit"
              className="primary"
              disabled={
                busy ||
                saved ||
                data.linked ||
                !valid ||
                total === null ||
                total > 2147483647
              }
            >
              {busy ? "Guardando…" : "Guardar y cerrar"}
            </button>
            <button
              type="button"
              disabled={busy || saved || data.linked}
              onClick={() => {
                keepDraft.current = true;
                setVersion((v) => v + 1);
              }}
            >
              Revisar últimos datos
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy || saved || data.linked}
              onClick={() => void clearSales(null)}
            >
              Dejar sin dato
            </button>
            <button
              type="button"
              disabled={busy || saved || data.linked}
              onClick={() => void clearSales("NA")}
            >
              Marcar N.A.
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
