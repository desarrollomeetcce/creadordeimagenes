"use client";
import { SheetDataFillBadge } from "./sheet-data-fill-badge";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { useReportDayPages } from "./report-day-pages";
import { readAdvisorRange } from "./workbook-range-request";
import { MetaDateRange } from "./meta-date-range";
import { EffectivenessCell } from "./effectiveness-cell";
import { AdvisorAbsenceCell } from "./advisor-absence-cell";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { AdvisorDetail } from "./advisor-detail";
import type {
  AdvisorDayData as Day,
  AdvisorPerson as Person,
  Attendance,
  AdvisorTable,
} from "./advisor-types";
import { countryOptions } from "../../lib/meta-ads/countries";
import { SheetSearchSelect } from "./sheet-search-select";
const statuses = [
  { value: "", label: "Sin registrar" },
  { value: "PRESENT", label: "Presente" },
  { value: "ABSENT", label: "Ausente" },
  { value: "NA", label: "N.A." },
];
export function AdvisorsSheet({
  tables,
  listId = "default-advisors",
  initialTableId,
  sheetTabs,
  onChanged,
  onOpenPeriod,
}: {
  listId?: string;
  tables: AdvisorTable[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
  onOpenPeriod?: (period: AdvisorPeriodView) => void;
}) {
  const { widths, resize, warning } = useSheetWidths("advisors:" + listId),
    rowsLayout = useSheetHeights("advisors:" + listId);
  const handle = (key: string, label: string) => (
    <SheetColumnResizer
      label={label}
      onResize={(v) => resize(key, v)}
      onReset={() => resize(key)}
    />
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailDay, setDetailDay] = useState<string | null>(null);
  const [since, setSince] = useWorkbookPreference<string>(
      listId,
      "since",
      today.slice(0, 8) + "01",
    ),
    [until, setUntil] = useWorkbookPreference<string>(listId, "until", today),
    [tableId, setTableId] = useWorkbookPreference<string>(
      listId,
      "tableId",
      initialTableId,
    ),
    [aliasId, setAliasId] = useWorkbookPreference<string>(
      listId,
      "aliasId",
      "",
    ),
    [country, setCountry] = useWorkbookPreference<string>(
      listId,
      "country",
      "",
    ),
    [detail, setDetail] = useState<Person | null>(null),
    [rows, setRows] = useState<Person[]>([]),
    [rowsContext, setRowsContext] = useState(""),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [editingName, setEditingName] = useState<string | null>(null),
    [query, setQuery] = useWorkbookPreference<string>(listId, "query", "");
  useEffect(() => {
    if (tableId !== "all" && !tables.some((t) => t.id === tableId)) {
      setTableId(tables[0]?.id ?? "all");
      setAliasId("");
    } else if (
      aliasId &&
      !tables
        .filter((t) => tableId === "all" || t.id === tableId)
        .some((t) => (t.aliases ?? []).some((a) => a.id === aliasId))
    )
      setAliasId("");
  }, [tables, tableId, aliasId]);
  const flight = useRef(0);
  const sequence = useRef(0),
    context = useRef("");
  const valid =
    since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 3660;
  const key = JSON.stringify([listId, tableId, since, until, aliasId, country]);
  context.current = key;
  const load = async (saved = false, quiet = false) => {
    if (quiet && flight.current) return;
    const token = ++sequence.current,
      requested = key;
    flight.current = token;
    if (!quiet) setLoading(true);
    try {
      const data = await readAdvisorRange(
        {
          advisorListId: listId,
          tableId,
          since,
          until,
          ...(aliasId ? { aliasId } : {}),
          ...(country ? { country } : {}),
        },
        () => token === sequence.current && context.current === requested,
      );
      if (token === sequence.current && context.current === requested) {
        setRows(data.rows);
        setRowsContext(requested);
      }
    } catch (e) {
      if (token === sequence.current && context.current === requested)
        setMessage(
          saved
            ? "Guardado, pero no se pudo recargar. Pulsa Actualizar antes de seguir editando."
            : (e as Error).message,
        );
    } finally {
      if (flight.current === token) flight.current = 0;
      if (token === sequence.current && context.current === requested)
        setLoading(false);
    }
  };
  useEffect(() => {
    if (valid) void load();
    else setLoading(false);
    const stop = subscribeAdvisorSalesChanged(() => {
      if (valid) void load(false, true);
    });
    const timer = setInterval(() => {
      if (valid && !document.hidden) void load(false, true);
    }, 30000);
    return () => {
      stop();
      clearInterval(timer);
      sequence.current++;
    };
  }, [key, valid, reload]);
  const write = async (path: string, method: string, body: unknown) => {
    const requested = key;
    setBusy(true);
    setMessage("");
    try {
      await api(path, method, body);
      if (path === "meta-ads/advisors") await onChanged();
      if (context.current === requested) await load(true);
      else setReload((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };
  const showAdvisor = (id: string) => {
    const found = rows.find((p) => p.id === id);
    if (!found) return;
    setQuery(found.name);
    setEditingName(null);
    setMessage("");
  };
  const addAdvisor = async (input: string) => {
    const name = input.trim();
    if (!name || name.length > 100)
      throw Error("Escribe un nombre de 1 a 100 caracteres.");
    const existing = rows.find(
      (p) => p.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0,
    );
    if (existing) {
      setQuery("");
      setMessage("");
      setEditingName(null);
      return;
    }
    await write("meta-ads/advisors", "POST", { name, sheetId: listId });
    setQuery("");
    setEditingName(null);
  };
  useEffect(() => {
    if (!editingName) return;
    const frame = requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        `tr[data-advisor-id="${CSS.escape(editingName)}"] .advisor-name-editor input`,
      );
      input?.focus({ preventScroll: true });
      input?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editingName]);
  const days: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      days.push(new Date(d).toISOString().slice(0, 10));
  const { visibleDays, navigation } = useReportDayPages(days);
  const words = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const filtered = (rowsContext === key ? rows : []).filter((p) =>
    words.every((w) =>
      p.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(w),
    ),
  );
  return (
    <section
      className="sheet-view advisor-sheet"
      aria-label="Hoja Asesores"
      aria-busy={loading}
    >
      <div className="row sheet-toolbar">
        <strong>Asesores</strong>
        <MetaDateRange
          maxDays={3660}
          from={since}
          to={until}
          onChange={(a, b) => {
            setSince(a);
            setUntil(b);
          }}
        />
        <label>
          Ventas de{" "}
          <SheetSearchSelect
            label="Hojas para ventas por asesor"
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
        </label>
        <SheetSearchSelect
          label="Inventario de ventas por asesor"
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
          label="País de ventas por asesor"
          value={country}
          placeholder="Todos los países"
          options={[
            { value: "", label: "Todos los países" },
            ...countryOptions.map((c) => ({
              value: c.code,
              label: c.name + " · " + c.code,
            })),
          ]}
          onSelect={setCountry}
        />
        <button
          disabled={busy || loading || !valid}
          onClick={() => void load()}
        >
          Actualizar
        </button>
      </div>
      <p className="sheet-help">
        A y H son asistencia y horas ausentes. BM suma la base manual repartida
        a cada asesor, por hoja, país y día. BM y BC se consultan aquí y se
        editan en Totales. BC es la base por contactar ingresada en Totales,
        independiente de BM y B de Meta Ads. Es independiente del diplomado
        filtrado. V suma las ventas registradas a nombre de cada asesor en las
        hojas elegidas, aunque no sea el responsable de la fila. Pulsa una venta
        para ver qué diplomados vendió ese día. H = Horas ausentes (0,5 = 30
        minutos): puedes registrar varias salidas y regresos. A y H corresponden
        a la persona y no se reparten por producto. Los registros anteriores sin
        reparto conservan su atribución por asignaciones y cortes. * Total
        parcial o reparto pendiente de aprobar; — sin datos; N.A. no es cero.
        Todas las hojas incluye también las copias sincronizadas.
      </p>
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {navigation}
      {!valid && (
        <p role="alert">Elige un período válido de hasta diez años.</p>
      )}
      {loading && (
        <p role="status" className="sheet-loading-status">
          Cargando asesores…
        </p>
      )}
      {(warning || rowsLayout.warning) && (
        <p className="sheet-message" role="status">
          {warning || rowsLayout.warning}
        </p>
      )}
      {sheetTabs}
      {valid && (
        <div className="table-scroll effectiveness-scroll">
          <table
            className="effectiveness-grid advisor-grid sheet-resizable-table"
            style={{
              width:
                (widths.advisor ?? 180) +
                visibleDays.reduce(
                  (n, d) =>
                    n +
                    (widths[d + "attendance"] ?? 84) +
                    (widths[d + "sales"] ?? 48) +
                    (widths[d + "absence"] ?? 56) +
                    (widths[d + "manualBase"] ?? 64) +
                    (widths[d + "advisorBase"] ?? 64),
                  0,
                ),
            }}
          >
            <colgroup>
              <col style={{ width: widths.advisor ?? 180 }} />
              {visibleDays.flatMap((d) => [
                <col
                  key={d + "attendance"}
                  style={{ width: widths[d + "attendance"] ?? 84 }}
                />,
                <col
                  key={d + "absence"}
                  style={{ width: widths[d + "absence"] ?? 56 }}
                />,
                <col
                  key={d + "sales"}
                  style={{ width: widths[d + "sales"] ?? 48 }}
                />,
                <col
                  key={d + "manualBase"}
                  style={{ width: widths[d + "manualBase"] ?? 64 }}
                />,
                <col
                  key={d + "advisorBase"}
                  style={{ width: widths[d + "advisorBase"] ?? 64 }}
                />,
              ])}
            </colgroup>
            <caption className="sr-only">
              Asistencia y ventas diarias por asesor
            </caption>
            <thead>
              <tr>
                <th className="advisor-name" rowSpan={2}>
                  <div className="advisor-column-title">
                    Asesor{handle("advisor", "Asesor")}
                  </div>
                  <div className="advisor-column-tools">
                    <SheetSearchSelect
                      label="Buscar o añadir asesor"
                      value={
                        (rowsContext === key ? rows : []).find(
                          (p) => p.name === query,
                        )?.id ?? ""
                      }
                      placeholder="Buscar o añadir…"
                      options={(rowsContext === key ? rows : []).map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                      disabled={busy || loading || !valid}
                      onSelect={showAdvisor}
                      onCreate={addAdvisor}
                      onError={setMessage}
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setMessage("");
                        }}
                        title={`Borrar búsqueda: ${query}`}
                      >
                        Ver todos los asesores ×
                      </button>
                    )}
                  </div>
                </th>
                {visibleDays.map((d) => (
                  <th key={d} colSpan={5} scope="colgroup">
                    {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr>
                {visibleDays.map((d) => (
                  <FragmentHeaders key={d} day={d} handle={handle} />
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <SheetSizedRow
                  key={p.id}
                  data-advisor-id={p.id}
                  label={p.name}
                  height={rowsLayout.heights[p.id]}
                  onResize={(v) => rowsLayout.resize(p.id, v)}
                  onReset={() => rowsLayout.resize(p.id)}
                >
                  <td className="advisor-name">
                    <div className="advisor-name-actions">
                      <button
                        type="button"
                        className="advisor-detail-trigger"
                        aria-label={`Detalle de ${p.name}`}
                        title="Ver evolución y detalle de ventas"
                        onClick={() => {
                          setDetailDay(null);
                          setDetail(p);
                          setDetailVersion((v) => v + 1);
                        }}
                      >
                        Detalle ↗
                      </button>
                      <span className="advisor-name-label">{p.name}</span>
                      <button
                        type="button"
                        className="advisor-name-edit"
                        disabled={busy || loading}
                        aria-label={`Editar nombre de ${p.name}`}
                        title="Editar este nombre"
                        onClick={() => setEditingName(p.id)}
                      >
                        ✎
                      </button>
                    </div>
                    {editingName === p.id && (
                      <div className="row advisor-name-editor">
                        <EffectivenessCell
                          label={`Nombre del asesor ${p.name}`}
                          value={p.name}
                          onError={setMessage}
                          onSave={async (name) => {
                            if (!name.trim() || name.length > 100)
                              throw Error("Nombre de 1 a 100 caracteres.");
                            await write("meta-ads/advisors", "PATCH", {
                              id: p.id,
                              name: name.trim(),
                              revision: p.revision,
                            });
                            setEditingName(null);
                            setQuery(name.trim());
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setEditingName(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                  {visibleDays.map((d) => {
                    const c = p.days[d];
                    return (
                      <AdvisorDay
                        key={d}
                        person={p}
                        day={d}
                        cell={c}
                        disabled={busy || loading}
                        onError={setMessage}
                        onDetail={() => {
                          setDetailDay(d);
                          setDetail(p);
                          setDetailVersion((v) => v + 1);
                        }}
                        onAbsenceSave={async (input) => {
                          await write(
                            "meta-ads/advisors/absence",
                            "PATCH",
                            input,
                          );
                        }}
                        onSave={async (status) => {
                          await write("meta-ads/advisors/attendance", "PATCH", {
                            advisorId: p.id,
                            day: d,
                            status,
                            revision: c.revision,
                          });
                        }}
                      />
                    );
                  })}
                </SheetSizedRow>
              ))}
            </tbody>
          </table>
          {!loading && !filtered.length && (
            <p className="hint">
              {rows.length
                ? "No hay asesores que coincidan con la búsqueda."
                : "Añade un asesor para empezar."}
            </p>
          )}
        </div>
      )}
      {detail && (
        <AdvisorDetail
          key={detail.id + ":" + (detailDay ?? "range")}
          openRequest={detailVersion}
          person={detail}
          tables={tables}
          initialTableId={tableId}
          initialAliasId={aliasId}
          initialCountry={country}
          initialSince={detailDay ?? since}
          initialUntil={detailDay ?? until}
          onClose={() => setDetail(null)}
          onOpenPeriod={onOpenPeriod}
        />
      )}
    </section>
  );
}
function FragmentHeaders({
  day,
  handle,
}: {
  day: string;
  handle: (key: string, label: string) => ReactNode;
}) {
  return (
    <>
      <th
        scope="col"
        title="Asistencia · registro manual del mismo día"
        aria-label="Asistencia"
        data-fill-kind="manual"
      >
        A{handle(day + "attendance", "Asistencia " + day)}
        <SheetDataFillBadge kind="manual" />
      </th>
      <th
        scope="col"
        title="Horas ausentes · registro manual del mismo día"
        aria-label="Horas ausentes"
        data-fill-kind="manual"
      >
        H{handle(day + "absence", "Horas ausentes " + day)}
        <SheetDataFillBadge kind="manual" />
      </th>
      <th
        scope="col"
        title="Ventas recibidas de las hojas"
        aria-label="Ventas"
        data-fill-kind="automatic"
      >
        V{handle(day + "sales", "Ventas " + day)}
        <SheetDataFillBadge kind="automatic" />
      </th>
      <th
        scope="col"
        title="Base manual recibida de Totales; solo lectura"
        aria-label="Base manual"
        data-fill-kind="automatic"
        data-fill-timing="next-day"
      >
        BM{handle(day + "manualBase", "Base manual " + day)}
        <SheetDataFillBadge kind="automatic" nextDay />
      </th>
      <th
        scope="col"
        title="Base por contactar: registrada en Totales"
        aria-label="Base por contactar"
        data-fill-kind="automatic"
        data-fill-timing="same-day"
      >
        BC{handle(day + "advisorBase", "Base por contactar " + day)}
        <SheetDataFillBadge kind="automatic" />
      </th>
    </>
  );
}
function AdvisorDay({
  person,
  day,
  cell,
  disabled,
  onError,
  onSave,
  onAbsenceSave,
  onDetail,
}: {
  person: Person;
  day: string;
  cell: Day;
  disabled: boolean;
  onError: (v: string) => void;
  onDetail: () => void;
  onSave: (v: Attendance) => Promise<void>;
  onAbsenceSave: (
    v: import("../../lib/meta-ads/advisor-absence").AbsenceInput,
  ) => Promise<void>;
}) {
  return (
    <>
      <td
        data-fill-kind="manual"
        className="advisor-attendance"
        data-status={cell.status ?? ""}
      >
        {disabled ? (
          <span>
            {statuses.find((s) => s.value === (cell.status ?? ""))?.label}
          </span>
        ) : (
          <SheetSearchSelect
            compact
            displayLabel
            placeholder="Sin registrar"
            label={`Asistencia ${person.name} ${day}`}
            value={cell.status ?? ""}
            options={statuses}
            onSelect={(v) => onSave((v || null) as Attendance)}
            onError={onError}
          />
        )}
      </td>
      <td className="advisor-hours" data-fill-kind="manual">
        <AdvisorAbsenceCell
          advisorId={person.id}
          name={person.name}
          day={day}
          value={cell.absence}
          disabled={disabled}
          onSave={onAbsenceSave}
          onError={onError}
        />
      </td>
      <td
        data-fill-kind="automatic"
        title="Ventas recibidas de las hojas, registradas a nombre del asesor"
      >
        <button
          type="button"
          className="advisor-sales-detail-trigger"
          aria-label={`Detalle de ventas ${person.name} ${day}`}
          onClick={onDetail}
        >
          {cell.na
            ? "N.A."
            : cell.sales === null
              ? "—"
              : new Intl.NumberFormat("es-PE").format(cell.sales)}
          {cell.partial ? " *" : ""}
        </button>
      </td>
      <td
        aria-label={`BM ${person.name} ${day}`}
        title="Solo lectura: suma del reparto de Totales para este asesor, hojas y países consultados"
        data-readonly="true"
        data-fill-kind="automatic"
        data-fill-timing="next-day"
      >
        {cell.manualBase === null || cell.manualBase === undefined
          ? "—"
          : cell.manualBase.toLocaleString("es-PE")}
      </td>
      <td
        aria-label={`BC ${person.name} ${day}`}
        data-fill-kind="automatic"
        data-fill-timing="same-day"
        title="BC se registra y reparte por asesor en Totales"
      >
        {cell.advisorBase === null || cell.advisorBase === undefined
          ? "—"
          : cell.advisorBase.toLocaleString("es-PE")}
      </td>
    </>
  );
}
