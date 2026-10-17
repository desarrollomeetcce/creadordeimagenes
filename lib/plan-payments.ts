import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PaymentConnection, PlanPurchase } from "@prisma/client";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { demand, AppError } from "./errors";
import { encryptKey, decryptKey, maskKey } from "./crypto";
import { recordActivity } from "./activity";
const provider = z.enum(["mercadopago", "paypal"]);
type Actor = { id: string; role: string };
type Credentials = {
  accessToken?: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
};
const context = (p: string) => `payments:${p}:credentials`;
const credentials = (c: PaymentConnection) =>
  JSON.parse(
    decryptKey(c.encryptedCredentials, context(c.provider)),
  ) as Credentials;
const ppBase = (c: PaymentConnection) =>
  c.mode === "LIVE"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
const origin = () => {
  const o = process.env.APP_ORIGIN ?? "";
  demand(
    /^https:\/\//.test(o) || o.startsWith("http://localhost:"),
    "Configura el origen de la aplicación.",
    503,
  );
  return o.replace(/\/$/, "");
};
async function remote(url: string, init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new AppError(
      "No se pudo confirmar la respuesta de la pasarela. Consulta el estado antes de volver a pagar.",
      502,
    );
  }
  const reader = r.body?.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1000000) {
        await reader.cancel();
        throw new AppError(
          "La pasarela devolvió una respuesta demasiado grande.",
          502,
        );
      }
      chunks.push(value);
    }
  }
  demand(
    r.ok,
    r.status === 401 || r.status === 403
      ? "La pasarela rechazó las credenciales o sus permisos."
      : "La pasarela no pudo completar la operación. Consulta el estado antes de repetirla.",
    502,
  );
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new AppError("Respuesta de pagos no válida.", 502);
  }
}
async function ppToken(c: PaymentConnection) {
  const k = credentials(c);
  const r = await remote(ppBase(c) + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${k.clientId}:${k.clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  demand(
    typeof r.access_token === "string",
    "PayPal no confirmó las credenciales.",
    502,
  );
  return r.access_token as string;
}
async function pp(
  c: PaymentConnection,
  path: string,
  body?: unknown,
  idempotency?: string,
) {
  const token = await ppToken(c);
  return remote(ppBase(c) + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(idempotency ? { "PayPal-Request-Id": idempotency } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function mp(c: PaymentConnection, path: string, body?: unknown) {
  const k = credentials(c);
  return remote("https://api.mercadopago.com" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + k.accessToken,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const valid = (c: PaymentConnection) =>
  !!c.verifiedAt && c.verifiedRevision === c.revision;
const publicConnection = (c: PaymentConnection) => ({
  provider: c.provider,
  maskedCredentials: c.maskedCredentials,
  merchantId: c.merchantId,
  mode: c.mode,
  currency: c.currency,
  exchangeRateMicros: c.exchangeRateMicros.toString(),
  enabled: c.enabled,
  verified: valid(c),
  verifiedAt: c.verifiedAt,
  error: c.error,
});
async function owner(tx: any, a: Actor) {
  ownerOnly(a);
  const u = await tx.user.findUnique({
    where: { id: a.id },
    select: { role: true, status: true },
  });
  demand(
    u?.role === "OWNER" && u.status === "APPROVED",
    "La autorización cambió.",
    403,
  );
}
export async function paymentConnections(a: Actor) {
  ownerOnly(a);
  return (await db.paymentConnection.findMany()).map(publicConnection);
}
export async function paymentOptions() {
  return (await db.paymentConnection.findMany({ where: { enabled: true } }))
    .filter(valid)
    .map((c) => ({
      provider: c.provider,
      mode: c.mode,
      currency: c.currency,
      exchangeRateMicros: c.exchangeRateMicros.toString(),
    }));
}
export async function savePaymentConnection(a: Actor, input: unknown) {
  ownerOnly(a);
  const b = z
    .object({
      provider,
      mode: z.enum(["LIVE", "SANDBOX"]),
      currency: z.enum(["USD", "PEN"]),
      exchangeRateMicros: z
        .string()
        .regex(/^\d{1,10}$/)
        .transform(BigInt),
      merchantId: z.string().regex(/^[\w-]{1,80}$/),
      enabled: z.boolean(),
      credentials: z
        .object({
          accessToken: z.string().trim().max(1000).optional(),
          webhookSecret: z.string().trim().max(1000).optional(),
          clientId: z.string().trim().max(1000).optional(),
          clientSecret: z.string().trim().max(1000).optional(),
          webhookId: z.string().trim().max(150).optional(),
        })
        .strict(),
    })
    .strict()
    .parse(input);
  demand(b.exchangeRateMicros > 0n, "Introduce un tipo de cambio válido.");
  demand(
    b.currency !== "USD" || b.exchangeRateMicros === 1000000n,
    "El cobro en USD no lleva conversión.",
  );
  demand(
    b.provider !== "paypal" ||
      (b.currency === "USD" && b.exchangeRateMicros === 1000000n),
    "PayPal cobra estos planes en USD, sin conversión.",
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await owner(tx, a);
    const old = await tx.paymentConnection.findUnique({
      where: { provider: b.provider },
    });
    const keys = {
      ...(old ? credentials(old) : {}),
      ...Object.fromEntries(
        Object.entries(b.credentials).filter(([, v]) => !!v),
      ),
    };
    const required =
      b.provider === "paypal"
        ? ["clientId", "clientSecret", "webhookId"]
        : ["accessToken", "webhookSecret"];
    demand(
      required.every(
        (k) =>
          typeof keys[k as keyof Credentials] === "string" &&
          keys[k as keyof Credentials]!.length >= 8,
      ),
      "Completa las credenciales y el identificador o secreto del webhook.",
    );
    const encryptedCredentials = encryptKey(
        JSON.stringify(keys),
        context(b.provider),
      ),
      maskedCredentials = Object.fromEntries(
        Object.entries(keys).map(([k, v]) => [k, maskKey(v!)]),
      );
    const data = {
      mode: b.mode,
      currency: b.currency,
      exchangeRateMicros: b.exchangeRateMicros,
      merchantId: b.merchantId,
      enabled: b.enabled,
      encryptedCredentials,
      maskedCredentials,
      verifiedAt: null,
      verifiedRevision: null,
      error: null,
    };
    await tx.paymentConnection.upsert({
      where: { provider: b.provider },
      create: { provider: b.provider, ...data },
      update: { ...data, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: a.id,
        action: "PAGO_CONEXION_GUARDADA",
        resourceId: b.provider,
      },
    });
  });
  return paymentConnections(a);
}
export async function deletePaymentConnection(a: Actor, p: string) {
  ownerOnly(a);
  provider.parse(p);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await owner(tx, a);
    await tx.paymentConnection.deleteMany({ where: { provider: p } });
    await recordActivity(tx, {
      data: { actorId: a.id, action: "PAGO_CONEXION_ELIMINADA", resourceId: p },
    });
  });
  return { deleted: true };
}
export async function verifyPaymentConnection(a: Actor, p: string) {
  ownerOnly(a);
  provider.parse(p);
  const c = await db.paymentConnection.findUnique({ where: { provider: p } });
  demand(c, "Guarda las credenciales primero.", 409);
  try {
    if (p === "paypal") await ppToken(c);
    else {
      const account = await mp(c, "/users/me");
      demand(
        String(account.id) === c.merchantId,
        "El identificador de vendedor no corresponde a la cuenta de Mercado Pago.",
        400,
      );
    }
  } catch (e) {
    await db.$transaction(async (tx) => {
      await owner(tx, a);
      await tx.paymentConnection.updateMany({
        where: { provider: p, revision: c.revision },
        data: {
          verifiedAt: null,
          verifiedRevision: null,
          error:
            "No se pudo verificar la cuenta. Revisa credenciales, entorno e identificador del vendedor.",
        },
      });
    });
    throw e;
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    await owner(tx, a);
    const changed = await tx.paymentConnection.updateMany({
      where: { provider: p, revision: c.revision },
      data: {
        verifiedAt: new Date(),
        verifiedRevision: c.revision,
        error: null,
      },
    });
    demand(
      changed.count === 1,
      "Las credenciales cambiaron; vuelve a verificar.",
      409,
    );
  });
  return paymentConnections(a);
}
const money = (cents: number) => (cents / 100).toFixed(2);
function cents(value: unknown) {
  demand(
    typeof value === "string" || typeof value === "number",
    "Importe de pago no válido.",
    502,
  );
  const raw = String(value);
  demand(/^\d+(\.\d{1,2})?$/.test(raw), "Importe de pago no válido.", 502);
  const [whole, part = ""] = raw.split(".");
  const n = BigInt(whole) * 100n + BigInt(part.padEnd(2, "0"));
  demand(n <= BigInt(Number.MAX_SAFE_INTEGER), "Importe fuera de rango.", 502);
  return Number(n);
}
export async function createPlanPurchase(a: Actor, input: unknown) {
  demand(
    a.role !== "OBSERVER",
    "Observador no puede contratar un plan de generación.",
    403,
  );
  const b = z
    .object({ provider, planId: z.string().max(80), requestId: z.uuid() })
    .strict()
    .parse(input);
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const user = await tx.user.findUnique({
      where: { id: a.id },
      select: { role: true, status: true },
    });
    demand(
      user?.status === "APPROVED" && user.role !== "OBSERVER",
      "Tu cuenta no puede contratar este plan.",
      403,
    );
    const existing = await tx.planPurchase.findUnique({
      where: { requestId: b.requestId },
    });
    if (existing) {
      demand(
        existing.userId === a.id &&
          existing.provider === b.provider &&
          existing.planId === b.planId,
        "La solicitud ya existe.",
        409,
      );
      return { order: existing, connection: null };
    }
    const plan = await tx.membershipPlan.findUnique({
      where: { id: b.planId },
    });
    demand(
      plan &&
        !plan.archivedAt &&
        ((plan.isPublic && !plan.customUserId) || plan.customUserId === a.id) &&
        plan.id !== "ILIMITADO" &&
        plan.priceCents > 0,
      "Plan no disponible.",
      404,
    );
    const c = await tx.paymentConnection.findUnique({
      where: { provider: b.provider },
    });
    demand(
      c && c.enabled && valid(c),
      "Esta pasarela necesita configuración y verificación del OWNER.",
      409,
    );
    const amount = Number(
      (BigInt(plan.priceCents) * c.exchangeRateMicros + 500000n) / 1000000n,
    );
    demand(
      amount > 0 && amount <= 100000000,
      "El importe convertido no es válido.",
    );
    const order = await tx.planPurchase.create({
      data: {
        userId: a.id,
        planId: plan.id,
        planName: plan.name,
        provider: b.provider,
        connectionRevision: c.revision,
        mode: c.mode,
        amountCents: amount,
        currency: c.currency,
        requestId: b.requestId,
      },
    });
    return { order, connection: c };
  });
  if (!result.connection) {
    demand(
      result.order.checkoutUrl,
      "El enlace de esta compra aún no está confirmado. Consulta Mis compras.",
      409,
    );
    return publicPurchase(result.order);
  }
  const { order: o, connection: c } = result;
  try {
    let data: any, url: string, externalId: string;
    if (c.provider === "paypal") {
      data = await pp(
        c,
        "/v2/checkout/orders",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: o.id,
              custom_id: o.id,
              payee: { merchant_id: c.merchantId },
              amount: {
                currency_code: o.currency,
                value: money(o.amountCents),
              },
              description: `Plan ${o.planName} · un mes`,
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: origin() + "/?view=plans&purchase=" + o.id,
                cancel_url: origin() + "/?view=plans&purchase=" + o.id,
                user_action: "PAY_NOW",
              },
            },
          },
        },
        o.id,
      );
      url = data.links?.find(
        (l: any) => l.rel === "payer-action" || l.rel === "approve",
      )?.href;
      externalId = data.id;
      demand(
        typeof url === "string" &&
          ["www.paypal.com", "www.sandbox.paypal.com"].includes(
            new URL(url).hostname,
          ) &&
          new URL(url).protocol === "https:",
        "PayPal no devolvió un enlace de pago válido.",
        502,
      );
    } else {
      data = await mp(c, "/checkout/preferences", {
        items: [
          {
            id: o.planId,
            title: `Plan ${o.planName} · un mes`,
            quantity: 1,
            currency_id: o.currency,
            unit_price: o.amountCents / 100,
          },
        ],
        external_reference: o.id,
        notification_url: origin() + "/api/payments/webhook/mercadopago",
        back_urls: {
          success: origin() + "/?view=plans&purchase=" + o.id,
          pending: origin() + "/?view=plans&purchase=" + o.id,
          failure: origin() + "/?view=plans&purchase=" + o.id,
        },
        auto_return: "approved",
      });
      url = c.mode === "LIVE" ? data.init_point : data.sandbox_init_point;
      externalId = data.id;
      demand(
        typeof url === "string" &&
          /^(www\.|sandbox\.)?mercadopago\.(com|com\.pe)$/.test(
            new URL(url).hostname,
          ) &&
          new URL(url).protocol === "https:",
        "Mercado Pago no devolvió un enlace válido.",
        502,
      );
    }
    demand(
      typeof externalId === "string" && externalId.length <= 150,
      "Identificador de compra no válido.",
      502,
    );
    const updated = await db.planPurchase.update({
      where: { id: o.id },
      data: { externalId, checkoutUrl: url, status: "PENDING" },
    });
    return publicPurchase(updated);
  } catch (e) {
    await db.planPurchase.update({
      where: { id: o.id },
      data: {
        status: "REVIEW",
        error:
          "No se confirmó la creación del enlace. Revisa antes de volver a pagar.",
      },
    });
    throw e;
  }
}
const publicPurchase = (o: PlanPurchase) => ({
  id: o.id,
  planName: o.planName,
  provider: o.provider,
  mode: o.mode,
  amountCents: o.amountCents,
  currency: o.currency,
  status: o.status,
  checkoutUrl: o.checkoutUrl,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
  error: o.error,
});
export async function myPurchases(a: Actor) {
  return (
    await db.planPurchase.findMany({
      where: { userId: a.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    })
  ).map(publicPurchase);
}
async function activate(
  c: PaymentConnection,
  o: PlanPurchase,
  paymentId: string,
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const current = await tx.paymentConnection.findUnique({
      where: { provider: c.provider },
    });
    demand(
      current?.revision === o.connectionRevision &&
        current.revision === c.revision,
      "La configuración de cobro cambió; se necesita revisión manual.",
      409,
    );
    const order = await tx.planPurchase.findUniqueOrThrow({
      where: { id: o.id },
    });
    if (["PAID", "TEST_COMPLETED"].includes(order.status))
      return publicPurchase(order);
    const duplicated = await tx.planPurchase.findUnique({
      where: { externalPaymentId: paymentId },
    });
    demand(
      !duplicated || duplicated.id === o.id,
      "El pago ya está asociado a otra compra.",
      409,
    );
    const user = await tx.user.findUniqueOrThrow({ where: { id: o.userId } });
    demand(
      user.status === "APPROVED" && user.role !== "OBSERVER",
      "La cuenta requiere revisión para activar el plan.",
      409,
    );
    if (c.mode === "LIVE") {
      const start =
        user.planValidUntil && user.planValidUntil > new Date()
          ? user.planValidUntil
          : new Date();
      const until = new Date(start.getTime() + 30 * 86400000);
      await tx.user.update({
        where: { id: o.userId },
        data: { planId: o.planId, planValidUntil: until },
      });
    }
    const updated = await tx.planPurchase.update({
      where: { id: o.id },
      data: {
        status: c.mode === "LIVE" ? "PAID" : "TEST_COMPLETED",
        paidAt: new Date(),
        externalPaymentId: paymentId,
        error: null,
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: o.userId,
        action: c.mode === "LIVE" ? "PLAN_PAGADO" : "PAGO_PRUEBA_CONFIRMADO",
        resourceId: o.id,
        detail: {
          plan: o.planName,
          provider: o.provider,
          amountCents: o.amountCents,
          currency: o.currency,
        },
      },
    });
    return publicPurchase(updated);
  });
}
async function paypalConfirmed(c: PaymentConnection, o: PlanPurchase) {
  const data = await pp(
    c,
    "/v2/checkout/orders/" + encodeURIComponent(o.externalId!),
  );
  const unit = data.purchase_units?.[0],
    captures = unit?.payments?.captures ?? [];
  const capture = captures.find((x: any) => x.status === "COMPLETED");
  if (!capture) return publicPurchase(o);
  demand(
    data.status === "COMPLETED" &&
      data.purchase_units.length === 1 &&
      unit.custom_id === o.id &&
      unit.payee?.merchant_id === c.merchantId &&
      capture.amount?.currency_code === o.currency &&
      cents(capture.amount.value) === o.amountCents &&
      capture.final_capture === true,
    "El pago no coincide con importe, vendedor o compra. Requiere revisión.",
    409,
  );
  demand(
    /^[A-Z0-9]{5,80}$/.test(capture.id),
    "Identificador de pago no válido.",
    502,
  );
  return activate(c, o, "paypal:" + capture.id);
}
async function mpConfirmed(c: PaymentConnection, paymentId: string) {
  demand(/^\d{1,40}$/.test(paymentId), "Identificador de pago no válido.");
  const data = await mp(c, "/v1/payments/" + paymentId);
  const o = await db.planPurchase.findUnique({
    where: { id: String(data.external_reference ?? "") },
  });
  demand(
    o && o.provider === "mercadopago" && o.connectionRevision === c.revision,
    "Compra no encontrada o configuración cambiada.",
    409,
  );
  if (data.status !== "approved") return publicPurchase(o);
  demand(
    String(data.collector_id) === c.merchantId &&
      data.currency_id === o.currency &&
      cents(data.transaction_amount) === o.amountCents &&
      data.live_mode === (c.mode === "LIVE") &&
      !data.transaction_amount_refunded,
    "El pago no coincide con vendedor, importe o entorno.",
    409,
  );
  return activate(c, o, "mercadopago:" + paymentId);
}
export async function refreshPurchase(a: Actor, id: string, capture = false) {
  const o = await db.planPurchase.findUnique({ where: { id } });
  demand(o && o.userId === a.id, "Compra no encontrada.", 404);
  if (["PAID", "TEST_COMPLETED"].includes(o.status)) return publicPurchase(o);
  const c = await db.paymentConnection.findUnique({
    where: { provider: o.provider },
  });
  demand(
    c && o.externalId && c.revision === o.connectionRevision,
    "La compra requiere revisión del OWNER.",
    409,
  );
  if (c.provider === "paypal") {
    if (capture) {
      await pp(
        c,
        "/v2/checkout/orders/" + encodeURIComponent(o.externalId) + "/capture",
        {},
        o.id + "-capture",
      );
    }
    return paypalConfirmed(c, o);
  }
  const payments = await mp(
    c,
    "/v1/payments/search?" +
      new URLSearchParams({
        external_reference: o.id,
        sort: "date_created",
        criteria: "desc",
        limit: "10",
      }),
  );
  const found = Array.isArray(payments.results)
    ? payments.results.find(
        (p: any) => p.status === "approved" && p.external_reference === o.id,
      )
    : null;
  return found ? mpConfirmed(c, String(found.id)) : publicPurchase(o);
}
export async function paymentWebhook(
  p: string,
  headers: Headers,
  params: URLSearchParams,
  input: unknown,
) {
  provider.parse(p);
  const c = await db.paymentConnection.findUnique({ where: { provider: p } });
  demand(c, "Pasarela no configurada.", 404);
  const event = input as any;
  if (p === "mercadopago") {
    const id = params.get("data.id") ?? "",
      sig = headers.get("x-signature") ?? "",
      requestId = headers.get("x-request-id") ?? "";
    const ts = /(?:^|,)\s*ts=(\d+)/.exec(sig)?.[1] ?? "",
      mac = /(?:^|,)\s*v1=([a-f0-9]{64})/.exec(sig)?.[1] ?? "";
    demand(
      /^\d{1,40}$/.test(id) &&
        requestId.length > 0 &&
        requestId.length < 200 &&
        ts &&
        mac,
      "Firma de notificación ausente.",
      401,
    );
    const timestamp = Number(ts);
    const seconds = timestamp > 1e12 ? timestamp / 1000 : timestamp;
    demand(
      Math.abs(Date.now() / 1000 - seconds) < 300,
      "La notificación caducó.",
      401,
    );
    const expected = createHmac("sha256", credentials(c).webhookSecret!)
      .update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest();
    demand(
      timingSafeEqual(expected, Buffer.from(mac, "hex")),
      "Firma de notificación inválida.",
      401,
    );
    if (event.type !== "payment") return { received: true };
    await mpConfirmed(c, id);
    return { received: true };
  }
  const k = credentials(c),
    required = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ];
  demand(
    required.every((h) => headers.has(h)),
    "Firma PayPal ausente.",
    401,
  );
  const verify = await pp(c, "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get(required[0]),
    cert_url: headers.get(required[1]),
    transmission_id: headers.get(required[2]),
    transmission_sig: headers.get(required[3]),
    transmission_time: headers.get(required[4]),
    webhook_id: k.webhookId,
    webhook_event: event,
  });
  demand(
    verify.verification_status === "SUCCESS",
    "Firma PayPal inválida.",
    401,
  );
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED")
    return { received: true };
  const id = event.resource?.supplementary_data?.related_ids?.order_id;
  demand(
    typeof id === "string" && /^[A-Z0-9]{5,80}$/.test(id),
    "Notificación PayPal no válida.",
  );
  const o = await db.planPurchase.findUnique({ where: { externalId: id } });
  demand(o && o.provider === "paypal", "Compra no encontrada.", 404);
  await paypalConfirmed(c, o);
  return { received: true };
}
