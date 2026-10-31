"use client";
import { useRef, useState } from "react";
import type { RegisteredSalesSummary } from "../../lib/meta-ads/registered-sales";
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
export function MetaSalesCounter({
  sales,
  loading,
  manualSince,
  onSinceChange,
}: {
  sales?: RegisteredSalesSummary;
  loading: boolean;
  manualSince: string;
  onSinceChange: (day: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(manualSince);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const since = manualSince || sales?.since;
  return (
    <>
      <button
        type="button"
        className="meta-sales-counter"
        aria-label="Ver ventas registradas y editar fecha de inicio"
        aria-haspopup="dialog"
        aria-busy={loading}
        onClick={() => {
          setDraft(manualSince || sales?.since || "");
          dialog.current?.showModal();
        }}
      >
        <span className="meta-sales-caption">
          Ventas <span aria-hidden="true">↗</span>
        </span>
        <strong>
          {loading
            ? "—"
            : sales?.total == null
              ? "Sin registros"
              : new Intl.NumberFormat("es-PE").format(sales.total) +
                (sales.partial ? "*" : "")}
        </strong>
        <small>
          {since ? `Desde ${dateLabel(since)}` : "Desde el primer registro"}
        </small>
      </button>
      <dialog ref={dialog} className="meta-sales-dialog">
        <header>
          <div>
            <h2>Ventas registradas</h2>
            <p>Acumulado por inventario y país</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cerrar
          </button>
        </header>
        <p className="meta-sales-total">
          {sales?.total == null
            ? "Sin registros de ventas"
            : `${new Intl.NumberFormat("es-PE").format(sales.total)} ventas registradas${sales.partial ? "*" : ""}`}
        </p>
        <p>
          Desde {since ? dateLabel(since) : "el primer registro válido"} hasta{" "}
          {dateLabel(sales?.until || today)}. Este acumulado es independiente
          del calendario de gasto y conversaciones.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSinceChange(draft);
            dialog.current?.close();
          }}
        >
          <label>
            Registradas desde
            <input
              type="date"
              value={draft}
              max={today}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="meta-sales-date-actions">
            <button
              type="button"
              onClick={() => {
                onSinceChange("");
                dialog.current?.close();
              }}
            >
              Usar primer registro
            </button>
            <button type="submit">Aplicar fecha</button>
          </div>
        </form>
        <p className="muted">
          {sales?.firstRecord
            ? `Primer registro disponible: ${dateLabel(sales.firstRecord)}.`
            : "La fecha automática aparecerá cuando empieces a registrar ventas."}{" "}
          Cambiar esta fecha solo ajusta tu vista; conserva las ventas y su
          historial.
        </p>
        {sales?.partial && (
          <p>
            * Hay días sin datos o registros incompletos. Se suman únicamente
            las ventas registradas.
          </p>
        )}
        {!!sales?.groups.length && (
          <div className="meta-sales-breakdown">
            <table>
              <thead>
                <tr>
                  <th>Inventario</th>
                  <th>País</th>
                  <th>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {sales.groups.map((group, index) => (
                  <tr key={`${group.name}:${group.country}:${index}`}>
                    <td>{group.name}</td>
                    <td>{group.country}</td>
                    <td>{group.sales ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Cada diplomado y país se cuenta una sola vez, aunque esté vinculado a
          varias campañas. El asesor no modifica este acumulado.
        </p>
      </dialog>
    </>
  );
}
