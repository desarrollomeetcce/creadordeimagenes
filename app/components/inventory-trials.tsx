"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import { InventoryMultiSelect } from "./inventory-multi-select";
import { useWorkbookPreference } from "./use-workbook-preference";
import { limaToday } from "./date-range";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import { matchesSearchWords } from "../../lib/search";
import {
  diverseTrialItems,
  trialStatusNames,
  type TrialItem,
} from "../../lib/meta-ads/inventory-trial-policy";
import type {
  TrialDirectory,
  TrialGroup,
  TrialReport,
} from "../../lib/meta-ads/inventory-trials";
type Row = TrialReport["rows"][number];
const money = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN",
        maximumFractionDigits: 2,
      }).format(v);
const num = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(v);
const pct = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        style: "percent",
        maximumFractionDigits: 0,
      }).format(v);
const dayMin = () =>
  new Date(Date.parse(limaToday()) - 365 * 86400000).toISOString().slice(0, 10);
function TrialDialog({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="trial-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar diálogo de grupos"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function InventoryTrials({ listId }: { listId: string }) {
  const [directory, setDirectory] = useState<TrialDirectory | null>(null),
    [report, setReport] = useState<TrialReport | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false),
    [replacing, setReplacing] = useState(false),
    [cycleEditing, setCycleEditing] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [until, setUntil] = useState(limaToday);
  const [selectedId, setSelectedId] = useWorkbookPreference<string>(
      listId,
      "trial-group",
      "",
    ),
    [chosenCountry, setChosenCountry] = useWorkbookPreference<string>(
      listId,
      "trial-country",
      "all",
    ),
    [basis, setBasis] = useWorkbookPreference<string>(
      listId,
      "trial-basis",
      "BUDGET",
    );
  const group =
      directory?.groups.find((g) => g.id === selectedId) ??
      directory?.groups[0],
    country = group?.countries.includes(chosenCountry) ? chosenCountry : "all",
    canEdit = directory?.canEdit ?? false;
  async function loadDirectory() {
    const d: TrialDirectory = await api(
      "meta-ads/inventory/trials?" + new URLSearchParams({ listId }),
    );
    setDirectory(d);
    return d;
  }
  useEffect(() => {
    let active = true;
    setDirectory(null);
    setMessage("");
    void api("meta-ads/inventory/trials?" + new URLSearchParams({ listId }))
      .then((d: TrialDirectory) => {
        if (active) setDirectory(d);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [listId]);
  useEffect(() => {
    setSelected([]);
  }, [group?.id]);
  useEffect(() => {
    let active = true,
      inFlight = false;
    setReport(null);
    async function load() {
      if (!group || group.reserve || document.hidden || inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const r: TrialReport = await api(
          "meta-ads/inventory/trials/report?" +
            new URLSearchParams({ listId, groupId: group.id, until }),
        );
        if (active) {
          setReport(r);
          setMessage("");
        }
      } catch (e) {
        if (active) {
          setReport(null);
          setMessage(e instanceof Error ? e.message : "No se pudo actualizar.");
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [listId, group?.id, group?.revision, group?.reserve, until, reload]);
  async function change(data: Record<string, unknown>) {
    if (!group) return;
    setBusy(true);
    setMessage("");
    let saved = false;
    try {
      await api("meta-ads/inventory/trials", "POST", {
        listId,
        groupId: group.id,
        revision: group.revision,
        ...data,
      });
      saved = true;
      await loadDirectory();
      setSelected([]);
      setDetail(null);
      setEditing(false);
      setReplacing(false);
      setCycleEditing(false);
    } catch (e) {
      setMessage(
        saved
          ? "Se guardó. Actualiza para ver los cambios."
          : e instanceof Error
            ? e.message
            : "No se pudo guardar.",
      );
      if (saved) {
        setReload((v) => v + 1);
      } else throw e;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (!detail || !group) return;
    setDetailLoading(true);
    void api(
      "meta-ads/inventory/trials/report?" +
        new URLSearchParams({
          listId,
          groupId: group.id,
          until,
          slotId: detail.slotId,
          country: detail.country,
        }),
    )
      .then((r: TrialReport) => {
        if (active && r.rows[0]) setDetail(r.rows[0]);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listId, group?.id, until, detail?.slotId, detail?.country]);
  const lookup = new Map(
      report?.rows.map((r) => [r.slotId + ":" + r.country, r]) ?? [],
    ),
    countries = country === "all" ? (group?.countries ?? []) : [country],
    visible = (group?.members ?? []).filter((m) =>
      matchesSearchWords(
        [
          m.name,
          ...countries.map((c) => lookup.get(m.slotId + ":" + c)?.name ?? ""),
        ].join(" "),
        query,
      ),
    );
  const currentRows =
      report?.rows.filter((r) => countries.includes(r.country)) ?? [],
    alertCount = currentRows.filter((r) =>
      ["CRITICAL", "ALERT"].includes(
        (basis === "META" ? r.metaEvaluation : r.budgetEvaluation).status,
      ),
    ).length;
  function evaluate(row: Row) {
    return basis === "META" ? row.metaEvaluation : row.budgetEvaluation;
  }
  function status(row: Row) {
    return row.paused ? "Pausado" : trialStatusNames[evaluate(row).status];
  }
  function select(slot: string, checked: boolean) {
    setSelected((v) =>
      checked ? [...new Set([...v, slot])] : v.filter((s) => s !== slot),
    );
  }
  return (
    <div className="inventory-trials">
      <div className="trial-controls">
        <label>
          Grupo
          <SheetSearchSelect
            label="Grupo de evaluación"
            placeholder="Sin grupos"
            value={group?.id ?? ""}
            options={
              directory?.groups.map((g) => ({
                value: g.id,
                label: g.name + (g.reserve ? " · Reserva" : ""),
              })) ?? []
            }
            onSelect={setSelectedId}
          />
        </label>
        <label>
          País
          <SheetSearchSelect
            label="País de evaluación"
            value={country}
            options={[
              { value: "all", label: "Todos los países del grupo" },
              ...(group?.countries ?? []).map((c) => ({
                value: c,
                label: countryName(c),
              })),
            ]}
            onSelect={setChosenCountry}
          />
        </label>
        <label>
          Evaluar con
          <SheetSearchSelect
            label="Fuente de evaluación"
            value={basis}
            options={[
              { value: "BUDGET", label: "Presupuesto asignado" },
              { value: "META", label: "Gasto real de Meta" },
            ]}
            onSelect={setBasis}
          />
        </label>
        <label>
          Hasta
          <input
            aria-label="Fecha de corte de evaluación"
            type="date"
            value={until}
            min={dayMin()}
            max={limaToday()}
            onChange={(e) => {
              if (e.target.value) setUntil(e.target.value);
            }}
          />
        </label>
        <button
          type="button"
          disabled={!group || loading}
          onClick={() => {
            setReload((v) => v + 1);
            void loadDirectory().catch((e) => setMessage(e.message));
          }}
        >
          Actualizar
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              className="primary"
              onClick={() => setCreating(true)}
            >
              + Crear grupo
            </button>
            <button
              type="button"
              disabled={!group}
              onClick={() => setEditing(true)}
            >
              Reglas y grupo
            </button>
          </>
        )}
      </div>
      {message && (
        <p className="notice error" role="alert">
          {message}
        </p>
      )}
      {!directory && !message && <p role="status">Cargando grupos…</p>}
      {directory && !directory.groups.length && (
        <div className="trial-empty">
          <span>▦</span>
          <h3>Prepara tu próxima prueba</h3>
          <p>
            Crea un grupo con diplomados del inventario. Evalúa la misma
            selección en cada país y conserva lo que funciona.
          </p>
          {canEdit && (
            <button className="primary" onClick={() => setCreating(true)}>
              Crear primer grupo
            </button>
          )}
        </div>
      )}
      {group && (
        <>
          <div className="trial-summary">
            <div>
              <span>Diplomados del grupo</span>
              <strong>{group.members.length}</strong>
            </div>
            <div>
              <span>Países</span>
              <strong>{group.countries.length}</strong>
            </div>
            <div>
              <span>
                Alertas {country === "all" ? "del grupo" : countryName(country)}
              </span>
              <strong>{report ? alertCount : "—"}</strong>
            </div>
            <p>
              {group.reserve
                ? "Reserva común: elige estos diplomados al preparar reemplazos."
                : basis === "META"
                  ? "El gasto de Meta se evalúa cuando la cobertura y la sincronización están completas. Datos antiguos o incompletos quedan pendientes."
                  : "Evaluación estimada con presupuesto diario acumulado durante los días activos del seguimiento. No equivale a gasto realizado."}
              <small>
                Regla: sin ventas {money(group.rules.zero)}; con ventas{" "}
                {money(group.rules.perSale)} × ventas. Importes en soles.
              </small>
            </p>
          </div>
          <div className="trial-table-actions">
            <input
              type="search"
              aria-label="Buscar diplomados del grupo"
              placeholder="Buscar diplomado…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span>{selected.length} seleccionados</span>
            {canEdit && !group.reserve && (
              <button
                type="button"
                disabled={
                  country === "all" ||
                  !selected.length ||
                  busy ||
                  until !== limaToday()
                }
                title={
                  country === "all"
                    ? "Elige un país para preparar sus reemplazos"
                    : "Revisar candidatos antes de cambiar el seguimiento"
                }
                onClick={() => setReplacing(true)}
              >
                Preparar reemplazos
              </button>
            )}
            {canEdit && !group.reserve && (
              <button
                type="button"
                disabled={
                  country === "all" ||
                  !visible.length ||
                  busy ||
                  until !== limaToday()
                }
                onClick={() => setCycleEditing(true)}
              >
                Inicio del país
              </button>
            )}
            <small>
              {loading
                ? "Actualizando cifras…"
                : report
                  ? "Actualizado · " +
                    new Date(report.generatedAt).toLocaleTimeString("es-PE", {
                      timeZone: "America/Lima",
                    })
                  : ""}
            </small>
          </div>
          <div
            className="trial-table-scroll"
            tabIndex={0}
            aria-label="Tabla de grupos por país"
          >
            <table className="trial-grid">
              <thead>
                <tr>
                  <th>
                    {canEdit && !group.reserve && (
                      <input
                        type="checkbox"
                        aria-label="Seleccionar diplomados visibles del grupo"
                        checked={
                          !!visible.length &&
                          visible.every((m) => selected.includes(m.slotId))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? visible.map((m) => m.slotId)
                              : [],
                          )
                        }
                      />
                    )}{" "}
                    Diplomado
                  </th>
                  {group.reserve ? (
                    <th>Categoría principal</th>
                  ) : country === "all" ? (
                    countries.map((c) => <th key={c}>{countryName(c)}</th>)
                  ) : (
                    <>
                      <th>Ventas</th>
                      <th>Presupuesto</th>
                      <th>Gasto Meta</th>
                      <th>Días activos</th>
                      <th title="Importe evaluado / límite de alerta">
                        Uso del límite
                      </th>
                      <th>Estado</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => {
                  const item = directory?.catalog.find(
                      (i) => i.id === m.itemId,
                    ),
                    row = lookup.get(m.slotId + ":" + country);
                  return (
                    <tr key={m.slotId} data-trial-slot={m.slotId}>
                      <th>
                        {canEdit && !group.reserve && (
                          <input
                            type="checkbox"
                            aria-label={"Seleccionar " + m.name}
                            checked={selected.includes(m.slotId)}
                            onChange={(e) => select(m.slotId, e.target.checked)}
                          />
                        )}
                        <span>
                          {country !== "all"
                            ? (row?.name ?? item?.name ?? m.name)
                            : (item?.name ?? m.name)}
                        </span>
                        {country !== "all" && row?.name !== m.name && row && (
                          <small>Reemplaza a {m.name}</small>
                        )}
                      </th>
                      {group.reserve ? (
                        <td>
                          {item?.primaryNames.join(", ") ||
                            "Sin categoría principal"}
                        </td>
                      ) : country === "all" ? (
                        countries.map((c) => {
                          const r = lookup.get(m.slotId + ":" + c);
                          return (
                            <td key={c}>
                              {r ? (
                                <button
                                  type="button"
                                  className={
                                    "trial-country-cell trial-" +
                                    (r.paused ? "PAUSED" : evaluate(r).status)
                                  }
                                  aria-label={
                                    "Detalle de " + r.name + " en " + c
                                  }
                                  onClick={() => setDetail(r)}
                                >
                                  <b>{status(r)}</b>
                                  {r.name !== m.name && (
                                    <span className="trial-replacement-name">
                                      Ahora: {r.name}
                                    </span>
                                  )}
                                  <span>
                                    <strong>{num(r.sales)}</strong> ventas ·{" "}
                                    {r.activeDays} días
                                  </span>
                                  <span>
                                    P {money(r.budget)} · G {money(r.spend)}
                                  </span>
                                  <small>
                                    Uso del límite: {pct(evaluate(r).usage)}
                                    {!r.complete.sales ||
                                    !(basis === "META"
                                      ? r.complete.spend
                                      : r.complete.budget)
                                      ? " · parcial"
                                      : ""}
                                  </small>
                                  {r.decision !== "AUTO" && (
                                    <small>
                                      Decisión:{" "}
                                      {r.decision === "KEEP"
                                        ? "conservar"
                                        : "reemplazar"}
                                    </small>
                                  )}
                                </button>
                              ) : (
                                <span className="trial-muted">
                                  {loading
                                    ? "Cargando…"
                                    : "Sin evaluación a esta fecha"}
                                </span>
                              )}
                            </td>
                          );
                        })
                      ) : row ? (
                        <>
                          <td>
                            {num(row.sales)}
                            {!row.complete.sales && row.sales !== null
                              ? " *"
                              : ""}
                          </td>
                          <td>
                            {money(row.budget)}
                            {!row.complete.budget && row.budget !== null
                              ? " *"
                              : ""}
                          </td>
                          <td>
                            {money(row.spend)}
                            {!row.complete.spend && row.spend !== null
                              ? " *"
                              : ""}
                          </td>
                          <td>{row.activeDays}</td>
                          <td>
                            {pct(evaluate(row).usage)}
                            <small>Límite {money(evaluate(row).limit)}</small>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={
                                "trial-status trial-" +
                                (row.paused ? "PAUSED" : evaluate(row).status)
                              }
                              aria-label={
                                "Detalle de " + row.name + " en " + row.country
                              }
                              onClick={() => setDetail(row)}
                            >
                              {status(row)} ↗
                            </button>
                          </td>
                        </>
                      ) : (
                        <td colSpan={6}>
                          {loading
                            ? "Cargando cifras…"
                            : "Sin evaluación a esta fecha"}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr>
                    <td colSpan={country === "all" ? 1 + countries.length : 7}>
                      No hay diplomados que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="trial-footnote">
            * Datos parciales. — Sin dato; no significa cero. Cada país se
            evalúa por separado, desde el inicio de su ciclo y excluyendo las
            pausas registradas. Al 100% del límite se genera alerta; «En rango»
            no confirma rentabilidad.
          </p>
        </>
      )}
      {creating && directory && (
        <TrialCreate
          directory={directory}
          onClose={() => setCreating(false)}
          onSaved={async (id) => {
            setSelectedId(id);
            setCreating(false);
            await loadDirectory();
          }}
        />
      )}
      {editing && group && (
        <TrialSettings
          group={group}
          busy={busy}
          onClose={() => setEditing(false)}
          onChange={change}
        />
      )}
      {detail && group && (
        <TrialDetail
          row={detail}
          loading={detailLoading}
          group={group}
          basis={basis}
          until={until}
          canEdit={canEdit && until === limaToday()}
          busy={busy}
          onClose={() => setDetail(null)}
          onChange={change}
          onReplace={() => {
            setChosenCountry(detail.country);
            setSelected([detail.slotId]);
            setDetail(null);
            setReplacing(true);
          }}
        />
      )}
      {cycleEditing && group && country !== "all" && (
        <TrialStart
          group={group}
          country={country}
          slots={selected.length ? selected : visible.map((m) => m.slotId)}
          busy={busy}
          onClose={() => setCycleEditing(false)}
          onChange={change}
        />
      )}
      {replacing && group && directory && country !== "all" && (
        <TrialReplace
          directory={directory}
          group={group}
          country={country}
          slots={selected}
          busy={busy}
          onClose={() => setReplacing(false)}
          onChange={change}
        />
      )}
    </div>
  );
}
function TrialCreate({
  directory,
  onClose,
  onSaved,
}: {
  directory: TrialDirectory;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("Grupo " + (directory.groups.length + 1)),
    [mode, setMode] = useState<"MANUAL" | "DIVERSE">("MANUAL"),
    [ids, setIds] = useState<string[]>([]),
    [count, setCount] = useState(10),
    [countries, setCountries] = useState(["PE", "EC", "BO", "CO"]),
    [reserve, setReserve] = useState(false),
    [since, setSince] = useState(limaToday),
    [avoid, setAvoid] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const catalog = directory.catalog,
    used = directory.groups.flatMap((g) => g.members.map((m) => m.itemId));
  function draw() {
    const proposal = diverseTrialItems(catalog, count, avoid ? used : []);
    setIds(proposal.map((i) => i.id));
    setError(
      proposal.length < count
        ? `Hay ${proposal.length} áreas principales disponibles para esta selección; no se repetirán áreas. Puedes guardar esa cantidad o cambiar los filtros.`
        : "",
    );
  }
  function replaceOne(id: string) {
    const others = ids.filter((x) => x !== id),
      primary = new Set(
        catalog
          .filter((i) => others.includes(i.id))
          .flatMap((i) => i.primaryIds),
      ),
      pool = catalog.filter(
        (i) =>
          !ids.includes(i.id) &&
          (!avoid || !used.includes(i.id)) &&
          (mode !== "DIVERSE" ||
            (i.primaryIds.length && !i.primaryIds.some((c) => primary.has(c)))),
      ),
      candidate = pool[Math.floor(Math.random() * pool.length)];
    if (!candidate) {
      setError("No hay otro candidato disponible con estas condiciones.");
      return;
    }
    setIds((v) => v.map((x) => (x === id ? candidate.id : x)));
  }
  return (
    <TrialDialog title="Crear grupo de prueba" busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          void (async () => {
            let committed = false;
            try {
              const g: TrialGroup = await api(
                "meta-ads/inventory/trials",
                "POST",
                {
                  action: "CREATE",
                  requestId,
                  listId: directory.listId,
                  name,
                  itemIds: ids,
                  countries,
                  since,
                  reserve,
                  diverse: mode === "DIVERSE",
                  rules: { zero: 25, perSale: 50 },
                },
              );
              committed = true;
              setSaved(true);
              await onSaved(g.id);
            } catch (e) {
              setError(
                committed
                  ? "El grupo se guardó. Cierra y actualiza para verlo."
                  : e instanceof Error
                    ? e.message
                    : "No se pudo crear el grupo.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <label>
          Nombre del grupo
          <input
            aria-label="Nombre del grupo"
            value={name}
            maxLength={100}
            required
            disabled={busy || saved}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div
          className="trial-mode"
          role="group"
          aria-label="Cómo crear el grupo"
        >
          <button
            type="button"
            aria-pressed={mode === "MANUAL"}
            onClick={() => {
              setMode("MANUAL");
              setIds([]);
            }}
          >
            Elegir manualmente
          </button>
          <button
            type="button"
            aria-pressed={mode === "DIVERSE"}
            onClick={() => {
              setMode("DIVERSE");
              setIds([]);
            }}
          >
            Aleatorio por áreas
          </button>
        </div>
        {mode === "MANUAL" ? (
          <InventoryMultiSelect
            all={false}
            label="Diplomados del nuevo grupo"
            placeholder="Buscar y seleccionar diplomados"
            values={ids}
            options={catalog.map((i) => ({
              value: i.id,
              label: i.name,
              searchLabel: i.name + " " + i.primaryNames.join(" "),
            }))}
            onChange={setIds}
          />
        ) : (
          <div className="trial-draw">
            <label>
              Cantidad
              <input
                aria-label="Cantidad de diplomados aleatorios"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                  )
                }
              />
            </label>
            <label className="trial-check">
              <input
                type="checkbox"
                checked={avoid}
                onChange={(e) => setAvoid(e.target.checked)}
              />
              Evitar diplomados de otros grupos
            </label>
            <button type="button" onClick={draw}>
              Generar propuesta
            </button>
            <small>
              Una categoría principal diferente por diplomado. Las secundarias
              pueden coincidir.
            </small>
          </div>
        )}
        {!!ids.length && (
          <div className="trial-preview" aria-label="Propuesta del grupo">
            {ids.map((id) => {
              const i = catalog.find((i) => i.id === id);
              return (
                <div key={id}>
                  <span>
                    <b>{i?.name}</b>
                    <small>
                      {i?.primaryNames.join(", ") || "Sin categoría principal"}
                    </small>
                  </span>
                  <button type="button" onClick={() => replaceOne(id)}>
                    Cambiar este
                  </button>
                  <button
                    type="button"
                    aria-label={"Quitar de la propuesta " + i?.name}
                    onClick={() => setIds((v) => v.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <InventoryMultiSelect
          all={false}
          label="Países del grupo"
          values={countries}
          options={countryOptions.map((c) => ({
            value: c.code,
            label: c.code + " · " + c.name,
          }))}
          onChange={(v) => {
            if (v.length <= 20) setCountries(v);
            else setError("Selecciona hasta 20 países por grupo.");
          }}
          placeholder="Selecciona los países"
        />
        <div className="trial-form-row">
          <label>
            Evaluar desde
            <input
              type="date"
              aria-label="Inicio de evaluación del grupo"
              min={dayMin()}
              max={limaToday()}
              value={since}
              onChange={(e) => setSince(e.target.value)}
              required
            />
          </label>
          <label className="trial-check">
            <input
              type="checkbox"
              checked={reserve}
              onChange={(e) => setReserve(e.target.checked)}
            />
            Guardar como grupo de reserva
          </label>
        </div>
        <p className="trial-help">
          Revisa la propuesta antes de guardarla. Inicia el seguimiento en la
          aplicación; las campañas de Meta se gestionan desde Meta Ads.
        </p>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <footer>
          <span>
            {ids.length} diplomados · {countries.length} países
          </span>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary"
            disabled={busy || saved || !ids.length || !countries.length}
          >
            {busy ? "Guardando…" : "Guardar grupo"}
          </button>
        </footer>
      </form>
    </TrialDialog>
  );
}
function TrialSettings({
  group,
  busy,
  onClose,
  onChange,
}: {
  group: TrialGroup;
  busy: boolean;
  onClose: () => void;
  onChange: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [zero, setZero] = useState(group.rules.zero),
    [perSale, setPerSale] = useState(group.rules.perSale),
    [name, setName] = useState(group.name),
    [countries, setCountries] = useState(group.countries),
    [error, setError] = useState("");
  async function run(b: Record<string, unknown>) {
    try {
      await onChange(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }
  return (
    <TrialDialog title="Reglas y grupo" busy={busy} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run({ action: "RULES", rules: { zero, perSale } });
        }}
      >
        <label>
          Nombre
          <input
            aria-label="Renombrar grupo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </label>
        <button
          type="button"
          disabled={busy || !name.trim() || name === group.name}
          onClick={() => void run({ action: "RENAME", name })}
        >
          Guardar nombre
        </button>
        <div className="trial-form-row">
          <label>
            Sin ventas: alerta desde S/
            <input
              aria-label="Límite sin ventas"
              type="number"
              min={0.01}
              step={0.01}
              value={zero}
              onChange={(e) => setZero(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Con ventas: S/ por venta
            <input
              aria-label="Límite por venta"
              type="number"
              min={0.01}
              step={0.01}
              value={perSale}
              onChange={(e) => setPerSale(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <p className="trial-help">
          Ejemplo: 0 ventas → {money(zero)}; 1 → {money(perSale)}; 2 →{" "}
          {money(2 * perSale)}; 3 → {money(3 * perSale)}. La alerta usa
          presupuesto o gasto según la fuente elegida.
        </p>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            Guardar reglas
          </button>
        </footer>
      </form>
      <details>
        <summary>Países del grupo</summary>
        <InventoryMultiSelect
          all={false}
          label="Editar países del grupo"
          values={countries}
          options={countryOptions.map((c) => ({
            value: c.code,
            label: c.code + " · " + c.name,
          }))}
          onChange={(v) => {
            if (v.length <= 20) setCountries(v);
            else setError("Elige hasta 20 países.");
          }}
        />
        <p className="trial-help">
          Los países nuevos empiezan su seguimiento hoy. Retirar uno de la vista
          conserva su historial.
        </p>
        <button
          type="button"
          disabled={busy || !countries.length}
          onClick={() =>
            void run({ action: "COUNTRIES", countries, since: limaToday() })
          }
        >
          Guardar países
        </button>
      </details>
      <details className="trial-archive">
        <summary>Archivar grupo</summary>
        <p>Lo retira de la lista y conserva su historial guardado.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run({ action: "ARCHIVE" })}
        >
          Archivar este grupo
        </button>
      </details>
    </TrialDialog>
  );
}
function TrialDetail({
  loading,
  row,
  group,
  basis,
  until,
  canEdit,
  busy,
  onClose,
  onChange,
  onReplace,
}: {
  row: Row;
  loading: boolean;
  group: TrialGroup;
  basis: string;
  until: string;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onChange: (b: Record<string, unknown>) => Promise<void>;
  onReplace: () => void;
}) {
  const [error, setError] = useState(""),
    evaluation = basis === "META" ? row.metaEvaluation : row.budgetEvaluation;
  async function run(action: string, decision?: string) {
    try {
      await onChange({
        action,
        country: row.country,
        slotIds: [row.slotId],
        ...(decision ? { decision } : { date: limaToday() }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }
  return (
    <TrialDialog
      title={row.name + " · " + countryName(row.country)}
      busy={busy}
      onClose={onClose}
    >
      <p className="trial-help">
        Ciclo desde {row.since} hasta {until}. {row.activeDays} días activos de
        seguimiento.
      </p>
      <div className={"trial-detail-status trial-" + evaluation.status}>
        <strong>{trialStatusNames[evaluation.status]}</strong>
        <span>
          Uso del límite: {pct(evaluation.usage)} · Límite{" "}
          {money(evaluation.limit)}
        </span>
      </div>
      <div className="trial-detail-numbers">
        <div>
          <span>Ventas</span>
          <strong>{num(row.sales)}</strong>
        </div>
        <div>
          <span>Presupuesto acumulado</span>
          <strong>{money(row.budget)}</strong>
        </div>
        <div>
          <span>Gasto Meta</span>
          <strong>{money(row.spend)}</strong>
        </div>
        <div>
          <span>Ventas por día activo</span>
          <strong>{num(row.salesPerDay)}</strong>
        </div>
        <div>
          <span>Presupuesto por venta</span>
          <strong>{money(row.budgetPerSale)}</strong>
        </div>
        <div>
          <span>Gasto por venta</span>
          <strong>{money(row.spendPerSale)}</strong>
        </div>
      </div>
      {(!row.complete.sales || !row.complete.budget || !row.complete.spend) && (
        <p className="trial-help">
          Hay datos pendientes o parciales. El gasto de Meta requiere cobertura
          y sincronización completas; el presupuesto es una estimación. Una
          cantidad faltante no se cuenta como cero.
        </p>
      )}
      {!row.available && (
        <p role="status">Este diplomado ya no está en el catálogo actual.</p>
      )}
      {loading && <p role="status">Actualizando detalle diario…</p>}
      <details>
        <summary>Ver cifras por día</summary>
        <div className="trial-daily-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ventas</th>
                <th>Presupuesto</th>
                <th>Gasto Meta</th>
              </tr>
            </thead>
            <tbody>
              {row.daily.map((d) => (
                <tr key={d.day}>
                  <th>{d.day}</th>
                  <td>{num(d.sales)}</td>
                  <td>{money(d.budget)}</td>
                  <td>
                    {money(d.spend)}
                    {!d.complete.spend && d.spend !== null ? " *" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Historial del país y reemplazos</summary>
        <ol className="trial-history">
          {group.cycles
            .filter((c) => c.slotId === row.slotId && c.country === row.country)
            .slice()
            .reverse()
            .map((c) => (
              <li key={c.id}>
                <b>{c.name}</b>
                <span>
                  {c.since} — {c.until ?? "actual"}
                </span>
                {c.pauses.length > 0 && (
                  <small>{c.pauses.length} pausas registradas</small>
                )}
              </li>
            ))}
        </ol>
      </details>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("DECISION", "KEEP")}
            >
              Conservar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("DECISION", "REPLACE")}
            >
              Marcar para reemplazo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(row.paused ? "RESUME" : "PAUSE")}
            >
              {row.paused ? "Reanudar seguimiento" : "Pausar seguimiento"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run("RESTART")}
            >
              Nuevo ciclo desde hoy
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={onReplace}
            >
              Preparar reemplazo
            </button>
          </>
        )}
      </footer>
    </TrialDialog>
  );
}
function TrialReplace({
  directory,
  group,
  country,
  slots,
  busy,
  onClose,
  onChange,
}: {
  directory: TrialDirectory;
  group: TrialGroup;
  country: string;
  slots: string[];
  busy: boolean;
  onClose: () => void;
  onChange: (b: Record<string, unknown>) => Promise<void>;
}) {
  const active = directory.groups.flatMap((g) =>
      g.cycles.filter((c) => c.country === country),
    ),
    excluded = new Set(active.map((c) => c.itemId)),
    pool = directory.catalog.filter((i) => !excluded.has(i.id)),
    reserveOrder = directory.groups
      .filter((g) => g.reserve)
      .flatMap((g) => g.members.map((m) => m.itemId)),
    reserved = new Set(reserveOrder),
    ranked = [...pool].sort(
      (a, b) =>
        (reserved.has(a.id) ? reserveOrder.indexOf(a.id) : 100000) -
          (reserved.has(b.id) ? reserveOrder.indexOf(b.id) : 100000) ||
        a.name.localeCompare(b.name, "es"),
    );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
      Object.fromEntries(slots.map((s, i) => [s, ranked[i]?.id ?? ""])),
    ),
    [error, setError] = useState("");
  return (
    <TrialDialog
      title={"Preparar reemplazos · " + countryName(country)}
      busy={busy}
      onClose={onClose}
    >
      <p className="trial-help">
        Solo cambian las filas elegidas en {countryName(country)}. Los demás
        países y diplomados se conservan. Los candidatos de reserva aparecen
        primero.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (new Set(Object.values(choices)).size !== slots.length) {
            setError("Selecciona un diplomado diferente para cada fila.");
            return;
          }
          void onChange({
            action: "REPLACE",
            country,
            date: limaToday(),
            replacements: slots.map((slotId) => ({
              slotId,
              itemId: choices[slotId],
            })),
          }).catch((e) => setError(e.message));
        }}
      >
        <div className="trial-replacements">
          {slots.map((slot) => {
            const c = active.find(
              (c) =>
                !c.until &&
                c.slotId === slot &&
                group.cycles.some((g) => g.id === c.id),
            );
            return (
              <div key={slot}>
                <span>
                  <small>Sale</small>
                  <b>
                    {c?.name ??
                      group.members.find((m) => m.slotId === slot)?.name}
                  </b>
                </span>
                <label>
                  Entra
                  <SheetSearchSelect
                    label={"Reemplazo de " + (c?.name ?? slot)}
                    value={choices[slot] ?? ""}
                    placeholder="Elige un diplomado"
                    options={ranked.map((i) => ({
                      value: i.id,
                      label: i.name + (reserved.has(i.id) ? " · Reserva" : ""),
                    }))}
                    onSelect={(id) => setChoices((v) => ({ ...v, [slot]: id }))}
                  />
                </label>
              </div>
            );
          })}
        </div>
        <p className="trial-help">
          El nuevo seguimiento empieza hoy. El cambio de campañas se realiza en
          Meta Ads.
        </p>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={busy || slots.some((s) => !choices[s])}
          >
            {busy ? "Guardando…" : "Confirmar reemplazos"}
          </button>
        </footer>
      </form>
    </TrialDialog>
  );
}

function TrialStart({
  group,
  country,
  slots,
  busy,
  onClose,
  onChange,
}: {
  group: TrialGroup;
  country: string;
  slots: string[];
  busy: boolean;
  onClose: () => void;
  onChange: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [date, setDate] = useState(
      group.cycles.find(
        (c) => c.country === country && c.slotId === slots[0] && !c.until,
      )?.since ?? limaToday(),
    ),
    [error, setError] = useState("");
  return (
    <TrialDialog
      title={"Inicio de evaluación · " + countryName(country)}
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onChange({
            action: "START_DATE",
            country,
            slotIds: slots,
            date,
          }).catch((e) => setError(e.message));
        }}
      >
        <p className="trial-help">
          Define cuándo comenzó este ciclo en {countryName(country)}. Se
          recalculan {slots.length} diplomados; los otros países conservan sus
          fechas.
        </p>
        <label>
          Fecha de inicio real
          <input
            type="date"
            aria-label="Inicio real del ciclo del país"
            min={dayMin()}
            max={limaToday()}
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy || !date}>
            Guardar inicio
          </button>
        </footer>
      </form>
    </TrialDialog>
  );
}
