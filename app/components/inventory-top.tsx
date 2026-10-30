"use client";
import { Fragment, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  InventoryCampaignControl,
  type InventoryCampaignChange,
} from "./inventory-campaign-control";
import { InventoryDeactivationConfirm } from "./inventory-deactivation-confirm";
import { InventoryStatusLabel } from "./inventory-status-label";
import {
  useInventoryCountryEvaluation,
  type SheetPoint,
} from "./inventory-country-evaluation";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { periodTableUrl } from "../../lib/meta-ads/period-table-link";
import { limaToday } from "./date-range";
import { matchesSearchWords } from "../../lib/search";
type Mode = "MANUAL" | "SAME" | "OTHER";
const rank = (p: SheetPoint) =>
  p.campaignTasks.includes("STOP")
    ? 2
    : p.campaignTasks.includes("CREATE")
      ? 1
      : 0;
export const inventoryTopPriority = (point: SheetPoint) =>
  rank(point) * 10 +
  { CRITICAL: 0, ALERT: 1, TESTING: 2, WITHIN: 3, PENDING: 4 }[
    point.assessment.status
  ];
const bucketNames = ["Activos", "Por hacer campaña", "Por desactivar campaña"];
export function InventoryTop({
  directory,
  columns,
  initialColumn,
  initialReplaceName,
  onChanged,
  onDetail,
  onBusyChange,
}: {
  directory: TrialDirectory;
  columns: { value: string; label: string }[];
  initialColumn?: string;
  initialReplaceName?: string;
  onChanged: () => Promise<void>;
  onDetail: (column: string, name: string, aliasId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [column, setColumn] = useState(
      initialColumn || columns[0]?.value || "",
    ),
    [nonce, setNonce] = useState(0),
    [query, setQuery] = useState(""),
    [primary, setPrimary] = useState(""),
    [replaceName, setReplaceName] = useState(initialReplaceName || ""),
    [candidate, setCandidate] = useState(""),
    [mode, setMode] = useState<Mode>("MANUAL"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [kept, setKept] = useState<string[]>([]);
  const pending = useRef(false);
  const evaluation = useInventoryCountryEvaluation(
    directory.listId,
    column ? [column] : [],
    nonce,
  );
  const [confirm, setConfirm] = useState<{
    point: SheetPoint;
    change: InventoryCampaignChange;
    column: string;
  } | null>(null);
  const point = (name: string) =>
    evaluation.lookup.get(JSON.stringify([categoryKey(name), column]));
  const catalog = directory.catalog;
  const old = catalog.find(
    (i) => categoryKey(i.name) === categoryKey(replaceName),
  );
  const options = catalog.filter(
    (i) =>
      categoryKey(i.name) !== categoryKey(replaceName) &&
      !(
        point(i.name)?.activation === "ACTIVE" ||
        point(i.name)?.activation === "MIXED" ||
        (point(i.name)?.campaignTasks.length ?? 0) > 0
      ),
  );
  const rows = catalog
    .map((item) => ({ item, point: point(item.name) }))
    .filter(
      (r): r is { item: (typeof catalog)[number]; point: SheetPoint } =>
        !!r.point &&
        (r.point.activation === "ACTIVE" ||
          r.point.activation === "MIXED" ||
          r.point.campaignTasks.length > 0),
    );
  const filtered = rows
    .filter(
      (r) =>
        matchesSearchWords(r.item.name, query) &&
        (!primary || r.item.primaryNames.includes(primary)),
    )
    .sort(
      (a, b) =>
        inventoryTopPriority(a.point) - inventoryTopPriority(b.point) ||
        (b.point.assessment.usage ?? -1) - (a.point.assessment.usage ?? -1) ||
        a.item.name.localeCompare(b.item.name, "es"),
    );
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      await action();
      committed = true;
      setMessage(success);
      setNonce((n) => n + 1);
      await onChanged();
      return true;
    } catch (e) {
      setError(
        (committed
          ? "Cambio guardado. Actualiza para ver los resultados. "
          : "") + (e as Error).message,
      );
      setNonce((n) => n + 1);
      return committed;
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  async function change(p: SheetPoint, change: InventoryCampaignChange) {
    if (change.active === false && p.activation !== "INACTIVE") {
      setConfirm({ point: p, change, column });
      return;
    }
    await saveChange(p, change, column);
  }
  async function saveChange(
    p: SheetPoint,
    change: InventoryCampaignChange,
    key: string,
  ) {
    return mutate(
      () =>
        api("meta-ads/inventory/sheet-activation", "PATCH", {
          listId: directory.listId,
          tableId: key.split(":")[0],
          country: key.split(":")[1],
          items: [{ name: p.name, targets: p.targets }],
          ...change,
        }),
      "Estado actualizado.",
    );
  }
  function random(same: boolean) {
    const pool = options.filter((i) =>
      same
        ? i.primaryIds.some((id) => old?.primaryIds.includes(id))
        : i.primaryIds.length > 0 &&
          !i.primaryIds.some((id) => old?.primaryIds.includes(id)),
    );
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) {
      setError(
        "No hay un reemplazo disponible con esa categoría. Puedes elegirlo manualmente.",
      );
      return;
    }
    setError("");
    setMode(same ? "SAME" : "OTHER");
    setCandidate(next.name);
  }
  const disabled =
    busy || !directory.canEdit || !evaluation.ready || evaluation.loading;
  return (
    <div className="inventory-top-manager">
      <div className="inventory-top-controls">
        <label>
          Hoja y país
          <SheetSearchSelect
            label="Hoja y país del Top"
            placeholder="Elige hoja y país"
            value={column}
            options={columns}
            disabled={busy}
            onSelect={(value) => {
              setColumn(value);
              setReplaceName("");
              setCandidate("");
              setMessage("");
              setError("");
            }}
          />
        </label>
        <label>
          Buscar
          <input
            type="search"
            aria-label="Buscar diplomado del Top"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre del diplomado…"
          />
        </label>
        <label>
          Categoría principal
          <SheetSearchSelect
            label="Categoría principal del Top"
            placeholder="Todas"
            value={primary}
            options={[
              { value: "", label: "Todas" },
              ...[...new Set(catalog.flatMap((i) => i.primaryNames))]
                .sort((a, b) => a.localeCompare(b, "es"))
                .map((name) => ({ value: name, label: name })),
            ]}
            onSelect={setPrimary}
          />
        </label>
      </div>
      <div className="inventory-top-counts">
        {bucketNames.map((name, index) => (
          <span key={name} data-top-rank={index}>
            {name}{" "}
            <strong>
              {evaluation.ready
                ? rows.filter((r) => rank(r.point) === index).length
                : "—"}
            </strong>
          </span>
        ))}
      </div>
      <p className="inventory-top-hint">
        Conserva los que funcionan. Reemplaza solo los que quieres cambiar en
        este país.
      </p>
      {(error || evaluation.error) && (
        <p role="alert" className="notice error">
          {error || evaluation.error}
        </p>
      )}
      {message && (
        <p role="status" className="inventory-top-feedback">
          {message}
        </p>
      )}
      {replaceName && (
        <section
          className="inventory-top-replacement"
          aria-label="Elegir reemplazo"
        >
          <header>
            <strong>Reemplazar: {replaceName}</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReplaceName("");
                setCandidate("");
              }}
            >
              ×
            </button>
          </header>
          <div className="inventory-top-replacement-controls">
            <SheetSearchSelect
              label="Nuevo diplomado del Top"
              placeholder="Busca el reemplazo…"
              value={candidate}
              options={options.map((i) => ({ value: i.name, label: i.name }))}
              disabled={disabled}
              onSelect={(name) => {
                setCandidate(name);
                setMode("MANUAL");
                setError("");
              }}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => random(true)}
            >
              Azar · misma categoría
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => random(false)}
            >
              Azar · otra categoría
            </button>
            <button
              type="button"
              className="primary"
              disabled={
                disabled ||
                !candidate ||
                !point(replaceName) ||
                !options.some((item) => item.name === candidate)
              }
              onClick={async () => {
                const from = point(replaceName);
                if (!from) return;
                const saved = await mutate(
                  () =>
                    api("meta-ads/inventory/sheet-activation/replace", "POST", {
                      listId: directory.listId,
                      tableId: column.split(":")[0],
                      country: column.split(":")[1],
                      from: { name: from.name, targets: from.targets },
                      to: {
                        name: candidate,
                        targets: point(candidate)?.targets ?? [],
                      },
                      mode,
                    }),
                  "Reemplazo listo: anterior por desactivar y nuevo por hacer campaña.",
                );
                if (saved) {
                  setReplaceName("");
                  setCandidate("");
                  setQuery("");
                  setPrimary("");
                }
              }}
            >
              Confirmar reemplazo
            </button>
          </div>
          {candidate && (
            <p className="inventory-top-preview">
              <span>{replaceName} · Por desactivar</span>
              <b aria-hidden="true">→</b>
              <strong>{candidate} · Por hacer campaña</strong>
            </p>
          )}
        </section>
      )}
      {evaluation.loading && !evaluation.ready ? (
        <p role="status">Cargando Top…</p>
      ) : (
        <div className="inventory-top-scroll">
          <table className="inventory-top-table">
            <colgroup>
              {[260, 72, 50, 80, 65, 75, 60, 120, 300].map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Diplomado</th>
                <th>Activación</th>
                <th>Ventas</th>
                <th>Desde</th>
                <th title="Días calendario del último período de activación registrado">
                  Días activos
                </th>
                <th title="Presupuesto acumulado del último período registrado, en soles">
                  Pres. S/
                </th>
                <th>FX</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ item, point: p }, index) => (
                <Fragment key={item.id}>
                  {(index === 0 ||
                    rank(filtered[index - 1].point) !== rank(p)) && (
                    <tr className="inventory-top-band" data-top-rank={rank(p)}>
                      <th colSpan={9}>{bucketNames[rank(p)]}</th>
                    </tr>
                  )}
                  <tr
                    data-top-name={item.name}
                    data-top-kept={
                      kept.includes(JSON.stringify([column, item.name])) ||
                      undefined
                    }
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {item.primaryNames.join(" · ") ||
                          "Sin categoría principal"}
                      </small>
                    </td>
                    <td>
                      <InventoryCampaignControl
                        title={item.name}
                        activation={p.activation}
                        task={p.campaignTask}
                        disabled={disabled}
                        onChange={(value) => void change(p, value)}
                      />
                    </td>
                    <td>{p.sales ?? "—"}</td>
                    <td>
                      {p.since
                        ? new Intl.DateTimeFormat("es-PE", {
                            timeZone: "America/Lima",
                            dateStyle: "short",
                          }).format(new Date(p.since))
                        : "—"}
                    </td>
                    <td>{p.activeDays ?? "—"}</td>
                    <td>
                      {p.budget === null
                        ? "—"
                        : new Intl.NumberFormat("es-PE", {
                            maximumFractionDigits: 2,
                          }).format(p.budget)}
                    </td>
                    <td
                      title={
                        !p.complete
                          ? "Datos incompletos; revisar detalle."
                          : undefined
                      }
                    >
                      {p.assessment.usage === null
                        ? "—"
                        : new Intl.NumberFormat("es-PE", {
                            style: "percent",
                            maximumFractionDigits: 1,
                          }).format(p.assessment.usage)}
                      {!p.complete && p.assessment.usage !== null ? " *" : ""}
                    </td>
                    <td>
                      <span
                        className={
                          "trial-status inventory-status-with-dot trial-" +
                          p.assessment.status
                        }
                      >
                        <InventoryStatusLabel status={p.assessment.status} />
                      </span>
                    </td>
                    <td>
                      <div className="inventory-top-row-actions">
                        <button
                          type="button"
                          disabled={
                            disabled ||
                            (p.activation !== "ACTIVE" &&
                              p.activation !== "MIXED")
                          }
                          title="Conservar este diplomado sin cambiar su activación"
                          onClick={async () => {
                            if (p.campaignTasks.includes("STOP")) {
                              const saved = await saveChange(
                                p,
                                { campaignTask: "NONE" },
                                column,
                              );
                              if (!saved) return;
                            }
                            setKept((value) => [
                              ...new Set([
                                ...value,
                                JSON.stringify([column, item.name]),
                              ]),
                            ]);
                            setMessage("Se mantiene " + item.name + ".");
                          }}
                        >
                          ✓ Mantener
                        </button>
                        <button
                          type="button"
                          className="inventory-top-replace-trigger"
                          disabled={disabled}
                          onClick={() => {
                            setReplaceName(item.name);
                            setCandidate("");
                            setError("");
                            setMessage("");
                          }}
                        >
                          ↔ Reemplazar
                        </button>
                        <button
                          type="button"
                          title="Ver estadísticas, ventas e historial del diplomado"
                          disabled={!p.targets[0]?.aliasId}
                          onClick={() =>
                            onDetail(column, item.name, p.targets[0].aliasId)
                          }
                        >
                          Ver detalle ↗
                        </button>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={periodTableUrl({
                            focus: true,
                            tableId: column.split(":")[0],
                            aliasId: p.targets[0]?.aliasId ?? "",
                            country: column.split(":")[1],
                            since: p.since
                              ? new Intl.DateTimeFormat("en-CA", {
                                  timeZone: "America/Lima",
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                }).format(new Date(p.since))
                              : limaToday(),
                            until: limaToday(),
                          })}
                        >
                          Ir a la hoja ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9}>
                    {evaluation.error
                      ? "No se pudo cargar la evaluación. Actualiza para intentarlo de nuevo."
                      : !column
                        ? "Agrega una hoja y un país en Inventario para comenzar."
                        : rows.length
                          ? "No hay coincidencias con estos filtros."
                          : "No hay activos ni pendientes en esta hoja y país."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <InventoryDeactivationConfirm
          names={[confirm.point.name]}
          sheetName={
            columns.find((c) => c.value === confirm.column)?.label ?? "Hoja"
          }
          onClose={() => setConfirm(null)}
          onConfirm={async (pin) => {
            return saveChange(
              confirm.point,
              { ...confirm.change, pinned: pin },
              confirm.column,
            );
          }}
        />
      )}
    </div>
  );
}
