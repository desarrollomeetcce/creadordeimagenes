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
      <summary>Observaciones de Pulpo Mensajería</summary>
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
  }, [aliasId, tableId, country, campaign, offset]);
  return (
    <section aria-label="Historial de observaciones">
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Cargando observaciones…</p>}
      {!loading && !pages.length && !error && (
        <p>
          Aún no hay observaciones de Mensajería para este diplomado y país.
        </p>
      )}
      {pages.length > 0 && (
        <ol>
          {pages.map((note) => (
            <li key={note.id}>
              <strong>{note.author}</strong>
              {" · "}
              <time dateTime={note.day}>
                {dateLabel.format(new Date(note.day + "T12:00:00Z"))}
              </time>
              {note.recordedAt && (
                <small>
                  {" · Registrado el "}
                  {dateLabel.format(new Date(note.recordedAt))}
                </small>
              )}
              <p>{note.body}</p>
            </li>
          ))}
        </ol>
      )}
      {next !== null && (
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setError("");
            setOffset(next);
          }}
        >
          Ver anteriores
        </button>
      )}
    </section>
  );
}
