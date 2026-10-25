"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { sheetMetrics } from "../../lib/meta-ads/period-summary";
type Summary = {
  aliasesAdded: number;
  rowsAdded: number;
  cells: number;
  unmatched: number;
  missing: number;
  skippedCountry: number;
};
type Preview = {
  token: string;
  summary: Summary;
  sourceName: string;
  targetName: string;
};
const options = [{ key: "alias", name: "Alias", label: "A" }, ...sheetMetrics];
export function EffectivenessSync({
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
  const [source, setSource] = useState(""),
    [columns, setColumns] = useState<string[]>(["alias"]),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [last, setLast] = useState<string | null>(null),
    [success, setSuccess] = useState(false);
  const signature = JSON.stringify([tableId, source, columns, since, until]);
  const [reviewSignature, setReviewSignature] = useState("");
  const currentPreview = signature === reviewSignature ? preview : null;
  useEffect(() => {
    let active = true;
    void api("meta-ads/effectiveness/sync?" + new URLSearchParams({ tableId }))
      .then((v) => {
        if (active && v) {
          setSource(v.sourceTableId);
          setColumns(v.columns);
          setLast(v.lastSyncAt);
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
  }, [tableId]);
  const run = async (apply = false) => {
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const body = { tableId, sourceTableId: source, since, until, columns };
      if (!apply) {
        const result = await api(
          "meta-ads/effectiveness/sync/preview",
          "POST",
          body,
        );
        setPreview(result);
        setReviewSignature(signature);
      } else {
        const result = await api("meta-ads/effectiveness/sync", "POST", {
          ...body,
          token: currentPreview!.token,
        });
        setPreview(null);
        setLast(result.lastSyncAt);
        setSuccess(true);
        setMessage(
          `Sincronización completada: ${result.summary.cells} celdas y ${result.summary.aliasesAdded} alias nuevos.`,
        );
        try {
          await onSynced();
        } catch {
          setMessage(
            "Sincronización guardada. No se pudo recargar la hoja; actualiza la página antes de continuar.",
          );
        }
      }
    } catch (e) {
      setPreview(null);
      setMessage(e instanceof Error ? e.message : "No se pudo sincronizar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sheet-sync-panel" aria-label="Sincronizador de tablas">
      <div className="sheet-sync-heading">
        <strong>Sincronizar columnas</strong>
        <span>
          Dentro de Efectividad · {since} — {until}
        </span>
      </div>
      <fieldset className="sheet-sync-route" disabled={busy || loading}>
        <label className="sheet-sync-origin">
          <small>1 · HOJA DE ORIGEN</small>
          <SheetSearchSelect
            label="Hoja de origen de sincronización"
            value={source}
            options={tables
              .filter((t) => t.id !== tableId)
              .map((t) => ({ value: t.id, label: t.name }))}
            placeholder="Elegir tabla de origen"
            onSelect={(v) => {
              setSource(v);
              setPreview(null);
              setMessage("");
              setSuccess(false);
            }}
          />
        </label>
        <span className="sheet-sync-arrow" aria-hidden="true">
          →
        </span>
        <div className="sheet-sync-destination">
          <small>2 · HOJA DE DESTINO</small>
          <b>{tables.find((t) => t.id === tableId)?.name}</b>
        </div>
      </fieldset>
      <fieldset disabled={busy || loading}>
        <legend>3 · Columnas que quieres sincronizar</legend>
        <div className="sheet-sync-columns">
          {options.map((m) => (
            <label
              key={m.key}
              className={columns.includes(m.key) ? "is-selected" : ""}
            >
              <input
                type="checkbox"
                checked={columns.includes(m.key)}
                onChange={(e) => {
                  setColumns((old) =>
                    e.target.checked
                      ? [...old, m.key]
                      : old.filter((k) => k !== m.key),
                  );
                  setPreview(null);
                  setMessage("");
                  setSuccess(false);
                }}
              />
              <span>
                {m.name} ({m.label}) <i aria-hidden="true">→</i> {m.name} (
                {m.label})
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p>
        Coincidencia exacta de alias + país + fecha. Las monedas se convierten
        con la tasa de cada día. «Alias» añade los nombres y países del origen
        sin borrar los existentes. Las celdas elegidas con datos reemplazarán la
        vista del destino; los vacíos del origen no borran datos. No cambia Meta
        Ads.
      </p>
      <p className="sheet-sync-timing">
        Se actualiza al pulsar «Sincronizar ahora».{" "}
        {last
          ? "Última sincronización: " +
            new Date(last).toLocaleString("es-PE", {
              timeZone: "America/Lima",
            }) +
            " · Lima."
          : "Todavía no se ha sincronizado esta tabla."}
      </p>
      <div className="row">
        <button
          disabled={busy || loading || !source || !columns.length}
          onClick={() => void run()}
        >
          {busy ? "Procesando…" : "Revisar sincronización"}
        </button>
      </div>
      {currentPreview && (
        <div className="sheet-sync-preview" aria-live="polite">
          <strong>
            {currentPreview.sourceName} → {currentPreview.targetName}
          </strong>
          <div className="sheet-sync-counts">
            <span>
              <b>{currentPreview.summary.aliasesAdded}</b> alias nuevos
            </span>
            <span>
              <b>{currentPreview.summary.rowsAdded}</b> filas nuevas
            </span>
            <span>
              <b>{currentPreview.summary.cells}</b> celdas con datos
            </span>
          </div>
          <small>
            {currentPreview.summary.unmatched} filas sin coincidencia ·{" "}
            {currentPreview.summary.missing} celdas sin dato/tasa ·{" "}
            {currentPreview.summary.skippedCountry} filas sin país. Se omiten y
            se conservan los datos del destino.
          </small>
          <button
            className="primary"
            disabled={
              busy ||
              (!currentPreview.summary.cells &&
                !currentPreview.summary.aliasesAdded &&
                !currentPreview.summary.rowsAdded)
            }
            onClick={() => void run(true)}
          >
            Sincronizar ahora
          </button>
        </div>
      )}
      {message && (
        <p
          role="status"
          className={success ? "sheet-sync-success" : "sheet-sync-error"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
