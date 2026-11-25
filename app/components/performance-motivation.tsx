import { AdvisorProgressIllustration } from "./advisor-progress-illustration";
import {
  advisorGoalStatus,
  advisorPerformanceTrend,
} from "../../lib/meta-ads/advisor-motivation";

type GoalStatus = ReturnType<typeof advisorGoalStatus>;

const messages: Record<GoalStatus, string> = {
  met: "¡Meta alcanzada!",
  close: "Estás cerca de tu meta",
  progress: "Sigue avanzando hacia tu meta",
  pending: "Pendiente de datos completos",
  unset: "Meta sin definir",
};
const format = (value: number) =>
  value.toLocaleString("es-PE", { maximumFractionDigits: 2 });

export function PerformanceMotivation({
  percent,
  effectivenessTarget,
  partial,
  salesTarget,
  salesStatus,
  previous,
}: {
  percent: number | null;
  effectivenessTarget: number | null;
  partial: boolean;
  salesTarget: number | null;
  salesStatus: GoalStatus;
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
  return (
    <section className="advisor-goals" aria-label="Metas del día">
      <h4>Metas del día</h4>
      <div className="advisor-goals-grid">
        {goals.map(({ kind, label, target, suffix, status }) => (
          <div className="advisor-goal" data-state={status} key={kind}>
            <AdvisorProgressIllustration kind={kind} state={status} />
            <div>
              <span>{label}</span>
              <strong>{target === null ? "—" : format(target) + suffix}</strong>
              <p>{messages[status]}</p>
              {kind === "effectiveness" &&
                status === "close" &&
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
