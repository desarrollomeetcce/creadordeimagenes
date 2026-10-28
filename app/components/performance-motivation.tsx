"use client";
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
        ? "Vamos paso a paso"
        : trend.kind === "steady"
          ? "¡Mantén la constancia!"
          : "Cada avance cuenta";
  const message =
    trend.kind === "improved"
      ? `Tu efectividad subió ${number(trend.delta!)} puntos porcentuales. Sigue construyendo ese avance.`
      : trend.kind === "declined"
        ? `Tu efectividad bajó ${number(Math.abs(trend.delta!))} puntos porcentuales. Revisa qué puedes ajustar y vuelve a intentarlo; un día no define tu desempeño.`
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
      <svg
        width="92"
        height="104"
        viewBox="0 0 92 104"
        aria-hidden="true"
        focusable="false"
      >
        <ellipse
          cx="44"
          cy="98"
          rx="28"
          ry="4"
          fill="currentColor"
          opacity=".1"
        />
        <path
          d="M34 77 30 96M53 77 59 96"
          stroke="#477293"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path d="M31 52Q44 46 57 52L60 80H28Z" fill="#7867bc" />
        <path
          d={
            trend.kind === "improved" || met
              ? "M31 57 20 45 16 27M56 57 68 45 75 28"
              : "M31 57 19 65 13 59M56 57 68 46 71 34"
          }
          fill="none"
          stroke="#c78b65"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="39" y="39" width="11" height="14" rx="5" fill="#c78b65" />
        <circle cx="44" cy="28" r="17" fill="#e0a27b" />
        <path
          d="M27 27Q24 8 44 9Q62 7 61 26L54 18Q44 25 29 20Z"
          fill="#3d394d"
        />
        <circle cx="38" cy="29" r="1.6" fill="#302c3a" />
        <circle cx="50" cy="29" r="1.6" fill="#302c3a" />
        <path
          d="M38 36Q44 42 50 36"
          fill="none"
          stroke="#854c42"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m77 6 2.8 6 6.5.8-4.8 4.5 1.2 6.5-5.7-3.2-5.8 3.2 1.2-6.5-4.7-4.5 6.5-.8Z"
          fill={trend.kind === "declined" ? "#dfa448" : "#39a891"}
        />
      </svg>
      <div>
        <h4>{title}</h4>
        <p>{message}</p>
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
