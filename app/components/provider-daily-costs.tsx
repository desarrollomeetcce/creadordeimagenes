"use client";
import { useContext, useState } from "react";
import { CurrentRole } from "./role-guide";
import type { DailyCosts } from "../../lib/provider-costs";
import { usdMicros } from "../../lib/usage-format";
export function ProviderDailyCosts() {
  const role = useContext(CurrentRole);
  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DailyCosts | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (role !== "OWNER") return null;
  return (
    <details className="panel stack">
      <summary>Gasto diario reportado por el proveedor · OWNER</summary>
      <p>
        Consulta de solo lectura, hasta 31 días UTC. No genera imágenes. OpenAI
        requiere permisos administrativos de facturación; la clave de generación
        guardada puede no tenerlos. No reemplaces esa clave por una
        administrativa.
      </p>
      <p className="muted">
        Este informe puede incluir otras aplicaciones de tu organización y tener
        retraso. No se suma al consumo local ni se reparte entre imágenes. Los
        filtros de proyectos de abajo no afectan esta consulta.
      </p>
      <div className="fields">
        <label>
          Desde · UTC
          <input
            type="date"
            value={from}
            disabled={busy}
            onChange={(e) => {
              setFrom(e.target.value);
              setData(null);
            }}
          />
        </label>
        <label>
          Hasta · UTC
          <input
            type="date"
            value={to}
            disabled={busy}
            onChange={(e) => {
              setTo(e.target.value);
              setData(null);
            }}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !from || !to}
        onClick={async () => {
          setBusy(true);
          setData(null);
          setError("");
          try {
            const response = await fetch(
              "/api/ai/costs?" + new URLSearchParams({ from, to }),
              { cache: "no-store" },
            );
            const body = await response.json();
            if (!response.ok)
              throw Error(body.error ?? "No se pudo consultar el gasto.");
            setData(body);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "No se pudo consultar el gasto.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Consultando gasto…" : "Consultar gasto diario"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noreferrer"
          >
            Abrir consumo en OpenAI ↗
          </a>
        </p>
      )}
      {data && (
        <>
          <p>
            Total de importes informados:{" "}
            <strong>
              {usdMicros(data.totalMicros)}
              {data.totalMicros !== null ? " USD" : ""}
            </strong>
            . Consulta:{" "}
            {new Date(data.fetchedAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
            })}{" "}
            · Lima.
          </p>
          {data.rounded && (
            <p className="muted">Importes redondeados a seis decimales USD.</p>
          )}
          {!data.rows.length ? (
            <p>
              No hay importes informados para este período; no significa gasto
              cero.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Día · UTC</th>
                    <th>Gasto informado · USD</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{usdMicros(row.micros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">
            Las fechas ausentes o sin importe permanecen desconocidas. El total
            puede estar incompleto hasta que OpenAI actualice sus datos.
          </p>
        </>
      )}
    </details>
  );
}
