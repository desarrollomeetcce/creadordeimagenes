"use client";
import { moveAdvisorInOrder } from "../../lib/meta-ads/advisor-order-policy";
import { advisorFinancialSummary } from "../../lib/meta-ads/advisor-financial-summary";
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
const metaMoneyFormats = new Map<string, Intl.NumberFormat>();
function formatMetaMoney(value: number | null, currency: string) {
  if (value === null) return "—";
  try {
    let format = metaMoneyFormats.get(currency);
    if (!format) {
      format = new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      });
      metaMoneyFormats.set(currency, format);
    }
    return format.format(value);
  } catch {
    return (
      value.toLocaleString("es-PE", { maximumFractionDigits: 2 }) +
      " " +
      (currency || "sin moneda")
    );
  }
}
const statuses = [
  { value: "", label: "Sin registrar" },
  { value: "PRESENT", label: "Presente" },
  { value: "ABSENT", label: "Ausente" },
  { value: "NA", label: "N.A." },
];
export function AdvisorsSheet({
  tables,
  listId = "default-advisors",
  canEdit = false,
  initialTableId,
  sheetTabs,
  toolbarActions,
  onChanged,
  onOpenPeriod,
}: {
  listId?: string;
  canEdit?: boolean;
  tables: AdvisorTable[];
  initialTableId: string;
  sheetTabs: ReactNode;
  toolbarActions?: ReactNode;
  onChanged: () => Promise<void>;
  onOpenPeriod?: (period: AdvisorPeriodView) => void;
}) {
  const [orderRevision, setOrderRevision] = useState("");
  const orderPending = useRef(false),
    draggedAdvisor = useRef<string | null>(null);
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
  const [dataView, setDataView] = useWorkbookPreference<string>(
    listId,
    "advisor-data-view-v2",
    "meta",
  );
  const showMeta = dataView === "meta";
  const dayColumns = showMeta
    ? ([
        ["attendance", 84],
        ["absence", 76],
        ["sales", 60],
        ["metaBase", 90],
        ["metaSpend", 110],
        ["metaMetrics", 124],
      ] as const)
    : ([
        ["attendance", 84],
        ["absence", 76],
        ["advisorBase", 100],
        ["sales", 60],
        ["effectivenessBC", 112],
        ["manualBase", 95],
        ["effectivenessBM", 112],
      ] as const);
  const [teamAnalysis, setTeamAnalysis] = useState(false);
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
        setOrderRevision(data.advisorOrderRevision ?? "");
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
  const moveAdvisor = async (source: string, target: string) => {
    if (
      !canEdit ||
      busy ||
      orderPending.current ||
      rowsContext !== key ||
      !orderRevision ||
      source === target
    )
      return;
    const ids = rows.map((row) => row.id),
      next = moveAdvisorInOrder(ids, source, target);
    if (next === ids) return;
    const requested = key;
    orderPending.current = true;
    setBusy(true);
    setMessage("");
    sequence.current++;
    try {
      const saved: { advisorIds: string[]; revision: string } = await api(
        "meta-ads/advisors/order",
        "PUT",
        {
          advisorListId: listId,
          advisorIds: next,
          expectedRevision: orderRevision,
        },
      );
      if (context.current !== requested) return;
      const byId = new Map(rows.map((row) => [row.id, row]));
      setRows(
        saved.advisorIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
      );
      setOrderRevision(saved.revision);
      setMessage("Orden compartido guardado.");
    } catch (error) {
      if (context.current === requested) {
        setMessage((error as Error).message);
        if ((error as { status?: number }).status === 409)
          await load(false, true);
      }
    } finally {
      orderPending.current = false;
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
            className="row"
            role="group"
            aria-label="Vista de datos del asesor"
          >
            <button
              type="button"
              aria-pressed={!showMeta}
              className={!showMeta ? "primary" : ""}
              onClick={() => setDataView("manual")}
            >
              Vista manual
            </button>
            <button
              type="button"
              aria-pressed={showMeta}
              className={showMeta ? "primary" : ""}
              onClick={() => setDataView("meta")}
            >
              Vista automática
            </button>
          </div>
          <MetaDateRange
            maxDays={3660}
            activeSince={
              rows
                .map((p) => p.activeSince)
                .filter((d): d is string => !!d)
                .sort()[0]
            }
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
                (widths.advisor ?? 300) +
                visibleDays.reduce(
                  (sum, day) =>
                    sum +
                    dayColumns.reduce(
                      (n, [column, fallback]) =>
                        n + (widths[day + column] ?? fallback),
                      0,
                    ),
                  0,
                ),
            }}
          >
            <colgroup>
              <col style={{ width: widths.advisor ?? 300 }} />
              {visibleDays.flatMap((day) =>
                dayColumns.map(([column, fallback]) => (
                  <col
                    key={day + column}
                    style={{ width: widths[day + column] ?? fallback }}
                  />
                )),
              )}
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
                  <th key={d} colSpan={dayColumns.length} scope="colgroup">
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
                    showMeta={showMeta}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <SheetSizedRow
                  key={p.id}
                  data-advisor-id={p.id}
                  onDragOver={(e) => {
                    if (
                      canEdit &&
                      !busy &&
                      draggedAdvisor.current &&
                      draggedAdvisor.current !== p.id
                    ) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      e.currentTarget.dataset.advisorDrop = "true";
                    }
                  }}
                  onDragLeave={(e) => {
                    delete e.currentTarget.dataset.advisorDrop;
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    delete e.currentTarget.dataset.advisorDrop;
                    const source = draggedAdvisor.current;
                    draggedAdvisor.current = null;
                    if (source) void moveAdvisor(source, p.id);
                  }}
                  label={p.name}
                  height={rowsLayout.heights[p.id]}
                  onResize={(v) => rowsLayout.resize(p.id, v)}
                  onReset={() => rowsLayout.resize(p.id)}
                >
                  <td className="advisor-name">
                    <div className="advisor-name-actions">
                      {canEdit && (
                        <button
                          type="button"
                          className="advisor-order-handle"
                          draggable={!busy && !!orderRevision}
                          disabled={
                            busy || !orderRevision || rowsContext !== key
                          }
                          aria-label={`Mover asesor ${p.name}`}
                          title="Arrastra para cambiar el orden compartido. Alt+↑/↓ también mueve."
                          onDragStart={(e) => {
                            if (busy || !orderRevision) {
                              e.preventDefault();
                              return;
                            }
                            draggedAdvisor.current = p.id;
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData(
                              "application/x-advisor-order",
                              p.id,
                            );
                          }}
                          onDragEnd={() => {
                            draggedAdvisor.current = null;
                            document
                              .querySelectorAll("[data-advisor-drop]")
                              .forEach((node) =>
                                node.removeAttribute("data-advisor-drop"),
                              );
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.altKey &&
                              (e.key === "ArrowUp" || e.key === "ArrowDown")
                            ) {
                              e.preventDefault();
                              const index = filtered.findIndex(
                                  (person) => person.id === p.id,
                                ),
                                target =
                                  filtered[
                                    index + (e.key === "ArrowUp" ? -1 : 1)
                                  ];
                              if (target) void moveAdvisor(p.id, target.id);
                            }
                          }}
                        >
                          ⠿
                        </button>
                      )}
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
                      <span className="advisor-name-label" title={p.name}>{p.name}</span>
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
                        showMeta={showMeta}
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
      {navigation}
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
          initialView={showMeta ? "meta" : "period"}
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
          initialAnalysisView="period"
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
  showMeta,
}: {
  day: string;
  showMeta: boolean;
  handle: (key: string, label: string) => ReactNode;
}) {
  const header = (
    key: string,
    code: string,
    label: string,
    kind: "manual" | "automatic",
    formula?: string,
    nextDay = false,
  ) => (
    <th
      scope="col"
      aria-label={label}
      data-fill-kind={kind}
      title={formula ?? label}
    >
      {code}
      {handle(day + key, label + " " + day)}
      <small className="advisor-column-description">{label}</small>
      {formula ? (
        <small>{formula}</small>
      ) : (
        <SheetDataFillBadge kind={kind} nextDay={nextDay} />
      )}
    </th>
  );
  return (
    <>
      {header("attendance", "A", "Asistencia", "manual")}
      {header("absence", "H", "Inasistencia", "manual")}
      {!showMeta && header("advisorBase", "BC", "Base por contactar", "manual")}
      {header("sales", "V", "Ventas", "automatic")}
      {!showMeta && (
        <>
          {header(
            "effectivenessBC",
            "Efectividad",
            "De hoy",
            "automatic",
            "V / BC × 100",
          )}
          {header(
            "manualBase",
            "BM",
            "Base manual",
            "automatic",
            undefined,
            true,
          )}
          {header(
            "effectivenessBM",
            "Efectividad",
            "De ayer",
            "automatic",
            "V / BM × 100",
          )}
        </>
      )}
      {showMeta && (
        <>
          {header("metaBase", "B Meta", "Base de Meta", "automatic")}
          {header("metaSpend", "G Meta", "Gasto de Meta", "automatic")}
          <th
            scope="col"
            aria-label="Efectividad y CAC Meta"
            className="advisor-meta-metrics-heading"
          >
            <span className="advisor-statistics-title">Estadísticas</span>
            {handle(day + "metaMetrics", "Efectividad y CAC Meta " + day)}
            <div className="advisor-metric-half">
              <span>
                Efectividad<small>V / B Meta × 100</small>
              </span>
            </div>
            <div className="advisor-metric-half">
              <span>
                CAC Meta<small>G Meta / V</small>
              </span>
            </div>
          </th>
        </>
      )}
    </>
  );
}
function AdvisorDay({
  person,
  day,
  showMeta,
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
  showMeta: boolean;
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
  const metaMoney = showMeta
    ? advisorFinancialSummary([
        { day, sales: cell.sales, financial: cell.financial },
      ]).money
    : [];
  const metaPartial = !!(
    cell.financial?.metaPartial || cell.financial?.assignmentPartial
  );
  const metaRate = advisorDayEffectiveness({
    day,
    today,
    basis: "B",
    sales: cell.sales,
    base: cell.financial?.base,
    na: cell.na,
    partial: metaPartial || cell.partial,
  });
  const manualRate = (basis: "BC" | "BM") =>
    advisorDayEffectiveness({
      day,
      today,
      basis,
      sales: cell.sales,
      base: basis === "BC" ? cell.advisorBase : cell.manualBase,
      na: cell.na,
      partial: cell.partial,
    });
  const rateCell = (basis: "BC" | "BM") => {
    const rate = manualRate(basis);
    return (
      <td
        data-rate-basis={basis}
        data-readonly="true"
        aria-label={`Efectividad ${basis} ${person.name} ${day}`}
        title={rate.reason}
        className={`advisor-effectiveness advisor-effectiveness-${basis.toLowerCase()}`}
      >
        {rate.value === null
          ? "—"
          : advisorRateFormat.format(rate.value) + (cell.partial ? " *" : "")}
      </td>
    );
  };
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
      {!showMeta && (
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
      <td
        data-fill-kind="automatic"
        title={
          cell.historicalSales
            ? "Total histórico importado del asesor, independiente de los diplomados sin vendedor identificado."
            : "Ventas recibidas de las hojas, registradas a nombre del asesor"
        }
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
      {!showMeta && rateCell("BC")}
      {!showMeta && (
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
      {!showMeta && rateCell("BM")}
      {showMeta && (
        <>
          <td
            aria-label={`B Meta ${person.name} ${day}`}
            data-readonly="true"
            data-fill-kind="automatic"
            title="Base original de Meta de las campañas asignadas en esta fecha; el asterisco indica datos parciales."
          >
            {cell.financial?.base == null
              ? "—"
              : advisorCountFormat.format(cell.financial.base) +
                (metaPartial ? " *" : "")}
          </td>
          <td
            aria-label={`G Meta ${person.name} ${day}`}
            data-readonly="true"
            data-fill-kind="automatic"
            title="Gasto original de Meta, separado por moneda."
          >
            {metaMoney.length
              ? metaMoney.map((v) => (
                  <span key={v.currency} style={{ display: "block" }}>
                    {formatMetaMoney(v.spend, v.currency)}
                    {v.spend !== null && metaPartial ? " *" : ""}
                  </span>
                ))
              : "—"}
          </td>
          <td
            data-readonly="true"
            data-fill-kind="automatic"
            className="advisor-meta-metrics"
          >
            <div
              className="advisor-metric-half"
              aria-label={`Efectividad Meta ${person.name} ${day}`}
              title={metaRate.reason}
            >
              <small>Efect.</small>
              <strong>
                {metaRate.value === null
                  ? "—"
                  : advisorRateFormat.format(metaRate.value) +
                    (metaPartial || cell.partial ? " *" : "")}
              </strong>
            </div>
            <div
              className="advisor-metric-half"
              aria-label={`CAC Meta ${person.name} ${day}`}
              title="Gasto Meta / ventas de la misma fecha y moneda; sin ventas no se divide."
            >
              <small>CAC</small>
              <strong>
                {metaMoney.length
                  ? metaMoney.map((v) => (
                      <span key={v.currency} style={{ display: "block" }}>
                        {formatMetaMoney(v.metaCac, v.currency)}
                        {v.metaCac !== null && (metaPartial || v.partial)
                          ? " *"
                          : ""}
                      </span>
                    ))
                  : "—"}
              </strong>
            </div>
          </td>
        </>
      )}
    </>
  );
}
