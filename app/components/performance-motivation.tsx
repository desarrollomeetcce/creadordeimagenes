import { AdvisorProgressIllustration } from "./advisor-progress-illustration";
import {
  advisorGoalStatus,
  advisorPerformanceTrend,
} from "../../lib/meta-ads/advisor-motivation";

type GoalStatus = ReturnType<typeof advisorGoalStatus>;

const messages: Record<GoalStatus, string> = {
  met: "¡Meta alcanzada!",
  close: "Estás cerca de tu meta",
  progress: "La meta sigue por delante",
  pending: "Pendiente de datos completos",
  unset: "Meta sin definir",
};
const nextStep = {
  effectiveness: {
    met: "Identifica qué conversaciones avanzaron mejor y repite lo que funcionó.",
    progress:
      "Empieza por las conversaciones con interés y acuerda el próximo paso.",
  },
  sales: {
    met: "Buen trabajo. Deja programados los próximos seguimientos.",
    close:
      "Estás a una venta. Revisa qué conversación está más cerca de cerrar.",
    progress: "Prioriza los seguimientos con una decisión de compra pendiente.",
  },
} as const;
const format = (value: number) =>
  value.toLocaleString("es-PE", { maximumFractionDigits: 2 });

export function PerformanceMotivation({
  percent,
  effectivenessTarget,
  partial,
  salesTarget,
  salesStatus,
  salesRemaining,
  previous,
}: {
  percent: number | null;
  effectivenessTarget: number | null;
  partial: boolean;
  salesTarget: number | null;
  salesStatus: GoalStatus;
  salesRemaining?: number;
  previous?: { percent: number | null; partial: boolean };
}) {
  const effectivenessStatus = advisorGoalStatus(
    percent,
    effectivenessTarget,
    partial,
    0.5,
  );
  const trend = previous
    ? advisorPerformanceTrend(
        percent,
        previous.percent,
        partial,
        previous.partial,
      )
    : null;
  const goals = [
    {
      kind: "effectiveness",
      label: "Meta de efectividad",
      target: effectivenessTarget,
      suffix: " %",
      status: effectivenessStatus,
    },
    {
      kind: "sales",
      label: "Meta de ventas",
      target: salesTarget,
      suffix: "",
      status: salesStatus,
    },
  ] as const;
  const states = [effectivenessStatus, salesStatus];
  const message = states.every((state) => state === "met")
    ? "¡Alcanzaste las dos metas!"
    : states.includes("met")
      ? "¡Ya alcanzaste una meta!"
      : states.includes("close")
        ? "¡Ya casi llegas!"
        : states.includes("progress")
          ? "Cada seguimiento cuenta"
          : "Tus metas, paso a paso";
  return (
    <section className="advisor-goals" aria-label="Metas del día">
      <div className="advisor-goals-heading">
        <svg viewBox="0 0 70 70" aria-hidden="true" focusable="false">
          <path
            d="M35 10C48 9 59 20 59 34S49 59 35 60C21 60 10 49 10 35S21 10 35 10Z"
            fill="#ffd977"
            stroke="#a86123"
            strokeWidth="2.5"
          />
          <path
            d="M23 31q3-5 6-1m12 0q3-5 6 0M25 40q10 14 20-1"
            fill="none"
            stroke="#6b3c23"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M16 38h4m30 0h4"
            stroke="#ee885f"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m6 14 4 4m46-9-2 5m8 6 5-2M60 55l5 3"
            fill="none"
            stroke="#c7823e"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <div>
          <h4>Metas del día</h4>
          <strong>{message}</strong>
        </div>
      </div>
      <div className="advisor-goals-grid">
        {goals.map(({ kind, label, target, suffix, status }) => (
          <div className="advisor-goal" data-state={status} key={kind}>
            <AdvisorProgressIllustration kind={kind} state={status} />
            <div>
              <span>{label}</span>
              <strong>{target === null ? "—" : format(target) + suffix}</strong>
              <p>{messages[status]}</p>
              {(status === "met" || status === "progress") && (
                <small>{nextStep[kind][status]}</small>
              )}
              {kind === "sales" &&
                status === "close" &&
                salesRemaining === undefined && (
                  <small>{nextStep.sales.close}</small>
                )}
              {kind === "sales" &&
                salesRemaining !== undefined &&
                salesRemaining > 0 &&
                (status === "close" || status === "progress") && (
                  <small>
                    {salesRemaining === 1
                      ? "Te falta 1 venta."
                      : `Te faltan ${format(salesRemaining)} ventas.`}
                  </small>
                )}
              {kind === "effectiveness" &&
                (status === "close" || status === "progress") &&
                target !== null &&
                percent !== null && (
                  <small>
                    Faltan{" "}
                    {target - percent < 0.005
                      ? "menos de 0,01"
                      : format(target - percent)}{" "}
                    puntos porcentuales.
                  </small>
                )}
            </div>
          </div>
        ))}
      </div>
      {trend?.delta != null && trend.delta !== 0 && (
        <p className="hint">
          La efectividad {trend.delta > 0 ? "subió" : "bajó"}{" "}
          {format(Math.abs(trend.delta))} puntos porcentuales frente al día
          anterior.
        </p>
      )}
    </section>
  );
}
