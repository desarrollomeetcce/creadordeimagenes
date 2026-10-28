import { SheetDataFillBadge } from "./sheet-data-fill-badge";
/** Shared legend in the workspace header, above the sheet controls. */
export function EffectivenessLegend() {
  return (
    <span className="sheet-legend" aria-label="Leyenda de parámetros">
      <span>
        <b>V</b> Ventas
      </span>
      <span>
        <b>P</b> Presupuesto
      </span>
      <span>
        <b>B</b> Base (Meta Ads)
      </span>
      <span>
        <b>G</b> Gasto
      </span>
      <span>
        <b>CF</b> Costos fijos
      </span>
      <span>
        <b>BM</b> Base manual
      </span>
      <span>
        <b>BC</b> Base por contactar
      </span>
      <span>
        <b>GM</b> Gasto manual
      </span>
      <span
        className="sheet-fill-legend"
        role="group"
        aria-label="Guía de colores de los datos"
      >
        <span>
          <SheetDataFillBadge kind="automatic" /> Automático / recibido
        </span>
        <span>
          <SheetDataFillBadge kind="manual" /> Manual · mismo día
        </span>
        <span>
          <SheetDataFillBadge kind="next-day" /> Manual · día siguiente (BM y
          GM)
        </span>
      </span>
      <span className="sheet-fill-timing-note">
        BC se registra el mismo día. BM y GM se completan al día siguiente, para
        la fecha correspondiente.
      </span>
    </span>
  );
}
