"use client";
import { DetailSection } from "./detail-section";
import { useState } from "react";
import { useWorkbookPreference } from "./use-workbook-preference";
import { MetaDateRange } from "./meta-date-range";
import {
  defaultDetailPeriods,
  detailPeriodPreset,
  savedCalendarPeriod,
} from "../../lib/meta-ads/detail-period-presets";
export function DetailPeriodPresets({
  scope,
  sectionId,
  since,
  until,
  onSelect,
}: {
  scope: string;
  sectionId?: string;
  since: string;
  until: string;
  onSelect: (since: string, until: string) => void;
}) {
  const [saved, setSaved] = useWorkbookPreference<string[]>(
    scope,
    "detail-periods",
    defaultDetailPeriods,
  );
  const [message, setMessage] = useState("");
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const chip = (key: string) => {
    const preset = detailPeriodPreset(key, today());
    return preset ? (
      <span className="detail-period-chip" key={key}>
        <button
          type="button"
          onClick={() => {
            const p = detailPeriodPreset(key, today())!;
            onSelect(p.since, p.until);
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
  };
  return (
    <DetailSection
      id={sectionId}
      stateKey="periods"
      title="Períodos guardados"
      tone="periods"
      className="detail-period-presets"
    >
      <div className="row detail-period-accesses">
        {defaultDetailPeriods
          .filter((key) => key !== "last-month" && saved.includes(key))
          .map(chip)}
        <div className="detail-period-add-group">
          {saved.includes("last-month") && chip("last-month")}
          <MetaDateRange
            from={since}
            to={until}
            maxDays={3660}
            triggerLabel="+"
            triggerAriaLabel="Añadir período guardado"
            applyLabel="Guardar período"
            onChange={(a, b, preset) => {
              const key = savedCalendarPeriod(a, b, preset, today());
              if (!key) {
                setMessage(
                  "Elige un período válido de hasta diez años, sin fechas futuras.",
                );
                return;
              }
              setSaved((old) => [...new Set([...old, key])].slice(-100));
              setMessage("Período guardado. Pulsa su acceso para consultarlo.");
            }}
          />
        </div>
        {saved.filter((key) => !defaultDetailPeriods.includes(key)).map(chip)}
        <button
          type="button"
          className="detail-period-reset"
          aria-label="Restablecer accesos de períodos"
          title="Restablecer accesos"
          onClick={() => {
            setSaved(defaultDetailPeriods);
            setMessage("");
          }}
        >
          ↺
        </button>
      </div>
      <small>
        Los accesos rápidos se calculan al pulsarlos. Los rangos personalizados
        conservan sus fechas. Guardados en este navegador para este asesor.
      </small>
      {message && <small role="status">{message}</small>}
    </DetailSection>
  );
}
