"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
type Support = {
  id: string;
  advisorId: string;
  name: string;
  commercialRole: string;
  since: string;
  until: string;
  cancelledAt: string | null;
  revision: number;
};
type Review = {
  sales: number | null;
  rowRevision: number;
  advisorId: string | null;
  token: string;
  supports: Support[];
  metaHistoryMode: string;
  metaHistorySince: string | null;
  firstAssignmentDay: string | null;
  changes: {
    id: string;
    advisorId: string | null;
    previousAdvisorId: string | null;
    effectiveAt: string;
    mode: string;
    cutoffSales: number | null;
  }[];
};
export function AdvisorAssignment({
  aliasId,
  country,
  name,
  advisorId,
  revision,
  advisors,
  onClose,
  onSave,
  onRefresh,
  initial = false,
  manage = false,
}: {
  aliasId: string;
  country: string;
  name: string;
  advisorId: string | null;
  revision: number;
  advisors: { id: string; name: string; label?: string }[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
  onRefresh?: () => Promise<void>;
  initial?: boolean;
  manage?: boolean;
}) {
  const local = new Date(Date.now() - 5 * 3600000).toISOString(),
    today = local.slice(0, 10),
    dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(advisorId),
    [kind, setKind] = useState<"DEFINITIVE" | "TEMPORARY" | "">(
      initial || manage ? "DEFINITIVE" : "",
    ),
    [day, setDay] = useState(today),
    [until, setUntil] = useState(today),
    [time, setTime] = useState(local.slice(11, 16)),
    [mode, setMode] = useState<"DAY" | "CLOCK">(initial ? "DAY" : "CLOCK"),
    [review, setReview] = useState<Review | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [historyMode, setHistoryMode] = useState("ALL"),
    [historySince, setHistorySince] = useState(today),
    [historyDirty, setHistoryDirty] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setReview(null);
    setMessage("");
    if (initial) {
      setReview({
        sales: 0,
        rowRevision: revision,
        advisorId: null,
        token: "",
        supports: [],
        metaHistoryMode: "ALL",
        metaHistorySince: null,
        firstAssignmentDay: null,
        changes: [],
      });
      return;
    }
    void api(
      "meta-ads/effectiveness/advisor-review?" +
        new URLSearchParams({ aliasId, country, day }),
    )
      .then((v: Review) => {
        if (active) {
          setReview(v);
          if (!historyDirty) {
            setHistoryMode(v.metaHistoryMode);
            setHistorySince(
              v.metaHistorySince ?? v.firstAssignmentDay ?? today,
            );
          }
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [aliasId, country, day, version, initial, revision]);
  const label = (id: string | null) =>
    advisors.find((a) => a.id === id)?.label ??
    advisors.find((a) => a.id === id)?.name ??
    "Sin asesor";
  const currentRevision = review?.rowRevision ?? revision;
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-assignment"
      aria-label="Asignar asesor con fecha de inicio"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <h2>
          {initial
            ? "Inicio del asesor"
            : manage
              ? "Titular y apoyos"
              : "Asignar asesor"}
        </h2>
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </header>
      <p>
        <b>
          {name} · {country || "Sin país"}
        </b>
      </p>
      {!initial && (
        <div className="advisor-assignment-current">
          <small>Asesor titular</small>
          <strong>{review ? label(review.advisorId) : "…"}</strong>
          <span>
            Conserva la base y el gasto durante los apoyos temporales.
          </span>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!review || !kind) return;
          setBusy(true);
          setMessage("");
          try {
            if (kind === "TEMPORARY") {
              await api("meta-ads/effectiveness/advisor-support", "POST", {
                aliasId,
                country,
                advisorId: target,
                revision: currentRevision,
                since: day,
                until,
              });
              await onRefresh?.();
            } else
              await onSave({
                aliasId,
                country,
                advisorId: target,
                revision: currentRevision,
                day,
                mode,
                ...(mode === "CLOCK" ? { time } : {}),
                ...(!initial && historyDirty
                  ? {
                      metaHistoryMode: historyMode,
                      ...(historyMode === "CUSTOM"
                        ? { metaHistorySince: historySince }
                        : {}),
                    }
                  : {}),
              });
            onClose();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "No se pudo guardar.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          {!initial && (
            <>
              <legend>¿Qué necesitas hacer?</legend>
              <div className="advisor-assignment-kinds">
                <label>
                  <input
                    type="radio"
                    name="advisor-change-kind"
                    checked={kind === "TEMPORARY"}
                    disabled={!review?.advisorId}
                    onChange={() => setKind("TEMPORARY")}
                  />
                  <span>
                    <b>Apoyo temporal</b>
                    <small>
                      Vende durante la ausencia. La base sigue con el titular.
                    </small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="advisor-change-kind"
                    checked={kind === "DEFINITIVE"}
                    onChange={() => setKind("DEFINITIVE")}
                  />
                  <span>
                    <b>Cambio definitivo</b>
                    <small>
                      Asume la responsabilidad desde la fecha elegida.
                    </small>
                  </span>
                </label>
              </div>
            </>
          )}
          {manage && (
            <label>
              Persona
              <select
                value={target ?? ""}
                onChange={(e) => {
                  setTarget(e.target.value || null);
                  setKind("");
                }}
              >
                <option value="">Sin asesor</option>
                {advisors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ?? a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!manage && (
            <p>
              {kind === "TEMPORARY" ? "Apoyará: " : "Nuevo titular: "}
              <b>{label(target)}</b>
            </p>
          )}
          <div className="row">
            <label>
              {kind === "TEMPORARY" ? "Desde" : "Fecha de inicio (Lima)"}
              <input
                type="date"
                required
                value={day}
                max={kind === "DEFINITIVE" ? today : undefined}
                onChange={(e) => {
                  setDay(e.target.value);
                  if (until < e.target.value) setUntil(e.target.value);
                }}
              />
            </label>
            {kind === "TEMPORARY" && (
              <label>
                Hasta · incluido
                <input
                  type="date"
                  required
                  value={until}
                  min={day}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
            )}
          </div>
          {kind === "DEFINITIVE" && (
            <>
              <div className="row assignment-modes">
                <label>
                  <input
                    type="radio"
                    name="assignment-mode"
                    checked={mode === "DAY"}
                    onChange={() => setMode("DAY")}
                  />
                  Todo el día · desde las 00:00
                </label>
                <label>
                  <input
                    type="radio"
                    name="assignment-mode"
                    checked={mode === "CLOCK"}
                    onChange={() => setMode("CLOCK")}
                  />
                  Desde una hora
                </label>
              </div>
              {mode === "CLOCK" && (
                <label>
                  Hora del cambio (Lima)
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                  />
                </label>
              )}
              {!initial && (
                <details className="advisor-meta-origin">
                  <summary>Inicio del histórico Meta</summary>
                  <p>
                    Solo ajusta los informes del asesor inicial. Los cambios
                    posteriores conservan sus fechas.
                  </p>
                  <label>
                    Consultar Meta desde
                    <select
                      value={historyMode}
                      onChange={(e) => {
                        setHistoryMode(e.target.value);
                        setHistoryDirty(true);
                      }}
                    >
                      <option value="ALL">
                        Inicio del historial disponible
                      </option>
                      <option
                        value="ASSIGNMENT"
                        disabled={
                          !review?.firstAssignmentDay && !!review?.advisorId
                        }
                      >
                        Fecha de incorporación
                      </option>
                      <option value="CUSTOM">Fecha personalizada</option>
                    </select>
                  </label>
                  {historyMode === "CUSTOM" && (
                    <label>
                      Fecha del histórico Meta
                      <input
                        type="date"
                        required
                        max={today}
                        value={historySince}
                        onChange={(e) => {
                          setHistorySince(e.target.value);
                          setHistoryDirty(true);
                        }}
                      />
                    </label>
                  )}
                </details>
              )}
            </>
          )}
          <p className="advisor-assignment-sales-note">
            Las ventas se registran para quien vende, incluso si es apoyo o
            supervisora.
          </p>
        </fieldset>
        {message && (
          <p role="alert" className="sheet-message">
            {message}
          </p>
        )}
        {!review && !message && <p role="status">Consultando asignación…</p>}
        <div className="row">
          <button
            type="submit"
            data-financial-write
            disabled={
              busy ||
              !review ||
              !kind ||
              (kind === "TEMPORARY" && (!target || target === review.advisorId))
            }
          >
            {busy
              ? "Guardando…"
              : kind === "TEMPORARY"
                ? "Confirmar apoyo temporal"
                : "Confirmar asignación"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setVersion((v) => v + 1)}
          >
            Actualizar información
          </button>
        </div>
      </form>
      {!!review?.supports.length && (
        <details className="advisor-support-history" open>
          <summary>Apoyos temporales ({review.supports.length})</summary>
          {review.supports.map((s) => (
            <div key={s.id} className="advisor-support-entry">
              <span>
                <b>{s.name}</b>
                {s.commercialRole === "SUPERVISOR" && (
                  <small> · Supervisora</small>
                )}
                <small>
                  {s.since} — {s.until} ·{" "}
                  {s.cancelledAt
                    ? "Finalizado"
                    : s.until < today
                      ? "Concluido"
                      : s.since > today
                        ? "Programado"
                        : "Apoyo temporal"}
                </small>
              </span>
              {!s.cancelledAt && s.until >= today && (
                <button
                  type="button"
                  data-financial-write
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage("");
                    try {
                      await api(
                        "meta-ads/effectiveness/advisor-support",
                        "PATCH",
                        {
                          aliasId,
                          country,
                          supportId: s.id,
                          revision: s.revision,
                        },
                      );
                      await onRefresh?.();
                      setVersion((v) => v + 1);
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "No se pudo finalizar.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Finalizar apoyo
                </button>
              )}
            </div>
          ))}
        </details>
      )}
      {!!review?.changes.length && (
        <details>
          <summary>Historial de titulares ({review.changes.length})</summary>
          <ul>
            {review.changes.map((c) => (
              <li key={c.id}>
                {new Intl.DateTimeFormat("es-PE", {
                  timeZone: "America/Lima",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(c.effectiveAt))}{" "}
                · {label(c.previousAdvisorId)} → {label(c.advisorId)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </dialog>
  );
}
