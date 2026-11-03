import { cacAssessment, defaultCacRules } from "./inventory-cac-policy";
import type { CampaignSalesPeriod } from "./campaign-performance";
export type SelectionDiplomaSource = {
  id: string;
  name: string;
  aliasId: string | null;
  aliasCountry?: string | null;
  currency: string;
  metric: string;
  metricName: string;
  status: string;
  alias: {
    id: string;
    name: string;
    tableId?: string;
    inventorySheetId?: string;
  } | null;
};
export type SelectionDiplomaPeriod = {
  since: string;
  until: string;
  spend: number;
  results: number;
  metaAvailable?: boolean;
  reportedMeta?: boolean;
  metaPartial?: boolean;
  state: string;
  sales?: CampaignSalesPeriod;
};
export function summarizeDiplomaPeriod(
  sources: { o: SelectionDiplomaSource; p?: SelectionDiplomaPeriod }[],
): CampaignSalesPeriod & {
  spend: number | null;
  results: number | null;
  metaPartial: boolean;
  conflict: boolean;
} {
  const periods = sources
      .map((s) => s.p)
      .filter((p): p is SelectionDiplomaPeriod => !!p),
    reports = periods.filter(
      (p) =>
        p.reportedMeta ||
        (p.metaAvailable !== false && p.state !== "UNAVAILABLE"),
    );
  const salesValues = [
    ...new Set(
      periods.flatMap((p) => (p.sales?.sales == null ? [] : [p.sales.sales])),
    ),
  ];
  const sales = salesValues.length === 1 ? salesValues[0] : null,
    conflict = salesValues.length > 1;
  const spend = reports.length
    ? reports.reduce((n, p) => n + p.spend, 0)
    : null;
  const metaPartial =
    reports.length !== sources.length ||
    reports.some((p) => p.metaPartial || p.state === "UNAVAILABLE");
  const metric = [...new Set(sources.map((s) => s.o.metric))];
  const results =
    reports.length && metric.length === 1 && metric[0] !== "UNKNOWN"
      ? reports.reduce((n, p) => n + p.results, 0)
      : null;
  const sharedCampaigns = Math.max(
    1,
    ...periods.map((p) => p.sales?.sharedCampaigns ?? 1),
  );
  const linked = sources.every((s) => !!s.o.aliasId && !!s.o.aliasCountry);
  const covered = linked && sources.length >= sharedCampaigns;
  const dates = [...new Set(periods.map((p) => p.since + ":" + p.until))];
  const partial =
    periods.some(
      (p) => !p.sales || p.sales.sales === null || p.sales.partial,
    ) || periods.length !== sources.length;
  const currency = sources[0]?.o.currency,
    rules = periods.find((p) => p.sales)?.sales?.rules ?? defaultCacRules();
  const complete =
    covered &&
    !conflict &&
    !metaPartial &&
    dates.length === 1 &&
    sales !== null &&
    (sales > 0 || !partial);
  const assessment = cacAssessment(
    sales,
    spend,
    complete && currency === "PEN",
    rules,
  );
  const reason = !linked
    ? "Sin vincular"
    : !covered
      ? "Gasto de campañas seleccionadas; ventas compartidas"
      : conflict
        ? "Ventas en revisión"
        : metaPartial
          ? "Informe Meta parcial"
          : sales === null
            ? "Sin ventas registradas"
            : currency !== "PEN"
              ? "Umbrales en PEN; moneda diferente"
              : dates.length !== 1
                ? "Períodos distintos"
                : partial && sales === 0
                  ? "Ventas incompletas"
                  : partial
                    ? "Provisional: faltan días de ventas"
                    : "";
  return {
    sales,
    spend,
    results,
    conflict,
    metaPartial,
    partial,
    sharedCampaigns,
    linked,
    since: periods.map((p) => p.since).sort()[0] ?? "",
    until:
      periods
        .map((p) => p.until)
        .sort()
        .at(-1) ?? "",
    cac: complete && sales! > 0 ? spend! / sales! : null,
    effectiveness:
      complete && results !== null && results > 0
        ? (sales! / results) * 100
        : null,
    provisional: complete && partial,
    status: assessment.status,
    rulesCurrency: "PEN",
    rules,
    statusReason: reason,
  };
}
export function groupSelectionDiplomas<T extends SelectionDiplomaSource>(
  sources: T[],
) {
  const groups = new Map<string, T[]>();
  for (const o of sources) {
    const key = JSON.stringify([
      o.aliasId && o.aliasCountry ? o.aliasId : o.id,
      o.aliasCountry ?? "",
      o.currency,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups].map(([key, items]) => ({
    key,
    name: items[0].alias?.name ?? items[0].name,
    country: items[0].aliasCountry ?? "",
    currency: items[0].currency,
    items,
  }));
}
