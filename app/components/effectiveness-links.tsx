"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import {
  sheetMetrics,
  type SheetMetric,
} from "../../lib/meta-ads/period-summary";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
type Config = {
  sourceTableId: string;
  columns: SheetMetric[];
  since: string | null;
  until: string | null;
  source: { name: string };
};
type Review = {
  token: string;
  sourceName: string;
  targetName: string;
  summary: {
    matched?: number;
    unmatched?: number;
    columns?: number;
    rows?: number;
    days?: number;
    cells?: number;
  };
};
export function EffectivenessLinks({
  tableId,
  tables,
  since,
  until,
  onSynced,
}: {
  tableId: string;
  tables: { id: string; name: string }[];
  since: string;
  until: string;
  onSynced: () => Promise<void>;
}) {
  const [config, setConfig] = useState<Config | null>(null),
    [source, setSource] = useState(""),
    [columns, setColumns] = useState<SheetMetric[]>(["sales"]),
    [scope, setScope] = useState<"all" | "period">("all"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [reviewKind, setReviewKind] = useState<"link" | "unlink">("link"),
    [reviewSignature, setReviewSignature] = useState(""),
    [reload, setReload] = useState(0);
  const pending = useRef(false),
    signature = JSON.stringify([tableId, source, columns, scope, since, until]),
    current = reviewSignature === signature ? review : null;
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api("meta-ads/effectiveness/links?" + new URLSearchParams({ tableId }))
      .then((v: Config | null) => {
        if (!active) return;
        setConfig(v);
        if (v) {
          setSource(v.sourceTableId);
          setColumns(v.columns);
          setScope(v.since ? "period" : "all");
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tableId, reload]);
  const run = async (action: "review" | "link" | "reviewUnlink" | "unlink") => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    let saved = false;
    try {
      if (action === "review" || action === "reviewUnlink") {
        const unlink = action === "reviewUnlink";
        const v = await api(
          "meta-ads/effectiveness/links/" +
            (unlink ? "unlink-preview" : "preview"),
          "POST",
          unlink
            ? { tableId }
            : { tableId, sourceTableId: source, columns, scope, since, until },
        );
        setReview(v);
        setReviewKind(unlink ? "unlink" : "link");
        setReviewSignature(signature);
      } else {
        if (!current) throw Error("Revisa los datos antes de continuar.");
        const v = await api(
          "meta-ads/effectiveness/links",
          action === "link" ? "POST" : "DELETE",
          action === "link"
            ? {
                tableId,
                sourceTableId: source,
                columns,
                scope,
                since,
                until,
                token: current.token,
              }
            : { tableId, token: current.token },
        );
        saved = true;
        setReview(null);
        setConfig(action === "link" ? v : null);
        notifyAdvisorSalesChanged();
        setMessage(
          action === "link"
            ? "Columnas vinculadas. Los cambios del origen se reflejarán automáticamente."
            : "Columnas desvinculadas. Se conservaron sus últimos valores y ahora puedes editarlos aquí.",
        );
        await onSynced();
      }
    } catch (e) {
      setReview(null);
      setMessage(
        saved
          ? "El cambio se guardó, pero no se pudo recargar la hoja. Actualiza la página antes de continuar."
          : e instanceof Error
            ? e.message
            : "No se pudo actualizar la vinculación.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const invalidate = () => {
    setReview(null);
    setMessage("");
  };
  return (
    <section
      className="sheet-column-links"
      aria-label="Vinculación automática de columnas"
    >
      <h3>Vincular columnas</h3>
      <p>
        El destino muestra los valores del origen para el mismo nombre exacto de
        inventario, país y fecha. Las cifras vinculadas se editan en el origen.
        No cambia Meta Ads.
      </p>
      {config && (
        <p className="sheet-link-status" role="status">
          Vinculación activa desde «{config.source.name}»:{" "}
          {config.columns
            .map((m) => sheetMetrics.find((x) => x.key === m)?.name)
            .join(", ")}
          .{" "}
          {config.since
            ? `${config.since} — ${config.until}`
            : "Todas las fechas"}
          . Para cambiar el origen o las columnas, desvincula primero.
        </p>
      )}
      <fieldset disabled={busy || loading || !!config}>
        <legend>Origen de los datos</legend>
        <SheetSearchSelect
          label="Hoja de origen de vinculación"
          value={source}
          options={tables
            .filter((t) => t.id !== tableId)
            .map((t) => ({ value: t.id, label: t.name }))}
          placeholder="Elegir hoja de origen"
          onSelect={(v) => {
            setSource(v);
            invalidate();
          }}
        />
        <div className="sheet-sync-columns">
          {sheetMetrics.map((m) => (
            <label
              key={m.key}
              className={columns.includes(m.key) ? "is-selected" : ""}
            >
              <input
                type="checkbox"
                checked={columns.includes(m.key)}
                onChange={(e) => {
                  setColumns((v) =>
                    e.target.checked
                      ? [...v, m.key]
                      : v.filter((x) => x !== m.key),
                  );
                  invalidate();
                }}
              />
              {m.name} ({m.label})
            </label>
          ))}
        </div>
        <div className="row sheet-link-scope">
          <label>
            <input
              type="radio"
              name={"link-scope-" + tableId}
              checked={scope === "all"}
              onChange={() => {
                setScope("all");
                invalidate();
              }}
            />
            Todas las fechas, incluidas las nuevas
          </label>
          <label>
            <input
              type="radio"
              name={"link-scope-" + tableId}
              checked={scope === "period"}
              onChange={() => {
                setScope("period");
                invalidate();
              }}
            />
            Solo {config?.since ?? since} — {config?.until ?? until}
          </label>
        </div>
      </fieldset>
      <p className="sheet-link-explanation">
        Las filas deben existir en ambas hojas. Sin coincidencia, la columna
        vinculada muestra —; un vacío del origen también se refleja como vacío.
        Las monedas se convierten con la tasa de cada fecha. Si incluyes origen
        y destino en un resumen, se cuentan ambas hojas. Actualización
        automática al abrir, al recibir cambios de otras pestañas y cada 30
        segundos mientras la vista está abierta.
      </p>
      <div className="row">
        <button
          disabled={
            busy || loading || (!config && (!source || !columns.length))
          }
          onClick={() => void run(config ? "reviewUnlink" : "review")}
        >
          {busy
            ? "Revisando…"
            : config
              ? "Revisar desvinculación"
              : "Revisar vinculación"}
        </button>
        <button
          disabled={busy || loading}
          onClick={() => {
            invalidate();
            setReload((n) => n + 1);
          }}
        >
          Recargar vinculación
        </button>
      </div>
      {current && (
        <div className="sheet-sync-preview" aria-live="polite">
          <strong>
            {current.sourceName} → {current.targetName}
          </strong>
          {reviewKind === "link" ? (
            <p>
              {current.summary.matched} filas coincidentes ·{" "}
              {current.summary.unmatched} sin coincidencia ·{" "}
              {current.summary.columns} columnas. Las columnas elegidas pasarán
              a mostrar el origen; los datos independientes anteriores se
              conservan debajo de la vinculación.
            </p>
          ) : (
            <p>
              Se conservarán los valores visibles de {current.summary.cells}{" "}
              celdas en {current.summary.days} fechas de todo el alcance
              vinculado. Después dejarán de recibir cambios del origen.
            </p>
          )}
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(reviewKind === "link" ? "link" : "unlink")}
          >
            {reviewKind === "link"
              ? "Vincular y actualizar automáticamente"
              : "Desvincular y conservar valores"}
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
