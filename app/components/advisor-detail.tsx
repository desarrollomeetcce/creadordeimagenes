"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaDateRange } from "./meta-date-range";
import { SheetSearchSelect } from "./sheet-search-select";
import { MetaDailyChart } from "./meta-daily-chart";
import { countryOptions } from "../../lib/meta-ads/countries";
import {subscribeAdvisorSalesChanged} from "./advisor-sales-events";
import { advisorAttendanceValue } from "../../lib/meta-ads/advisor-metrics";
import type { DailyChartMetric } from "../../lib/meta-ads/daily-chart";
import type {
  AdvisorPerson,
  AdvisorSheetData,
  AdvisorTable,
} from "./advisor-types";
const number = (v: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(v);
const attendance = (v: string | null) =>
  v === "PRESENT"
    ? "Presente"
    : v === "ABSENT"
      ? "Ausente"
      : v === "NA"
        ? "N.A."
        : "—";
type AdvisorMetric = DailyChartMetric | "absences";
const options = [
  { value: "results", label: "Ventas (V)" },
  { value: "cost", label: "Horas ausentes (H)" },
  { value: "spend", label: "Asistencia (A)" },
  { value: "absences", label: "Inasistencias (I)" },
];
export function AdvisorDetail({
  person,
  tables,
  initialTableId,
  initialAliasId,
  initialCountry,
  initialSince,
  initialUntil,
  onClose,
  openRequest = 0,
}: {
  person: AdvisorPerson;
  tables: AdvisorTable[];
  initialTableId: string;
  initialAliasId: string;
  initialCountry: string;
  initialSince: string;
  initialUntil: string;
  onClose: () => void;
  openRequest?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [minimized, setMinimized] = useState(false);
  const restore = () => {
    setMinimized(false);
    requestAnimationFrame(() => {
      if (!dialog.current?.open) dialog.current?.showModal();
    });
  };
  const [tableId, setTableId] = useState(initialTableId),
    [aliasId, setAliasId] = useState(initialAliasId),
    [country, setCountry] = useState(initialCountry),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [bars, setBars] = useState<AdvisorMetric>("results"),
    [line, setLine] = useState<AdvisorMetric>("cost"),
    [data, setData] = useState<AdvisorSheetData | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  const valid =
    since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  const query =
    "meta-ads/advisors/detail?" +
    new URLSearchParams({
      advisorId: person.id,
      tableId,
      since,
      until,
      ...(aliasId ? { aliasId } : {}),
      ...(country ? { country } : {}),
    });
  useEffect(() => {
    setMinimized(false);
    const frame = requestAnimationFrame(() => {
      if (!dialog.current?.open) dialog.current?.showModal();
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest]);
  useEffect(() => {
    let active = true;
    if (!valid) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    setData(null);
    void api(query)
      .then((v: AdvisorSheetData) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, valid, reload]);
  useEffect(()=>subscribeAdvisorSalesChanged(()=>setReload(v=>v+1)),[]);
  const row = data?.rows[0],
    days = row ? Object.keys(row.days).sort() : [];
  const known = days.filter(
      (d) => row!.days[d].sales !== null && !row!.days[d].na,
    ),
    sales = known.length
      ? known.reduce((s, d) => s + row!.days[d].sales!, 0)
      : null;
  const hourDays = days.filter((d) => row!.days[d].absence.hours !== null),
    hours = hourDays.length
      ? hourDays.reduce((s, d) => s + row!.days[d].absence.hours!, 0)
      : null,
    pending = days.reduce((s, d) => s + row!.days[d].absence.pending, 0);
  const present = days.filter((d) => row!.days[d].status === "PRESENT").length,
    absent = days.filter((d) => row!.days[d].status === "ABSENT").length;
  const recordedAttendance = days.filter(
    (d) => advisorAttendanceValue(row!.days[d].status, "attendance") !== null,
  ).length;
  const metricValue = (metric: AdvisorMetric, day: string) => {
    const c = row!.days[day];
    return metric === "results"
      ? c.sales
      : metric === "cost"
        ? c.absence.hours
        : advisorAttendanceValue(
            c.status,
            metric === "absences" ? "absences" : "attendance",
          );
  };
  const metricLabel = (metric: AdvisorMetric) =>
    options.find((o) => o.value === metric)!.label;
  const chart = days.map((day) => ({
    day,
    results: metricValue(bars, day),
    cost: metricValue(line, day),
    spend: null,
  }));

  const partial = days.some((d) => row!.days[d].partial);
  return (
    <>
      {minimized && (
        <button
          type="button"
          className="advisor-detail-restore"
          onClick={restore}
          aria-label={`Restaurar detalle de ${person.name}`}
        >
          ↗ Restaurar detalle · {person.name}
        </button>
      )}
      <dialog
        ref={dialog}
        className="meta-detail advisor-detail"
        hidden={minimized}
        aria-label={`Detalle de asesor ${person.name}`}
        onCancel={onClose}
      >
        <header className="row">
          <h2>{row?.name ?? person.name}</h2>
          <button type="button" onClick={onClose}>
            Cerrar detalle
          </button>
        </header>
        <div className="row advisor-detail-controls">
          <MetaDateRange
            from={since}
            to={until}
            onChange={(a, b) => {
              setSince(a);
              setUntil(b);
            }}
          />
          <SheetSearchSelect
            label="Hoja del detalle del asesor"
            value={tableId}
            options={[
              ...tables.map((t) => ({ value: t.id, label: t.name })),
              { value: "all", label: "Todas las hojas" },
            ]}
            onSelect={(id) => {
              setTableId(id);
              setAliasId("");
            }}
          />
          <SheetSearchSelect
            label="Inventario del detalle del asesor"
            value={aliasId}
            placeholder="Todo el inventario"
            options={[
              { value: "", label: "Todo el inventario" },
              ...tables
                .filter((t) => tableId === "all" || t.id === tableId)
                .flatMap((t) =>
                  (t.aliases ?? []).map((a) => ({
                    value: a.id,
                    label: a.name + (tableId === "all" ? " · " + t.name : ""),
                  })),
                ),
            ]}
            onSelect={setAliasId}
          />
          <SheetSearchSelect
            label="País del detalle del asesor"
            value={country}
            placeholder="Todos los países"
            options={[
              { value: "", label: "Todos los países" },
              ...countryOptions.map((c) => ({
                value: c.code,
                label: c.code + " · " + c.name,
              })),
            ]}
            onSelect={setCountry}
          />
          <button
            type="button"
            disabled={loading || !valid}
            onClick={() => setReload((v) => v + 1)}
          >
            Actualizar detalle
          </button>
        </div>
        <p className="hint">
          Ventas de coincidencias exactas de inventario + asesor + país. Todos
          suma las combinaciones de las hojas elegidas; el desglose identifica
          cada producto. A, I y H corresponden al asesor, independientemente del
          producto. Las ausencias abiertas no se suman hasta registrar el
          regreso.
        </p>
        {!valid && <p role="alert">Elige hasta 31 días.</p>}
        {message && (
          <p className="sheet-message" role="alert">
            {message}
          </p>
        )}
        {loading && <p role="status">Cargando detalle…</p>}
        {row && (
          <>
            <div className="advisor-detail-summary">
              <span>
                Ventas (V)
                <strong>
                  {sales === null ? "—" : number(sales)}
                  {partial ? " *" : ""}
                </strong>
              </span>
              <span>
                Promedio por día con V
                <strong>
                  {sales === null ? "—" : number(sales / known.length)}
                </strong>
                <small>
                  {known.length}/{days.length} días con ventas registradas
                </small>
              </span>
              <span>
                Horas ausentes (H)
                <strong>
                  {hours === null ? "—" : number(hours) + " h"}
                  {pending ? " +" : ""}
                </strong>
                <small>{pending} regreso(s) pendiente(s)</small>
              </span>
              <span>
                Asistencia (A)
                <strong>
                  {present} presente(s) · {absent} ausente(s)
                </strong>
              </span>
              <span data-advisor-summary="absences">
                Inasistencias (I)
                <strong>{recordedAttendance ? absent : "—"}</strong>
                <small>
                  {recordedAttendance}/{days.length} días con asistencia
                  registrada
                </small>
              </span>
            </div>
            <div className="row advisor-detail-controls">
              <label>
                1 · Barras
                <select
                  aria-label="Barras del detalle del asesor"
                  value={bars}
                  onChange={(e) => {
                    const v = e.target.value as AdvisorMetric;
                    setBars(v);
                    if (v === line)
                      setLine(v === "results" ? "cost" : "results");
                  }}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                2 · Línea con puntos
                <select
                  aria-label="Línea del detalle del asesor"
                  value={line}
                  onChange={(e) => {
                    const v = e.target.value as AdvisorMetric;
                    setLine(v);
                    if (v === bars)
                      setBars(v === "results" ? "cost" : "results");
                  }}
                >
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MetaDailyChart
              rows={chart}
              bars="results"
              line="cost"
              currency="PEN"
              metricName="Ventas"
              since={since}
              until={until}
              labels={{
                results: metricLabel(bars),
                cost: metricLabel(line),
                spend: "Asistencia (A)",
              }}
              units={{
                results: bars === "cost" ? "hours" : "count",
                cost: line === "cost" ? "hours" : "count",
                spend: "count",
              }}
            />
            <p className="hint">
              Escalas independientes. A: 1 = Presente, 0 = Ausente. I: 1 =
              Ausente, 0 = Presente; N.A. y vacío dejan un hueco. V y H no
              imputan ceros a los días sin datos. H muestra solo horas
              confirmadas; + indica regreso pendiente. * Cobertura parcial. Las
              ventas respetan cada tramo de asignación y los cortes registrados;
              no se reparten por horas. Las asignaciones antiguas sin historial
              conservan su atribución previa.
            </p>
            {!!data.assignmentHistory?.length && (
              <details className="advisor-assignment-history">
                <summary>Tramos y cortes de asignación</summary>
                <ul>
                  {data.assignmentHistory.map((e) => (
                    <li key={e.id}>
                      <b>
                        {new Intl.DateTimeFormat("es-PE", {
                          timeZone: "America/Lima",
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(e.effectiveAt))}
                      </b>{" "}
                      · {e.alias} · {e.country} · {e.tableName} ·{" "}
                      {e.advisorId === person.id
                        ? "Inicio de tramo"
                        : "Fin de tramo"}{" "}
                      ·{" "}
                      {e.mode === "DAY"
                        ? "día completo"
                        : `corte acumulado ${e.cutoffSales} V`}
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  Se incluye el inicio previo al período para identificar el
                  responsable. Los días completos reemplazan los cortes previos
                  de esa fecha.
                </p>
              </details>
            )}
            <h3>Histórico por día</h3>
            <div className="table-scroll">
              <table className="advisor-detail-days">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>A</th>
                    <th title="Inasistencias">I</th>
                    <th>V</th>
                    <th>H</th>
                    <th>Salidas y regresos · Lima</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => {
                    const c = row.days[day];
                    return (
                      <tr key={day}>
                        <th>{day}</th>
                        <td>{attendance(c.status)}</td>
                        <td>
                          {advisorAttendanceValue(c.status, "absences") ??
                            (c.status === "NA" ? "N.A." : "—")}
                        </td>
                        <td>
                          {c.na
                            ? "N.A."
                            : c.sales === null
                              ? "—"
                              : number(c.sales)}
                          {c.partial ? " *" : ""}
                        </td>
                        <td>
                          {c.absence.hours === null
                            ? "—"
                            : number(c.absence.hours)}
                          {c.absence.pending ? " +" : ""}
                        </td>
                        <td>
                          {c.absence.mode === "CLOCK"
                            ? c.absence.intervals
                                .map(
                                  (i) =>
                                    `${i.start} → ${i.end ?? "regreso pendiente"}${i.nextDay ? " (+1 día)" : ""}`,
                                )
                                .join("; ")
                            : c.absence.hours === null
                              ? "—"
                              : "Horas decimales manuales"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3>Ventas por producto y país · origen de la suma</h3>
            <div className="table-scroll advisor-source-scroll">
              <table className="advisor-source-breakdown">
                <thead>
                  <tr>
                    <th>Hoja</th>
                    <th>Inventario</th>
                    <th>País</th>
                    <th>Asesor</th>
                    <th>V del período</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data!.breakdown.map((source) => {
                    const cells = Object.values(source.days),
                      known = cells.filter((c) => c.sales !== null && !c.na);
                    return (
                      <tr
                        key={JSON.stringify([
                          source.tableId,
                          source.aliasId,
                          source.country,
                        ])}
                        data-source-alias={source.aliasId}
                        data-source-country={source.country}
                      >
                        <td>{source.tableName}</td>
                        <td>{source.alias}</td>
                        <td>{source.country}</td>
                        <td>{row.name}</td>
                        <td>
                          {known.length
                            ? number(known.reduce((s, c) => s + c.sales!, 0))
                            : cells.every((c) => c.na)
                              ? "N.A."
                              : "—"}
                          {known.length &&
                          cells.some(
                            (c) => c.partial || (!c.na && c.sales === null),
                          )
                            ? " *"
                            : ""}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => {
                              setTableId(source.tableId);
                              setAliasId(source.aliasId);
                              setCountry(source.country);
                            }}
                          >
                            Ver esta combinación
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data!.breakdown.length && (
              <p>
                No hay filas con esa coincidencia de inventario, asesor y país.
              </p>
            )}
          </>
        )}
        <footer className="advisor-detail-footer">
          <button
            type="button"
            onClick={() => {
              dialog.current?.close();
              setMinimized(true);
            }}
          >
            − Minimizar
          </button>
        </footer>
      </dialog>
    </>
  );
}
