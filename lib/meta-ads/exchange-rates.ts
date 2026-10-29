import { db } from "../db";
import {ownerOnly} from "./financial-access";
import { demand } from "../errors";
import type { Actor } from "./service";
export const fxProvider = "Currency API · referencia diaria";
import { currencyCodes } from "./currency-codes";
export { isCurrency } from "./currency-codes";
const currencies = new Set(currencyCodes);
export type FxRates = Record<string, number>;
export function convertMoney(
  amount: number,
  from: string,
  to: string,
  rates?: FxRates,
): number | null {
  if (!to || !Number.isFinite(amount)) return null;
  if (from === to || amount === 0) return amount;
  const a = rates?.[from],
    b = rates?.[to];
  return a && b && a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)
    ? Number.isFinite((amount * b) / a)
      ? (amount * b) / a
      : null
    : null;
}
export async function fetchFxDay(day: string, fetcher: typeof fetch = fetch) {
  const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${day}/v1/currencies/eur.min.json`;
  const r = await fetcher(url, {
    signal: AbortSignal.timeout(8000),
    redirect: "error",
    cache: "no-store",
  });
  demand(r.ok, "La fuente diaria no publicó una tasa disponible.", 502);
  const text = await r.text();
  demand(text.length <= 1000000, "Respuesta de tasas demasiado grande.", 502);
  let v: { date?: unknown; eur?: unknown };
  try {
    v = JSON.parse(text);
  } catch {
    throw Error("La fuente devolvió tasas ilegibles.");
  }
  demand(
    v?.date === day &&
      v.eur &&
      typeof v.eur === "object" &&
      !Array.isArray(v.eur),
    "La fecha de la tasa no corresponde al día solicitado.",
    502,
  );
  const rates: FxRates = { EUR: 1 };
  for (const [k, n] of Object.entries(v.eur as Record<string, unknown>)) {
    const code = k.toUpperCase();
    if (
      currencies.has(code) &&
      typeof n === "number" &&
      Number.isFinite(n) &&
      n > 0 &&
      n < 1e12
    )
      rates[code] = n;
  }
  demand(
    rates.PEN && rates.USD && rates.EUR === 1,
    "Tasas de referencia incompletas.",
    502,
  );
  return { rates, source: fxProvider, sourceUrl: url };
}
export async function syncFxDays(actor: Actor, days: string[]) {
  ownerOnly(actor);
  demand(
    await db.user.findFirst({
      where: { id: actor.id, role: "OWNER", status: "APPROVED" },
    }),
    "Sin permiso.",
    403,
  );
  const result: { day: string; ready: boolean }[] = [];
  for (let i = 0; i < days.length; i += 4)
    await Promise.all(
      days.slice(i, i + 4).map(async (day) => {
        const cached = await db.metaFxDay.findUnique({ where: { day } });
        if (cached && Object.keys(cached.rates as object).length) {
          result.push({ day, ready: true });
          return;
        }
        if (cached && Date.now() - cached.fetchedAt.getTime() < 900000) {
          result.push({ day, ready: false });
          return;
        }
        try {
          const row = await fetchFxDay(day);
          await db.metaFxDay.upsert({
            where: { day },
            create: { day, ...row },
            update: { ...row, lastError: null, fetchedAt: new Date() },
          });
          result.push({ day, ready: true });
        } catch {
          await db.metaFxDay.upsert({
            where: { day },
            create: {
              day,
              source: fxProvider,
              sourceUrl: "https://github.com/fawazahmed0/exchange-api",
              lastError: "Tasa diaria no disponible.",
            },
            update: {
              lastError: "Tasa diaria no disponible.",
              fetchedAt: new Date(),
            },
          });
          result.push({ day, ready: false });
        }
      }),
    );
  return { days: result.sort((a, b) => a.day.localeCompare(b.day)) };
}
