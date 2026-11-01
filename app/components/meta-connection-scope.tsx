"use client";
import { matchesSearchWords } from "../../lib/search";
import { useRef, useState } from "react";
type ScopeAccount = {
  id: string;
  name: string;
  lastCompletedAt?: string | null;
  coverage?: { since: string; until: string } | null;
  progress?: { label: string; scope: string | null };
};
const day = (value: string) =>
  new Date(value + "T12:00:00Z").toLocaleDateString("es-PE", {
    timeZone: "UTC",
  });
const time = (value: string) =>
  new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" });
export function MetaConnectionScope({
  accounts,
}: {
  accounts: ScopeAccount[];
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    summary = useRef<HTMLElement>(null);
  const filtered = accounts.filter((a) =>
      matchesSearchWords(`${a.name} ${a.id}`, query.replace(/\bact_/gi, "")),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 25)),
    current = Math.min(page, pages),
    visible = filtered.slice((current - 1) * 25, current * 25);
  const minimize = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      summary.current?.focus({ preventScroll: true });
      summary.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  return (
    <section
      className="meta-connection-scope"
      aria-label="Alcance de sincronización"
    >
      <strong>Alcance de sincronización</strong>
      <p>
        En Rendimiento, «Actualizar vista» consulta los estados y el gasto de hoy y ayer de los elementos visibles. El catálogo y el histórico se importan por separado.
      </p>
      <details
        className="meta-connection-accounts"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
      >
        <summary ref={summary}>
          Ver cuentas guardadas ({accounts.length})
        </summary>
        {open && (
          <div className="meta-connection-accounts-body">
            <p className="hint">
              Esta lista conserva cuentas guardadas. El número detectado al
              verificar el acceso puede ser diferente; el historial no se borra.
            </p>
            <label>
              Buscar cuenta en esta conexión
              <input
                type="search"
                value={query}
                placeholder="Nombre o ID de cuenta"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <div className="meta-connection-account-list">
              {visible.map((a) => (
                <article key={a.id}>
                  <strong>{a.name}</strong>
                  <small>act_{a.id}</small>
                  <small>
                    {a.progress?.label ?? "Sin importación iniciada"} · Última
                    sincronización completa:{" "}
                    {a.lastCompletedAt
                      ? time(a.lastCompletedAt)
                      : "Todavía no completada"}
                  </small>
                  {a.coverage && (
                    <small>
                      Fechas con estadísticas guardadas: {day(a.coverage.since)}{" "}
                      → {day(a.coverage.until)}. La importación puede estar
                      incompleta.
                    </small>
                  )}
                  {a.progress?.scope && (
                    <small>Alcance del intento: {a.progress.scope}</small>
                  )}
                </article>
              ))}
            </div>
            {!filtered.length && (
              <p>
                {accounts.length
                  ? "No hay cuentas que coincidan con la búsqueda."
                  : "No hay cuentas guardadas. Usa Buscar cuentas nuevas para incorporarlas."}
              </p>
            )}
            {pages > 1 && (
              <div className="row" aria-label="Páginas de cuentas guardadas">
                <button
                  type="button"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  Anterior
                </button>
                <span>
                  Página {current} de {pages} · {filtered.length} cuentas
                </span>
                <button
                  type="button"
                  disabled={current === pages}
                  onClick={() => setPage(current + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
            <div className="row meta-connection-accounts-footer">
              <button type="button" onClick={minimize}>
                Minimizar lista
              </button>
            </div>
          </div>
        )}
      </details>
      <small>
        «Comprobar acceso» valida la credencial. «Buscar cuentas nuevas» recorre las cuentas disponibles: úsalo al incorporar cuentas, no para actualizar el gasto. Abrir esta lista no consulta Meta.
      </small>
    </section>
  );
}
