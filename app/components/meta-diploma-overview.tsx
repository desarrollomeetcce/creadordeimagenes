"use client";
import { useMemo, useState } from "react";
import type { Item } from "./meta-ads";
import {
  groupSelectionDiplomas,
  summarizeDiplomaPeriod,
} from "../../lib/meta-ads/selection-diplomas";
import { campaignEvaluationWindow } from "../../lib/meta-ads/campaign-evaluation-window";
import {
  formatMetaMoney,
  localMetaDay,
} from "../../lib/meta-ads/display-format";
import { matchesSearchWords } from "../../lib/search";
import { MetaCampaignAssessment } from "./meta-campaign-assessment";
import { MetaDailyDetail } from "./meta-daily-detail";
import { InventorySheetReplacement } from "./inventory-sheet-replacement";
const names = {
  all: "Todos los diplomados",
  selling: "Con ventas",
  low: "Pocas ventas",
  zero: "Cero confirmado",
  unknown: "Sin ventas registradas",
};
export function MetaDiplomaOverview({
  items,
  period,
  since,
  until,
  onChanged,
}: {
  items: Item[];
  period: string;
  since: string;
  until: string;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [activity, setActivity] = useState("all"),
    [threshold, setThreshold] = useState(2),
    [ascending, setAscending] = useState(false),
    [metric, setMetric] = useState("sales"),
    [focus, setFocus] = useState("");
  const [replacement, setReplacement] = useState<{
    listId: string;
    tableId: string;
    country: string;
    name: string;
    names?:string[];
  } | null>(null);
  const groups = useMemo(
    () =>
      groupSelectionDiplomas(items).map((g) => ({
        ...g,
        selected: summarizeDiplomaPeriod(
          g.items.map((o) => ({ o, p: o.periods[period] })),
        ),
        recent: summarizeDiplomaPeriod(
          g.items.map((o) => ({
            o,
            p:
              campaignEvaluationWindow(
                o.periods,
                period,
                localMetaDay(o.timezone),
              ).period ?? undefined,
          })),
        ),
      })),
    [items, period],
  );
  const [checkedDiplomas,setCheckedDiplomas]=useState<string[]>([]);
  const checked=groups.filter(g=>checkedDiplomas.includes(g.key));
  const checkedObjects=checked.flatMap(g=>{const item=g.items.find(o=>o.alias?.tableId&&o.alias.inventorySheetId&&o.aliasCountry);return item?[item]:[]});
  const checkedScopes=new Set(checkedObjects.map(o=>JSON.stringify([o.alias!.inventorySheetId,o.alias!.tableId,o.aliasCountry])));
  const checkedReady=checked.length>0&&checkedObjects.length===checked.length&&checkedScopes.size===1;
  const currencies = [...new Set(groups.map((g) => g.currency))];
  const status = (v: number | null) =>
    v === null
      ? "unknown"
      : v === 0
        ? "zero"
        : v <= threshold
          ? "low"
          : "selling";
  const shown = groups
    .filter(
      (g) =>
        matchesSearchWords(g.name + " " + g.country, query) &&
        (filter === "all" || status(g.selected.sales) === filter) &&
        (activity === "all" ||
          (g.items.some((o) => o.status === "ACTIVE")
            ? activity === "active"
            : activity === "inactive")),
    )
    .sort((a, b) => {
      const x = a.selected.sales,
        y = b.selected.sales;
      if (x === null || y === null) {
        if (x === y) return a.name.localeCompare(b.name, "es");
        if (ascending)
          return x === null ? (y === 0 ? 1 : -1) : x === 0 ? -1 : 1;
        return x === null ? 1 : -1;
      }
      return (ascending ? x - y : y - x) || a.name.localeCompare(b.name, "es");
    });
  const chartGroups = metric.startsWith("spend:")
    ? shown.filter((g) => g.currency === metric.slice(6))
    : shown;
  const chartRows = chartGroups.map((g) => ({
    key: g.key,
    name: g.name + (g.country ? " · " + g.country : ""),
    value: metric === "sales" ? g.selected.sales : g.selected.spend,
    text:
      metric === "sales"
        ? g.selected.sales === null
          ? "—"
          : g.selected.sales + (g.selected.partial ? "*" : "")
        : g.selected.spend === null
          ? "—"
          : formatMetaMoney(g.selected.spend, g.currency) +
            (g.selected.metaPartial ? "*" : ""),
  }));
  const max = Math.max(1, ...chartRows.map((r) => r.value ?? 0)),
    width = Math.max(500, chartRows.length * 100 + 70),
    step = (width - 60) / Math.max(1, chartRows.length);
  const focused = groups.find((g) => g.items.some((o) => o.id === focus));
  const original = items.find((o) => o.id === focus);
  const salesUnique = new Map<string, number | null>();
  let salesPartial = false;
  for (const g of groups) {
    const key = JSON.stringify([g.items[0].aliasId ?? g.key, g.country]);
    const prior = salesUnique.get(key);
    if (salesUnique.has(key) && prior !== g.selected.sales) {
      salesUnique.set(key, null);
      salesPartial = true;
    } else if (!salesUnique.has(key)) salesUnique.set(key, g.selected.sales);
    salesPartial ||= g.selected.partial;
  }
  const known = [...salesUnique.values()].filter(
      (v): v is number => v !== null,
    ),
    total = known.length ? known.reduce((n, v) => n + v, 0) : null;
  return (
    <section
      className="meta-diploma-overview"
      aria-label="Análisis de los diplomados seleccionados"
    >
      <div className="meta-diploma-counters">
        <span>
          Diplomados · país<strong>{salesUnique.size}</strong>
        </span>
        <span>
          Ventas registradas
          <strong>
            {total === null
              ? "—"
              : total +
                (salesPartial || known.length < salesUnique.size ? "*" : "")}
          </strong>
        </span>
        {currencies.map((c) => {
          const data = groups.filter((g) => g.currency === c),
            known = data.filter((g) => g.selected.spend !== null);
          return (
            <span key={c}>
              Gasto Meta · {c}
              <strong>
                {known.length
                  ? formatMetaMoney(
                      known.reduce((n, g) => n + g.selected.spend!, 0),
                      c,
                    ) +
                    (known.length < data.length ||
                    known.some((g) => g.selected.metaPartial)
                      ? "*"
                      : "")
                  : "—"}
              </strong>
            </span>
          );
        })}
      </div>
      <header>
        <h3>Qué diplomados venden y cuáles necesitan revisión</h3>
        <p>
          Ventas de las hojas y gasto/resultados recibidos de Meta, para el
          período seleccionado. Las ventas se cuentan una vez por diplomado y
          país.
        </p>
      </header>
      <div className="row sheet-sales-detail-controls meta-diploma-filters">
        <input
          type="search"
          aria-label="Buscar diplomado en el detalle de Meta"
          placeholder="Buscar diplomado…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Clasificación de ventas de Meta"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {Object.entries(names).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado de campañas de los diplomados"
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
        >
          <option value="all">Todos · activos y pausados</option>
          <option value="active">Con campañas activas</option>
          <option value="inactive">Campañas pausadas / inactivas</option>
        </select>
        <label>
          Pocas ventas: hasta{" "}
          <input
            type="number"
            min={0}
            max={1000000}
            aria-label="Límite de pocas ventas en Meta"
            value={threshold}
            onChange={(e) =>
              setThreshold(
                Math.max(0, Math.min(1000000, Number(e.target.value))),
              )
            }
          />
        </label>
        <button
          type="button"
          aria-pressed={ascending}
          onClick={() => setAscending((v) => !v)}
        >
          {ascending ? "Menor a mayor venta" : "Mayor a menor venta"}
        </button>
        <select
          aria-label="Variable del gráfico por diplomado"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          <option value="sales">Ventas registradas</option>
          {currencies.map((c) => (
            <option key={c} value={"spend:" + c}>
              Gasto Meta · {c}
            </option>
          ))}
        </select>
      </div>
      <div
        className="inventory-sales-chart-scroll sheet-sales-comparison"
        tabIndex={0}
        aria-label="Comparativo vertical de diplomados en Meta"
      >
        <svg
          width={width}
          height={270}
          viewBox={`0 0 ${width} 270`}
          role="img"
          aria-label={
            metric === "sales"
              ? "Ventas por diplomado en el período"
              : "Gasto Meta por diplomado en el período"
          }
        >
          <line
            x1={35}
            y1={185}
            x2={width - 8}
            y2={185}
            className="inventory-sales-chart-grid"
          />
          <text x={5} y={15}>
            {metric === "sales"
              ? "Ventas registradas"
              : "Gasto Meta · " + metric.slice(6)}
          </text>
          <text x={29} y={189} textAnchor="end">
            0
          </text>
          {chartRows.map((r, i) => {
            const x = 45 + i * step + step / 2,
              h = r.value === null ? 0 : (r.value / max) * 140;
            return (
              <g
                key={r.key}
                role="button"
                tabIndex={0}
                aria-label={r.name + ": " + r.text + "; ver evolución"}
                onClick={() =>
                  setFocus(groups.find((g) => g.key === r.key)!.items[0].id)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFocus(groups.find((g) => g.key === r.key)!.items[0].id);
                  }
                }}
              >
                <title>{r.name + ": " + r.text}</title>
                <rect
                  x={x - 19}
                  y={185 - h}
                  width={38}
                  height={Math.max(2, h)}
                  rx={2}
                  fill={
                    r.value === null
                      ? "var(--muted)"
                      : r.value === 0
                        ? "#ac7040"
                        : "var(--accent)"
                  }
                />
                <text x={x} y={179 - h} textAnchor="middle">
                  {r.text}
                </text>
                <text x={x - 12} y={205} transform={`rotate(27 ${x - 12} 205)`}>
                  {r.name.length > 24 ? r.name.slice(0, 22) + "…" : r.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="hint">
        {shown.length} diplomados visibles · * Datos parciales; — sin registro.
        El gasto parcial se muestra sin presentarlo como informe completo. Si
        solo seleccionaste parte de las campañas vinculadas, su gasto no se
        divide entre todas las ventas del diplomado.
      </p>
      <div className="row"><button type="button" disabled={!checkedReady} title="Selecciona diplomados de una misma hoja y país" onClick={()=>{const first=checkedObjects[0];if(first?.alias)setReplacement({listId:first.alias.inventorySheetId!,tableId:first.alias.tableId!,country:first.aliasCountry!,name:first.alias.name,names:[...new Set(checkedObjects.map(o=>o.alias!.name))]});}}>Reemplazar {checked.length||"seleccionados"}{checked.length?" diplomados":""}</button><button type="button" disabled={!checkedDiplomas.length} onClick={()=>setCheckedDiplomas([])}>Quitar selección</button></div>
      {replacement && (
        <InventorySheetReplacement
          source="meta"
          {...replacement}
          sheetName={replacement.name}
          since={since}
          until={until}
          onClose={() => setReplacement(null)}
          onChanged={async () => onChanged()}
        />
      )}
      <div className="table-scroll">
        <table className="meta-diploma-table">
          <thead>
            <tr>
              <th>Elegir</th>
              <th>Diplomado</th>
              <th>País</th>
              <th>Ventas</th>
              <th>Resultados Meta</th>
              <th>Gasto Meta</th>
              <th>CAC del período</th>
              <th>Efectividad V/B</th>
              <th>Evaluación reciente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const s = g.selected,
                r = g.recent,
                o = g.items[0],
                eligible = g.items.find(
                  (o) =>
                    o.alias?.tableId &&
                    o.alias.inventorySheetId &&
                    o.aliasCountry,
                );
              return (
                <tr key={g.key} data-diploma-key={g.key}>
                  <td><input type="checkbox" aria-label={`Elegir para reemplazar ${g.name} ${g.country}`} checked={checkedDiplomas.includes(g.key)} onChange={e=>setCheckedDiplomas(current=>e.target.checked?[...current,g.key]:current.filter(id=>id!==g.key))}/></td>
                  <th>
                    {g.name}
                    <small>
                      {g.items.length} campaña(s) ·{" "}
                      {[...new Set(g.items.map((o) => o.accountName))].join(
                        " · ",
                      )}
                    </small>
                  </th>
                  <td>{g.country || "Sin país"}</td>
                  <td>
                    {s.sales === null ? "—" : s.sales + (s.partial ? "*" : "")}
                  </td>
                  <td>
                    {s.results === null
                      ? "—"
                      : s.results + (s.metaPartial ? "*" : "")}
                    <small>
                      {s.results !== null
                        ? g.items[0].metricName
                        : "Objetivos distintos o informe no disponible"}
                    </small>
                  </td>
                  <td>
                    {s.spend === null
                      ? "—"
                      : formatMetaMoney(s.spend, g.currency) +
                        (s.metaPartial ? "*" : "")}
                  </td>
                  <td>
                    {s.cac === null
                      ? "—"
                      : formatMetaMoney(s.cac, g.currency) +
                        (s.provisional ? "*" : "")}
                  </td>
                  <td>
                    {s.effectiveness === null
                      ? "—"
                      : s.effectiveness.toFixed(2) +
                        "%" +
                        (s.provisional ? "*" : "")}
                  </td>
                  <td>
                    <MetaCampaignAssessment
                      value={r}
                      compact
                      today={localMetaDay(o.timezone)}
                    />
                    <small>
                      {r.since && r.until
                        ? r.since + " — " + r.until
                        : "Sin período reciente"}
                    </small>
                  </td>
                  <td>
                    <div className="sheet-diploma-actions">
                      <button type="button" onClick={() => setFocus(o.id)}>
                        Ver evolución
                      </button>
                      <button
                        type="button"
                        className="inventory-top-replace-trigger"
                        disabled={!eligible}
                        title={
                          eligible
                            ? "Preparar reemplazo del diplomado en su hoja y país"
                            : "Vincula el diplomado a una hoja y país para reemplazarlo"
                        }
                        onClick={() => {
                          if (eligible)
                            setReplacement({
                              listId: eligible.alias!.inventorySheetId!,
                              tableId: eligible.alias!.tableId!,
                              country: eligible.aliasCountry!,
                              name: eligible.alias!.name,
                            });
                        }}
                      >
                        ↔ Reemplazar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {original && focused && (
        <section
          className="meta-diploma-evolution"
          aria-label="Evolución diaria del diplomado"
        >
          <header className="row spread">
            <h3>{focused.name} · evolución diaria</h3>
            <button
              type="button"
              className="ui-close-button"
              onClick={() => setFocus("")}
            >
              Cerrar evolución
            </button>
          </header>
          <label>
            Campaña del diplomado
            <select
              aria-label="Campaña para la evolución del diplomado"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            >
              {focused.items.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <MetaDailyDetail
            key={JSON.stringify([focus, period, since, until])}
            item={original}
            initialPeriod={period}
            initialSince={since}
            initialUntil={until}
          />
        </section>
      )}

    </section>
  );
}
