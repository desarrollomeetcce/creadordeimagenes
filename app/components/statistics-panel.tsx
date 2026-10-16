"use client";
import { useEffect, useState } from "react";
import type {
  ConsumptionRow,
  StatisticsReport,
} from "../../lib/statistics-types";

const dimensions: Record<string, string> = {
  day: "Día",
  month: "Mes",
  user: "Usuario",
  project: "Proyecto",
  category: "Categoría",
  subproduct: "Subproducto",
  model: "Modelo",
};
const statusLabels: Record<string, string> = {
  PENDING: "Pendientes",
  RUNNING: "En ejecución",
  COMPLETED: "Completadas",
  CANCELLED: "Canceladas",
  FAILED: "Fallidas",
  UNCERTAIN: "Requieren revisar cargos",
};
function dollars(value: string) {
  const rounded = (BigInt(value) + 50n) / 100n;
  return `USD ${rounded / 10000n}.${String(rounded % 10000n).padStart(4, "0")}`;
}
function average(value: string, count: number) {
  return count
    ? dollars(String(BigInt(value) / BigInt(count)))
    : "Sin datos confirmados";
}

export function StatisticsPanel() {
  const [days, setDays] = useState("30"),
    [dimension, setDimension] = useState("day");
  const [data, setData] = useState<StatisticsReport | null>(null),
    [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    void fetch(`/api/system/statistics?days=${days}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "No se pudieron consultar las estadísticas.",
          );
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, refresh]);
  const total = data?.total;
  return (
    <section className="stack statistics-panel" aria-busy={loading}>
      <h1>Estadísticas</h1>
      <p className="muted">
        Supervisión global exclusiva del OWNER. Consultar este panel no consume
        IA.
      </p>
      <div className="row">
        <label>
          Período
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </select>
        </label>
        <button
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Actualizar estadísticas
        </button>
      </div>
      {loading && <p role="status">Consultando estadísticas…</p>}
      {error && <p role="alert">{error}</p>}
      {data && total && (
        <>
          <p className="muted">
            Desde{" "}
            {new Date(data.period.start).toLocaleDateString("es-PE", {
              timeZone: data.period.timeZone,
            })}{" "}
            hasta{" "}
            {new Date(data.period.end).toLocaleString("es-PE", {
              timeZone: data.period.timeZone,
            })}
            , hora de Perú. Se incluyen todas las operaciones registradas en ese
            período.
          </p>
          <div className="metrics">
            <div>
              <strong>{data.inventory.projects}</strong>
              <span>
                Proyectos activos · {data.inventory.trash} en papelera
              </span>
            </div>
            <div>
              <strong>
                {data.inventory.categories} / {data.inventory.subproducts}
              </strong>
              <span>Categorías / subproductos activos</span>
            </div>
            <div>
              <strong>{data.inventory.accounts}</strong>
              <span>
                Cuentas · {data.inventory.pendingAccounts} pendientes de
                aprobación
              </span>
            </div>
            <div>
              <strong>{total.operations}</strong>
              <span>Operaciones con registro de consumo</span>
            </div>
            <div>
              <strong>
                {total.images} / {total.approved}
              </strong>
              <span>Afiches generados / aprobados del período</span>
            </div>
            <div>
              <strong>{dollars(total.reservedMicros)}</strong>
              <span>Reservas no liberadas</span>
            </div>
            <div>
              <strong>
                {total.knownCosts
                  ? dollars(total.knownActualMicros)
                  : "Sin importes confirmados"}
              </strong>
              <span>
                Costes confirmados registrados · {total.unknownCosts} costes
                desconocidos
              </span>
            </div>
            <div>
              <strong>{total.uncertain}</strong>
              <span>Operaciones con posible cargo incierto</span>
            </div>
          </div>
          <div className="panel stack">
            <h2>Cómo interpretar los importes</h2>
            <p>
              Las reservas son estimaciones para controlar el presupuesto. No
              representan una factura ni un coste real confirmado. La suma
              confirmada puede ser parcial; las operaciones sin importe real se
              mantienen como desconocidas. Revisa también la facturación del
              proveedor.
            </p>
            <p>
              Promedio por afiche con coste confirmado:{" "}
              <strong>
                {average(total.pricedImageMicros, total.pricedImages)}
              </strong>{" "}
              ({total.pricedImages} afiches). Promedio por afiche aprobado con
              coste confirmado:{" "}
              <strong>
                {average(total.pricedApprovedMicros, total.pricedApproved)}
              </strong>{" "}
              ({total.pricedApproved} afiches).
            </p>
            <p className="muted">
              Los promedios excluyen importes desconocidos. Una operación puede
              incluir dirección creativa e imagen; no equivale al número de
              llamadas de API. Los afiches incluyen los registros conservados
              aunque sus archivos hayan caducado o estén en papelera. Las
              aprobaciones reflejan el estado actual. El inventario superior
              muestra el estado actual, sin limitarse al período.
            </p>
          </div>
          <div className="panel stack">
            <h2>Estado de las generaciones del período</h2>
            {data.jobs.length ? (
              <ul>
                {data.jobs.map((job) => (
                  <li key={job.status}>
                    {statusLabels[job.status] ?? job.status}:{" "}
                    <strong>{job.count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay trabajos registrados en este período.</p>
            )}
          </div>
          <div className="panel stack">
            <h2>Desglose del consumo</h2>
            <label>
              Agrupar por
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value)}
              >
                {Object.entries(dimensions).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Los nombres corresponden a los recursos actuales. Los IDs permiten
              distinguir recursos con el mismo nombre.
            </p>
            {(data.groups[dimension]?.totalGroups ?? 0) > 20 &&
              !["day", "month"].includes(dimension) && (
                <p role="status">
                  Se muestran los 20 grupos con más operaciones de{" "}
                  {data.groups[dimension].totalGroups}. Los totales superiores
                  incluyen todos los grupos.
                </p>
              )}
            <ConsumptionTable
              rows={data.groups[dimension]?.rows ?? []}
              label={dimensions[dimension]}
              showId={!["day", "month", "model"].includes(dimension)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function ConsumptionTable({
  rows,
  label,
  showId,
}: {
  rows: ConsumptionRow[];
  label: string;
  showId: boolean;
}) {
  if (!rows.length) return <p>No hay registros de consumo en este período.</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption>Consumo agrupado por {label.toLowerCase()}</caption>
        <thead>
          <tr>
            <th>{label}</th>
            <th>Operaciones</th>
            <th>Reservas no liberadas</th>
            <th>Coste confirmado</th>
            <th>Costes desconocidos</th>
            <th>Afiches / aprobados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ overflowWrap: "anywhere", minWidth: 160 }}>
                {row.label}
                {showId && (
                  <small className="muted" style={{ display: "block" }}>
                    {row.id}
                  </small>
                )}
              </td>
              <td>{row.operations}</td>
              <td>{dollars(row.reservedMicros)}</td>
              <td>
                {row.knownCosts
                  ? dollars(row.knownActualMicros)
                  : "No informado"}
              </td>
              <td>{row.unknownCosts}</td>
              <td>
                {row.images} / {row.approved}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
