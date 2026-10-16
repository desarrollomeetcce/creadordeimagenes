import { AppError, demand } from "./errors";
export type DailyCosts = {
  rows: { day: string; micros: string | null }[];
  totalMicros: string | null;
  rounded: boolean;
  fetchedAt: string;
};
export function billingRange(from: string, to: string) {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  demand(
    valid(from) && valid(to),
    "Indica fechas válidas para consultar el gasto.",
  );
  const start = Date.parse(from) / 1000,
    end = Date.parse(to) / 1000 + 86400;
  demand(
    end > start && end - start <= 31 * 86400,
    "Selecciona un período de uno a 31 días UTC.",
  );
  return { start, end };
}
// Provider amounts, including credits, are rounded to microUSD without Number arithmetic.
export function reportedMicros(value: unknown) {
  demand(
    typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value)),
    "El proveedor no informó un importe válido.",
    502,
  );
  const match = String(value).match(
    /^(-?)(\d{1,18})(?:\.(\d{1,30}))?(?:e([+-]?\d{1,2}))?$/i,
  );
  demand(match, "El proveedor informó un importe no compatible.", 502);
  const fraction = match[3] ?? "",
    shift = 6 + Number(match[4] ?? 0) - fraction.length;
  demand(
    Math.abs(shift) <= 60,
    "El importe informado está fuera de rango.",
    502,
  );
  const digits = BigInt(match[2] + fraction),
    divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  const remainder = digits % divisor;
  const result =
    shift >= 0
      ? digits * 10n ** BigInt(shift)
      : digits / divisor + (remainder * 2n >= divisor ? 1n : 0n);
  return { micros: match[1] ? -result : result, rounded: remainder !== 0n };
}
export async function openaiDailyCosts(
  key: string,
  from: string,
  to: string,
  transport: typeof fetch = fetch,
): Promise<DailyCosts> {
  const { start, end } = billingRange(from, to);
  const days = new Map<string, bigint | null>();
  let cursor = "",
    rounded = false;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      start_time: String(start),
      end_time: String(end),
      bucket_width: "1d",
      limit: "31",
    });
    if (cursor) params.set("page", cursor);
    let response: Response;
    try {
      response = await transport(
        "https://api.openai.com/v1/organization/costs?" + params,
        {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
    } catch {
      throw new AppError(
        "No se pudo contactar con OpenAI para consultar la facturación.",
      );
    }
    demand(
      response.ok,
      response.status === 401 || response.status === 403
        ? "OpenAI no autorizó la consulta de gastos. Esta API requiere una clave administrativa de facturación; una clave de generación puede no tener ese permiso. No reemplaces tu clave de generación por una administrativa. Puedes consultar el gasto en el panel de OpenAI."
        : "OpenAI no pudo informar el gasto diario. Inténtalo más tarde.",
      502,
    );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AppError("OpenAI devolvió un informe ilegible.");
    }
    demand(
      Array.isArray(data.data) && data.data.length <= 31,
      "OpenAI devolvió un informe no compatible.",
      502,
    );
    for (const bucket of data.data) {
      demand(
        Number.isSafeInteger(bucket.start_time) &&
          bucket.start_time >= start &&
          bucket.start_time < end &&
          bucket.start_time % 86400 === 0 &&
          Array.isArray(bucket.results) &&
          bucket.results.length <= 1000,
        "El informe contiene fechas o filas no compatibles.",
        502,
      );
      const day = new Date(bucket.start_time * 1000).toISOString().slice(0, 10);
      demand(
        !days.has(day),
        "OpenAI repitió una fecha del informe; no se sumó dos veces.",
        502,
      );
      let amount = 0n;
      for (const result of bucket.results) {
        demand(
          typeof result.amount?.currency === "string" &&
            result.amount.currency.toLowerCase() === "usd",
          "El proveedor informó otra moneda; no se convirtió a USD.",
          502,
        );
        const parsed = reportedMicros(result.amount.value);
        amount += parsed.micros;
        rounded ||= parsed.rounded;
      }
      days.set(day, bucket.results.length ? amount : null);
    }
    if (!data.has_more && !data.next_page) {
      const rows = [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, micros]) => ({
          day,
          micros: micros === null ? null : String(micros),
        }));
      const known = rows.filter((row) => row.micros !== null);
      return {
        rows,
        totalMicros: known.length
          ? String(known.reduce((sum, row) => sum + BigInt(row.micros!), 0n))
          : null,
        rounded,
        fetchedAt: new Date().toISOString(),
      };
    }
    demand(
      typeof data.next_page === "string" &&
        data.next_page.length > 0 &&
        data.next_page.length <= 2000 &&
        data.next_page !== cursor,
      "El proveedor no permitió completar el informe.",
      502,
    );
    cursor = data.next_page;
  }
  throw new AppError(
    "El informe excedió el máximo de páginas; no se mostró un total parcial.",
  );
}
