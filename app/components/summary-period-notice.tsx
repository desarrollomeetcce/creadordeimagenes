"use client";
import {
  summaryPeriod,
  type SummaryView,
} from "../../lib/meta-ads/summary-period";
const date = (d: string) => d.split("-").reverse().join("/");
export function SummaryPeriodNotice({
  days,
  view,
  today,
}: {
  days: string[];
  view: SummaryView;
  today: string;
}) {
  if (view !== "today" && view !== "yesterday") return null;
  const period = summaryPeriod(days, view, today);
  return (
    <div
      className="summary-cutoff-note"
      data-summary-view={view}
      data-cutoff={period.end ?? period.cutoff}
      role="note"
    >
      <strong>
        {view === "yesterday"
          ? period.end
            ? `Datos de días completos hasta el ${date(period.end)}`
            : "No hay días completos en el período seleccionado"
          : period.end
            ? `Resumen del período hasta el ${date(period.end)}`
            : "No hay fechas disponibles para este resumen"}
      </strong>
      <span>
        {view === "yesterday"
          ? `No incluye el ${date(today)}: aún no han terminado sus 24 horas. El límite de días completos es el ${date(period.cutoff)}.`
          : period.days.includes(today)
            ? `Incluye las ventas y la base por contactar provisionales del ${date(today)}.`
            : "Incluye las fechas elegidas hasta hoy; no incluye fechas futuras."}{" "}
        Las tablas y los históricos conservan todo el período; los datos
        faltantes se muestran como —.
      </span>
    </div>
  );
}
