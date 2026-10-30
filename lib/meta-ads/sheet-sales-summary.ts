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
/** Missing sales always sort last; ties use the displayed name, never a fabricated zero. */
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
    if (x === null || y === null)
      return x === y ? a.name.localeCompare(b.name, "es") : x === null ? 1 : -1;
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
