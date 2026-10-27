"use client";
import { useState } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import {
  defaultDetailPeriods,
  detailPeriodPreset,
} from "../../lib/meta-ads/detail-period-presets";
export function DetailPeriodPresets({
  scope,
  onSelect,
}: {
  scope: string;
  onSelect: (since: string, until: string) => void;
}) {
  const [saved, setSaved] = useWorkbookPreference<string[]>(
    scope,
    "detail-periods",
    defaultDetailPeriods,
  );
  const [count, setCount] = useState("7"),
    [message, setMessage] = useState("");
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  return (
    <section className="detail-period-presets" aria-label="Períodos guardados">
      <strong className="detail-section-title detail-section-periods">
        Períodos guardados
      </strong>
      <div className="row">
        {saved.map((key) => {
          const preset = detailPeriodPreset(key, today());
          return preset ? (
            <span className="detail-period-chip" key={key}>
              <button
                type="button"
                onClick={() => {
                  const current = detailPeriodPreset(key, today())!;
                  onSelect(current.since, current.until);
                }}
              >
                {preset.label}
              </button>
              <button
                type="button"
                aria-label={`Quitar período ${preset.label}`}
                onClick={() => setSaved((old) => old.filter((v) => v !== key))}
              >
                ×
              </button>
            </span>
          ) : null;
        })}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const preset = detailPeriodPreset("days:" + count, today());
          if (!preset) {
            setMessage("Elige entre 1 y 3660 días.");
            return;
          }
          setSaved((old) => [...new Set([...old, "days:" + count])]);
          setMessage("Período guardado. Pulsa su botón para consultarlo.");
        }}
      >
        <label>
          Guardar últimos{" "}
          <input
            aria-label="Cantidad de días del período guardado"
            type="number"
            min="1"
            max="3660"
            required
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />{" "}
          días
        </label>
        <button type="submit">Guardar período</button>
        <button
          type="button"
          onClick={() => {
            setSaved(defaultDetailPeriods);
            setMessage("");
          }}
        >
          Restablecer accesos
        </button>
      </form>
      <small>
        Guardados en este navegador para esta vista. Se calculan hasta hoy al
        pulsarlos; al abrir se usa el período de la pestaña.
      </small>
      {message && <small role="status">{message}</small>}
    </section>
  );
}
