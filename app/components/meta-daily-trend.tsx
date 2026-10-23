"use client";
import { dailyTrend, type TrendDay } from "../../lib/meta-ads/daily-trend";
const labels = {
  improving: "Mejora sostenida",
  deteriorating: "Deterioro sostenido · posible desgaste",
  stable: "Rendimiento estable",
  mixed: "Sin una tendencia concluyente",
  observing: "En observación",
  partial: "Lectura parcial del histórico",
  "no-results": "Gasto reciente sin resultados",
  "no-spend": "Sin gasto reciente",
};
export function MetaDailyTrend({
  rows,
  since,
  until,
  today,
  currency,
  metricName,
}: {
  rows: TrendDay[];
  since: string;
  until: string;
  today: string;
  currency: string;
  metricName: string;
}) {
  const t = dailyTrend(rows, since, until, today);
  const money = (n: number | null) =>
    n === null
      ? "Sin costo calculable"
      : new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(
          n,
        );
  const pct = (n: number) =>
    `${n > 0 ? "+" : ""}${(n * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
  const date = (d: string) =>
    new Date(d + "T12:00:00Z").toLocaleDateString("es-PE", { timeZone: "UTC" });
  const reading =
    t.status === "improving"
      ? "El costo bajó de forma consistente en ambas partes del periodo reciente y el intervalo estimado respalda una mejora de eficiencia."
      : t.status === "deteriorating"
        ? "El costo subió de forma consistente en ambas partes del periodo reciente y el intervalo estimado respalda una pérdida de eficiencia. Es compatible con desgaste, pero estos datos por sí solos no demuestran fatiga creativa."
        : t.status === "stable"
          ? "El costo varió como máximo un 10% y el intervalo estimado se mantiene dentro de ±20%: el rendimiento observado es estable."
          : t.status === "partial"
            ? "Faltan registros comparables dentro del rango elegido. Las cifras describen los días importados; no se interpretan los huecos como ceros ni se confirma mejora o desgaste."
            : t.status === "no-results"
              ? "Se registró gasto, pero ningún resultado reciente. El costo por resultado no es cero: no puede calcularse. Hay una señal de atención, sin atribuir automáticamente el motivo a desgaste."
              : t.status === "no-spend"
                ? "No hubo gasto en los días recientes registrados. Esto no permite evaluar deterioro por entrega ni significa que la publicidad esté desactivada."
                : t.status === "observing"
                  ? "Se muestran las cifras reales disponibles, pero la muestra todavía no permite confirmar una tendencia sostenida con este modelo."
                  : "La variación puede ser puntual o irregular: no cumple simultáneamente los criterios de magnitud, incertidumbre y continuidad para confirmar mejora o deterioro.";
  return (
    <section
      className={`meta-trend meta-trend-${t.status}`}
      aria-label="Interpretación estadística del histórico"
    >
      <div className="meta-trend-heading">
        <h3>Interpretación del histórico</h3>
        <strong>{labels[t.status]}</strong>
      </div>
      <p className="hint">
        {t.window > 0
          ? `Comparación de días cerrados hasta ${date(t.end)} · ${t.window} días frente a ${t.window} anteriores.`
          : "El rango elegido no contiene dos periodos de días cerrados."}{" "}
        {t.excludedToday &&
          "Hoy queda fuera del diagnóstico porque está incompleto."}{" "}
        {!t.weekdaysMatched &&
          t.window > 0 &&
          "Rango corto: no controla el efecto del día de la semana."}
      </p>
      <p>{reading}</p>
      {t.window > 0 && (
        <div className="meta-trend-comparison">
          {(
            [
              ["Anterior", t.previous],
              ["Reciente", t.recent],
            ] as const
          ).map(([label, w]) => {
            const period = w;
            return (
              <div key={label}>
                <strong>
                  {label} · {date(period.start)} – {date(period.end)}
                </strong>
                <span>
                  Costo: <b>{money(period.cost)}</b> · Gasto:{" "}
                  {period.days ? money(period.spend) : "Sin registros"}
                </span>
                <span>
                  {period.days
                    ? `${period.results.toLocaleString("es-PE")} resultados`
                    : "Resultados sin registros"}{" "}
                  · {period.days}/{period.expected} días registrados
                </span>
              </div>
            );
          })}
        </div>
      )}
      {t.change !== null && (
        <p>
          <b>Cambio del costo: {pct(t.change)}.</b>
          {t.resultChange !== null &&
            ` Resultados por día registrado: ${pct(t.resultChange)}.`}
          {t.spendChange !== null && ` Gasto: ${pct(t.spendChange)}.`}{" "}
          {t.spendChange !== null &&
          t.spendChange < -0.2 &&
          t.resultChange !== null &&
          t.resultChange < 0
            ? "El menor volumen coincide con menor gasto; por sí solo no demuestra desgaste."
            : ""}
        </p>
      )}
      {t.historical.days > 0 && (
        <p className="hint">
          Referencia histórica anterior al periodo reciente:{" "}
          {money(t.historical.cost)} por resultado ·{" "}
          {t.historical.results.toLocaleString("es-PE")} resultados ·{" "}
          {t.historical.days}/{t.historical.expected} días registrados, desde{" "}
          {date(t.historical.start)}. Solo histórico del objeto abierto.
        </p>
      )}
      <details>
        <summary>Ver cálculo y evidencia estadística</summary>
        <div className="stack">
          <p>
            Variable analizada: costo por resultado y {metricName.toLowerCase()}
            . Costo = suma del gasto ÷ suma de resultados; no se promedian
            costos diarios. Cambio = (costo reciente ÷ costo anterior − 1) ×
            100.
          </p>
          <p>
            Se comparan {t.window} días de calendario contra los {t.window}{" "}
            anteriores, sin solapamiento, dentro del rango elegido.{" "}
            {t.weekdaysMatched
              ? "Ventanas de siete días con los mismos días de la semana."
              : "El rango es corto: los días de la semana no quedan emparejados."}{" "}
            {t.excludedToday
              ? "Se excluye hoy porque todavía está incompleto."
              : "Se usan días cerrados."}{" "}
            Fin analizado: {date(t.end)}.
          </p>
          <p>
            Para clasificar: mínimo {t.config.minimumDays} días con gasto y{" "}
            {t.config.minimumResults} resultados por ventana, registros en todos
            sus días; cambio de al menos {t.config.materialChange * 100}% y las
            dos mitades recientes frente a sus mitades anteriores comparables en
            la misma dirección (al menos {t.config.persistenceChange * 100}% y
            tres resultados cada una).
          </p>
          <p>
            {t.interval
              ? `Intervalo orientativo del 95% para el cambio de costo: ${pct(t.interval[0])} a ${pct(t.interval[1])}.`
              : "Intervalo no estimable con la muestra comparable actual."}{" "}
            Bootstrap pareado por bloques consecutivos de dos días,{" "}
            {t.config.samples} remuestras y semilla fija. Se amplía con un
            intervalo logarítmico de conteos (error estándar = √(1/resultados
            anteriores + 1/resultados recientes)), bajo una aproximación Poisson
            con gasto como exposición. Así, costos diarios idénticos no producen
            falsa incertidumbre cero. No es una probabilidad calibrada de
            desgaste. Para mejora/deterioro el intervalo debe excluir cero. Es
            una estimación exploratoria: pocos días, dependencia temporal y
            cambios de presupuesto o audiencia limitan su precisión; no predice
            ni garantiza el siguiente día.
          </p>
          <p>
            Solo registros diarios guardados del rango. La presencia de un día
            no acredita que la importación de esa cuenta haya terminado; no se
            deduce la causa de la tendencia ni se cambia el estado publicitario.
          </p>
        </div>
      </details>
    </section>
  );
}
