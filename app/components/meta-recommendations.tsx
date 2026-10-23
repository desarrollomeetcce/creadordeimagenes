"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Item } from "./meta-ads";
import type {
  Analysis,
  Decision,
  Rules,
} from "../../lib/meta-ads/recommendations/engine";
import {
  approvalPlan,
  applyApprovedPlan,
} from "../../lib/meta-ads/recommendations/approval";
import { MetaStatusSwitch } from "./meta-status-switch";

type Result = {
  fresh: boolean;
  coverage: boolean;
  analysis: Analysis;
  items: Item[];
  computedAt: string;
  expiresAt: string;
  accountId: string;
  accountName: string;
  sourceUpdatedAt: string | null;
  timezone: string;
  rules: Rules | null;
};
type Campaign = {
  id: string;
  name: string;
  accountId: string;
  account: { name: string; currency: string };
};
const money = (n: number | null, currency: string) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(n);
const time = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("es-PE", { timeZone: "America/Lima" })
    : "Sin confirmar";
async function request(path: string, signal?: AbortSignal, body?: unknown) {
  const r = await fetch(`/api/meta-ads/${path}`, {
    cache: "no-store",
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(data.error ?? `No se pudo completar (HTTP ${r.status}).`);
  return data;
}
const labels: Record<string, string> = {
  dayNoResultSpend: "Diurna: gasto sin conversaciones",
  dayMaxCost: "Diurna: costo máximo por conversación",
  favorableCost: "Costo favorable",
  contextCost: "Costo para revisar tendencia",
  reviewCost: "Costo de revisión prioritaria",
  newHours: "Nuevo: horas desde creación",
  unspentAmount: "Sin gasto: importe acumulado inferior a",
  minSpend: "Nocturna: gasto mínimo de evidencia",
  minResults: "Nocturna: conversaciones mínimas",
  deteriorationPercent: "Deterioro mínimo (%)",
  windowDays: "Días por ventana no solapada",
  recentDays: "Historial reciente (días)",
  idealPerAdset: "Ideal de anuncios viables por conjunto",
  minimumPerCampaign: "Mínimo de anuncios viables por campaña",
  cacheMinutes: "Vigencia máxima del análisis (minutos)",
};
function RuleSettings({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<{
      defaults: Rules;
      currencies: { currency: string; rules: Rules | null }[];
    } | null>(null),
    [currency, setCurrency] = useState(""),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    request("recommendations/rules", c.signal)
      .then((v) => {
        setData(v);
        setCurrency(v.currencies[0]?.currency ?? "PEN");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setMessage(e.message);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!data) return;
    const saved = data.currencies.find((c) => c.currency === currency)?.rules;
    const v = saved ?? data.defaults;
    setDraft(
      Object.fromEntries(
        Object.keys(labels).map((k) => [
          k,
          !saved &&
          [
            "dayNoResultSpend",
            "dayMaxCost",
            "favorableCost",
            "contextCost",
            "reviewCost",
            "unspentAmount",
            "minSpend",
          ].includes(k)
            ? ""
            : String(v[k as keyof Rules]),
        ]),
      ),
    );
  }, [currency, data]);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const body = {
            currency,
            ...Object.fromEntries(
              Object.entries(draft).map(([k, v]) => [k, Number(v)]),
            ),
          };
          const response = await fetch("/api/meta-ads/recommendations/rules", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const v = await response.json();
          if (!response.ok) throw Error(v.error ?? "Revisa los parámetros.");
          setMessage(
            "Reglas guardadas. Los próximos análisis usarán estos parámetros.",
          );
          setData((old) =>
            old
              ? {
                  ...old,
                  currencies: old.currencies.map((c) =>
                    c.currency === currency
                      ? { ...c, rules: body as Rules }
                      : c,
                  ),
                }
              : old,
          );
          onSaved();
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Importes en la moneda elegida. No se convierten soles a otras monedas.
        Ajusta la evidencia mínima antes de usar las recomendaciones.
      </p>
      <label>
        Moneda
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {data?.currencies.map((c) => (
            <option key={c.currency}>{c.currency}</option>
          ))}
        </select>
      </label>
      <div className="meta-rule-grid">
        {Object.entries(labels).map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              required
              type="number"
              min="0.01"
              step={
                k.includes("Cost") ||
                k.includes("Spend") ||
                k === "unspentAmount"
                  ? ".01"
                  : "1"
              }
              value={draft[k] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <button disabled={busy || !data} type="submit">
        {busy ? "Guardando…" : "Guardar reglas"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
function Evidence({
  decision: d,
  currency,
}: {
  decision: Decision;
  currency: string;
}) {
  return (
    <div className="meta-recommendation-reason">
      <strong>{d.action}</strong> <span className="badge">{d.behavior}</span>
      <small>
        {d.proposedStatus === "ACTIVE"
          ? d.badge === "NUEVO"
            ? "Primera prioridad de prueba"
            : d.badge === "SIN GASTO"
              ? "Segunda prioridad de prueba"
              : "Tercera prioridad: historial reciente"
          : d.action === "MANTENER"
            ? "Prioridad: conservar eficacia actual"
            : d.action === "EVALUAR PAUSA"
              ? "Revisión prioritaria de pausa"
              : "Revisión adicional"}
      </small>
      <p>{d.reason}</p>
      {d.proposedStatus === "ACTIVE" && d.dependencies.length > 0 && (
        <p>
          Requiere aprobar también la activación de:{" "}
          {d.dependencies.map((p) => p.name).join(" · ")}. Esos cambios se
          incluirán en la confirmación.
        </p>
      )}
      <small>
        {d.dataComplete ? (
          <>
            Hoy: {d.today.results} conversaciones ·{" "}
            {money(d.today.spend, currency)} de gasto ·{" "}
            {money(d.today.cost, currency)} por conversación.
          </>
        ) : (
          "Datos parciales o antiguos: no interpretar ausencias como cero."
        )}
      </small>
      <details>
        <summary>Evidencia y proyección de mañana</summary>
        <div className="meta-table">
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Gasto</th>
                <th>Conversaciones</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {["today", "yesterday", "3", "7", "14", "30", "lifetime"].map(
                (key) => (
                  <tr key={key}>
                    <td>
                      {key === "today"
                        ? "Hoy"
                        : key === "yesterday"
                          ? "Ayer"
                          : key === "lifetime"
                            ? "Acumulado disponible"
                            : `${key} días`}
                    </td>
                    <td>
                      {(!d.dataComplete && d.periods[key].days === 0) ||
                      (key === "lifetime" && !d.lifetimeKnown)
                        ? "Sin cobertura confirmada"
                        : money(d.periods[key].spend, currency)}
                    </td>
                    <td>
                      {(!d.dataComplete && d.periods[key].days === 0) ||
                      (key === "lifetime" && !d.lifetimeKnown)
                        ? "—"
                        : d.periods[key].results}
                    </td>
                    <td>
                      {(!d.dataComplete && d.periods[key].days === 0) ||
                      (key === "lifetime" && !d.lifetimeKnown)
                        ? "—"
                        : money(d.periods[key].cost, currency)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {d.changePercent !== null && (
          <p>
            Cambio entre ventanas completas iguales, sin solapamiento:{" "}
            {d.changePercent.toFixed(1)}%.
          </p>
        )}
        {d.forecast ? (
          <p>
            Proyección orientativa: {money(d.forecast.cost, currency)} por
            conversación. Banda descriptiva {money(d.forecast.low, currency)}–
            {money(d.forecast.high, currency)} con {d.forecast.observations}{" "}
            días de evidencia. {d.forecast.method}
          </p>
        ) : (
          <p>
            Proyección no disponible: faltan al menos cuatro días recientes con
            volumen y gasto suficientes. No se asigna una probabilidad de éxito.
          </p>
        )}
      </details>
    </div>
  );
}
function CampaignPanel({
  title,
  status,
  initialOpen,
  children,
}: {
  title: string;
  status: string;
  initialOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      className="panel meta-recommendation-campaign"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <h3>
          {title} <span className="badge">{status}</span>
        </h3>
      </summary>
      {open && children}
    </details>
  );
}
function RecommendationGroup({
  group: s,
  index,
  result: r,
  expandAll,
  owner,
  busy,
  onChange,
  renderEntries,
}: {
  group: Analysis["adsets"][number];
  index: number;
  result: Result;
  expandAll: boolean;
  owner: boolean;
  busy: boolean;
  onChange: () => void;
  renderEntries: (ads: Decision[]) => ReactNode;
}) {
  const [open, setOpen] = useState(
    expandAll ||
      (index === 0 &&
        s.ads.some(
          (d) => !["NO RECOMENDADO", "REVISAR DATOS"].includes(d.action),
        )),
  );
  const [page, setPage] = useState(1);
  const visible = expandAll
    ? s.ads
    : s.ads.filter((d) => d.action !== "NO RECOMENDADO");
  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / 25)));
  return (
    <details
      className="meta-recommendation-group"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {s.name} · {s.viable} viables de {s.ads.length} anuncios ·{" "}
        {s.status === "ACTIVE"
          ? "Activado"
          : s.status === "PAUSED"
            ? "Desactivado"
            : "Estado por confirmar"}
      </summary>
      {open && (
        <>
          <p>
            <strong>{s.recommendation}</strong>
          </p>
          <p>
            Prioridad de ubicación {index + 1}:{" "}
            {s.placementRank === 1
              ? "eficacia actual comprobada"
              : s.placementRank === 2
                ? "historial previo favorable o deterioro observado; revisar contexto"
                : s.placementRank === 3
                  ? "evidencia insuficiente, posible prueba controlada"
                  : "revisar historial y elegibilidad"}
            . Objetivo orientativo: {r.rules?.idealPerAdset ?? 2} viables, sin
            máximo obligatorio.
          </p>
          {owner && (
            <MetaStatusSwitch
              name={s.name}
              status={s.status ?? "UNKNOWN"}
              delivery={s.effectiveStatus ?? "UNKNOWN"}
              disabled={busy || !r.fresh || !r.coverage}
              onToggle={onChange}
            />
          )}
          {renderEntries(visible.slice((current - 1) * 25, current * 25))}
          <div className="row">
            <button
              type="button"
              disabled={busy || current <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anuncios anteriores
            </button>
            <span>
              {visible.length} anuncios · página {current} de{" "}
              {Math.max(1, Math.ceil(visible.length / 25))}
            </span>
            <button
              type="button"
              disabled={busy || current * 25 >= visible.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguientes anuncios
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Minimizar conjunto
            </button>
          </div>
        </>
      )}
    </details>
  );
}
export function MetaRecommendations({
  mode,
  accountIds,
  campaignIds,
  owner,
  view,
  revision,
  renderCard,
  selectedIds,
  selectObject,
  onDetail,
  onUpdated,
}: {
  mode: "night" | "day";
  accountIds: string[];
  campaignIds: string[];
  owner: boolean;
  view: string;
  revision: number;
  renderCard: (o: Item) => ReactNode;
  selectedIds: Set<string>;
  selectObject: (o: Item, checked: boolean) => void;
  onDetail: (o: Item) => void;
  onUpdated: () => void;
}) {
  const [page, setPage] = useState(1),
    [allStates, setAllStates] = useState(false),
    [filter, setFilter] = useState("all"),
    [expandAll, setExpandAll] = useState(false),
    [rulesOpen, setRulesOpen] = useState(false),
    [refresh, setRefresh] = useState(0),
    [rows, setRows] = useState<Campaign[]>([]),
    [total, setTotal] = useState(0),
    [results, setResults] = useState<Record<string, Result>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [operationResults, setOperationResults] = useState<string[]>([]);
  const key = accountIds.join(","),
    campaignKey = campaignIds.join(",");
  useEffect(() => setPage(1), [key, campaignKey, allStates, mode]);
  useEffect(() => {
    const c = new AbortController();
    setRows([]);
    setResults({});
    setErrors({});
    setLoading(true);
    void (async () => {
      try {
        const p = new URLSearchParams({
          accounts: key,
          campaigns: campaignKey,
          page: String(page),
          allStates: allStates ? "1" : "0",
        });
        const list = await request(`recommendations?${p}`, c.signal);
        if (c.signal.aborted) return;
        setRows(list.items);
        setTotal(list.total);
        // One campaign at a time: render each result without blocking on the rest of the account.
        for (const row of list.items as Campaign[]) {
          if (c.signal.aborted) return;
          try {
            const result = await request(
              `recommendations/${row.id}?mode=${mode}&refresh=${refresh > 0 ? "1" : "0"}`,
              c.signal,
            );
            if (!c.signal.aborted)
              setResults((old) => ({ ...old, [row.id]: result }));
          } catch (e) {
            if (!c.signal.aborted)
              setErrors((old) => ({ ...old, [row.id]: (e as Error).message }));
          }
        }
      } catch (e) {
        if (!c.signal.aborted) setErrors({ list: (e as Error).message });
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [key, campaignKey, page, allStates, mode, revision, refresh]);
  const changeOne = async (id: string, name: string, status: string) => {
    if (
      !owner ||
      busy ||
      !window.confirm(
        `${status === "ACTIVE" ? "Pausar" : "Activar"} «${name}» en Meta? Activar puede reanudar el gasto. Cambiar un conjunto o campaña también puede modificar la entrega de sus anuncios.`,
      )
    )
      return;
    setBusy(true);
    try {
      await request(`objects/${id}/status`, undefined, {
        status: status === "ACTIVE" ? "PAUSED" : "ACTIVE",
        expectedStatus: status,
        confirmed: true,
      });
      setOperationResults([`${name}: estado actualizado.`]);
      onUpdated();
    } catch (e) {
      setOperationResults([
        `${name}: ${(e as Error).message}. No se reintentó automáticamente.`,
      ]);
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    const actions = Object.values(results).flatMap((r) =>
      [...r.analysis.adsets.flatMap((s) => s.ads), ...r.analysis.orphanAds]
        .filter((d) => d.proposedStatus && selectedIds.has(d.id))
        .map((d) => ({ d, r, item: r.items.find((i) => i.id === d.id)! })),
    );
    if (!actions.length) {
      setOperationResults([
        "Selecciona anuncios con una acción propuesta para revisar su aprobación.",
      ]);
      return;
    }
    if (actions.some(({ r }) => Date.parse(r.expiresAt) <= Date.now())) {
      setOperationResults([
        "El análisis ha caducado. Actualiza las recomendaciones antes de aprobar.",
      ]);
      return;
    }
    const plan = approvalPlan(
      actions.map(({ d, item }) => ({ decision: d, item })),
    );
    const message = plan
      .map((c) => `${c.status === "ACTIVE" ? "ACTIVAR" : "PAUSAR"}: ${c.name}`)
      .join("\n");
    if (
      !window.confirm(
        `Revisar y aprobar ${plan.length} cambios reales en Meta:\n${message}\nIncluye los padres pausados que deban activarse. Activar un padre puede reanudar otros anuncios ya activados dentro de él y generar gasto. Se aplicarán uno a uno, sin reintentos automáticos. Ante un fallo se detendrá el lote.`,
      )
    )
      return;
    setBusy(true);
    setOperationResults([]);
    await applyApprovedPlan(
      plan,
      (c) =>
        request(`objects/${c.id}/status`, undefined, {
          status: c.status,
          expectedStatus: c.expectedStatus,
          confirmed: true,
        }),
      (message) => setOperationResults((old) => [...old, message]),
    );
    setBusy(false);
    onUpdated();
  };
  const show = (r: Result) =>
    filter === "all" ||
    (filter === "action" && r.analysis.status !== "MANTENER") ||
    (filter === "keep" && r.analysis.status === "MANTENER") ||
    (filter === "new" && r.analysis.counts.new > 0) ||
    (filter === "pause" &&
      r.analysis.adsets.some((s) =>
        s.ads.some((d) => d.action === "EVALUAR PAUSA"),
      )) ||
    (filter === "none" && r.analysis.counts.candidates === 0);
  const entries = (r: Result, ds: Decision[]) => {
    const visible = expandAll
      ? ds
      : ds.filter((d) => d.action !== "NO RECOMENDADO");
    return (
      <>
        <p className="hint">
          {visible.length} de {ds.length} anuncios · orden por prioridad de
          decisión, no por costo.
        </p>
        {view === "table" ? (
          <div className="meta-table">
            <table>
              <thead>
                <tr>
                  <th>Elegir</th>
                  <th>Activado</th>
                  <th>Anuncio / Alias</th>
                  <th>Estado</th>
                  <th>Hoy</th>
                  <th>7 días</th>
                  <th>30 días</th>
                  <th>Recomendación y motivo</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => {
                  const o = r.items.find((i) => i.id === d.id);
                  return o ? (
                    <tr
                      key={d.id}
                      className={
                        selectedIds.has(d.id) ? "meta-object-selected" : ""
                      }
                      aria-selected={selectedIds.has(d.id)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${o.name}`}
                          checked={selectedIds.has(d.id)}
                          onChange={(e) => selectObject(o, e.target.checked)}
                        />
                      </td>
                      <td>
                        <MetaStatusSwitch
                          name={o.name}
                          status={o.status}
                          delivery={o.effectiveStatus}
                          disabled={!owner || busy}
                          onToggle={() =>
                            void changeOne(o.id, o.name, o.status)
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            selectObject(o, true);
                            onDetail(o);
                          }}
                        >
                          {o.name}
                        </button>
                        <small>{o.alias?.name ?? "Sin alias"}</small>
                        {d.badge && <span className="badge">{d.badge}</span>}
                      </td>
                      <td>
                        {o.effectiveStatus === "ACTIVE"
                          ? "Activo"
                          : o.effectiveStatus === "PAUSED"
                            ? "Desactivado"
                            : o.effectiveStatus}
                      </td>
                      {["today", "7", "30"].map((k) => (
                        <td key={k}>
                          {o.periods[k].state === "UNAVAILABLE" ? (
                            "Pendiente"
                          ) : (
                            <>
                              {money(d.periods[k].cost, o.currency)}
                              <small>
                                {d.periods[k].results} conversaciones
                              </small>
                            </>
                          )}
                        </td>
                      ))}
                      <td>
                        <Evidence decision={d} currency={r.analysis.currency} />
                      </td>
                    </tr>
                  ) : null;
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <fieldset
            disabled={busy}
            className="meta-cards meta-recommendation-fields"
          >
            {visible.map((d) => {
              const o = r.items.find((i) => i.id === d.id);
              return o ? (
                <div className="meta-recommendation-card" key={d.id}>
                  {d.badge && <span className="badge">{d.badge}</span>}
                  {renderCard(o)}
                  <Evidence decision={d} currency={r.analysis.currency} />
                </div>
              ) : null;
            })}
          </fieldset>
        )}
      </>
    );
  };
  return (
    <section
      className="meta-recommendations stack"
      aria-label={`Recomendaciones ${mode === "day" ? "diurnas" : "nocturnas"}`}
    >
      <header className="panel">
        <h2>
          Recomendaciones{" "}
          {mode === "day"
            ? "diurnas · revisión 8:00 a. m. Perú"
            : "nocturnas · preparar el siguiente día"}
        </h2>
        <p>
          Reglas y análisis estadístico, sin IA generativa. Cada campaña se
          evalúa de forma independiente con todos sus conjuntos y anuncios
          activos y desactivados guardados. Ninguna recomendación cambia estados
          automáticamente.
        </p>
        {mode === "day" && (
          <p>
            Se evalúa el día de hoy de cada cuenta; 8:00 a. m. es la hora de
            revisión manual en Perú, no una ejecución programada.
          </p>
        )}
        <div className="row">
          <label>
            Campañas
            <select
              value={allStates ? "all" : "active"}
              onChange={(e) => setAllStates(e.target.value === "all")}
              disabled={!!campaignIds.length || busy}
            >
              <option value="active">Todas las campañas activas</option>
              <option value="all">Activas y desactivadas</option>
            </select>
          </label>
          <label>
            Mostrar
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todas</option>
              <option value="action">Requieren acción</option>
              <option value="keep">Mantener</option>
              <option value="new">Probar nuevos</option>
              <option value="pause">Revisar pausas</option>
              <option value="none">Sin candidatos</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={expandAll}
              onChange={(e) => setExpandAll(e.target.checked)}
            />
            Mostrar todos los anuncios y grupos
          </label>
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => setRefresh((n) => n + 1)}
          >
            Actualizar recomendaciones
          </button>
          {owner && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void approve()}
            >
              Revisar y aprobar seleccionados
            </button>
          )}
        </div>
        <small>
          La vista normal conserva sus filtros. El análisis usa conversaciones y
          el día local de la cuenta; solo usa la selección de cuentas y campañas
          de la vista normal para revisar toda la campaña. Actualizar
          recomendaciones lee datos locales; «Actualizar desde Meta» solicita
          datos nuevos. La aprobación por lote solo incluye anuncios analizados
          en esta página.
        </small>
        {owner && (
          <details onToggle={(e) => setRulesOpen(e.currentTarget.open)}>
            <summary>Configurar reglas por moneda</summary>
            {rulesOpen && (
              <RuleSettings onSaved={() => setRefresh((n) => n + 1)} />
            )}
          </details>
        )}
      </header>
      <p role="status">
        {loading
          ? `Analizando campañas por etapas: ${Object.keys(results).length} de ${rows.length} en esta página…`
          : `${total} campañas · ${Object.keys(results).length} análisis en esta página.`}
      </p>
      {Object.entries(errors).map(([id, error]) => (
        <p className="notice" role="alert" key={id}>
          {id === "list" ? "Selección" : rows.find((r) => r.id === id)?.name}:{" "}
          {error}
        </p>
      ))}
      {operationResults.length > 0 && (
        <div role="status" className="notice">
          {operationResults.map((v, i) => (
            <p key={i}>{v}</p>
          ))}
        </div>
      )}
      {rows.map((row, index) => {
        const r = results[row.id];
        if (!r)
          return (
            <section className="panel" key={row.id}>
              <h3>{row.name}</h3>
              <p>
                {errors[row.id]
                  ? "Análisis no disponible."
                  : "Pendiente de análisis…"}
              </p>
            </section>
          );
        if (!show(r)) return null;
        return (
          <CampaignPanel
            key={`${row.id}:${expandAll}`}
            title={row.name}
            status={r.analysis.status}
            initialOpen={expandAll || index === 0}
          >
            <p>
              {r.accountName} · {r.analysis.currency} · {r.timezone}
            </p>
            <small>
              Datos sincronizados: {time(r.sourceUpdatedAt)} · Análisis:{" "}
              {time(r.computedAt)} · Válido hasta: {time(r.expiresAt)} (Perú)
            </small>
            <p>
              {r.analysis.counts.active} activos · {r.analysis.counts.viable}{" "}
              viables · {r.analysis.counts.new} nuevos ·{" "}
              {r.analysis.counts.unspent} sin gasto ·{" "}
              {r.analysis.counts.deteriorated} deteriorados ·{" "}
              {r.analysis.counts.total} anuncios revisados
            </p>
            <p>
              <strong>{r.analysis.summary}</strong>
            </p>
            {r.analysis.task && (
              <p className="notice">Tarea pendiente: {r.analysis.task}</p>
            )}
            <p className="hint">{r.analysis.warning}</p>
            {r.analysis.adsets.map((s, index) => (
              <RecommendationGroup
                key={`${s.id}:${expandAll}`}
                group={s}
                index={index}
                result={r}
                expandAll={expandAll}
                owner={owner}
                busy={busy}
                onChange={() =>
                  void changeOne(s.id, s.name, s.status ?? "UNKNOWN")
                }
                renderEntries={(ds) => entries(r, ds)}
              />
            ))}
            {r.analysis.orphanAds.length > 0 && (
              <details>
                <summary>
                  Anuncios sin conjunto confirmado · revisar datos
                </summary>
                {entries(r, r.analysis.orphanAds)}
              </details>
            )}
          </CampaignPanel>
        );
      })}
      <div className="row">
        <button
          type="button"
          disabled={page <= 1 || busy || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          Página {page} de {Math.max(1, Math.ceil(total / 10))}
        </span>
        <button
          type="button"
          disabled={page * 10 >= total || busy || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
