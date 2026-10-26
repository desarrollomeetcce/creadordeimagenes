"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  sheetPalette,
  type SheetColorRule,
} from "../../lib/meta-ads/sheet-colors";
import {
  sheetMetrics,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
type Config = { revision: number; rules: SheetColorRule[] };
export function SheetColorsControl({
  tableId,
  tables,
  metrics,
  onRules,
  onError,
}: {
  tableId: string;
  tables: { id: string; name: string }[];
  metrics: SheetMetric[];
  onRules: (r: SheetColorRule[]) => void;
  onError: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [config, setConfig] = useState<Config | null>(null),
    [busy, setBusy] = useState(false),
    [value, setValue] = useState("0"),
    [color, setColor] = useState<SheetColorRule["color"]>("purple"),
    [chosen, setChosen] = useState<SheetMetric[] | null>(null),
    [warning, setWarning] = useState<SheetColorRule | null>(null),
    [source, setSource] = useState(""),
    [preview, setPreview] = useState<Config | null>(null);
  const selected = chosen ?? metrics;
  useEffect(() => {
    let active = true;
    void api(
      "meta-ads/effectiveness/colors?" + new URLSearchParams({ tableId }),
    )
      .then((v: Config) => {
        if (active) {
          setConfig(v);
          onRules(v.rules);
        }
      })
      .catch((e) => {
        if (active) onError(e.message);
      });
    return () => {
      active = false;
    };
  }, [tableId, onRules, onError]);
  const save = async (rules: SheetColorRule[]) => {
    if (!config) return;
    setBusy(true);
    try {
      const v: Config = await api("meta-ads/effectiveness/colors", "PATCH", {
        tableId,
        revision: config.revision,
        rules,
      });
      setConfig(v);
      onRules(v.rules);
      setWarning(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const apply = (rule: SheetColorRule, confirmed = false) => {
    if (!config) return;
    if (
      !confirmed &&
      config.rules.some(
        (r) =>
          r.pinned &&
          r.id !== rule.id &&
          r.color === rule.color &&
          r.value !== rule.value,
      )
    ) {
      setWarning(rule);
      return;
    }
    void save([...config.rules.filter((r) => r.id !== rule.id), rule]);
  };
  const prepare = (pinned: boolean) => {
    const numeric = Number(value),
      na = /^n\.?a\.?$/i.test(value.trim());
    if (
      !na &&
      (!value.trim() ||
        !Number.isFinite(numeric) ||
        numeric < 0 ||
        numeric > 1e9)
    ) {
      onError("Escribe un número de 0 a 1000000000 o N.A.");
      return;
    }
    if (!selected.length) {
      onError("Elige al menos un parámetro para el color.");
      return;
    }
    apply({
      id: crypto.randomUUID(),
      value: na ? "NA" : numeric,
      color,
      metrics: selected,
      pinned,
      enabled: true,
    });
  };
  const label = (r: SheetColorRule) =>
    `${r.value === "NA" ? "N.A." : r.value} · ${sheetMetrics
      .filter((m) => r.metrics.includes(m.key))
      .map((m) => m.label)
      .join("/")}`;
  return (
    <div className="sheet-colors-control">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ◉ Colores
      </button>
      {config?.rules
        .filter((r) => r.pinned)
        .map((r) => (
          <span
            key={r.id}
            className="sheet-pinned-color"
            style={
              {
                "--pinned-color": sheetPalette.find((c) => c.id === r.color)
                  ?.hex,
              } as CSSProperties
            }
          >
            <button
              type="button"
              className="sheet-pinned-toggle"
              disabled={busy}
              aria-label={`Mostrar color ${label(r)}`}
              aria-pressed={r.enabled !== false}
              title={
                r.enabled === false
                  ? "Mostrar color sin cambiar el fijado"
                  : "Ocultar color y mantenerlo fijado"
              }
              onClick={() =>
                void save(
                  config.rules.map((x) =>
                    x.id === r.id ? { ...x, enabled: x.enabled === false } : x,
                  ),
                )
              }
            >
              <span
                className="sheet-color-dot"
                style={{
                  background: sheetPalette.find((c) => c.id === r.color)?.hex,
                }}
              />
              <span aria-hidden="true">{r.enabled !== false ? "✓" : "○"}</span>
              <span>{label(r)}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Desfijar color ${label(r)}`}
              title="Desfijar y eliminar esta regla de color"
              onClick={() =>
                void save(config.rules.filter((x) => x.id !== r.id))
              }
            >
              ×
            </button>
          </span>
        ))}
      {open && (
        <section className="sheet-colors-panel" aria-label="Reglas de colores">
          <div className="row">
            <strong>Colores por valor</strong>
            <span>Todas las fechas</span>
            <button type="button" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
          <p>
            Elige un valor y los parámetros. El formato se aplica a todas las
            fechas, independientemente del calendario. Fijar deja el color a
            mano. Pulsa el color fijado para mostrarlo u ocultarlo sin
            desfijarlo; la X elimina su configuración. La selección se guarda y
            se puede sincronizar con otras tablas. N.A. es gris por defecto.
          </p>
          {!config && (
            <p role="status">
              No se han cargado las reglas. Cierra y vuelve a la hoja si la
              carga falló.
            </p>
          )}
          <label>
            Valor{" "}
            <input
              aria-label="Valor para colorear"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setWarning(null);
              }}
              placeholder="0 o N.A."
              maxLength={30}
            />
          </label>
          <div
            className="row sheet-color-metrics"
            aria-label="Parámetros para colorear"
          >
            {sheetMetrics.map((m) => (
              <label key={m.key}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.key)}
                  onChange={() =>
                    setChosen(
                      selected.includes(m.key)
                        ? selected.filter((v) => v !== m.key)
                        : [...selected, m.key],
                    )
                  }
                />
                {m.name} ({m.label})
              </label>
            ))}
          </div>
          <div
            className="sheet-color-palette"
            aria-label="Paleta de diez colores"
          >
            {sheetPalette.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                aria-pressed={color === c.id}
                style={{ background: c.hex, color: "#10202b" }}
                onClick={() => {
                  setColor(c.id);
                  setWarning(null);
                }}
              >
                <span aria-hidden="true">{color === c.id ? "✓" : "●"}</span>{" "}
                {c.name}
              </button>
            ))}
          </div>
          <div className="row">
            <button
              type="button"
              disabled={busy || !config}
              onClick={() => prepare(false)}
            >
              Aplicar color
            </button>
            <button
              type="button"
              disabled={busy || !config}
              onClick={() => prepare(true)}
            >
              Fijar y aplicar
            </button>
          </div>
          {warning && (
            <div
              role="alertdialog"
              aria-label="Color ya elegido"
              className="sheet-color-warning"
            >
              <p>
                Ese color ya fue elegido para otros valores. ¿Seguro que quieres
                usarlo nuevamente?
              </p>
              <button disabled={busy} onClick={() => apply(warning, true)}>
                Usar igualmente
              </button>
              <button disabled={busy} onClick={() => setWarning(null)}>
                Elegir otro color
              </button>
            </div>
          )}
          {config?.rules.length ? (
            <div className="sheet-color-rules">
              <strong>
                Reglas guardadas — la última coincidencia prevalece
              </strong>
              {config.rules.map((r) => (
                <div className="row" key={r.id}>
                  <span
                    className="sheet-color-dot"
                    style={{
                      background: sheetPalette.find((c) => c.id === r.color)
                        ?.hex,
                    }}
                  />
                  <span>
                    {r.pinned ? "📌 " : ""}
                    {label(r)}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={r.enabled !== false}
                    aria-label={`Mostrar regla de color ${label(r)}`}
                    onClick={() =>
                      void save(
                        config.rules.map((x) =>
                          x.id === r.id
                            ? { ...x, enabled: x.enabled === false }
                            : x,
                        ),
                      )
                    }
                  >
                    {r.enabled !== false
                      ? "✓ Seleccionado"
                      : "○ Sin seleccionar"}
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`${r.pinned ? "Desfijar" : "Retirar"} color ${label(r)}`}
                    title="Desfijar y eliminar esta regla de color"
                    onClick={() =>
                      void save(config.rules.filter((x) => x.id !== r.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="row">
            <SheetSearchSelect
              label="Tabla de origen de colores"
              value={source}
              placeholder="Sincronizar colores desde…"
              options={tables
                .filter((t) => t.id !== tableId)
                .map((t) => ({ value: t.id, label: t.name }))}
              onSelect={(id) => {
                setSource(id);
                setPreview(null);
              }}
            />
            <button
              disabled={busy || !source || !config}
              onClick={async () => {
                setBusy(true);
                try {
                  setPreview(
                    await api(
                      "meta-ads/effectiveness/colors?" +
                        new URLSearchParams({ tableId: source }),
                    ),
                  );
                } catch (e) {
                  onError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revisar colores de origen
            </button>
          </div>
          {preview && (
            <div className="sheet-color-sync-preview">
              <p>
                Se reemplazarán las reglas de esta tabla por{" "}
                {preview.rules.length} reglas de «
                {tables.find((t) => t.id === source)?.name}», para todas las
                fechas, incluidos sus colores fijados y su selección. No
                modifica celdas ni otras tablas. Los cambios futuros requieren
                otra sincronización.
              </p>
              <button
                disabled={busy || !config || !preview.revision}
                onClick={async () => {
                  if (!config) return;
                  setBusy(true);
                  try {
                    const v: Config = await api(
                      "meta-ads/effectiveness/colors/sync",
                      "POST",
                      {
                        tableId,
                        revision: config.revision,
                        sourceTableId: source,
                        sourceRevision: preview.revision,
                      },
                    );
                    setConfig(v);
                    onRules(v.rules);
                    setPreview(null);
                  } catch (e) {
                    onError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sincronizar colores ahora
              </button>
              <button disabled={busy} onClick={() => setPreview(null)}>
                Cancelar
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
