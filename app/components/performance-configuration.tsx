"use client";

import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import type { performanceConfiguration } from "../../lib/meta-ads/advisor-performance";

type Configuration = Awaited<ReturnType<typeof performanceConfiguration>>;
const endpoint = "meta-ads/my-performance/configuration";
const inputValue = (value: number | null) =>
  value === null ? "" : String(value);
const numberValue = (value: string) => (value === "" ? null : Number(value));

export function PerformanceConfiguration({ reload }: { reload: number }) {
  const [data, setData] = useState<Configuration | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(endpoint)
      .then((result: Configuration) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const changed =
    !!data &&
    ((goal !== null && goal !== inputValue(data.goal.percent)) ||
      data.people.some(
        (person) =>
          targets[person.id] !== undefined &&
          targets[person.id] !== inputValue(person.salesTarget),
      ));
  async function save() {
    if (!data || busy || !changed) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result: Configuration = await api(endpoint, "PUT", {
        ...(goal !== null && goal !== inputValue(data.goal.percent)
          ? {
              goal: {
                percent: numberValue(goal),
                revision: data.goal.revision,
              },
            }
          : {}),
        people: data.people.flatMap((person) => {
          const value = targets[person.id];
          return value === undefined || value === inputValue(person.salesTarget)
            ? []
            : [
                {
                  id: person.id,
                  salesTarget: numberValue(value),
                  revision: person.revision,
                },
              ];
        }),
      });
      setData(result);
      setGoal(null);
      setTargets({});
      setStatus("Metas diarias guardadas.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="performance-configuration panel"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {data ? (
        <>
          <div className="row">
            <label>
              Meta diaria de efectividad (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={goal ?? inputValue(data.goal.percent)}
                disabled={busy}
                onChange={(event) => setGoal(event.target.value)}
              />
            </label>
            <p className="hint">
              Ventas registradas ÷ conversaciones de Meta · Aplica a todos los
              asesores.
            </p>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Asesor</th>
                  <th scope="col">Meta de ventas por día</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => (
                  <tr key={person.id}>
                    <th scope="row">
                      {person.name} <small>{person.sheet}</small>
                    </th>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="0*(?:[1-9][0-9]{0,7}|100000000)"
                        title="Escribe un número entero del 1 al 100000000."
                        aria-label={`Meta diaria de ${person.name} · ${person.sheet}`}
                        placeholder="Sin meta"
                        disabled={busy}
                        value={
                          targets[person.id] ?? inputValue(person.salesTarget)
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          setTargets((previous) => ({
                            ...previous,
                            [person.id]: value,
                          }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.people.length && <p>No hay asesores registrados.</p>}
          <button className="primary" disabled={!changed || busy}>
            {busy ? "Guardando…" : "Guardar metas"}
          </button>
        </>
      ) : !error ? (
        <p role="status">Cargando configuración…</p>
      ) : null}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </form>
  );
}
