"use client";
import { reportDayPage } from "../../lib/meta-ads/report-day-pages";
import { useState } from "react";
export function useReportDayPages(days: string[], pageSize = 31) {
  const [selection, setSelection] = useState({ context: "", page: 0 });
  const context = `${days[0]}:${days.at(-1)}:${pageSize}`;
  const { page, pages, start, end } = reportDayPage(
    days.length,
    selection.context === context ? selection.page : 0,
    pageSize,
  );
  const visibleDays = days.slice(start, end);
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
