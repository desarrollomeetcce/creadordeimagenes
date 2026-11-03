import type { EffectivenessSheet } from "./effectiveness";
import { mergeTotalProductReports } from "./totals-product-summary";
import { sumEffectivenessDay } from "./effectiveness-total-values";
import type { TotalProduct, ProductAdvisor } from "./totals-product-summary";
import type { TotalValue } from "./effectiveness-total-values";
import { totalDetailSummary } from "./totals-detail";
export type SheetSalesBlock = {
  country: string;
  currency: string;
  products: TotalProduct[];
};
export type SheetSalesProduct = {
  aliasId: string;
  name: string;
  countries: string[];
  active: boolean;
  sales: TotalValue;
  days: Record<string, { sales: TotalValue; advisors: ProductAdvisor[] }>;
  advisors: ProductAdvisor[];
};
export type SheetSalesSort =
  "name" | "country" | "sales" | "result" | "active" | "advisors";
/** Ascending sales starts with confirmed zero, then missing records, then positive counts. Missing values retain their identity. */
export function sortSheetSalesProducts(
  products: SheetSalesProduct[],
  key: SheetSalesSort,
  ascending: boolean,
  threshold: number,
) {
  return [...products].sort((a, b) => {
    const value = (p: SheetSalesProduct): string | number | null => {
      switch (key) {
        case "name":
          return p.name;
        case "country":
          return p.countries.join(", ");
        case "sales":
          return p.sales.value;
        case "result":
          return p.sales.value === null
            ? null
            : { zero: 0, low: 1, selling: 2, unknown: 3 }[
                sheetSalesStatus(p, threshold)
              ];
        case "active":
          return Number(p.active);
        case "advisors":
          return p.advisors
            .filter((v) => v.sales !== null && !v.na && v.sales > 0)
            .map((v) => v.name)
            .join(", ");
      }
    };
    const x = value(a),
      y = value(b);
    if (x === null || y === null) {
      if (x === y) return a.name.localeCompare(b.name, "es");
      if (key === "sales" && ascending)
        return x === null ? (y === 0 ? 1 : -1) : x === 0 ? -1 : 1;
      return x === null ? 1 : -1;
    }
    const compared =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "es");
    return (
      (ascending ? compared : -compared) || a.name.localeCompare(b.name, "es")
    );
  });
}
export const emptySales: TotalValue = {
  value: null,
  known: 0,
  expected: 1,
  na: 0,
  pending: false,
  partial: true,
};
export function sumSalesAdvisors(values: ProductAdvisor[]): ProductAdvisor[] {
  const people = new Map<string | null, ProductAdvisor>();
  for (const v of values) {
    const p = people.get(v.advisorId) ?? {
      ...v,
      sales: null,
      na: false,
      partial: false,
    };
    if (v.sales !== null && !v.na) p.sales = (p.sales ?? 0) + v.sales;
    p.na ||= v.na;
    p.partial ||= v.partial || (v.sales === null && !v.na);
    people.set(v.advisorId, p);
  }
  return [...people.values()]
    .map((p) => ({ ...p, na: p.sales === null && p.na }))
    .sort(
      (a, b) =>
        (b.sales ?? -1) - (a.sales ?? -1) || a.name.localeCompare(b.name, "es"),
    );
}
/** Counts can cross countries; financial amounts remain in their original block/currency. */
export function sheetSalesProducts(
  blocks: SheetSalesBlock[],
  dates: string[],
): SheetSalesProduct[] {
  const items = new Map<
    string,
    {
      aliasId: string;
      name: string;
      active: boolean;
      countries: Set<string>;
      rows: Map<string, TotalProduct>;
    }
  >();
  for (const block of blocks)
    for (const product of block.products) {
      const item = items.get(product.aliasId) ?? {
        aliasId: product.aliasId,
        name: product.name,
        active: false,
        countries: new Set<string>(),
        rows: new Map<string, TotalProduct>(),
      };
      item.active ||= product.active;
      item.countries.add(block.country);
      const old = item.rows.get(block.country);
      if (old) {
        const days = { ...old.days };
        for (const [day, value] of Object.entries(product.days ?? {})) {
          const prior = days[day];
          if (
            prior?.sums.sales.value !== null &&
            prior?.sums.sales.value !== undefined &&
            value.sums.sales.value !== null &&
            prior.sums.sales.value !== value.sums.sales.value
          )
            throw Error(
              "Los datos cambiaron durante la consulta. Actualiza el detalle.",
            );
          if (!prior || prior.sums.sales.value === null) days[day] = value;
        }
        item.rows.set(block.country, { ...old, days });
      } else item.rows.set(block.country, product);
      items.set(product.aliasId, item);
    }
  return [...items.values()]
    .map((item) => {
      const days = Object.fromEntries(
        dates.map((day) => {
          const rows = [...item.rows.values()].map((p) => p.days?.[day]);
          return [
            day,
            {
              sales: totalDetailSummary(
                rows.map((r) => r?.sums.sales ?? emptySales),
              ),
              advisors: sumSalesAdvisors(
                rows.flatMap((r) => r?.advisors ?? []),
              ),
            },
          ];
        }),
      );
      return {
        aliasId: item.aliasId,
        name: item.name,
        active: item.active,
        countries: [...item.countries].sort(),
        days,
        sales: totalDetailSummary(Object.values(days).map((d) => d.sales)),
        advisors: sumSalesAdvisors(
          Object.values(days).flatMap((d) => d.advisors),
        ),
      };
    })
    .sort(
      (a, b) =>
        (b.sales.value ?? -1) - (a.sales.value ?? -1) ||
        a.name.localeCompare(b.name, "es"),
    );
}
export function sheetSalesStatus(p: SheetSalesProduct, threshold: number) {
  return p.sales.value === null
    ? "unknown"
    : p.sales.value === 0
      ? "zero"
      : p.sales.value <= threshold
        ? "low"
        : "selling";
}

/** Keep sheet membership even if the advisor-enriched response omitted a record. No fabricated zero. */
export function includeSheetMembers(
  products: TotalProduct[],
  pages: EffectivenessSheet[],
  dates: string[],
  country: string,
  currency: string,
) {
  const known = new Set(products.map((p) => p.aliasId));
  const seeds = pages.map((page) => ({
    products: page.rows
      .filter(
        (r) =>
          r.country === country &&
          r.currency === currency &&
          !known.has(r.aliasId),
      )
      .map((r) => ({
        aliasId: r.aliasId,
        name:
          page.table.aliases.find((a) => a.id === r.aliasId)?.name ??
          "Inventario",
        active: r.active,
        days: Object.fromEntries(
          dates
            .filter((day) => r.days[day])
            .map((day) => [
              day,
              { sums: sumEffectivenessDay([r], day), advisors: [] },
            ]),
        ),
      })),
  }));
  if (!seeds.some((p) => p.products.length)) return products;
  return [...products, ...mergeTotalProductReports(seeds, dates)];
}
export function filterSheetSalesBlocks(
  blocks: SheetSalesBlock[],
  country: string,
  activity: string,
  selection?: string[],
) {
  const selected = selection ? new Set(selection) : null;
  return blocks
    .filter((b) => country === "__all" || b.country === country)
    .map((b) => ({
      ...b,
      products: b.products.filter(
        (p) =>
          (activity === "all" || p.active === (activity === "active")) &&
          (!selected || selected.has(JSON.stringify([p.aliasId, b.country]))),
      ),
    }));
}
