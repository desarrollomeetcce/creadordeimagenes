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
        <b>B</b> Base
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
        <b>GM</b> Gasto manual
      </span>
    </span>
  );
}
