"use client";

import { useContext, useEffect, useState } from "react";
import { CurrentRole } from "./role-guide";
import "./pulpo-diploma-observations.css";

type Note = {
  id: string;
  author: string;
  day: string;
  recordedAt: string | null;
  body: string;
};
type Page = { notes: Note[]; next: number | null };
const dateLabel = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeZone: "America/Lima",
});

export function PulpoDiplomaObservations(props: {
  aliasId: string;
  tableId: string;
  country: string;
  campaign?: string;
}) {
  const [open, setOpen] = useState(false);
  const role = useContext(CurrentRole);
  if (!["OWNER", "ADMIN", "USER"].includes(role)) return null;
  return (
    <details
      className="pulpo-diploma-observations"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Comentarios del diplomado</summary>
      {open && (
        <History
          key={props.aliasId + "|" + props.country + "|" + props.tableId}
          {...props}
        />
      )}
    </details>
  );
}

function History({
  aliasId,
  tableId,
  country,
  campaign,
}: {
  aliasId: string;
  tableId: string;
  country: string;
  campaign?: string;
}) {
  const [pages, setPages] = useState<Note[]>([]);
  const [day, setDay] = useState("");
  const [offset, setOffset] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      alias: aliasId,
      table: tableId,
      country,
      ...(campaign ? { campaign } : {}),
      offset: String(offset),
      ...(day ? { day } : {}),
    });
    void (async () => {
      try {
        const response = await fetch("/api/pulpo/observations?" + params, {
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(
            body.error || "No se pudieron consultar los comentarios.",
          );
        const data = body as Page;
        if (controller.signal.aborted) return;
        setPages((old) => (offset ? [...old, ...data.notes] : data.notes));
        setNext(data.next);
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [aliasId, tableId, country, campaign, offset, day]);
  const dates = new Map<string, Note[]>();
  for (const note of pages) {
    const group = dates.get(note.day) ?? [];
    group.push(note);
    dates.set(note.day, group);
  }
  const region = new Intl.DisplayNames("es", { type: "region" }).of(country);
  return (
    <section aria-label="Historial de observaciones">
      <div className="pulpo-observation-controls">
        <strong>{region}</strong>
        <label>
          Filtrar por fecha
          <input type="date" value={day} onChange={(event) => {
            setDay(event.target.value);
            setOffset(0);
            setPages([]);
            setNext(null);
            setError("");
            setLoading(true);
          }} />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Cargando observaciones…</p>}
      {!loading && !pages.length && !error && (
        <p>{day ? "Sin observaciones para esta fecha." : "Aún no hay observaciones para este diplomado y país."}</p>
      )}
      {pages.length > 0 && (
        <div className="pulpo-observation-scroll" tabIndex={0} role="region" aria-label="Observaciones por fecha">
          {[...dates].map(([date, entries]) => (
            <div className="pulpo-observation-day" key={date}>
              <time dateTime={date}>{dateLabel.format(new Date(date + "T12:00:00Z"))}</time>
              <ul>
                {entries.map((note) => (
                  <li key={note.id}>
                    <strong>{note.author}</strong>
                    {note.recordedAt && <small> · Registrado el {dateLabel.format(new Date(note.recordedAt))}</small>}
                    <p>{note.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {next !== null && (
        <button type="button" disabled={loading} onClick={() => {
          setLoading(true);
          setError("");
          setOffset(next);
        }}>
          Ver anteriores
        </button>
      )}
    </section>
  );
}
