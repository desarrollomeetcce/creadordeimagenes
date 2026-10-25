"use client";
import { useId, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { sheetMetrics } from "../../lib/meta-ads/period-summary";
type Event = {
  id: string;
  active: boolean;
  createdAt: string;
  snapshot: {
    since: string;
    until: string;
    currency: string;
    parameterCount: number;
    metrics: string[];
    values: Record<
      string,
      {
        total: number | null;
        knownDays: number;
        periodDays: number;
        notApplicableDays: number;
      }
    >;
  };
};
export function EffectivenessHistory({
  aliasId,
  country,
  name,
}: {
  aliasId: string;
  country: string;
  name: string;
}) {
  const id = useId(),
    pop = useRef<HTMLDivElement>(null),
    [events, setEvents] = useState<Event[]>([]),
    [next, setNext] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [position, setPosition] = useState({ top: 8, left: 8 });
  const load = async (cursor?: string) => {
    setBusy(true);
    setMessage("");
    try {
      const v = await api(
        "meta-ads/effectiveness/history?" +
          new URLSearchParams({
            aliasId,
            country,
            ...(cursor ? { cursor } : {}),
          }),
      );
      setEvents((old) => (cursor ? [...old, ...v.events] : v.events));
      setNext(v.next);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo cargar el historial.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="sheet-history-trigger"
        aria-label={`Detalle de ${name} ${country || "sin país"}`}
        disabled={!country}
        title="Historial de activación y valores del alias en este país"
        popoverTarget={id}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 508)),
            top: Math.max(8, Math.min(r.bottom + 3, innerHeight - 510)),
          });
          setEvents([]);
          setNext(null);
          void load();
        }}
      >
        ⓘ
      </button>
      <div
        id={id}
        popover="auto"
        ref={pop}
        className="sheet-state-history"
        style={{
          ...position,
          maxHeight: `calc(100dvh - ${position.top + 8}px)`,
        }}
      >
        <strong>
          {name} · {country}
        </strong>
        <p>Historial de Efectividad. No cambia el estado en Meta Ads.</p>
        {message && (
          <p role="alert">
            {message}
            <button onClick={() => void load()}>Reintentar</button>
          </p>
        )}
        {!busy && !events.length && !message && (
          <p>Activado por defecto; sin cambios registrados.</p>
        )}
        {events.map((e) => (
          <article key={e.id}>
            <b>
              {e.active ? "Activado" : "Desactivado"} ·{" "}
              {new Date(e.createdAt).toLocaleString("es-PE", {
                timeZone: "America/Lima",
              })}{" "}
              (Lima)
            </b>
            <small>
              Período {e.snapshot.since} — {e.snapshot.until} ·{" "}
              {e.snapshot.parameterCount} parámetros seleccionados
            </small>
            <table>
              <thead>
                <tr>
                  <th>Parámetro</th>
                  <th>Total conocido</th>
                  <th>Días con dato / N.A.</th>
                </tr>
              </thead>
              <tbody>
                {sheetMetrics.map((m) => (
                  <tr key={m.key}>
                    <td>
                      {m.key === "base" ? "Base" : m.name} ({m.label})
                    </td>
                    <td>
                      {e.snapshot.values[m.key]?.total?.toLocaleString(
                        "es-PE",
                      ) ?? "—"}{" "}
                      {m.money ? e.snapshot.currency : ""}
                    </td>
                    <td>
                      {e.snapshot.values[m.key]?.knownDays ?? 0}/
                      {e.snapshot.values[m.key]?.periodDays ?? 0} ·{" "}
                      {e.snapshot.values[m.key]?.notApplicableDays ?? 0} N.A.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
        {busy && <p role="status">Cargando historial…</p>}
        {next && (
          <button disabled={busy} onClick={() => void load(next)}>
            Ver anteriores
          </button>
        )}
        <button onClick={() => pop.current?.hidePopover()}>Cerrar</button>
      </div>
    </>
  );
}
