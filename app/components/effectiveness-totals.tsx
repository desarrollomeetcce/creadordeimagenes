"use client";
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
type ManualMetric = "baseManual" | "totalSpend" | "fixedCost";
type Day = {
  sums: Record<SheetMetric, TotalValue>;
  manual: Partial<Record<ManualMetric, number | "NA">>;
  revision: number;
};
type TotalSheet = {
  tableId: string;
  name: string;
  missingFxDays: string[];
  groups: { country: string; currency: string; days: Record<string, Day> }[];
};
const manualColumns = [
  { key: "sales", label: "V", name: "Ventas", sum: true },
  { key: "budget", label: "P", name: "Presupuesto", sum: true },
  { key: "baseManual", label: "BM", name: "Base manual", sum: false },
  { key: "totalSpend", label: "GD", name: "Gasto diario", sum: false },
  { key: "fixedCost", label: "CF", name: "Costos fijos", sum: false },
] as const;
const autoColumns = [
  { key: "sales", label: "V", name: "Ventas", sum: true },
  { key: "base", label: "B", name: "Base", sum: true },
  { key: "spend", label: "G", name: "Gasto", sum: true },
  { key: "fixedCost", label: "CF", name: "Costos fijos", sum: true },
] as const;
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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [since, setSince] = useWorkbookPreference<string>(
      listId,
      "since",
      today.slice(0, 8) + (Number(today.slice(8)) >= 20 ? "20" : "01"),
    ),
    [until, setUntil] = useWorkbookPreference<string>(listId, "until", today);
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
  const seq = useRef(0),
    queues = useRef(new Map<string, Promise<void>>()),
    versions = useRef(new Map<string, number>());
  const ids = (
    selected === null
      ? tables.map((t) => t.id)
      : selected.filter((id) => tables.some((t) => t.id === id))
  ).join(",");
  const context = JSON.stringify([ids, since, until]);
  const activeContext = useRef(context);
  activeContext.current = context;
  useEffect(() => {
    let active = true;
    const load = async () => {
      const version = ++seq.current;
      setLoading(true);
      try {
        const list = ids ? ids.split(",") : [],
          next: TotalSheet[] = [];
        for (let i = 0; i < list.length; i += 4)
          next.push(
            ...(await Promise.all(
              list.slice(i, i + 4).map((tableId) =>
                api(
                  "meta-ads/effectiveness/totals?" +
                    new URLSearchParams({
                      sheetId: listId,
                      tableId,
                      since,
                      until,
                    }),
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
        if (active && version === seq.current) setLoading(false);
      }
    };
    setData([]);
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ids, since, until, reload]);
  const days = useMemo(() => {
    const result: string[] = [];
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      result.push(new Date(d).toISOString().slice(0, 10));
    return result;
  }, [since, until]);
  const groups = useMemo(() => {
    const map = new Map<string, { country: string; currency: string }>();
    for (const t of data)
      for (const g of t.groups)
        map.set(JSON.stringify([g.country, g.currency]), {
          country: g.country,
          currency: g.currency,
        });
    // Explicit country/currency can start a new manual daily total, including an empty table.
    if (country && currency)
      map.set(JSON.stringify([country === "__none" ? "" : country, currency]), {
        country: country === "__none" ? "" : country,
        currency,
      });
    return [...map.values()]
      .filter(
        (g) =>
          (!country || g.country === (country === "__none" ? "" : country)) &&
          (!currency || g.currency === currency),
      )
      .sort(
        (a, b) =>
          a.country.localeCompare(b.country) ||
          a.currency.localeCompare(b.currency),
      );
  }, [data, country, currency]);
  const columns = mode === "manual" ? manualColumns : autoColumns;
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
    >
      <div className="row sheet-toolbar">
        <div className="row sheet-view-buttons" aria-label="Vista de totales">
          <button
            aria-pressed={mode === "manual"}
            className={
              "sheet-mode-manual" + (mode === "manual" ? " primary" : "")
            }
            onClick={() => setMode("manual")}
          >
            Total manual
          </button>
          <button
            aria-pressed={mode === "automatic"}
            className={
              "sheet-mode-automatic" + (mode === "automatic" ? " primary" : "")
            }
            onClick={() => setMode("automatic")}
          >
            Total automático
          </button>
        </div>
        <MetaDateRange
          from={since}
          to={until}
          onChange={(a, b) => {
            if (
              !a ||
              !b ||
              a > b ||
              (Date.parse(b) - Date.parse(a)) / 86400000 >= 31
            ) {
              setMessage("Elige hasta 31 días.");
              return;
            }
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
        {selected !== null && tables.some((t) => !selected.includes(t.id)) && (
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
        <button disabled={loading} onClick={() => setReload((v) => v + 1)}>
          Actualizar totales
        </button>
      </div>
      <p className="sheet-help">
        {mode === "manual"
          ? "V/P: suma de inventario. BM, GD y CF: valores manuales de esta hoja, por tabla, país, moneda y fecha."
          : "V/B/G/CF: suma de los valores de la vista automática."}{" "}
        Países y monedas separados; N.A. no suma, — sin dato, * suma parcial.
        Las ventas se suman únicamente desde la hoja de origen indicada en cada
        bloque, sin combinar tablas. No modifica Meta Ads.
      </p>
      {message && (
        <p className="sheet-message" role="alert">
          {message}
        </p>
      )}
      {loading && (
        <p role="status" className="sheet-help">
          Cargando totales…
        </p>
      )}
      {data.some((t) => t.missingFxDays.length > 0) && (
        <p className="sheet-help">
          Hay tasas pendientes. Actualiza las tasas desde la hoja de cada tabla;
          no se muestran subtotales monetarios incompletos.
        </p>
      )}
      {!data.length && !loading && (
        <p className="sheet-help">Selecciona al menos una tabla.</p>
      )}
      {sheetTabs}
      {!!data.length && (
        <div className="table-scroll effectiveness-scroll sheet-scroll">
          <table className="effectiveness-grid sheet-totals-grid">
            <thead>
              <tr>
                <th rowSpan={2}>Fecha</th>
                <th rowSpan={2}>País</th>
                <th rowSpan={2}>Moneda</th>
                {data.map((t) => (
                  <th key={t.tableId} colSpan={columns.length}>
                    {t.name}
                  </th>
                ))}
              </tr>
              <tr>
                {data.flatMap((t) =>
                  columns.map((m) => (
                    <th
                      key={t.tableId + m.key}
                      data-entry={m.sum ? "derived" : "manual"}
                      title={`${m.name} (${m.label})${m.sum ? " · suma" : " · manual"}`}
                    >
                      {m.label}
                      {m.sum ? " Σ" : ""}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {days.flatMap((day) =>
                groups.map((g) => (
                  <tr key={day + JSON.stringify(g)}>
                    <th>
                      {day.slice(8)}.{day.slice(5, 7)}.{day.slice(0, 4)}
                    </th>
                    <td>{g.country || "—"}</td>
                    <td>{g.currency || "—"}</td>
                    {data.flatMap((t) => {
                      const cell = t.groups.find(
                        (x) =>
                          x.country === g.country && x.currency === g.currency,
                      )?.days[day];
                      return columns.map((m) => {
                        const sum = m.sum
                          ? cell?.sums?.[m.key as SheetMetric]
                          : undefined;
                        return (
                          <td
                            key={t.tableId + m.key}
                            className={m.sum ? "sheet-derived" : ""}
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
                      });
                    })}
                  </tr>
                )),
              )}
              {!groups.length && (
                <tr>
                  <td colSpan={3 + data.length * columns.length}>
                    Sin datos. Elige país y moneda para ingresar totales
                    manuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
