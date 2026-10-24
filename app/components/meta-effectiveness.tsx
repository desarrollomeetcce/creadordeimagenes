"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import {
  parseEffectivenessPaste,
  resolveCountry,
} from "../../lib/meta-ads/effectiveness-paste";
import { MetaDateRange } from "./meta-date-range";
import { currencyCodes, isCurrency } from "../../lib/meta-ads/currency-codes";
import {
  sheetMetrics,
  summarizePeriod,
  matchesMetricRange,
  compareSheetNumbers,
  type SheetMetric,
  type PeriodMode,
  type MetricRange,
} from "../../lib/meta-ads/period-summary";
import { SheetNumberFilter } from "./sheet-number-filter";
import { EffectivenessCell } from "./effectiveness-cell";
type Cell = {
  spend: number | null;
  base: number | null;
  sales: number | null;
  fixedCost: number | null;
  campaigns: number;
  updatedAt: string | null;
  revision: number;
  sourceSpend: { currency: string; amount: number }[];
  sourceFixedCost: { currency: string; amount: number }[];
  fxMissing: boolean;
  fx: {
    from: string;
    to: string;
    rate: number;
    date: string;
    source: string;
    url: string;
  }[];
};
type Row = {
  aliasId: string;
  country: string;
  currency: string;
  rowRevision: number;
  days: Record<string, Cell>;
  campaigns: number;
  timezones: string[];
};
type Settings = {
  aliasColumnName: string;
  defaultCountry: string;
  defaultCurrency: string;
};
type SheetSort =
  | {
      kind: "text";
      field: "alias" | "country" | "currency";
      direction: "asc" | "desc";
    }
  | { kind: "period"; metric: SheetMetric; direction: "asc" | "desc" }
  | {
      kind: "day";
      metric: SheetMetric;
      day: string;
      direction: "asc" | "desc";
    };
type Data = { rows: Row[]; table: Settings; missingFxDays: string[] };
export function MetaEffectiveness({
  tableId,
  aliases,
  onNamesChanged,
  settings,
}: {
  tableId: string;
  settings: Settings;
  aliases: { id: string; name: string }[];
  onNamesChanged: () => Promise<void>;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [since, setSince] = useState(
      today.slice(0, 8) + (Number(today.slice(8)) >= 20 ? "20" : "01"),
    ),
    [until, setUntil] = useState(today),
    [country, setCountry] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [paste, setPaste] = useState<string | null>(null),
    [pasteCountry, setPasteCountry] = useState(settings.defaultCountry),
    [pasteCurrency, setPasteCurrency] = useState(settings.defaultCurrency),
    [csv, setCsv] = useState(false);
  const [newName, setNewName] = useState(""),
    [newCountry, setNewCountry] = useState(settings.defaultCountry),
    [newCurrency, setNewCurrency] = useState(settings.defaultCurrency);
  const [summaryMode, setSummaryMode] = useState<PeriodMode>("total"),
    [metricRanges, setMetricRanges] = useState<
      Partial<Record<SheetMetric, MetricRange>>
    >({}),
    [sheetSort, setSheetSort] = useState<SheetSort>({
      kind: "text",
      field: "alias",
      direction: "asc",
    });
  const currentRange = useRef(""),
    queryVersion = useRef(0),
    attemptedFx = useRef(new Set<string>());
  const valid =
    !!since &&
    !!until &&
    since <= until &&
    (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  const query = `meta-ads/effectiveness?${new URLSearchParams({ tableId, since, until })}`;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    if (currentRange.current !== query) {
      setData(null);
      currentRange.current = query;
    }
    const load = () => {
      if (document.hidden) return;
      const version = ++queryVersion.current;
      void api(query)
        .then((v: Data) => {
          if (active && queryVersion.current === version) setData(v);
          const days = v.missingFxDays.filter(
            (d) => !attemptedFx.current.has(d),
          );
          if (days.length) {
            days.forEach((d) => attemptedFx.current.add(d));
            void api("meta-ads/effectiveness/fx", "POST", { days })
              .then(() => {
                if (active) load();
              })
              .catch((e) => {
                if (active) setMessage(e.message);
              });
          }
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [query, valid]);
  const refresh = async () => {
    const version = ++queryVersion.current;
    const v: Data = await api(query);
    if (queryVersion.current === version && currentRange.current === query)
      setData(v);
    const days = v.missingFxDays.filter((d) => !attemptedFx.current.has(d));
    if (days.length) {
      days.forEach((d) => attemptedFx.current.add(d));
      void api("meta-ads/effectiveness/fx", "POST", { days })
        .then(async () => {
          if (currentRange.current !== query) return;
          const seq = ++queryVersion.current;
          const next: Data = await api(query);
          if (queryVersion.current === seq) setData(next);
        })
        .catch((e) => setMessage(e.message));
    }
  };
  const mutate = async (
    path: string,
    method: string,
    body: unknown,
    names = false,
  ) => {
    await api(path, method, body);
    try {
      if (names) await onNamesChanged();
      await refresh();
      setMessage("");
    } catch {
      throw Error(
        "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
      );
    }
  };
  const columns = async (
    change: Partial<{
      aliasColumnName: string;
      country: string;
      currency: string;
    }>,
  ) => {
    await mutate(
      "meta-ads/effectiveness/columns",
      "PATCH",
      { tableId, ...change },
      true,
    );
    if (change.country !== undefined) {
      setNewCountry(change.country);
      setPasteCountry(change.country);
    }
    if (change.currency !== undefined) {
      setNewCurrency(change.currency);
      setPasteCurrency(change.currency);
    }
  };
  const identity = async (
    r: Row,
    field: "country" | "currency",
    value: string,
  ) => {
    const code = field === "country" ? resolveCountry(value) : r.country;
    if (code === null)
      throw Error("País no reconocido. Escribe PE, Perú o elige una opción.");
    const currency = field === "currency" ? value.toUpperCase() : r.currency;
    if (!isCurrency(currency))
      throw Error(
        "Moneda no válida: usa PEN, USD, ARS u otro código de 3 letras.",
      );
    await mutate("meta-ads/effectiveness/identity", "PATCH", {
      aliasId: r.aliasId,
      fromCountry: r.country,
      fromCurrency: r.currency,
      country: code,
      currency,
      revision: r.rowRevision,
    });
  };
  const manualQueues = useRef(new Map<string, Promise<void>>());
  const manualVersions = useRef(new Map<string, number>());
  const manual = (
    r: Row,
    day: string,
    field: "sales" | "fixedCost",
    value: string,
  ) => {
    const c = r.days[day],
      key = JSON.stringify([
        r.aliasId,
        r.country,
        r.currency,
        r.rowRevision,
        day,
      ]);
    const previous = manualQueues.current.get(key) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        const revision = Math.max(
          c?.revision ?? 0,
          manualVersions.current.get(key) ?? 0,
        );
        await api("meta-ads/effectiveness", "PATCH", {
          aliasId: r.aliasId,
          country: r.country,
          currency: r.currency,
          day,
          [field]: value === "" ? null : Number(value),
          revision,
          rowRevision: r.rowRevision,
        });
        manualVersions.current.set(key, revision + 1);
        try {
          await refresh();
          setMessage("");
        } catch {
          throw Error(
            "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
          );
        }
      });
    manualQueues.current.set(key, job);
    return job.finally(() => {
      if (manualQueues.current.get(key) === job)
        manualQueues.current.delete(key);
    });
  };
  const importRows = async () => {
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(pasteCountry);
      if (code === null)
        throw Error("Selecciona un país válido o déjalo vacío.");
      const rows = parseEffectivenessPaste(
        paste ?? "",
        code,
        pasteCurrency,
        csv,
      );
      const result = await api("meta-ads/effectiveness/import", "POST", {
        tableId,
        rows,
      });
      await onNamesChanged();
      await refresh();
      setPaste(null);
      setMessage(
        `${result.rows} filas listas; ${result.created} alias nuevos.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  };
  const openPaste = (text: string) => {
    if (!/[\n\t]/.test(text)) return false;
    setCsv(false);
    setPaste(text);
    return true;
  };
  const addRow = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(newCountry);
      if (code === null) throw Error("País no reconocido.");
      const rows = parseEffectivenessPaste(newName, code, newCurrency);
      await mutate(
        "meta-ads/effectiveness/import",
        "POST",
        { tableId, rows },
        true,
      );
      setNewName("");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo agregar la fila.",
      );
    } finally {
      setBusy(false);
    }
  };
  const days = useMemo(() => {
    const result: string[] = [];
    if (valid)
      for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
        result.push(new Date(d).toISOString().slice(0, 10));
    return result;
  }, [since, until, valid]);
  const names = useMemo(
    () => new Map(aliases.map((a) => [a.id, a.name])),
    [aliases],
  );
  const summaries = useMemo(
    () =>
      new Map(
        (data?.rows ?? []).map((r) => [
          JSON.stringify([r.aliasId, r.country]),
          Object.fromEntries(
            sheetMetrics.map((m) => [
              m.key,
              summarizePeriod(r.days, days, m.key, r.campaigns),
            ]),
          ) as Record<SheetMetric, ReturnType<typeof summarizePeriod>>,
        ]),
      ),
    [data, days],
  );
  const summary = (r: Row, m: SheetMetric) =>
    summaries.get(JSON.stringify([r.aliasId, r.country]))![m];
  const activeSort: SheetSort =
    sheetSort.kind === "day" && (sheetSort.day < since || sheetSort.day > until)
      ? { kind: "text", field: "alias", direction: "asc" }
      : sheetSort;
  const baseRows = (data?.rows ?? []).filter((r) =>
    country === "__none" ? !r.country : !country || r.country === country,
  );
  const rows = baseRows
    .filter((r) =>
      sheetMetrics.every((m) =>
        matchesMetricRange(summary(r, m.key)[summaryMode], metricRanges[m.key]),
      ),
    )
    .sort((a, b) => {
      let result = 0;
      if (activeSort.kind === "text") {
        const av =
            activeSort.field === "alias"
              ? (names.get(a.aliasId) ?? "")
              : a[activeSort.field],
          bv =
            activeSort.field === "alias"
              ? (names.get(b.aliasId) ?? "")
              : b[activeSort.field];
        result = av.localeCompare(bv, "es", { numeric: true });
        if (activeSort.direction === "desc") result = -result;
      } else {
        const metric = activeSort.metric,
          av =
            activeSort.kind === "day"
              ? (a.days[activeSort.day]?.[metric] ?? null)
              : summary(a, metric)[summaryMode],
          bv =
            activeSort.kind === "day"
              ? (b.days[activeSort.day]?.[metric] ?? null)
              : summary(b, metric)[summaryMode],
          money = metric === "spend" || metric === "fixedCost";
        result = compareSheetNumbers(
          av,
          bv,
          activeSort.direction,
          money ? a.currency : "",
          money ? b.currency : "",
        );
      }
      return (
        result ||
        (names.get(a.aliasId) ?? "").localeCompare(
          names.get(b.aliasId) ?? "",
          "es",
        ) ||
        a.country.localeCompare(b.country)
      );
    });
  const sortId = (v: SheetSort) =>
    v.kind === "text"
      ? v.field
      : v.kind === "period"
        ? "period-" + v.metric
        : v.day + "-" + v.metric;
  const order = (v: SheetSort) =>
    setSheetSort({
      ...v,
      direction:
        sortId(v) === sortId(activeSort) && activeSort.direction === "asc"
          ? "desc"
          : "asc",
    });
  const arrow = (v: SheetSort) =>
    sortId(v) === sortId(activeSort)
      ? activeSort.direction === "asc"
        ? " ↑"
        : " ↓"
      : " ↕";
  const activeFilters = Object.values(metricRanges).some(
    (r) => r?.min !== undefined || r?.max !== undefined,
  );
  const number = (
    v: number | null,
    money: boolean,
    currency: string,
    average = false,
  ) =>
    v === null
      ? "—"
      : v.toLocaleString("es-PE", {
          minimumFractionDigits: money
            ? new Intl.NumberFormat("en", {
                style: "currency",
                currency: currency || "USD",
              }).resolvedOptions().minimumFractionDigits
            : average
              ? 2
              : 0,
          maximumFractionDigits: money
            ? new Intl.NumberFormat("en", {
                style: "currency",
                currency: currency || "USD",
              }).resolvedOptions().maximumFractionDigits
            : average
              ? 2
              : 6,
        });
  return (
    <section
      className="effectiveness sheet-view"
      aria-label="Efectividad diaria"
    >
      <datalist id="effectiveness-countries">
        {countryOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </datalist>
      <datalist id="effectiveness-currencies">
        {currencyCodes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="row sheet-toolbar">
        <span className="sheet-legend">
          <b>V</b> Ventas · <b>B</b> Conversaciones · <b>G</b> Gasto · <b>CF</b>{" "}
          Costos fijos
        </span>
        <MetaDateRange
          from={since}
          to={until}
          onChange={(a, b) => {
            if (!a || !b || (Date.parse(b) - Date.parse(a)) / 86400000 >= 31) {
              setMessage("Elige un rango de hasta 31 días.");
              return;
            }
            setSince(a);
            setUntil(b);
          }}
        />
        <label>
          Filtrar país
          <select
            aria-label="País de efectividad"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="__none">Sin país</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setCsv(false);
            setPaste("");
          }}
        >
          Pegar alias
        </button>
        <label className="sheet-file">
          Subir archivo
          <input
            type="file"
            aria-label="Subir lista de alias"
            accept=".txt,.tsv,.csv,text/plain,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 100000) {
                setMessage("El archivo admite hasta 100 KB.");
                return;
              }
              try {
                setCsv(f.name.toLowerCase().endsWith(".csv"));
                setPaste(await f.text());
              } catch {
                setMessage("No se pudo leer el archivo.");
              }
            }}
          />
        </label>
      </div>
      <div className="sheet-help">
        Edita y pulsa Enter o Tab para guardar; Escape descarta. V y CF
        manuales; B y G por coincidencia exacta de alias + país. G y CF se
        muestran en la moneda elegida con la tasa de cada fecha.{" "}
        {data?.missingFxDays.length ? (
          <span> Tasas pendientes: {data.missingFxDays.join(", ")}. </span>
        ) : null}
        <details>
          <summary>Cómo se calcula</summary> Totales y promedios usan el período
          elegido. Promedio diario = suma / días con datos; registra 0 cuando
          realmente no hubo ventas/costos. * Indica días o campañas faltantes.
          Los filtros numéricos se aplican al resumen visible; al cambiar de
          total a promedio se limpian. Los importes de monedas distintas se
          ordenan en grupos separados. Solo campañas, incluidas apagadas; nunca
          suma sus conjuntos/anuncios. Se consulta lo importado cada 30 s; hoy
          puede ser parcial y cada cuenta conserva su zona horaria. — sin dato,
          * cobertura parcial. Cambiar país consulta B/G de ese país sin cambiar
          las etiquetas de Meta Ads. Cambiar moneda convierte importes sin
          alterar los originales. Un alias puede tener una fila por país. La
          tasa diaria de referencia proviene de Currency API; no es una
          cotización bancaria de compra/venta.
        </details>
      </div>
      {message && (
        <p className="sheet-message" role="status">
          {message}
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </p>
      )}
      {!valid && <p role="alert">Elige un rango válido de hasta 31 días.</p>}
      {paste !== null && (
        <form
          className="sheet-import"
          onSubmit={(e) => {
            e.preventDefault();
            void importRows();
          }}
        >
          <label>
            Pega una columna de nombres o tres columnas: Alias, País y Moneda
            (sin encabezados).
            <textarea
              aria-label="Lista de alias"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={
                "Monitoreo ambiental\tPE\tPEN\nDermatología\tAR\tUSD"
              }
              required
              rows={6}
            />
          </label>
          <div className="row">
            <label>
              País si la columna no está
              <input
                list="effectiveness-countries"
                aria-label="País para la lista"
                value={pasteCountry}
                onChange={(e) => setPasteCountry(e.target.value)}
                placeholder="Sin asignar"
              />
            </label>
            <label>
              Moneda si la columna no está
              <input
                value={pasteCurrency}
                onChange={(e) => setPasteCurrency(e.target.value)}
                pattern="[A-Za-z]{3}"
                maxLength={3}
              />
            </label>
            <span>
              Hasta 500 filas. Nombres existentes se reutilizan; no se
              sobrescriben cifras.
            </span>
            <button className="primary" disabled={busy}>
              Importar filas
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPaste(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {valid && (
        <div className="table-scroll effectiveness-scroll sheet-scroll">
          <table className="effectiveness-grid">
            <caption className="sr-only">
              Efectividad diaria desde {since} hasta {until}
            </caption>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  scope="col"
                  className="effectiveness-name"
                  aria-sort={
                    activeSort.kind === "text" && activeSort.field === "alias"
                      ? activeSort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <div className="sheet-alias-heading">
                    <EffectivenessCell
                      label="Nombre de columna A"
                      value={settings.aliasColumnName}
                      onError={setMessage}
                      onSave={(v) => columns({ aliasColumnName: v })}
                    />
                    <button
                      type="button"
                      className="sheet-sort-button"
                      aria-label="Ordenar alias"
                      title="Ordenar alfabéticamente ascendente o descendente"
                      onClick={() =>
                        order({
                          kind: "text",
                          field: "alias",
                          direction: "asc",
                        })
                      }
                    >
                      {arrow({
                        kind: "text",
                        field: "alias",
                        direction: "asc",
                      })}
                    </button>
                  </div>
                </th>
                <th rowSpan={2} scope="col" className="effectiveness-country">
                  <button
                    type="button"
                    className="sheet-sort-button"
                    aria-label="Ordenar por país"
                    onClick={() =>
                      order({
                        kind: "text",
                        field: "country",
                        direction: "asc",
                      })
                    }
                  >
                    País
                    {arrow({
                      kind: "text",
                      field: "country",
                      direction: "asc",
                    })}
                  </button>
                  <select
                    className="sheet-column-control"
                    aria-label="País para todas las filas"
                    title="Aplicar a todas las filas; luego puedes editar cada una"
                    value={settings.defaultCountry}
                    onChange={(e) => {
                      if (e.target.value)
                        void columns({
                          country:
                            e.target.value === "__empty" ? "" : e.target.value,
                        }).catch((e) => setMessage(e.message));
                    }}
                  >
                    <option value="">Para todas…</option>
                    <option value="__empty">Vacío en todas</option>
                    {countryOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </th>
                <th rowSpan={2} scope="col" className="effectiveness-currency">
                  <button
                    type="button"
                    className="sheet-sort-button"
                    aria-label="Ordenar por moneda"
                    onClick={() =>
                      order({
                        kind: "text",
                        field: "currency",
                        direction: "asc",
                      })
                    }
                  >
                    Moneda
                    {arrow({
                      kind: "text",
                      field: "currency",
                      direction: "asc",
                    })}
                  </button>
                  <select
                    className="sheet-column-control"
                    aria-label="Moneda para todas las filas"
                    title="Moneda de visualización; convierte los importes con tasa de cada día"
                    value={settings.defaultCurrency}
                    onChange={(e) => {
                      if (e.target.value)
                        void columns({
                          currency:
                            e.target.value === "__empty" ? "" : e.target.value,
                        }).catch((e) => setMessage(e.message));
                    }}
                  >
                    <option value="">Para todas…</option>
                    <option value="__empty">Vacío en todas</option>
                    {currencyCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </th>
                <th
                  colSpan={4}
                  scope="colgroup"
                  className="sheet-period-heading"
                >
                  <select
                    aria-label="Resumen del período"
                    value={summaryMode}
                    onChange={(e) => {
                      setSummaryMode(e.target.value as PeriodMode);
                      setMetricRanges({});
                    }}
                  >
                    <option value="total">Total del período</option>
                    <option value="average">Promedio diario</option>
                  </select>
                  <small title="Filas que cumplen los filtros">
                    {rows.length}/{baseRows.length}
                  </small>
                  {activeFilters && (
                    <button
                      type="button"
                      aria-label="Borrar filtros de métricas"
                      onClick={() => setMetricRanges({})}
                    >
                      ×
                    </button>
                  )}
                </th>
                {days.map((d) => (
                  <th key={d} colSpan={4} scope="colgroup">
                    {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr>
                {sheetMetrics.map((m) => (
                  <th
                    key={"period-" + m.key}
                    aria-sort={
                      activeSort.kind === "period" &&
                      activeSort.metric === m.key
                        ? activeSort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    scope="col"
                    className="sheet-period-heading"
                  >
                    <span className="sheet-metric-heading">
                      <button
                        type="button"
                        className="sheet-sort-button"
                        aria-label={`Ordenar ${summaryMode === "total" ? "total" : "promedio"} ${m.name}`}
                        title={
                          m.money
                            ? "Ordena dentro de cada moneda. Elige una misma moneda para comparar todas las filas."
                            : `Ordenar ${m.name} del período`
                        }
                        onClick={() =>
                          order({
                            kind: "period",
                            metric: m.key,
                            direction: "asc",
                          })
                        }
                      >
                        {m.label}
                        {arrow({
                          kind: "period",
                          metric: m.key,
                          direction: "asc",
                        })}
                      </button>
                      <SheetNumberFilter
                        label={`${summaryMode === "total" ? "total" : "promedio"} ${m.name}`}
                        money={m.money}
                        value={metricRanges[m.key]}
                        onApply={(v) =>
                          setMetricRanges((old) => ({ ...old, [m.key]: v }))
                        }
                      />
                    </span>
                  </th>
                ))}
                {days.flatMap((d) =>
                  sheetMetrics.map((m) => (
                    <th
                      key={d + m.key}
                      scope="col"
                      aria-sort={
                        activeSort.kind === "day" &&
                        activeSort.day === d &&
                        activeSort.metric === m.key
                          ? activeSort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className="sheet-sort-button"
                        aria-label={`Ordenar ${m.name} ${d}`}
                        title={
                          m.money
                            ? "Ordena dentro de cada moneda; desconocidos al final"
                            : `Ordenar ${m.name} de ${d}`
                        }
                        onClick={() =>
                          order({
                            kind: "day",
                            day: d,
                            metric: m.key,
                            direction: "asc",
                          })
                        }
                      >
                        {m.label}
                        {arrow({
                          kind: "day",
                          day: d,
                          metric: m.key,
                          direction: "asc",
                        })}
                      </button>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = names.get(r.aliasId) ?? "Alias";
                return (
                  <tr
                    key={JSON.stringify([r.aliasId, r.country])}
                    data-alias-id={r.aliasId}
                    data-country={r.country}
                    data-currency={r.currency}
                  >
                    <td className="effectiveness-name">
                      <EffectivenessCell
                        label={`Alias ${name} ${r.country || "sin país"}`}
                        value={name}
                        onError={setMessage}
                        onPaste={openPaste}
                        onSave={async (v) => {
                          if (!v || v.length > 150)
                            throw Error(
                              "El nombre debe tener entre 1 y 150 caracteres.",
                            );
                          await mutate(
                            "meta-ads/aliases/" + r.aliasId,
                            "PATCH",
                            { name: v },
                            true,
                          );
                        }}
                      />
                    </td>
                    <td className="effectiveness-country">
                      <EffectivenessCell
                        label={`País de ${name} ${r.country || "sin país"}`}
                        value={r.country}
                        list="effectiveness-countries"
                        onError={setMessage}
                        onSave={(v) => identity(r, "country", v)}
                      />
                    </td>
                    <td className="effectiveness-currency">
                      <EffectivenessCell
                        label={`Moneda de ${name} ${r.country}`}
                        value={r.currency}
                        list="effectiveness-currencies"
                        onError={setMessage}
                        onSave={(v) => identity(r, "currency", v)}
                      />
                    </td>
                    {sheetMetrics.map((m) => {
                      const sum = summary(r, m.key),
                        value = sum[summaryMode];
                      return (
                        <td
                          key={"summary-" + m.key}
                          className="sheet-period-cell"
                          data-summary={m.key}
                          title={`${summaryMode === "total" ? "Suma conocida" : "Promedio = suma / días con dato"}: ${sum.knownDays}/${sum.periodDays} días con datos. Total ${sum.total ?? "—"}; promedio ${sum.total ?? "—"}/${sum.knownDays || "—"} = ${sum.average ?? "—"}. ${sum.conversionPending ? "Conversión pendiente; no se muestra un subtotal incompleto." : ""} ${sum.partial ? "* Cobertura parcial." : ""} ${m.money ? r.currency : ""}`}
                        >
                          {sum.conversionPending && r.currency
                            ? "Sin tasa"
                            : number(
                                value,
                                m.money,
                                r.currency,
                                summaryMode === "average",
                              )}
                          {value !== null && sum.partial ? " *" : ""}
                        </td>
                      );
                    })}
                    {days.flatMap((d) => {
                      const c = r.days[d],
                        partial = c && c.campaigns < r.campaigns;
                      return [
                        <td key={d + "V"}>
                          <EffectivenessCell
                            label={`V ${name} ${r.country} ${d}`}
                            value={
                              c?.sales === null || c?.sales === undefined
                                ? ""
                                : String(c.sales)
                            }
                            type="number"
                            step="1"
                            onError={setMessage}
                            onSave={(v) => manual(r, d, "sales", v)}
                          />
                        </td>,
                        <td
                          key={d + "B"}
                          className="sheet-derived"
                          title={
                            partial
                              ? `${c.campaigns}/${r.campaigns} campañas importadas`
                              : "Conversaciones iniciadas de campañas"
                          }
                        >
                          {c?.base ?? "—"}
                          {partial ? " *" : ""}
                        </td>,
                        <td
                          key={d + "G"}
                          className="sheet-derived"
                          title={
                            c?.updatedAt
                              ? `Original: ${c.sourceSpend.map((x) => x.currency + " " + x.amount).join(" + ")}. ${c.fx.map((f) => `1 ${f.from} = ${f.rate} ${f.to} · ${f.date} · ${f.source}`).join("; ")}. Datos recibidos: ${new Date(c.updatedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} · ${r.timezones.join(", ")}`
                              : "Sin datos importados"
                          }
                        >
                          {c?.spend === null || c?.spend === undefined
                            ? c?.fxMissing
                              ? "Sin tasa"
                              : !r.currency
                                ? "—"
                                : "—"
                            : c.spend.toLocaleString("es-PE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                          {partial ? " *" : ""}
                        </td>,
                        <td key={d + "CF"}>
                          <EffectivenessCell
                            label={`CF ${name} ${r.country} ${d}`}
                            value={
                              c?.fixedCost === null ||
                              c?.fixedCost === undefined
                                ? ""
                                : c.fixedCost.toFixed(
                                    new Intl.NumberFormat("en", {
                                      style: "currency",
                                      currency: r.currency || "USD",
                                    }).resolvedOptions().maximumFractionDigits,
                                  )
                            }
                            type="number"
                            hint={
                              c?.sourceFixedCost.length
                                ? `Original CF: ${c.sourceFixedCost.map((x) => x.currency + " " + x.amount).join(" + ")}. ${c.fx.map((f) => `${f.date}: 1 ${f.from} = ${f.rate} ${f.to} (${f.source})`).join("; ")}`
                                : undefined
                            }
                            locked={
                              !r.currency ||
                              (!!c?.sourceFixedCost.length &&
                                c.fixedCost === null)
                            }
                            step="0.000001"
                            onError={setMessage}
                            onSave={(v) => manual(r, d, "fixedCost", v)}
                          />
                        </td>,
                      ];
                    })}
                  </tr>
                );
              })}
              <tr className="sheet-new-row">
                <td className="effectiveness-name">
                  <input
                    aria-label="Nuevo alias"
                    placeholder="+ Escribe o pega alias…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onPaste={(e) => {
                      if (openPaste(e.clipboardData.getData("text")))
                        e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addRow();
                      }
                    }}
                  />
                </td>
                <td className="effectiveness-country">
                  <input
                    aria-label="País del nuevo alias"
                    list="effectiveness-countries"
                    value={newCountry}
                    placeholder="PE / Perú"
                    onChange={(e) => setNewCountry(e.target.value)}
                  />
                </td>
                <td className="effectiveness-currency">
                  <input
                    aria-label="Moneda del nuevo alias"
                    value={newCurrency}
                    maxLength={3}
                    onChange={(e) => setNewCurrency(e.target.value)}
                  />
                </td>
                <td colSpan={4} className="sheet-period-cell" />
                <td colSpan={days.length * 4}>
                  <button
                    disabled={busy || !newName.trim()}
                    onClick={() => void addRow()}
                  >
                    Agregar fila
                  </button>
                  {!data && <span role="status"> Cargando datos…</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
