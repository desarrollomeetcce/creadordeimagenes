"use client";
import { financialRequest as api } from "./financial-request";
import { activePeriodWindow } from "../../lib/meta-ads/active-periods";
import type { AdvisorSheetData } from "./advisor-types";
import type { TotalSheet } from "../../lib/meta-ads/totals-detail";
export async function readRangePages<T>(
  path: string,
  params: Record<string, string>,
  accept?: () => boolean,
): Promise<T[]> {
  const windows: { since: string; until: string }[] = [];
  const { since, until } = params;
  if (
    !since ||
    !until ||
    since > until ||
    (Date.parse(until) - Date.parse(since)) / 86400000 >= 3660
  )
    throw Error("Elige un período válido de hasta diez años.");
  let first = since;
  while (first <= until) {
    const w = activePeriodWindow(since, until, first);
    windows.push({ since: w.since, until: w.until });
    if (!w.next) break;
    first = w.next;
  }
  const pages: T[] = [];
  for (let i = 0; i < windows.length; i += 2) {
    if (accept && !accept())
      throw Error("Consulta sustituida por otro período.");
    pages.push(
      ...(await Promise.all(
        windows
          .slice(i, i + 2)
          .map((w) =>
            api(path + "?" + new URLSearchParams({ ...params, ...w })),
          ),
      )),
    );
  }
  return pages;
}
export async function readAdvisorRange(
  params: Record<string, string>,
  accept?: () => boolean,
): Promise<AdvisorSheetData> {
  const pages = await readRangePages<AdvisorSheetData>(
    "meta-ads/advisors/sheet",
    params,
    accept,
  );
  const people = new Map<string, AdvisorSheetData["rows"][number]>();
  for (const page of pages)
    for (const person of page.rows) {
      const old = people.get(person.id);
      people.set(person.id, {
        ...person,
        days: { ...old?.days, ...person.days },
      });
    }
  return {
    ...pages[0],
    since: params.since,
    until: params.until,
    rows: [...people.values()],
  };
}
export async function readTotalsRange(
  params: Record<string, string>,
  accept?: () => boolean,
): Promise<TotalSheet> {
  const pages = await readRangePages<TotalSheet>(
    "meta-ads/effectiveness/totals",
    params,
    accept,
  );
  const groups = new Map<string, TotalSheet["groups"][number]>();
  for (const page of pages)
    for (const group of page.groups) {
      const key = JSON.stringify([group.country, group.currency]),
        old = groups.get(key);
      groups.set(key, { ...group, days: { ...old?.days, ...group.days } });
    }
  return {
    ...pages[0],
    missingFxDays: [...new Set(pages.flatMap((p) => p.missingFxDays))],
    groups: [...groups.values()],
  };
}
