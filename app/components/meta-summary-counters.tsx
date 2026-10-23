"use client";
import type { MetaSummary } from "../../lib/meta-ads/summary";
const number = (v: number) =>
  new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(v);
const money = (v: number, currency: string) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(v);
export function MetaSummaryCounters({
  summary,
  loading,
}: {
  summary: MetaSummary | null;
  loading: boolean;
}) {
  const currencies = summary?.currencies ?? [];
  const financial = (key: "spend" | "conversations" | "average") =>
    currencies.length
      ? currencies
          .map((g) =>
            g[key] === null
              ? `${g.currency}: —`
              : key === "conversations"
                ? `${number(g[key]!)}${currencies.length > 1 ? " · " + g.currency : ""}`
                : money(g[key]!, g.currency),
          )
          .join(" · ")
      : "—";
  const labels = [
    [
      "Gasto total",
      financial("spend"),
      "Suma del gasto de los elementos del ámbito en el periodo de análisis. Monedas separadas.",
    ],
    [
      "Conversaciones",
      financial("conversations"),
      "Conversaciones iniciadas atribuidas por Meta. No representa personas únicas ni solo WhatsApp si el anuncio usa varios destinos.",
    ],
    [
      "Costo promedio",
      financial("average"),
      "Gasto total ÷ conversaciones. No es el promedio simple de costos por anuncio.",
    ],
    [
      "Campañas activas",
      summary ? number(summary.campaigns.active) : "—",
      "Estado configurado actual de campañas únicas del ámbito. No es su estado histórico en las fechas elegidas.",
    ],
    [
      "Desactivadas",
      summary ? number(summary.campaigns.inactive) : "—",
      "Campañas únicas con estado PAUSED ahora. Estados no informados no se cuentan como desactivados.",
    ],
  ];
  return (
    <section
      className="meta-counters"
      aria-label="Resumen del periodo de análisis"
      aria-busy={loading}
    >
      <div className="meta-counter-scope">
        {loading
          ? "Consultando resumen…"
          : summary
            ? `${summary.selected ? "Seleccionados" : "Todo el ámbito"} · ${number(summary.objects)} elementos${summary.partial ? " · Cobertura parcial" : ""}${summary.campaigns.unknown ? " · " + number(summary.campaigns.unknown) + " campañas sin estado confirmado" : ""}`
            : "Resumen no disponible"}
        <span title="Los importes corresponden a los informes realmente guardados; los informes ausentes no se convierten en cero.">
          Periodo de análisis
        </span>
      </div>
      <div className="meta-counter-grid">
        {labels.map(([label, value, title]) => (
          <div key={label} title={title}>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
