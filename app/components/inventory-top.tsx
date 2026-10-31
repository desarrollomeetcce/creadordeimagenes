"use client";
import { Fragment, useRef, useState } from "react";
import { useSheetWidths } from "./use-sheet-widths";
import { SheetColumnResizer } from "./sheet-column-resizer";
import { InventoryBatchReplacement } from "./inventory-batch-replacement";
import { InventoryDiplomaObservations } from "./inventory-diploma-observations";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  InventoryCampaignControl,
  type InventoryCampaignChange,
} from "./inventory-campaign-control";
import { InventoryDeactivationConfirm } from "./inventory-deactivation-confirm";
import { InventoryCacStatus as InventoryStatusLabel } from "./inventory-cac-status";
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
  { CRITICAL: 0, SEVERE: 1, ALERT: 2, TESTING: 3, WITHIN: 4, PENDING: 5 }[
    (point.cac?.budget.assessment ?? point.assessment).status
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
  const [selected, setSelected] = useState<string[]>([]);
  const [batch, setBatch] = useState<string[]>([]);
  const [inspect, setInspect] = useState("");
  const { widths, resize, warning } = useSheetWidths(
    "inventory-top:" + directory.listId,
  );
  const sizes = [32, 260, 72, 50, 80, 65, 75, 60, 120, 300];
  const handle = (i: number, label: string) => (
    <SheetColumnResizer
      label={label}
      onResize={(v) => resize("column" + i, v)}
      onReset={() => resize("column" + i)}
    />
  );
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
        (b.point.cac?.budget.assessment.usage ??
          b.point.assessment.usage ??
          -1) -
          (a.point.cac?.budget.assessment.usage ??
            a.point.assessment.usage ??
            -1) ||
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
              setSelected([]);
              setBatch([]);
              setInspect("");
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
        <button
          type="button"
          className="primary inventory-batch-trigger"
          disabled={disabled || !selected.length}
          onClick={() => {
            setBatch([...selected]);
            setReplaceName("");
          }}
        >
          ↔ Reemplazar seleccionados ({selected.length})
        </button>
      </div>
      <p className="inventory-top-hint">
        Conserva los que funcionan. Reemplaza solo los que quieres cambiar en
        este país.
      </p>
      {warning && <small role="status">{warning}</small>}
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
      {!!batch.length && (
        <InventoryBatchReplacement
          key={JSON.stringify([column, batch])}
          origins={catalog.filter((i) => batch.includes(i.name))}
          candidates={options.filter(
            (i) => !batch.some((n) => categoryKey(n) === categoryKey(i.name)),
          )}
          busy={disabled}
          onClose={() => setBatch([])}
          onInspect={setInspect}
          onConfirm={async (plan) => {
            const valid = plan.every(
              (p) => point(p.from) && options.some((i) => i.name === p.to),
            );
            if (!valid) {
              setError("El Top cambió. Actualiza y revisa la propuesta.");
              return;
            }
            const saved = await mutate(
              () =>
                api(
                  "meta-ads/inventory/sheet-activation/replace-batch",
                  "POST",
                  {
                    listId: directory.listId,
                    tableId: column.split(":")[0],
                    country: column.split(":")[1],
                    replacements: plan.map((p) => ({
                      from: { name: p.from, targets: point(p.from)!.targets },
                      to: { name: p.to, targets: point(p.to)?.targets ?? [] },
                      mode: p.mode,
                    })),
                  },
                ),
              "Reemplazos listos: anteriores por desactivar y nuevos por hacer campaña.",
            );
            if (saved) {
              setBatch([]);
              setSelected([]);
              setQuery("");
              setPrimary("");
            }
          }}
        />
      )}
      {inspect && (
        <InventoryDiplomaObservations
          listId={directory.listId}
          name={inspect}
          columns={columns}
          initialColumn={column}
          onClose={() => setInspect("")}
        />
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
              <button type="button" onClick={() => setInspect(candidate)}>
                Ver antecedentes ↗
              </button>
            </p>
          )}
        </section>
      )}
      {evaluation.loading && !evaluation.ready ? (
        <p role="status">Cargando Top…</p>
      ) : (
        <div className="inventory-top-scroll">
          <table
            className="inventory-top-table"
            style={{
              width: sizes.reduce(
                (n, v, i) => n + (widths["column" + i] ?? v),
                0,
              ),
              minWidth: 0,
            }}
          >
            <colgroup>
              {[32, 260, 72, 50, 80, 65, 75, 60, 120, 300].map(
                (width, index) => (
                  <col
                    key={index}
                    style={{ width: widths["column" + index] ?? width }}
                  />
                ),
              )}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todos los diplomados visibles del Top"
                    disabled={disabled || !filtered.length}
                    checked={
                      !!filtered.length &&
                      filtered.every((r) => selected.includes(r.item.name))
                    }
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked
                          ? [
                              ...new Set([
                                ...current,
                                ...filtered.map((r) => r.item.name),
                              ]),
                            ]
                          : current.filter(
                              (n) => !filtered.some((r) => r.item.name === n),
                            ),
                      )
                    }
                  />
                </th>
                <th>Diplomado{handle(1, "Diplomado")}</th>
                <th>Activación{handle(2, "Activación")}</th>
                <th>Ventas{handle(3, "Ventas")}</th>
                <th>Desde{handle(4, "Desde")}</th>
                <th title="Días calendario del último período de activación registrado">
                  Días activos{handle(5, "Días activos")}
                </th>
                <th title="Presupuesto acumulado del último período registrado, en soles">
                  Pres. S/{handle(6, "Presupuesto")}
                </th>
                <th title="Hoy y los 13 días anteriores">
                  CAC{handle(7, "CAC")}
                </th>
                <th>Estado{handle(8, "Estado")}</th>
                <th>Acciones{handle(9, "Acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ item, point: p }, index) => (
                <Fragment key={item.id}>
                  {(index === 0 ||
                    rank(filtered[index - 1].point) !== rank(p)) && (
                    <tr className="inventory-top-band" data-top-rank={rank(p)}>
                      <th colSpan={10}>
                        <div className="inventory-top-block-heading">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={
                                "Seleccionar bloque " + bucketNames[rank(p)]
                              }
                              disabled={disabled}
                              checked={filtered
                                .filter((r) => rank(r.point) === rank(p))
                                .every((r) => selected.includes(r.item.name))}
                              onChange={(e) => {
                                const names = filtered
                                  .filter((r) => rank(r.point) === rank(p))
                                  .map((r) => r.item.name);
                                setSelected((current) =>
                                  e.target.checked
                                    ? [...new Set([...current, ...names])]
                                    : current.filter((n) => !names.includes(n)),
                                );
                              }}
                            />{" "}
                            {bucketNames[rank(p)]}
                          </label>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              const names = filtered
                                .filter((r) => rank(r.point) === rank(p))
                                .map((r) => r.item.name);
                              setSelected(names);
                              setBatch(names);
                              setReplaceName("");
                            }}
                          >
                            ↔ Reemplazar bloque
                          </button>
                        </div>
                      </th>
                    </tr>
                  )}
                  <tr
                    data-top-selected={
                      selected.includes(item.name) || undefined
                    }
                    data-top-name={item.name}
                    data-top-kept={
                      kept.includes(JSON.stringify([column, item.name])) ||
                      undefined
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"Reemplazar " + item.name}
                        disabled={disabled}
                        checked={selected.includes(item.name)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...new Set([...current, item.name])]
                              : current.filter((n) => n !== item.name),
                          )
                        }
                      />
                    </td>
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
                    <td>{(p.cac ? p.cac.sales : p.sales) ?? "—"}</td>
                    <td>
                      {(p.cac ? p.cac.first : p.since)
                        ? new Intl.DateTimeFormat("es-PE", {
                            timeZone: "America/Lima",
                            dateStyle: "short",
                          }).format(
                            new Date(
                              p.cac ? p.cac.first! + "T12:00:00Z" : p.since!,
                            ),
                          )
                        : "—"}
                    </td>
                    <td>{p.cac?.days ?? p.activeDays ?? "—"}</td>
                    <td>
                      {(p.cac ? p.cac.budget.penAmount : p.budget) === null
                        ? "—"
                        : new Intl.NumberFormat("es-PE", {
                            maximumFractionDigits: 2,
                          }).format(
                            (p.cac ? p.cac.budget.penAmount : p.budget)!,
                          )}
                    </td>
                    <td
                      title={
                        (p.cac ? p.cac.budget.partial : !p.complete)
                          ? "Datos incompletos; revisar detalle."
                          : undefined
                      }
                    >
                      {(p.cac?.budget.assessment ?? p.assessment).usage === null
                        ? "—"
                        : new Intl.NumberFormat("es-PE", {
                            style: "currency",
                            currency: "PEN",
                            maximumFractionDigits: 1,
                          }).format(
                            (p.cac?.budget.assessment ?? p.assessment).usage!,
                          )}
                      {(p.cac ? p.cac.budget.partial : !p.complete) &&
                      (p.cac?.budget.assessment ?? p.assessment).usage !== null
                        ? " *"
                        : ""}
                    </td>
                    <td>
                      <span
                        className={
                          "trial-status inventory-status-with-dot trial-" +
                          (p.cac?.budget.assessment ?? p.assessment).status
                        }
                      >
                        <InventoryStatusLabel
                          status={
                            (p.cac?.budget.assessment ?? p.assessment).status
                          }
                        />
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
                            setBatch([]);
                            setSelected([item.name]);
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
                  <td colSpan={10}>
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
