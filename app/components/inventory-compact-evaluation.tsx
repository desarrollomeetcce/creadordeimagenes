"use client";
import { useEffect, useRef, useState } from "react";
import type {
  TrialGroup,
  TrialReport,
} from "../../lib/meta-ads/inventory-trials";
import { countryName } from "../../lib/meta-ads/countries";
import { financialRequest as api } from "./financial-request";
import { limaToday } from "./date-range";
/** Read the chosen group's report once; historical facts are never inferred from activation. */
export function InventoryCompactEvaluation({
  listId,
  group,
  focusName,
  onClose,
}: {
  listId: string;
  group: TrialGroup;
  focusName: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [until, setUntil] = useState(limaToday),
    [reload, setReload] = useState(0),
    [expanded, setExpanded] = useState(false),
    [data, setData] = useState<TrialReport | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api(
      "meta-ads/inventory/trials/report?" +
        new URLSearchParams({ listId, groupId: group.id, until }),
      "GET",
      undefined,
      { signal: controller.signal },
    )
      .then((report: TrialReport) => {
        if (alive) setData(report);
      })
      .catch((e) => {
        if (alive && !controller.signal.aborted) {
          if ([401, 403].includes(e.status)) setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [listId, group.id, group.revision, until, reload]);
  const lookup = new Map(
    data?.rows.map((row) => [JSON.stringify([row.slotId, row.country]), row]) ??
      [],
  );
  const money = (value: number | null) =>
    value === null
      ? "Sin gasto"
      : new Intl.NumberFormat("es-PE", {
          style: "currency",
          currency: "PEN",
          maximumFractionDigits: 2,
        }).format(value);
  return (
    <dialog
      ref={ref}
      className="trial-dialog inventory-compact-evaluation"
      data-expanded={expanded}
      aria-label={`${group.name} · Evaluación por país`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{group.name} · Evaluación por país</h2>
        <div className="row">
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Restaurar" : "Maximizar"}
          </button>
          <button
            type="button"
            className="ui-close-button"
            aria-label="Cerrar evaluación"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>
      <div className="row inventory-compact-evaluation-period">
        <label>
          Hasta
          <input
            type="date"
            value={until}
            max={limaToday()}
            onChange={(e) => {
              if (e.target.value) {
                setData(null);
                setUntil(e.target.value);
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => setReload((n) => n + 1)}
        >
          Actualizar
        </button>
        <small>
          V · ventas &nbsp; G · gasto Meta en soles. * Datos parciales.
        </small>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && !data ? (
        <p role="status">Cargando evaluación del grupo…</p>
      ) : (
        <div className="inventory-compact-evaluation-scroll">
          <table>
            <thead>
              <tr>
                <th>Diplomado</th>
                {group.countries.map((code) => (
                  <th key={code}>{countryName(code)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => (
                <tr
                  key={member.slotId}
                  data-focused={member.name === focusName}
                >
                  <th>{member.name}</th>
                  {group.countries.map((code) => {
                    const row = lookup.get(
                      JSON.stringify([member.slotId, code]),
                    );
                    const state = row?.activation;
                    return (
                      <td
                        key={code}
                        title={
                          row
                            ? `Período ${row.since} — ${until}`
                            : "Sin registros del grupo para este país"
                        }
                      >
                        <span className="compact-evaluation-sales">
                          V <b>{row?.sales ?? "—"}</b>
                          {row && !row.complete.sales ? " *" : ""}
                        </span>
                        <span className="compact-evaluation-spend">
                          G <b>{money(row?.spend ?? null)}</b>
                          {row?.spend !== null && row && !row.complete.spend
                            ? " *"
                            : ""}
                        </span>
                        <small
                          className={
                            "compact-evaluation-activation state-" +
                            (state ?? "UNKNOWN")
                          }
                        >
                          {state === "ACTIVE"
                            ? "● Activo"
                            : state === "INACTIVE"
                              ? "○ No activo"
                              : state === "MIXED"
                                ? "◐ Mixto"
                                : "Sin estado"}
                        </small>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </dialog>
  );
}
