import {
  AdvisorOverallIllustration,
  AdvisorProgressIllustration,
} from "./advisor-progress-illustration";
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
    (effectivenessTarget ?? 0) * 0.15,
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
  const progress =
    percent !== null &&
    effectivenessTarget !== null &&
    effectivenessTarget > 0 &&
    !partial
      ? percent / effectivenessTarget
      : null;
  const stage =
    effectivenessStatus === "met"
      ? "goal"
      : progress === null
        ? "pending"
        : progress >= 0.85
          ? "near"
          : trend?.delta != null &&
              effectivenessTarget !== null &&
              trend.delta <= -effectivenessTarget * 0.2
            ? "decline"
            : progress >= 0.5
              ? "half"
              : "start";
  const headline = {
    goal: "¡Meta de efectividad alcanzada!",
    near: "Vas en buen camino",
    half: "Ya vas por la mitad de tu meta",
    decline: "¿Qué cambió en tu jornada?",
    start: "Cada seguimiento cuenta",
    pending: "Tus metas, paso a paso",
  }[stage];
  return (
    <section className="advisor-goals" aria-label="Metas del día">
      <div className="advisor-goals-heading" data-stage={stage}>
        <AdvisorOverallIllustration stage={stage} />
        <div>
          <h4>Avance de efectividad</h4>
          <strong>{headline}</strong>
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
          {stage === "decline" &&
            "Revisa qué conversaciones quedaron pendientes. "}
          La efectividad {trend.delta > 0 ? "subió" : "bajó"}{" "}
          {format(Math.abs(trend.delta))} puntos porcentuales frente al día
          anterior.
        </p>
      )}
    </section>
  );
}
