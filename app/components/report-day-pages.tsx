"use client";
import { useState } from "react";
export function useReportDayPages(days: string[]) {
  const [selection, setSelection] = useState({ context: "", page: 0 });
  const context = `${days[0]}:${days.at(-1)}`;
  const pages = Math.max(1, Math.ceil(days.length / 31));
  const page =
    selection.context === context ? Math.min(selection.page, pages - 1) : 0;
  const visibleDays = days.slice(page * 31, (page + 1) * 31);
  const navigation =
    pages > 1 ? (
      <nav className="row report-day-pages" aria-label="Páginas de fechas">
        <button
          type="button"
          disabled={!page}
          onClick={() => setSelection({ context, page: page - 1 })}
        >
          ← Fechas anteriores
        </button>
        <span>
          {visibleDays[0]} — {visibleDays.at(-1)} · Página {page + 1} de {pages}
          . Período completo: {days[0]} — {days.at(-1)}
        </span>
        <button
          type="button"
          disabled={page + 1 >= pages}
          onClick={() => setSelection({ context, page: page + 1 })}
        >
          Fechas siguientes →
        </button>
      </nav>
    ) : null;
  return { visibleDays, navigation };
}
