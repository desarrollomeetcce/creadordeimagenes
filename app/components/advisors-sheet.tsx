"use client";
import { AdvisorCommercialRole } from "./advisor-commercial-role";
import { AdvisorContactBaseEditor } from "./advisor-contact-base-editor";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
import { advisorDayEffectiveness } from "../../lib/meta-ads/advisor-day-effectiveness";
import { matchesSearchWords } from "../../lib/search";
import { useSheetTextFit } from "./use-sheet-text-fit";
import { SheetDataFillBadge } from "./sheet-data-fill-badge";
import type { AdvisorPeriodView } from "../../lib/meta-ads/advisor-period-history";
import { useSheetWidths } from "./use-sheet-widths";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { financialRequest as api } from "./financial-request";
import { useReportDayPages } from "./report-day-pages";
import { readAdvisorRange } from "./workbook-range-request";
import { MetaDateRange } from "./meta-date-range";
import { EffectivenessCell } from "./effectiveness-cell";
import { AdvisorAbsenceCell } from "./advisor-absence-cell";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { AdvisorTeamAnalysis } from "./advisor-team-analysis";
import { AdvisorDetail } from "./advisor-detail";
import type {
  AdvisorDayData as Day,
  AdvisorPerson as Person,
  Attendance,
  AdvisorTable,
} from "./advisor-types";
import { countryOptions } from "../../lib/meta-ads/countries";
import { SheetSearchSelect } from "./sheet-search-select";
const advisorCountFormat = new Intl.NumberFormat("es-PE");
const advisorRateFormat = new Intl.NumberFormat("es-PE", {
  style: "percent",
  maximumFractionDigits: 2,
});
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
  toolbarActions,
  onChanged,
  onOpenPeriod,
}: {
  listId?: string;
  tables: AdvisorTable[];
  initialTableId: string;
  sheetTabs: ReactNode;
  toolbarActions?: ReactNode;
  onChanged: () => Promise<void>;
  onOpenPeriod?: (period: AdvisorPeriodView) => void;
}) {
  const [contactBase, setContactBase] = useState<{
    advisorId: string;
    name: string;
    day: string;
  } | null>(null);
  const [rolePerson, setRolePerson] = useState<Person | null>(null);
  const numbersTable = useRef<HTMLTableElement>(null);
  useSheetTextFit(
    numbersTable,
    "td[data-readonly=true], td[aria-label^='BC '], .advisor-absence-trigger, .advisor-sales-detail-trigger",
  );
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
  const [analysisView, setAnalysisView] = useState<
    "period" | "today" | "yesterday"
  >("period");
  const showBM = analysisView !== "today",
    showBC = analysisView !== "yesterday";
  const rateBasis =
    analysisView === "period" ? null : analysisView === "today" ? "BC" : "BM";
  const [teamAnalysis, setTeamAnalysis] = useState(false);
  const [teamViewOverride, setTeamViewOverride] = useState<"meta" | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const [detailDay, setDetailDay] = useState<string | null>(null);
  const [periodSince, setSince] = useWorkbookPreference<string>(
      listId,
      "since",
      today.slice(0, 8) + "01",
    ),
    [periodUntil, setUntil] = useWorkbookPreference<string>(
      listId,
      "until",
      today,
    ),
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
  const since = periodSince,
    until = periodUntil;
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
  const filtered = (rowsContext === key ? rows : []).filter((p) =>
    matchesSearchWords(p.name, query),
  );
  return (
    <section
      className="sheet-view advisor-sheet"
      aria-label="Hoja Asesores"
      aria-busy={loading}
    >
      {contactBase && (
        <AdvisorContactBaseEditor
          {...contactBase}
          advisorListId={listId}
          onClose={() => setContactBase(null)}
          onSaved={async () => {
            notifyAdvisorSalesChanged();
            await load(true);
          }}
        />
      )}
      <div className="row sheet-toolbar sheet-toolbar-with-actions">
        <div className="row sheet-toolbar-controls">
          <strong>Asesores</strong>
          <div
            className="row sheet-view-buttons"
            aria-label="Vista de asesores"
          >
            {(
              [
                ["today", "Hoy · avance provisional"],
                ["yesterday", "Ayer · día completo"],
                ["period", "Análisis del período"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={
                  value === "today"
                    ? "sheet-mode-today"
                    : value === "yesterday"
                      ? "sheet-mode-yesterday"
                      : undefined
                }
                aria-pressed={analysisView === value}
                onClick={() => {
                  setAnalysisView(value);
                  if (value === "today" || value === "yesterday") {
                    const day =
                      value === "today"
                        ? today
                        : new Date(Date.parse(today) - 86400000)
                            .toISOString()
                            .slice(0, 10);
                    setSince(day);
                    setUntil(day);
                    setAliasId("");
                  }
                }}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setTeamViewOverride("meta");
                setTeamAnalysis(true);
              }}
            >
              Datos Meta
            </button>
          </div>
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
            Ventas de hojas{" "}
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
        {toolbarActions}
      </div>
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
            ref={numbersTable}
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
                    (showBM ? (widths[d + "manualBase"] ?? 64) : 0) +
                    (showBC ? (widths[d + "advisorBase"] ?? 64) : 0) +
                    (rateBasis ? (widths[d + "effectiveness"] ?? 84) : 0),
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
                ...(showBM
                  ? [
                      <col
                        key={d + "manualBase"}
                        style={{ width: widths[d + "manualBase"] ?? 64 }}
                      />,
                    ]
                  : []),
                ...(showBC
                  ? [
                      <col
                        key={d + "advisorBase"}
                        style={{ width: widths[d + "advisorBase"] ?? 64 }}
                      />,
                    ]
                  : []),
                ...(rateBasis
                  ? [
                      <col
                        key={d + "effectiveness"}
                        style={{ width: widths[d + "effectiveness"] ?? 84 }}
                      />,
                    ]
                  : []),
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
                  <button
                    type="button"
                    className="advisor-team-trigger"
                    onClick={() => {
                      setTeamViewOverride(null);
                      setTeamAnalysis(true);
                    }}
                  >
                    Ver análisis del equipo
                  </button>
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
                  <th
                    key={d}
                    colSpan={
                      3 + Number(showBM) + Number(showBC) + Number(!!rateBasis)
                    }
                    scope="colgroup"
                  >
                    {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr>
                {visibleDays.map((d) => (
                  <FragmentHeaders
                    key={d}
                    day={d}
                    handle={handle}
                    showBM={showBM}
                    showBC={showBC}
                    rateBasis={rateBasis}
                  />
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
                        className="advisor-commercial-badge"
                        data-financial-write
                        aria-label={`Editar función de ${p.name}`}
                        onClick={() => setRolePerson(p)}
                      >
                        {p.commercialRole === "SUPERVISOR"
                          ? "Supervisión"
                          : "Asesoría"}
                      </button>
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
                        showBM={showBM}
                        showBC={showBC}
                        rateBasis={rateBasis}
                        today={today}
                        disabled={busy || loading}
                        onError={setMessage}
                        onContactBase={() =>
                          setContactBase({
                            advisorId: p.id,
                            name: p.name,
                            day: d,
                          })
                        }
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
      {rolePerson && (
        <AdvisorCommercialRole
          name={rolePerson.name}
          value={rolePerson.commercialRole ?? "ADVISOR"}
          onClose={() => setRolePerson(null)}
          onSave={async (commercialRole) => {
            await write("meta-ads/advisors", "PATCH", {
              id: rolePerson.id,
              name: rolePerson.name,
              revision: rolePerson.revision,
              commercialRole,
            });
          }}
        />
      )}
      {teamAnalysis && (
        <AdvisorTeamAnalysis
          listId={listId}
          tables={tables}
          initialTableId={tableId}
          initialCountry={country}
          initialView={teamViewOverride ?? analysisView}
          initialSince={since}
          initialUntil={until}
          onClose={() => setTeamAnalysis(false)}
        />
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
          initialAnalysisView={analysisView}
          initialRangeSelected={!!detailDay}
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
  showBM,
  showBC,
  rateBasis,
}: {
  rateBasis: "BC" | "BM" | null;
  showBM: boolean;
  showBC: boolean;
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
      {showBM && (
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
      )}
      {showBC && (
        <th
          scope="col"
          title="Base por contactar: registra por asesor, hoja y país"
          aria-label="Base por contactar"
          data-fill-kind="manual"
          data-fill-timing="same-day"
        >
          BC{handle(day + "advisorBase", "Base por contactar " + day)}
          <SheetDataFillBadge kind="manual" />
        </th>
      )}
      {rateBasis && (
        <th
          scope="col"
          aria-label={
            rateBasis === "BC"
              ? "Efectividad provisional Ventas / BC"
              : "Efectividad real Ventas / BM"
          }
          className={
            "advisor-effectiveness advisor-effectiveness-" +
            rateBasis.toLowerCase()
          }
          title={
            rateBasis === "BC"
              ? "Efectividad provisional: ventas / BC del mismo día, hasta hoy Lima."
              : "Efectividad real: ventas / BM del mismo día; disponible desde el día siguiente."
          }
        >
          V / {rateBasis} %
          {handle(
            day + "effectiveness",
            "Efectividad " + rateBasis + " " + day,
          )}
          <small>Calculado</small>
        </th>
      )}
    </>
  );
}
function AdvisorDay({
  person,
  day,
  showBM,
  showBC,
  rateBasis,
  today,
  cell,
  disabled,
  onError,
  onSave,
  onAbsenceSave,
  onContactBase,
  onDetail,
}: {
  person: Person;
  day: string;
  showBM: boolean;
  showBC: boolean;
  rateBasis: "BC" | "BM" | null;
  today: string;
  cell: Day;
  disabled: boolean;
  onError: (v: string) => void;
  onDetail: () => void;
  onContactBase: () => void;
  onSave: (v: Attendance) => Promise<void>;
  onAbsenceSave: (
    v: import("../../lib/meta-ads/advisor-absence").AbsenceInput,
  ) => Promise<void>;
}) {
  const rate = rateBasis
    ? advisorDayEffectiveness({
        day,
        today,
        basis: rateBasis,
        sales: cell.sales,
        base: rateBasis === "BC" ? cell.advisorBase : cell.manualBase,
        na: cell.na,
        partial: cell.partial,
      })
    : null;
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
              : advisorCountFormat.format(cell.sales)}
          {cell.partial ? " *" : ""}
        </button>
      </td>
      {showBM && (
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
      )}
      {showBC && (
        <td
          aria-label={`BC ${person.name} ${day}`}
          data-fill-kind="manual"
          data-fill-timing="same-day"
          title="Registrar BC de este asesor por hoja y país"
        >
          <button
            type="button"
            className="advisor-contact-base-cell"
            disabled={disabled}
            aria-label={`Registrar BC de ${person.name} ${day}`}
            onClick={onContactBase}
          >
            {cell.advisorBase == null
              ? "—"
              : cell.advisorBase.toLocaleString("es-PE")}
          </button>
        </td>
      )}
      {rateBasis && rate && (
        <td
          data-rate-basis={rateBasis}
          data-readonly="true"
          aria-label={`Efectividad ${rateBasis} ${person.name} ${day}`}
          title={rate.reason}
          className={
            "advisor-effectiveness advisor-effectiveness-" +
            rateBasis.toLowerCase()
          }
        >
          {rate.value === null
            ? "—"
            : advisorRateFormat.format(rate.value) + (cell.partial ? " *" : "")}
        </td>
      )}
    </>
  );
}
