"use client";
import { useSheetTextFit } from "./use-sheet-text-fit";
import { subscribeAdvisorSalesChanged } from "./advisor-sales-events";
import { useSheetWidths } from "./use-sheet-widths";
import { totalSourceBlocks } from "../../lib/meta-ads/total-source-blocks";
import { useSheetHeights } from "./use-sheet-heights";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { SheetSizedRow } from "./sheet-sized-row";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { engineRequest as api } from "./generation-engine";
import { MetaDateRange } from "./meta-date-range";
import { SheetMultiFilter } from "./sheet-multi-filter";
import { SheetSearchSelect } from "./sheet-search-select";
import { EffectivenessCell } from "./effectiveness-cell";
import { countryOptions } from "../../lib/meta-ads/countries";
import { currencyCodes } from "../../lib/meta-ads/currency-codes";
import type { TotalValue } from "../../lib/meta-ads/effectiveness-total-values";
import type { SheetMetric } from "../../lib/meta-ads/period-summary";
import {
  manualTotalColumns as manualColumns,
  automaticTotalColumns as autoColumns,
  type ManualTotalMetric as ManualMetric,
  type TotalDay as Day,
  type TotalSheet,
} from "../../lib/meta-ads/totals-detail";
import { readTotalsRange } from "./workbook-range-request";
import { useReportDayPages } from "./report-day-pages";
import { ManualBaseEditor } from "./manual-base-editor";
import {
  TotalsColumnPalette,
  useTotalsColumnTools,
} from "./totals-column-tools";
import { SheetDataFillBadge } from "./sheet-data-fill-badge";
import {
  fillNextDay,
  sheetDataFillLabels,
} from "../../lib/meta-ads/sheet-data-fill";
import { shiftDay } from "./date-range";
import { totalViewColumns } from "../../lib/meta-ads/total-detail-views";
import { TotalsDetail } from "./totals-detail";
const names = new Intl.DisplayNames(["es"], { type: "currency" });
export function EffectivenessTotals({
  tables,
  listId = "default-totals",
  initialTableId,
  sheetTabs,
}: {
  listId?: string;
  sheetTabs: ReactNode;
  tables: { id: string; name: string }[];
  initialTableId: string;
}) {
  const numbersTable = useRef<HTMLTableElement>(null);
  useSheetTextFit(
    numbersTable,
    "td[data-metric].sheet-derived, td[data-metric] input.sheet-cell, td[data-metric] .manual-base-cell",
  );
  const { widths, resize, warning } = useSheetWidths("totals:" + listId),
    rowsLayout = useSheetHeights("totals:" + listId);
  const handle = (key: string, label: string, resetWidth?: number) => (
    <SheetColumnResizer
      label={label}
      onResize={(v) => resize(key, v)}
      onReset={() => resize(key, resetWidth)}
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
  const [periodSince, setSince] = useWorkbookPreference<string>(
      listId,
      "since",
      today.slice(0, 8) + (Number(today.slice(8)) >= 20 ? "20" : "01"),
    ),
    [periodUntil, setUntil] = useWorkbookPreference<string>(
      listId,
      "until",
      today,
    );
  const since =
    analysisView === "period"
      ? periodSince
      : analysisView === "today"
        ? today
        : shiftDay(today, -1);
  const until = analysisView === "period" ? periodUntil : since;
  const [mode, setMode] = useWorkbookPreference<"manual" | "automatic">(
      listId,
      "mode",
      "manual",
    ),
    [selected, setSelected] = useWorkbookPreference<string[] | null>(
      listId,
      "selected",
      listId === "default-totals" && initialTableId ? [initialTableId] : [],
    );
  const [country, setCountry] = useWorkbookPreference<string>(
      listId,
      "country",
      "",
    ),
    [currency, setCurrency] = useWorkbookPreference<string>(
      listId,
      "currency",
      "",
    ),
    [data, setData] = useState<TotalSheet[]>([]),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [reload, setReload] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSelection, setDetailSelection] = useState<
    { blockKey: string; day: string } | undefined
  >();
  const [baseEditor, setBaseEditor] = useState<{
    metric: "BM" | "BA";
    tableId: string;
    country: string;
    currency: string;
    day: string;
  } | null>(null);
  const seq = useRef(0),
    queues = useRef(new Map<string, Promise<void>>()),
    versions = useRef(new Map<string, number>());
  const ids = (
    selected === null
      ? tables.map((t) => t.id)
      : selected.filter((id) => tables.some((t) => t.id === id))
  ).join(",");
  const context = JSON.stringify([listId, ids, since, until]);
  const requestedContext = useRef("");
  const activeContext = useRef(context);
  activeContext.current = context;
  useEffect(() => {
    let active = true,
      inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const version = ++seq.current;
      setLoading(true);
      try {
        const list = ids ? ids.split(",") : [],
          next: TotalSheet[] = [];
        for (let i = 0; i < list.length; i += 4)
          next.push(
            ...(await Promise.all(
              list
                .slice(i, i + 4)
                .map((tableId) =>
                  readTotalsRange(
                    { sheetId: listId, tableId, since, until },
                    () => active && version === seq.current,
                  ),
                ),
            )),
          );
        if (active && version === seq.current) {
          setData(next);
          setMessage("");
        }
      } catch (e) {
        if (active && version === seq.current)
          setMessage(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los totales.",
          );
      } finally {
        inFlight = false;
        if (active && version === seq.current) setLoading(false);
      }
    };
    // Reload the same cells in place; only a different source/range starts an empty view.
    if (requestedContext.current !== context) {
      requestedContext.current = context;
      setData([]);
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    const unsubscribe = subscribeAdvisorSalesChanged(() => void load());
    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [listId, ids, since, until, reload]);
  const days = useMemo(() => {
    const result: string[] = [];
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      result.push(new Date(d).toISOString().slice(0, 10));
    return result;
  }, [since, until]);
  const { visibleDays, navigation } = useReportDayPages(days);
  const blocks = useMemo(
    () => totalSourceBlocks(data, country, currency),
    [data, country, currency],
  );
  const effectiveMode = analysisView === "period" ? mode : "manual";
  const columnTools = useTotalsColumnTools(
    listId,
    effectiveMode,
    effectiveMode === "manual" ? manualColumns : autoColumns,
  );
  const columns =
    analysisView === "period"
      ? columnTools.columns
      : columnTools.columns.filter((c) =>
          totalViewColumns(analysisView).some((v) => v.key === c.key),
        );
  const layoutColumns = [
    { key: "date", width: 100 },
    ...blocks.flatMap((block) => [
      { key: block.key + ":country", width: widths.country ?? 66 },
      { key: block.key + ":currency", width: widths.currency ?? 66 },
      ...columns.map((m) => ({
        key: block.key + ":" + m.key,
        width: widths[block.table.tableId + ":" + m.key] ?? 76,
      })),
    ]),
  ];
  const save = (
    t: TotalSheet,
    g: { country: string; currency: string },
    day: string,
    cell: Day | undefined,
    metric: ManualMetric,
    text: string,
  ) => {
    const value =
      text.trim() === ""
        ? null
        : /^n\.?a\.?$/i.test(text.trim())
          ? "NA"
          : Number(text);
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) ||
        value < 0 ||
        value > 1e9 ||
        (metric === "baseManual" && (!Number.isInteger(value) || value > 1e8)))
    )
      return Promise.reject(
        Error("Escribe un número no negativo válido o N.A."),
      );
    const key = JSON.stringify([t.tableId, g.country, g.currency, day]);
    const job = (queues.current.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const result = await api("meta-ads/effectiveness/totals", "PATCH", {
          sheetId: listId,
          tableId: t.tableId,
          ...g,
          day,
          metric,
          value,
          revision: Math.max(
            cell?.revision ?? 0,
            versions.current.get(key) ?? 0,
          ),
        });
        versions.current.set(key, result.revision);
        if (activeContext.current !== context) return;
        seq.current++;
        setLoading(false);
        setMessage("");
        // Patch the saved field only: preserve pending drafts and avoid remounting the sheet.
        setData((old) =>
          old.map((sheet) =>
            sheet.tableId !== t.tableId
              ? sheet
              : {
                  ...sheet,
                  groups: (sheet.groups.some(
                    (x) => x.country === g.country && x.currency === g.currency,
                  )
                    ? sheet.groups
                    : [...sheet.groups, { ...g, days: {} }]
                  ).map((group) =>
                    group.country !== g.country || group.currency !== g.currency
                      ? group
                      : {
                          ...group,
                          days: {
                            ...group.days,
                            [day]: {
                              ...group.days[day],
                              revision: result.revision,
                              manual: {
                                ...group.days[day]?.manual,
                                [metric]: value ?? undefined,
                              },
                            },
                          },
                        },
                  ),
                },
          ),
        );
      });
    queues.current.set(key, job);
    return job.finally(() => {
      if (queues.current.get(key) === job) queues.current.delete(key);
    });
  };
  return (
    <section
      className="effectiveness sheet-view"
      aria-label="Totales de efectividad"
      aria-busy={loading}
    >
      <div className="row sheet-toolbar">
        <div className="row sheet-view-buttons" aria-label="Vista de totales">
          <button
            aria-pressed={analysisView === "period" && mode === "manual"}
            className={
              "sheet-mode-manual" +
              (analysisView === "period" && mode === "manual" ? " primary" : "")
            }
            onClick={() => {
              setAnalysisView("period");
              setMode("manual");
            }}
          >
            Total manual
          </button>
          <button
            aria-pressed={analysisView === "period" && mode === "automatic"}
            className={
              "sheet-mode-automatic" +
              (analysisView === "period" && mode === "automatic"
                ? " primary"
                : "")
            }
            onClick={() => {
              setAnalysisView("period");
              setMode("automatic");
            }}
          >
            Total automático
          </button>
          <button
            aria-pressed={analysisView === "today"}
            onClick={() => setAnalysisView("today")}
          >
            Hoy · avance provisional
          </button>
          <button
            aria-pressed={analysisView === "yesterday"}
            onClick={() => setAnalysisView("yesterday")}
          >
            Ayer · día completo
          </button>
        </div>
        <MetaDateRange
          maxDays={3660}
          from={since}
          to={until}
          onChange={(a, b) => {
            if (
              !a ||
              !b ||
              a > b ||
              (Date.parse(b) - Date.parse(a)) / 86400000 >= 3660
            ) {
              setMessage("Elige un período válido de hasta diez años.");
              return;
            }
            setAnalysisView("period");
            setSince(a);
            setUntil(b);
          }}
        />
        <SheetMultiFilter
          label="Hojas de origen"
          value={selected}
          onChange={setSelected}
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
        />
        {!data.length &&
          selected !== null &&
          tables.some((t) => !selected.includes(t.id)) && (
            <SheetSearchSelect
              label="Agregar hoja a Totales"
              className="sheet-add-source"
              value=""
              placeholder="+ Agregar hoja"
              options={tables
                .filter((t) => !selected.includes(t.id))
                .map((t) => ({ value: t.id, label: t.name }))}
              onSelect={(id) =>
                setSelected((old) =>
                  old === null ? null : [...new Set([...old, id])],
                )
              }
            />
          )}
        <label>
          País
          <SheetSearchSelect
            label="País de totales"
            placeholder="Todos"
            value={country}
            options={[
              { value: "", label: "Todos" },
              { value: "__none", label: "Sin país" },
              ...countryOptions.map((c) => ({
                value: c.code,
                label: c.code + " · " + c.name,
              })),
            ]}
            onSelect={setCountry}
          />
        </label>
        <label>
          Moneda
          <SheetSearchSelect
            label="Moneda de totales"
            placeholder="Todas"
            value={currency}
            options={[
              { value: "", label: "Todas" },
              ...currencyCodes.map((c) => ({
                value: c,
                label: c + " · " + names.of(c),
              })),
            ]}
            onSelect={setCurrency}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setDetailSelection(undefined);
            setDetailOpen(true);
          }}
        >
          Ver detalle
        </button>
        <TotalsColumnPalette tools={columnTools} />
        <button disabled={loading} onClick={() => setReload((v) => v + 1)}>
          Actualizar totales
        </button>
      </div>
      {baseEditor && (
        <ManualBaseEditor
          metric={baseEditor.metric}
          context={{
            kind: "total",
            scope: {
              tableId: baseEditor.tableId,
              country: baseEditor.country,
              currency: baseEditor.currency,
              day: baseEditor.day,
              sheetId: listId,
            },
          }}
          tables={tables}
          onClose={() => setBaseEditor(null)}
          onChanged={async () => {
            setReload((v) => v + 1);
          }}
        />
      )}
      {detailOpen && (
        <TotalsDetail
          totalsSheetId={listId}
          blocks={blocks}
          days={days}
          initialMode={effectiveMode}
          initialView={analysisView === "period" ? effectiveMode : analysisView}
          initialSelection={detailSelection}
          loading={loading}
          message={message}
          onClose={() => setDetailOpen(false)}
        />
      )}
      <p className="sheet-help">
        {analysisView === "today"
          ? "Hoy · Lima: ventas, presupuesto, BC y costo fijo; sin BM ni GM."
          : analysisView === "yesterday"
            ? "Ayer · Lima: ventas, BM, GM y costo fijo; sin BC ni presupuesto."
            : mode === "manual"
              ? "V/P: suma de inventario. BM y BC: repartos manuales independientes por asesor, hoja, país y día (sin moneda). GM y CF: valores manuales por bloque."
              : "V/B/G/CF: suma de los valores de la vista automática. BC se registra manualmente por asesor."}{" "}
        Países y monedas separados; N.A. no suma, — sin dato, * suma parcial.
        Las ventas se suman únicamente desde la hoja de origen indicada en cada
        bloque, sin combinar tablas. No modifica Meta Ads.
      </p>
      {columnTools.message && (
        <span className="sr-only" role="status">
          {columnTools.message}
        </span>
      )}
      {message && (
        <p className="sheet-message" role="alert">
          {message}
        </p>
      )}
      {loading && !data.length && (
        <p role="status" className="sheet-loading-status">
          Cargando totales…
        </p>
      )}
      {navigation}
      {data.some((t) => t.missingFxDays.length > 0) && (
        <p className="sheet-help">
          Hay tasas pendientes. Actualiza las tasas desde la hoja de cada tabla;
          no se muestran subtotales monetarios incompletos.
        </p>
      )}
      {!data.length && !loading && (
        <p className="sheet-help">Selecciona al menos una tabla.</p>
      )}
      {(warning || rowsLayout.warning) && (
        <p className="sheet-message" role="status">
          {warning || rowsLayout.warning}
        </p>
      )}
      {sheetTabs}
      {!!data.length && (
        <div className="table-scroll effectiveness-scroll sheet-scroll">
          <table
            ref={numbersTable}
            className="effectiveness-grid sheet-totals-grid sheet-resizable-table"
            style={{
              width: layoutColumns.reduce(
                (n, c) => n + (widths[c.key] ?? c.width),
                0,
              ),
            }}
          >
            <colgroup>
              {layoutColumns.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Fecha{handle("date", "Fecha")}</th>
                {data.map((t, index) => (
                  <th
                    key={t.tableId}
                    colSpan={
                      blocks.filter((b) => b.table.tableId === t.tableId)
                        .length *
                      (columns.length + 2)
                    }
                  >
                    <div className="totals-source-heading">
                      <span>{t.name}</span>
                      <button
                        type="button"
                        className="totals-source-detail"
                        aria-label={`Ver detalle de la hoja ${t.name}`}
                        onClick={() => {
                          const candidates = blocks.filter(
                            (b) => b.table.tableId === t.tableId,
                          );
                          const first =
                            candidates.find((b) => {
                              const group = b.table.groups.find(
                                (g) =>
                                  g.country === b.country &&
                                  g.currency === b.currency,
                              );
                              return Object.values(group?.days ?? {}).some(
                                (d) => (d.sums?.sales?.known ?? 0) > 0,
                              );
                            }) ?? candidates[0];
                          if (!first) return;
                          setDetailSelection({ blockKey: first.key, day: "" });
                          setDetailOpen(true);
                        }}
                      >
                        Ver detalle
                      </button>
                      {index === data.length - 1 &&
                        selected !== null &&
                        tables.some(
                          (source) => !selected.includes(source.id),
                        ) && (
                          <SheetSearchSelect
                            label="Agregar hoja junto a las hojas de Totales"
                            className="totals-source-add"
                            value=""
                            placeholder="+"
                            options={tables
                              .filter((source) => !selected.includes(source.id))
                              .map((source) => ({
                                value: source.id,
                                label: source.name,
                              }))}
                            onSelect={(id) =>
                              setSelected((old) =>
                                old === null
                                  ? null
                                  : [...new Set([...old, id])],
                              )
                            }
                          />
                        )}
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                {blocks.flatMap((block) => [
                  <th key={block.key + ":country"}>
                    País
                    {handle(
                      block.key + ":country",
                      block.table.name +
                        " " +
                        block.country +
                        " " +
                        block.currency +
                        " País",
                      66,
                    )}
                  </th>,
                  <th key={block.key + ":currency"}>
                    Moneda
                    {handle(
                      block.key + ":currency",
                      block.table.name +
                        " " +
                        block.country +
                        " " +
                        block.currency +
                        " Moneda",
                      66,
                    )}
                  </th>,
                  ...columns.map((m) => (
                    <th
                      key={block.key + ":" + m.key}
                      data-entry={m.sum ? "derived" : "manual"}
                      data-total-column={m.key}
                      data-fill-kind={columnTools.kind(m.key)}
                      data-fill-timing={
                        fillNextDay(m.key) ? "next-day" : "same-day"
                      }
                      data-total-tone={
                        columnTools.kind(m.key) === "automatic"
                          ? "green"
                          : columnTools.kind(m.key) === "next-day"
                            ? "brown"
                            : "blue"
                      }
                      data-column-drop={
                        columnTools.drop?.key === m.key
                          ? columnTools.drop.after
                            ? "after"
                            : "before"
                          : undefined
                      }
                      style={columnTools.style(m.key, true)}
                      title={`${m.name} (${m.label}) · ${sheetDataFillLabels[columnTools.kind(m.key)]}`}
                    >
                      {m.label}
                      {m.sum ? " Σ" : ""}
                      {columnTools.handle(
                        m,
                        `${block.table.name} ${block.country} ${block.currency}`,
                      )}
                      {handle(
                        block.key + ":" + m.key,
                        block.table.name +
                          " " +
                          block.country +
                          " " +
                          block.currency +
                          " " +
                          m.label,
                        76,
                      )}
                      <SheetDataFillBadge kind={columnTools.kind(m.key)} />
                    </th>
                  )),
                ])}
              </tr>
            </thead>
            <tbody>
              {visibleDays.map((day) => (
                <SheetSizedRow
                  key={day}
                  data-total-day={day}
                  label={day}
                  height={
                    rowsLayout.heights["date:" + day] ??
                    Math.max(
                      0,
                      ...blocks.map(
                        (b) =>
                          rowsLayout.heights[
                            day + ":" + b.country + ":" + b.currency
                          ] ?? 0,
                      ),
                    )
                  }
                  onResize={(value) => rowsLayout.resize("date:" + day, value)}
                  onReset={() => rowsLayout.resize("date:" + day, 30)}
                >
                  <th>
                    {day.slice(8)}.{day.slice(5, 7)}.{day.slice(0, 4)}
                  </th>
                  {blocks.flatMap((block) => {
                    const t = block.table,
                      g = { country: block.country, currency: block.currency },
                      cell = t.groups.find(
                        (x) =>
                          x.country === g.country && x.currency === g.currency,
                      )?.days[day];
                    return [
                      <td
                        key={block.key + ":country"}
                        data-source-table={t.tableId}
                        data-country={g.country}
                        data-currency={g.currency}
                        data-metric="country"
                      >
                        <button
                          type="button"
                          className="totals-country-detail"
                          aria-label={`Ver detalle de ${t.name}, ${g.country || "sin país"}, ${g.currency || "sin moneda"}, ${day}`}
                          onClick={() => {
                            setDetailSelection({ blockKey: block.key, day });
                            setDetailOpen(true);
                          }}
                        >
                          {g.country || "—"} <small aria-hidden="true">↗</small>
                        </button>
                      </td>,
                      <td
                        key={block.key + ":currency"}
                        data-source-table={t.tableId}
                        data-country={g.country}
                        data-currency={g.currency}
                        data-metric="currency"
                      >
                        {g.currency || "—"}
                      </td>,
                      ...columns.map((m) => {
                        const sum = m.sum
                          ? cell?.sums?.[m.key as SheetMetric]
                          : undefined;
                        return (
                          <td
                            key={block.key + m.key}
                            data-source-table={t.tableId}
                            data-country={g.country}
                            data-currency={g.currency}
                            data-metric={m.key}
                            data-fill-kind={columnTools.kind(m.key)}
                            data-fill-timing={
                              fillNextDay(m.key) ? "next-day" : "same-day"
                            }
                            className={m.sum ? "sheet-derived" : ""}
                            data-total-tone={
                              columnTools.kind(m.key) === "automatic"
                                ? "green"
                                : columnTools.kind(m.key) === "next-day"
                                  ? "brown"
                                  : "blue"
                            }
                            style={columnTools.style(m.key)}
                            data-entry={m.sum ? "derived" : "manual"}
                          >
                            {m.sum ? (
                              <span
                                title={
                                  sum
                                    ? `${sum.known}/${sum.expected} inventario con dato; ${sum.na} N.A.${sum.pending ? " Falta conversión." : ""}`
                                    : "Sin datos"
                                }
                              >
                                {sum?.value === null || sum?.value === undefined
                                  ? sum?.pending
                                    ? "Sin tasa"
                                    : "—"
                                  : sum.value.toLocaleString("es-PE", {
                                      maximumFractionDigits: 2,
                                    }) + (sum.partial ? " *" : "")}
                              </span>
                            ) : m.key === "baseManual" ||
                              m.key === "advisorBase" ? (
                              <button
                                type="button"
                                className="manual-base-cell"
                                aria-label={`${m.label} total ${t.name} ${g.country} ${g.currency} ${day}`}
                                title={`Repartir ${m.name.toLowerCase()} por asesor`}
                                onClick={() =>
                                  setBaseEditor({
                                    metric:
                                      m.key === "advisorBase" ? "BA" : "BM",
                                    tableId: t.tableId,
                                    country: g.country,
                                    currency: g.currency,
                                    day,
                                  })
                                }
                              >
                                {cell?.manual[m.key] === "NA"
                                  ? "N.A."
                                  : (cell?.manual[m.key]?.toLocaleString(
                                      "es-PE",
                                    ) ?? "—")}
                              </button>
                            ) : (
                              <EffectivenessCell
                                allowNA
                                label={`${m.label} total ${t.name} ${g.country} ${g.currency} ${day}`}
                                value={
                                  cell?.manual?.[m.key as ManualMetric] ===
                                  undefined
                                    ? ""
                                    : cell.manual[m.key as ManualMetric] ===
                                        "NA"
                                      ? "N.A."
                                      : String(
                                          cell.manual[m.key as ManualMetric],
                                        )
                                }
                                onError={setMessage}
                                onSave={(text) =>
                                  save(
                                    t,
                                    g,
                                    day,
                                    cell,
                                    m.key as ManualMetric,
                                    text,
                                  )
                                }
                              />
                            )}
                          </td>
                        );
                      }),
                    ];
                  })}
                </SheetSizedRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
