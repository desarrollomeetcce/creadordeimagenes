"use client";
import dynamic from "next/dynamic";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { countryName } from "../../lib/meta-ads/countries";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { inventoryTopSection } from "../../lib/meta-ads/inventory-top-sections";
import { inventoryTopPriority } from "../../lib/meta-ads/inventory-top-priority";
import {
  moveGroupCountry,
  orderedGroupCountries,
} from "../../lib/meta-ads/inventory-group-country-order";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { normalizeSearchText, searchTerms } from "../../lib/search";
import { useWorkbookPreference } from "./use-workbook-preference";
import {
  useInventoryCountryEvaluation,
  type SheetPoint,
} from "./inventory-country-evaluation";
import {
  InventoryCampaignControl,
  type InventoryCampaignChange,
} from "./inventory-campaign-control";
import { InventoryCacStatus } from "./inventory-cac-status";
import {
  cacStatusNames,
  type CacStatus,
} from "../../lib/meta-ads/inventory-cac-policy";
import { InventoryTopActivationPicker } from "./inventory-top-activation-picker";
import { InventoryTopSummary } from "./inventory-top-summary";
import { InventoryDeactivationConfirm } from "./inventory-deactivation-confirm";
import {
  SheetHorizontalNavigation,
  horizontalSheetKey,
} from "./sheet-horizontal-navigation";
import { SheetSearchSelect } from "./sheet-search-select";
import { MetaAnalysisPeriod } from "./meta-analysis-period";
import { quickRange } from "../../lib/meta-ads/date-range";
import { limaToday } from "./date-range";
import { financialRequest as api } from "./financial-request";
import type { ReplacementPlan } from "./inventory-batch-replacement";
import "./inventory-top-board.css";
const BatchReplacement = dynamic(
  () =>
    import("./inventory-batch-replacement").then(
      (m) => m.InventoryBatchReplacement,
    ),
  { loading: () => <p role="status">Abriendo reemplazo…</p> },
);
const Observations = dynamic(() =>
  import("./inventory-diploma-observations").then(
    (m) => m.InventoryDiplomaObservations,
  ),
);
type Column = { value: string; label: string };
type Item = TrialDirectory["catalog"][number];
type Card = { item: Item; point: SheetPoint };
function Panel({
  title,
  busy,
  close,
  children,
}: {
  title: string;
  busy: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-top-board-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <h3>{title}</h3>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          aria-label="Cerrar reemplazo"
          onClick={close}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
const date = (raw: string | null | undefined) => {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw))
    return raw.split("-").reverse().join("/");
  const value = new Date(raw);
  return Number.isNaN(value.getTime())
    ? null
    : value.toLocaleDateString("es-PE", {
        timeZone: "America/Lima",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
};
export function InventoryTopBoard({
  navigation,
  directory,
  columns,
  visible,
  onVisibleChange,
  onAddCountry,
  onChanged,
  onDetail,
  onBusyChange,
}: {
  navigation: ReactNode;
  directory: TrialDirectory;
  columns: Column[];
  visible: string[] | null;
  onVisibleChange: (values: string[] | null) => void;
  onAddCountry: () => void;
  onChanged: (column: string) => Promise<void>;
  onDetail: (column: string, name: string, aliasId: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const countryScroll = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useWorkbookPreference<string[]>(
    directory.listId,
    "inventory-top-board-order",
    [],
  );
  const ordered = useMemo(
    () =>
      orderedGroupCountries(
        columns.map((c) => ({ ...c, code: c.value })),
        order,
      ),
    [columns, order],
  );
  const selected = useMemo(
    () => ordered.filter((c) => visible === null || visible.includes(c.value)),
    [ordered, visible],
  );
  const [query, setQuery] = useState(""),
    [primary, setPrimary] = useState(""),
    [period, setPeriod] = useState("7");
  const [range, setRange] = useState<[string, string]>(() =>
    quickRange("7", limaToday()),
  );
  const dates = period === "custom" ? range : quickRange(period, limaToday());
  const evaluation = useInventoryCountryEvaluation(
    directory.listId,
    selected.map((c) => c.value),
    0,
    period === "lifetime"
      ? { fromActivation: true }
      : { since: dates[0], until: dates[1] },
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [replacement, setReplacement] = useState<{
    column: string;
    item: Item;
  } | null>(null);
  const [inspect, setInspect] = useState<{
    column: string;
    name: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    column: string;
    point: SheetPoint;
    change: InventoryCampaignChange;
  } | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const pending = useRef(false),
    pointer = useRef<{
      id: string;
      x: number;
      y: number;
      moving: boolean;
    } | null>(null);
  const point = (name: string, column: string) =>
    evaluation.lookup.get(JSON.stringify([categoryKey(name), column]));
  const canEdit = (column: string) =>
    !busy &&
    directory.canEdit &&
    evaluation.canEdit &&
    evaluation.loadedTables.has(column.split(":")[0]);
  const move = (from: string, to: string) =>
    setOrder(
      moveGroupCountry(
        ordered.map((c) => c.value),
        from,
        to,
      ),
    );
  const catalogEntries = useMemo(
    () =>
      directory.catalog.map((item) => ({
        item,
        key: categoryKey(item.name),
        search: normalizeSearchText(item.name),
      })),
    [directory.catalog],
  );
  const categoryOptions = useMemo(
    () => [
      { value: "", label: "Todas" },
      ...[...new Set(directory.catalog.flatMap((item) => item.primaryNames))]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((name) => ({ value: name, label: name })),
    ],
    [directory.catalog],
  );
  // Group and sort only when the source changes, never on each search keystroke.
  const countryCards = useMemo(
    () =>
      new Map(
        selected.map((column) => {
          const active: Card[] = [],
            inactive: Card[] = [],
            candidates: Item[] = [];
          for (const { item, key } of catalogEntries) {
            const point = evaluation.lookup.get(
              JSON.stringify([key, column.value]),
            );
            const section = point ? inventoryTopSection(point) : null;
            if (point && section)
              (section === "active" ? active : inactive).push({ item, point });
            if (section !== "active") candidates.push(item);
          }
          active.sort(
            (a, b) =>
              inventoryTopPriority(a.point) - inventoryTopPriority(b.point) ||
              a.item.name.localeCompare(b.item.name, "es"),
          );
          inactive.sort((a, b) => a.item.name.localeCompare(b.item.name, "es"));
          return [
            column.value,
            {
              active,
              inactive,
              candidates,
            },
          ] as const;
        }),
      ),
    [selected, catalogEntries, evaluation.lookup],
  );
  const deferredQuery = useDeferredValue(query);
  const matchingIds = useMemo(() => {
    const terms = searchTerms(deferredQuery);
    return new Set(
      catalogEntries
        .filter(
          ({ item, search }) =>
            terms.every((term) => search.includes(term)) &&
            (!primary || item.primaryNames.includes(primary)),
        )
        .map(({ item }) => item.id),
    );
  }, [catalogEntries, deferredQuery, primary]);
  const cards = useMemo(
    () =>
      new Map(
        [...countryCards].map(
          ([column, group]) =>
            [
              column,
              {
                active: group.active.filter((card) =>
                  matchingIds.has(card.item.id),
                ),
                inactive: group.inactive.filter((card) =>
                  matchingIds.has(card.item.id),
                ),
              },
            ] as const,
        ),
      ),
    [countryCards, matchingIds],
  );
  const candidates = (column: string) =>
    countryCards.get(column)?.candidates ?? [];
  async function mutate(
    column: string,
    action: () => Promise<unknown>,
    success: string,
  ) {
    if (pending.current || !canEdit(column)) return false;
    pending.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    let committed = false;
    try {
      await action();
      committed = true;
      setMessage(success);
      await onChanged(column);
      return true;
    } catch (e) {
      setError(
        (committed ? "Cambio guardado. Actualiza para comprobarlo. " : "") +
          (e instanceof Error ? e.message : "No se pudo guardar."),
      );
      return committed;
    } finally {
      evaluation.refresh([column]);
      pending.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  const change = (
    column: string,
    p: SheetPoint,
    value: InventoryCampaignChange,
  ) => {
    if (value.active === false && p.activation !== "INACTIVE") {
      setConfirm({ column, point: p, change: value });
      return;
    }
    void saveChange(column, p, value);
  };
  const saveChange = (
    column: string,
    p: SheetPoint,
    value: InventoryCampaignChange,
  ) =>
    mutate(
      column,
      () =>
        api("meta-ads/inventory/sheet-activation", "PATCH", {
          listId: directory.listId,
          tableId: column.split(":")[0],
          country: column.split(":")[1],
          items: [{ name: p.name, targets: p.targets }],
          ...value,
        }),
      "Estado actualizado · " + countryName(column.split(":")[1]),
    );
  const startReplacement = (column: string, item: Item) => {
    setError("");
    setReplacement({ column, item });
  };
  async function replace(plan: ReplacementPlan[]) {
    if (!replacement) return;
    const { column } = replacement;
    if (
      plan.some(
        (p) =>
          !point(p.from, column) ||
          !candidates(column).some((i) => i.name === p.to),
      )
    ) {
      setError("El Top cambió. Actualiza y revisa el reemplazo.");
      return;
    }
    const saved = await mutate(
      column,
      () =>
        api("meta-ads/inventory/sheet-activation/replace-batch", "POST", {
          listId: directory.listId,
          tableId: column.split(":")[0],
          country: column.split(":")[1],
          replacements: plan.map((p) => ({
            from: { name: p.from, targets: point(p.from, column)!.targets },
            to: { name: p.to, targets: point(p.to, column)?.targets ?? [] },
            mode: p.mode,
          })),
        }),
      "Reemplazo guardado: anterior por desactivar y nuevo por hacer campaña.",
    );
    if (saved) {
      setReplacement(null);
      setQuery("");
      setPrimary("");
    }
  }
  function renderCard(card: Card, column: string) {
    const { item, point: p } = card,
      inactive = inventoryTopSection(p) === "inactive";
    const start = date(p.since),
      end = date(p.activeUntil);
    const ongoing = p.activation === "ACTIVE" || p.activation === "MIXED";
    const status = p.cac?.meta.assessment.status ?? "PENDING";
    const base = p.cac?.metaBase;
    const basePartial = base != null && p.cac?.metaBasePartial;
    const baseLabel = base == null ? "—" : base.toLocaleString("es-PE");
    return (
      <article
        key={item.id}
        className="inventory-top-board-card"
        data-top-name={item.name}
        data-cac-status={status}
        aria-label={item.name + ": " + cacStatusNames[status]}
        data-top-column={column}
        data-top-section={inactive ? "inactive" : "active"}
      >
        <InventoryTopSummary
          title={item.name}
          metric={
            <span
              className="inventory-top-card-base"
              title={
                base == null
                  ? "Base de Meta sin datos en el periodo"
                  : basePartial
                    ? "Base de Meta con cobertura parcial"
                    : "Base de Meta del periodo"
              }
            >
              <span>Base de Meta</span>
              <strong>
                {baseLabel}
                {basePartial ? "*" : ""}
              </strong>
            </span>
          }
          detailDisabled={!p.targets[0]?.aliasId}
          onDetail={() => onDetail(column, item.name, p.targets[0].aliasId)}
          action={
            <InventoryCampaignControl
              title={item.name}
              activation={p.activation}
              task={p.campaignTask}
              disabled={!canEdit(column)}
              onChange={(value) => change(column, p, value)}
              extraActions={
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!p.targets[0]?.aliasId}
                    onClick={(e) => {
                      e.currentTarget
                        .closest<HTMLElement>("[popover]")
                        ?.hidePopover();
                      onDetail(column, item.name, p.targets[0].aliasId);
                    }}
                  >
                    Ver detalle ↗
                  </button>
                  {!inactive && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canEdit(column)}
                      onClick={(e) => {
                        e.currentTarget
                          .closest<HTMLElement>("[popover]")
                          ?.hidePopover();
                        startReplacement(column, item);
                      }}
                    >
                      ↔ Reemplazar diplomado
                    </button>
                  )}
                </>
              }
            />
          }
        >
          <span
            className={`trial-status inventory-status-with-dot trial-${status}`}
          >
            <InventoryCacStatus status={status} />
            {p.cac?.meta.provisional ? " · Provisional" : ""}
          </span>
          {item.primaryNames.length > 0 && (
            <p className="inventory-top-card-category">
              {item.primaryNames.join(" · ")}
            </p>
          )}
          <div className="inventory-top-card-dates">
            <span>Período activo</span>
            <strong>
              {start ?? "Inicio no registrado"}{" "}
              <span aria-hidden="true">→</span>{" "}
              {ongoing ? "En curso" : (end ?? "Fin no registrado")}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Conversaciones de Meta del período</dt>
              <dd>
                {baseLabel}
                {basePartial ? " · Parcial" : ""}
              </dd>
            </div>
            <div>
              <dt>Ventas del ciclo</dt>
              <dd>{p.sales == null ? "—" : p.sales.toLocaleString("es-PE")}</dd>
            </div>
            <div>
              <dt>Días activos</dt>
              <dd>{p.activeDays ?? "—"}</dd>
            </div>
          </dl>
        </InventoryTopSummary>
      </article>
    );
  }
  const hidden = ordered.filter(
    (c) => !selected.some((s) => s.value === c.value),
  );
  return (
    <div className="inventory-top-board">
      <div className="inventory-top-board-toolbar">
        {navigation}
        <label>
          Buscar diplomado
          <input
            type="search"
            aria-label="Buscar en todos los países del Top"
            placeholder="Nombre del diplomado…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Categoría
          <SheetSearchSelect
            label="Categoría del Top por países"
            placeholder="Todas"
            value={primary}
            onSelect={setPrimary}
            options={categoryOptions}
          />
        </label>
        <MetaAnalysisPeriod
          label="Período de evaluación del Top"
          value={period}
          since={dates[0]}
          until={dates[1]}
          today={limaToday()}
          lifetimeLabel="Desde que se activó"
          onPreset={setPeriod}
          onRange={(since, until) => {
            setRange([since, until]);
            setPeriod("custom");
          }}
        />
        <SheetSearchSelect
          label="Agregar país al Top"
          placeholder="＋ Agregar país"
          value=""
          disabled={busy}
          options={[
            ...hidden.map((c) => ({ value: c.value, label: c.label })),
            ...(directory.canEdit
              ? [{ value: "__new__", label: "Agregar otra hoja o país…" }]
              : []),
          ]}
          onSelect={(value) => {
            if (value === "__new__") {
              onAddCountry();
              return;
            }
            if (hidden.some((c) => c.value === value))
              onVisibleChange([...selected.map((c) => c.value), value]);
          }}
        />
        <button
          type="button"
          disabled={busy || evaluation.loading || !selected.length}
          onClick={() => evaluation.refresh()}
        >
          ↻ Actualizar
        </button>
      </div>
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
      {!selected.length && (
        <div className="inventory-top-board-empty">
          <h3>Agrega tu primer país</h3>
          <p>Elige las columnas que quieres ver desde «Agregar país».</p>
        </div>
      )}
      <div
        className="inventory-top-board-legend"
        aria-label="Leyenda de evaluación del Top"
      >
        <strong>CAC con gasto de Meta · período evaluado</strong>
        {(Object.keys(cacStatusNames) as CacStatus[]).map((status) => (
          <span key={status}>
            <InventoryCacStatus status={status} />
          </span>
        ))}
      </div>
      <div
        className="inventory-top-board-navigation"
        aria-label="Recorrer países del Top"
      >
        <SheetHorizontalNavigation target={countryScroll} />
      </div>
      <div
        ref={countryScroll}
        onKeyDown={(event) => horizontalSheetKey(event, countryScroll.current)}
        className="inventory-top-board-columns"
        role="region"
        aria-label="Top de países desplazable horizontalmente"
        tabIndex={0}
      >
        {selected.map((column, index) => {
          const country = column.value.split(":")[1],
            group = cards.get(column.value)!,
            limit = limits[column.value] ?? 25,
            ready = evaluation.loadedTables.has(column.value.split(":")[0]);
          return (
            <section
              key={column.value}
              className="inventory-top-country-lane"
              data-top-column={column.value}
              aria-label={"Top de " + column.label}
            >
              <header className="inventory-top-country-header">
                <button
                  type="button"
                  className="inventory-top-country-grip"
                  aria-label={"Reordenar " + column.label}
                  title="Arrastra para ordenar · Alt + flechas"
                  disabled={busy}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    pointer.current = {
                      id: column.value,
                      x: e.clientX,
                      y: e.clientY,
                      moving: false,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const drag = pointer.current;
                    if (!drag) return;
                    if (
                      !drag.moving &&
                      Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6
                    )
                      return;
                    drag.moving = true;
                    e.preventDefault();
                    const target = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>(
                        "section.inventory-top-country-lane[data-top-column]",
                      )?.dataset.topColumn;
                    if (target && target !== drag.id) move(drag.id, target);
                  }}
                  onPointerUp={() => {
                    pointer.current = null;
                  }}
                  onPointerCancel={() => {
                    pointer.current = null;
                  }}
                  onLostPointerCapture={() => {
                    pointer.current = null;
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.altKey &&
                      ["ArrowLeft", "ArrowRight"].includes(e.key)
                    ) {
                      e.preventDefault();
                      const target =
                        selected[index + (e.key === "ArrowLeft" ? -1 : 1)];
                      if (target) move(column.value, target.value);
                    }
                  }}
                >
                  ⠿
                </button>
                <div>
                  <h3>{countryName(country)}</h3>
                  {categoryKey(column.label) !==
                    categoryKey(countryName(country)) && (
                    <small>{column.label}</small>
                  )}
                </div>
                <span className="inventory-top-country-iso">{country}</span>
                <button
                  type="button"
                  aria-label={"Quitar columna " + column.label}
                  disabled={busy}
                  onClick={() =>
                    onVisibleChange(
                      selected
                        .filter((c) => c.value !== column.value)
                        .map((c) => c.value),
                    )
                  }
                >
                  ×
                </button>
              </header>
              <div className="inventory-top-country-order">
                <span>{ready ? group.active.length : "—"} en el Top</span>
                <button
                  type="button"
                  disabled={busy || index === 0}
                  aria-label={"Mover " + column.label + " a la izquierda"}
                  onClick={() => move(column.value, selected[index - 1].value)}
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={busy || index === selected.length - 1}
                  aria-label={"Mover " + column.label + " a la derecha"}
                  onClick={() => move(column.value, selected[index + 1].value)}
                >
                  →
                </button>
              </div>
              <div className="inventory-top-country-body">
                {!ready ? (
                  <p role="status">
                    {evaluation.error
                      ? "No se pudo cargar este país. Pulsa Actualizar."
                      : "Cargando diplomados…"}
                  </p>
                ) : (
                  <>
                    {group.active.length === 0 && (
                      <p className="inventory-top-country-empty">
                        {query || primary
                          ? "No hay coincidencias en este Top."
                          : "Todavía no hay activos ni pendientes."}
                      </p>
                    )}
                    {group.active
                      .slice(0, limit)
                      .map((card) => renderCard(card, column.value))}
                    {group.active.length > limit && (
                      <button
                        type="button"
                        onClick={() =>
                          setLimits((v) => ({
                            ...v,
                            [column.value]: limit + 25,
                          }))
                        }
                      >
                        Ver 25 más · {group.active.length - limit} pendientes de
                        mostrar
                      </button>
                    )}
                    <div className="inventory-top-country-add">
                      <strong>＋ Activar otro diplomado</strong>
                      <InventoryTopActivationPicker
                        label={"Activar diplomado en " + column.label}
                        disabled={!canEdit(column.value)}
                        choices={candidates(column.value)}
                        onSelect={async (name) => {
                          if (
                            !name ||
                            !candidates(column.value).some(
                              (i) => i.name === name,
                            )
                          )
                            return false;
                          return mutate(
                            column.value,
                            () =>
                              api(
                                "meta-ads/inventory/sheet-activation",
                                "PATCH",
                                {
                                  listId: directory.listId,
                                  tableId: column.value.split(":")[0],
                                  country,
                                  items: [
                                    {
                                      name,
                                      targets:
                                        point(name, column.value)?.targets ??
                                        [],
                                    },
                                  ],
                                  active: true,
                                },
                              ),
                            name + " activado · " + countryName(country),
                          ).then((saved) => {
                            if (saved) {
                              setQuery("");
                              setPrimary("");
                            }
                            return saved;
                          });
                        }}
                      />
                    </div>
                    {group.inactive.length > 0 && (
                      <>
                        <h4 className="inventory-top-country-inactive">
                          Desactivados <span>{group.inactive.length}</span>
                        </h4>
                        {group.inactive
                          .slice(0, limit)
                          .map((card) => renderCard(card, column.value))}
                        {group.inactive.length > limit && (
                          <button
                            type="button"
                            onClick={() =>
                              setLimits((v) => ({
                                ...v,
                                [column.value]: limit + 25,
                              }))
                            }
                          >
                            Ver 25 desactivados más
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {confirm && (
        <InventoryDeactivationConfirm
          names={[confirm.point.name]}
          sheetName={
            columns.find((c) => c.value === confirm.column)?.label ?? "País"
          }
          onClose={() => setConfirm(null)}
          onConfirm={(pin) =>
            saveChange(confirm.column, confirm.point, {
              ...confirm.change,
              pinned: pin,
            })
          }
        />
      )}
      {replacement && (
        <Panel
          title={
            "Reemplazar en " +
            (columns.find((c) => c.value === replacement.column)?.label ??
              "este país")
          }
          busy={busy}
          close={() => setReplacement(null)}
        >
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <BatchReplacement
            directory={directory}
            country={replacement.column.split(":")[1]}
            origins={[replacement.item]}
            candidates={candidates(replacement.column)}
            busy={busy}
            canConfirm={canEdit(replacement.column)}
            onClose={() => setReplacement(null)}
            onConfirm={replace}
            onInspect={(name) =>
              setInspect({ column: replacement.column, name })
            }
          />
        </Panel>
      )}
      {inspect && (
        <Observations
          listId={directory.listId}
          name={inspect.name}
          columns={columns}
          initialColumn={inspect.column}
          onClose={() => setInspect(null)}
        />
      )}
    </div>
  );
}
