"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaDateRange } from "./meta-date-range";
import { SheetSearchSelect } from "./sheet-search-select";
import { MetaDailyChart } from "./meta-daily-chart";
import { countryOptions } from "../../lib/meta-ads/countries";
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
const options = [
  { value: "results", label: "Ventas (V)" },
  { value: "cost", label: "Horas ausentes (H)" },
  { value: "spend", label: "Asistencia (A)" },
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
}: {
  person: AdvisorPerson;
  tables: AdvisorTable[];
  initialTableId: string;
  initialAliasId: string;
  initialCountry: string;
  initialSince: string;
  initialUntil: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tableId, setTableId] = useState(initialTableId),
    [aliasId, setAliasId] = useState(initialAliasId),
    [country, setCountry] = useState(initialCountry),
    [since, setSince] = useState(initialSince),
    [until, setUntil] = useState(initialUntil),
    [bars, setBars] = useState<DailyChartMetric>("results"),
    [line, setLine] = useState<DailyChartMetric>("cost"),
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
    dialog.current?.showModal();
  }, []);
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
  const chart = days.map((day) => ({
    day,
    results: row!.days[day].sales,
    cost: row!.days[day].absence.hours,
    spend:
      row!.days[day].status === "PRESENT"
        ? 1
        : row!.days[day].status === "ABSENT"
          ? 0
          : null,
  }));
  const partial = days.some((d) => row!.days[d].partial);
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-detail"
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
          label="Alias del detalle del asesor"
          value={aliasId}
          placeholder="Todos los alias"
          options={[
            { value: "", label: "Todos los alias" },
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
        Ventas de coincidencias exactas de alias + asesor + país. Todos suma las
        combinaciones de las hojas elegidas; el desglose identifica cada
        producto. A y H corresponden al asesor, independientemente del producto.
        Las ausencias abiertas no se suman hasta registrar el regreso.
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
          </div>
          <div className="row advisor-detail-controls">
            <label>
              1 · Barras
              <select
                aria-label="Barras del detalle del asesor"
                value={bars}
                onChange={(e) => {
                  const v = e.target.value as DailyChartMetric;
                  setBars(v);
                  if (v === line) setLine(v === "results" ? "cost" : "results");
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
                  const v = e.target.value as DailyChartMetric;
                  setLine(v);
                  if (v === bars) setBars(v === "results" ? "cost" : "results");
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
            bars={bars}
            line={line}
            currency="PEN"
            metricName="Ventas"
            since={since}
            until={until}
            labels={{
              results: "Ventas (V)",
              cost: "Horas ausentes (H)",
              spend: "Asistencia (A)",
            }}
            units={{ results: "count", cost: "hours", spend: "count" }}
          />
          <p className="hint">
            Escalas independientes. A: 1 = Presente, 0 = Ausente; N.A. y vacío
            dejan un hueco. V y H no imputan ceros a los días sin datos. H
            muestra solo horas confirmadas; + indica regreso pendiente. *
            Cobertura parcial. La asignación actual se aplica también al
            histórico.
          </p>
          <h3>Histórico por día</h3>
          <div className="table-scroll">
            <table className="advisor-detail-days">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>A</th>
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
                  <th>Alias</th>
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
            <p>No hay filas con esa coincidencia de alias, asesor y país.</p>
          )}
        </>
      )}
    </dialog>
  );
}
