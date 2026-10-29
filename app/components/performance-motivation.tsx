"use client";
import { AdvisorProgressIllustration } from "./advisor-progress-illustration";
import { advisorPerformanceTrend } from "../../lib/meta-ads/advisor-motivation";
type Props = {
  percent: number | null;
  partial: boolean;
  basis: string;
  previousDay: string;
  previousPercent: number | null;
  previousPartial: boolean;
  goal: { percent: number } | null;
};
const number = (v: number) =>
  v.toLocaleString("es-PE", { maximumFractionDigits: 2 });
export function PerformanceMotivation({
  percent,
  partial,
  basis,
  previousDay,
  previousPercent,
  previousPartial,
  goal,
}: Props) {
  const trend = advisorPerformanceTrend(
      percent,
      previousPercent,
      partial,
      previousPartial,
    ),
    met =
      !partial && percent !== null && goal !== null && percent >= goal.percent;
  const title = met
    ? "¡Meta alcanzada!"
    : trend.kind === "improved"
      ? "¡Vas avanzando!"
      : trend.kind === "declined"
        ? "¡Puedes retomar el ritmo!"
        : trend.kind === "steady"
          ? "¡Mantén la constancia!"
          : "Cada avance cuenta";
  const message =
    trend.kind === "improved"
      ? `Tu efectividad subió ${number(trend.delta!)} puntos porcentuales. Sigue construyendo ese avance.`
      : trend.kind === "declined"
        ? `Tu efectividad bajó ${number(Math.abs(trend.delta!))} puntos porcentuales. Sigue esforzándote y revisa qué puedes ajustar; un día no define tu desempeño.`
        : trend.kind === "steady"
          ? "Tu efectividad se mantuvo. La constancia te ayuda a seguir avanzando."
          : "Cuando estén completos los registros de ambos días, podrás ver cómo evoluciona tu efectividad. Sigue sumando paso a paso.";
  return (
    <section
      className="performance-motivation"
      data-trend={trend.kind}
      aria-label="Ánimo y evolución del asesor"
      aria-live="polite"
    >
      <div className="performance-motivation-art">
        <AdvisorProgressIllustration trend={trend.kind} met={met} />
      </div>
      <div className="performance-motivation-copy">
        <div className="performance-motivation-heading">
          <span className="performance-motivation-eyebrow">
            TU PROGRESO, PASO A PASO
          </span>
          <span className="performance-motivation-badge">
            {trend.kind === "improved"
              ? "Mejorando"
              : trend.kind === "declined"
                ? "Un nuevo impulso"
                : trend.kind === "steady"
                  ? "Paso constante"
                  : "Comparación pendiente"}
          </span>
        </div>
        <h4>{title}</h4>
        <p>{message}</p>
        <p className="performance-motivation-next">
          <strong>{met ? "Sigue construyendo" : "Tu siguiente paso"}</strong>
          <span>
            {trend.kind === "declined"
              ? "Prioriza tus próximos contactos y retoma el ritmo, una conversación a la vez."
              : trend.kind === "improved"
                ? "Identifica qué te ayudó y mantén ese buen hábito en tus próximos contactos."
                : trend.kind === "steady"
                  ? "Prueba un pequeño ajuste en tus seguimientos: cada conversación es una oportunidad."
                  : "Completa tus registros. Así podrás reconocer tus avances con datos claros."}
          </span>
        </p>
        {trend.kind !== "pending" && previousPercent !== null && (
          <small>
            Comparación con {previousDay}: V/{basis} de{" "}
            {number(previousPercent)} % a {number(percent!)} %. Misma base de
            cálculo.
          </small>
        )}
        {trend.kind === "pending" && (
          <small>
            Se compara {basis} con {basis} del día anterior; no se mezclan BM y
            BC.
          </small>
        )}
      </div>
    </section>
  );
}
