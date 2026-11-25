"use client";

import { useEffect, useRef, useState } from "react";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
import { countryName } from "../../lib/meta-ads/countries";
import type { pendingSales } from "../../lib/meta-ads/pending-sales";

type Data = Awaited<ReturnType<typeof pendingSales>>;
const limaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function PendingSales({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef("");
  const [month, setMonth] = useState(() => limaToday().slice(0, 7));
  const [day, setDay] = useState(limaToday);
  const [table, setTable] = useState("");
  const [alias, setAlias] = useState("");
  const [country, setCountry] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [customer, setCustomer] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const endpoint = "/api/meta-ads/pending-sales";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ month, ...(table ? { table } : {}) });
    void fetch(endpoint + "?" + params, { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw Error(value.error);
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [month, table, refresh]);
  const countries =
    data?.aliases.find((item) => item.id === alias)?.countries ?? [];
  async function save() {
    requestId.current ||= crypto.randomUUID();
    await mutate("POST", {
      id: requestId.current,
      tableId: table,
      aliasId: alias,
      country,
      advisorId: advisor,
      customer,
      day,
    });
  }
  async function mutate(method: "POST" | "PATCH", body: object) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      if (method === "POST") {
        setCustomer("");
        requestId.current = "";
        setMonth(day.slice(0, 7));
      }
      if (method === "PATCH") notifyAdvisorSalesChanged();
      setStatus(
        method === "POST"
          ? "Pendiente registrado."
          : "Pago confirmado. La venta se registró en la hoja.",
      );
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="pending-sales-dialog"
      aria-label="Ventas pendientes de validación"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="row spread">
        <h2>Ventas pendientes</h2>
        <button type="button" onClick={onClose} disabled={busy}>
          Cerrar
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <form
        className="pending-sales-form"
        onChange={() => {
          requestId.current = "";
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          Fecha de venta
          <input
            type="date"
            value={day}
            max={limaToday()}
            onChange={(e) => setDay(e.target.value)}
            required
          />
        </label>
        <label>
          Hoja
          <select
            value={table}
            onChange={(e) => {
              setTable(e.target.value);
              setAlias("");
              setCountry("");
            }}
            required
          >
            <option value="">Seleccionar hoja</option>
            {data?.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Diplomado
          <select
            value={alias}
            onChange={(e) => {
              const next = e.target.value;
              setAlias(next);
              const codes =
                data?.aliases.find((a) => a.id === next)?.countries ?? [];
              setCountry(codes.length === 1 ? codes[0] : "");
            }}
            required
          >
            <option value="">Seleccionar diplomado</option>
            {data?.aliases.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          País
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
          >
            <option value="">Seleccionar país</option>
            {countries.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asesor
          <select
            value={advisor}
            onChange={(e) => setAdvisor(e.target.value)}
            required
          >
            <option value="">Seleccionar asesor</option>
            {data?.advisors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.sheet.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre de la persona
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            minLength={2}
            maxLength={180}
            required
          />
        </label>
        <button type="submit" className="primary" disabled={busy || !data}>
          Registrar pendiente
        </button>
      </form>
      <div className="row spread">
        <label>
          Mes de pendientes
          <input
            type="month"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <p role="status">
          {status ||
            (!data ? "Cargando pendientes…" : `${data.rows.length} pendientes`)}
        </p>
      </div>
      <div className="pending-sales-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Persona</th>
              <th>Hoja</th>
              <th>País</th>
              <th>Diplomado</th>
              <th>Asesor</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.day.slice(8)}.{row.day.slice(5, 7)}
                  {row.overdue && (
                    <small className="pending-sales-overdue">
                      Más de 14 días
                    </small>
                  )}
                </td>
                <th scope="row">{row.customer}</th>
                <td>{row.table}</td>
                <td>{countryName(row.country)}</td>
                <td>{row.diploma}</td>
                <td>{row.advisor}</td>
                <td>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Confirmar pago de ${row.customer}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Confirmar el pago de ${row.customer} y registrar una venta?`,
                        )
                      )
                        void mutate("PATCH", { id: row.id });
                    }}
                  >
                    ✓ Validar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
