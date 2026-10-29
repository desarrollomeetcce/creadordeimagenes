import {
  metaEditorOnly,
  metaEditorUserWhere,
  metaActor,
} from "./workspace-access";
import { createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../db";
import { AppError, demand } from "../errors";
import { ownerOnly, rateLimit, tokenHash } from "../auth";
import { encryptKey, decryptKey } from "../crypto";
import { recordActivity } from "../activity";
import { boundedResponse, external, MetaReader } from "./provider";
import { redactGraphMessage } from "./graph-error";
import { saveToken, discover, type Actor } from "./service";
import { marketingOAuthInfo } from "./marketing-policy";
const cookieName = "meta_marketing_oauth",
  cookiePath = "/api/meta/marketing/oauth/callback";
const appSchema = z
  .object({
    appId: z.string().regex(/^\d{1,40}$/),
    appSecret: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{16,200}$/)
      .optional(),
    loginConfigId: z
      .string()
      .regex(/^\d{1,40}$/)
      .nullable()
      .default(null),
  })
  .strict();
export async function configureMarketingApp(
  actor: Actor,
  id: string,
  input: unknown,
) {
  await metaEditorOnly(actor);
  const b = appSchema.parse(input);
  await rateLimit("meta:app:" + actor.id, 20);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
    await metaEditorOnly(actor, tx);
    const c = await tx.metaConnection.findUnique({ where: { id } });
    demand(
      c?.transport === "API" && !c.disconnectedAt,
      "Selecciona una conexión Marketing API activa.",
      409,
    );
    demand(
      b.appSecret || (c.encryptedAppSecret && c.appId === b.appId),
      "Introduce la clave secreta de esta app en el campo seguro.",
      400,
    );
    await tx.metaConnection.update({
      where: { id },
      data: {
        appId: b.appId,
        loginConfigId: b.loginConfigId,
        ...(b.appSecret
          ? {
              encryptedAppSecret: encryptKey(b.appSecret, "meta-app:" + id),
              appSecretConfiguredAt: new Date(),
            }
          : {}),
        revision: { increment: 1 },
        verifiedAt: null,
        lastError: null,
      },
    });
    await tx.metaAdAccount.updateMany({
      where: { connectionId: id },
      data: {
        syncToken: null,
        syncLeaseAt: null,
        syncError: null,
        schedulerToken: null,
        schedulerRunId: null,
        nextSyncAt: null,
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_APP_OAUTH_CONFIGURADA",
        resourceId: id,
      },
    });
    return { ok: true };
  });
}
async function activeSession(id: string, ownerId: string) {
  demand(
    await db.session.findFirst({
      where: {
        id,
        userId: ownerId,
        expiresAt: { gt: new Date() },
        user: metaEditorUserWhere(),
      },
    }),
    "La sesión original ya no está autorizada. Inicia sesión y vuelve a conectar.",
    401,
  );
}
export async function beginMarketingOAuth(
  req: NextRequest,
  actor: Actor,
  id: string,
  manage = false,
) {
  await metaEditorOnly(actor);
  const info = marketingOAuthInfo(process.env.APP_ORIGIN);
  demand(
    req.headers.get("origin") === info.origin,
    "Origen no autorizado.",
    403,
  );
  const sessionId = tokenHash(req.cookies.get("session")?.value ?? "");
  await activeSession(sessionId, actor.id);
  await rateLimit("meta:marketing-oauth:" + actor.id, 20);
  const c = await db.metaConnection.findUnique({ where: { id } });
  demand(
    c?.transport === "API" &&
      c.appId &&
      c.encryptedAppSecret &&
      !c.disconnectedAt,
    "Guarda el ID y la clave secreta de tu app antes de conectar con Facebook.",
    409,
  );
  demand(
    /^v\d{2}\.0$/.test(c.apiVersion),
    "Configura una versión Graph válida.",
  );
  const state = randomBytes(32).toString("base64url"),
    browser = randomBytes(32).toString("base64url"),
    key = tokenHash(state);
  await db.metaOAuthState.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { ownerId: actor.id, purpose: "MARKETING_API" },
      ],
    },
  });
  await db.metaOAuthState.create({
    data: {
      id: key,
      purpose: "MARKETING_API",
      connectionId: id,
      ownerId: actor.id,
      sessionId,
      connectionRevision: c.revision,
      browserHash: tokenHash(browser),
      verifier: encryptKey(
        manage ? "marketing-manage-flow" : "marketing-code-flow",
        "meta-marketing-oauth:" + key,
      ),
      clientId: c.appId,
      tokenEndpoint: `https://graph.facebook.com/${c.apiVersion}/oauth/access_token`,
      redirectUri: info.callbackUrl,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  const url = new URL(`https://www.facebook.com/${c.apiVersion}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: c.appId,
    redirect_uri: info.callbackUrl,
    response_type: "code",
    state,
    ...(c.loginConfigId
      ? { config_id: c.loginConfigId, override_default_response_type: "true" }
      : { scope: manage ? "ads_read,ads_management" : "ads_read" }),
  }).toString();
  const response = NextResponse.json(
    { url: url.href },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(cookieName, browser, {
    httpOnly: true,
    secure: info.origin.startsWith("https:"),
    sameSite: "lax",
    path: cookiePath,
    maxAge: 600,
  });
  return response;
}
async function graphJSON(
  url: string,
  init: RequestInit,
  secrets: string[],
  phase: string,
) {
  const response = await external(url, init);
  let value: any;
  try {
    value = JSON.parse(await boundedResponse(response, 200000));
  } catch {
    throw new AppError(
      "Meta devolvió una respuesta incompatible durante " + phase + ".",
      502,
    );
  }
  if (!response.ok || value?.error) {
    const e = value?.error ?? {},
      code = Number.isSafeInteger(e.code) ? e.code : null,
      subcode = Number.isSafeInteger(e.error_subcode) ? e.error_subcode : null;
    let message =
      typeof e.message === "string"
        ? e.message
        : "Revisa la configuración y los permisos de la app.";
    for (const secret of secrets) message = redactGraphMessage(message, secret);
    throw new AppError(
      `Meta rechazó ${phase}${code !== null ? ` · código ${code}` : ""}${subcode !== null ? `/${subcode}` : ""}: ${message}`,
      502,
    );
  }
  return value;
}
function tokenValue(raw: any) {
  demand(
    typeof raw?.access_token === "string" &&
      raw.access_token.length >= 10 &&
      raw.access_token.length <= 12000 &&
      !/\s/.test(raw.access_token),
    "Meta no devolvió un token de usuario compatible.",
    502,
  );
  demand(
    raw.expires_in === undefined ||
      (Number.isFinite(Number(raw.expires_in)) &&
        Number(raw.expires_in) > 0 &&
        Number(raw.expires_in) <= 315360000),
    "Meta informó una caducidad inválida.",
    502,
  );
  demand(
    raw.token_type === undefined ||
      String(raw.token_type).toLowerCase() === "bearer",
    "Meta no devolvió una credencial Bearer compatible.",
    502,
  );
  return raw.access_token as string;
}
export async function finishMarketingOAuth(req: NextRequest) {
  try {
    const info = marketingOAuthInfo(process.env.APP_ORIGIN),
      p = req.nextUrl.searchParams;
    const state = p.get("state");
    demand(
      state && state.length <= 200,
      "Falta el estado de autorización. Inicia de nuevo desde Meta Ads.",
      400,
    );
    const row = await db.metaOAuthState.findUnique({
      where: { id: tokenHash(state) },
    });
    demand(
      row?.purpose === "MARKETING_API" &&
        row.expiresAt > new Date() &&
        row.redirectUri === info.callbackUrl &&
        row.browserHash === tokenHash(req.cookies.get(cookieName)?.value ?? ""),
      "La autorización caducó o no corresponde a esta instalación y navegador.",
      400,
    );
    await activeSession(row.sessionId, row.ownerId);
    const c = await db.metaConnection.findFirst({
      where: {
        id: row.connectionId,
        revision: row.connectionRevision,
        transport: "API",
        disconnectedAt: null,
      },
    });
    demand(
      c?.appId === row.clientId && c.encryptedAppSecret,
      "La conexión o la app cambió durante la autorización. Inicia de nuevo.",
      409,
    );
    const flow = decryptKey(row.verifier, "meta-marketing-oauth:" + row.id);
    demand(
      row.tokenEndpoint ===
        `https://graph.facebook.com/${c.apiVersion}/oauth/access_token` &&
        ["marketing-code-flow", "marketing-manage-flow"].includes(flow),
      "El estado de autorización no es compatible.",
      400,
    );
    demand(
      (
        await db.metaOAuthState.deleteMany({
          where: { id: row.id, purpose: "MARKETING_API" },
        })
      ).count,
      "Esta autorización ya se utilizó.",
      409,
    );
    demand(
      !p.get("error"),
      "La autorización fue cancelada o Facebook no concedió el acceso. Tu conexión anterior se conserva.",
      400,
    );
    const code = p.get("code");
    demand(
      code && code.length <= 4000,
      "Meta no devolvió un código de autorización válido.",
      400,
    );
    const secret = decryptKey(c.encryptedAppSecret, "meta-app:" + c.id);
    const post = (body: URLSearchParams, secrets: string[], phase: string) =>
      graphJSON(
        row.tokenEndpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        },
        secrets,
        phase,
      );
    const short = tokenValue(
      await post(
        new URLSearchParams({
          client_id: c.appId,
          client_secret: secret,
          redirect_uri: info.callbackUrl,
          code,
        }),
        [secret, code],
        "el intercambio del código",
      ),
    );
    await activeSession(row.sessionId, row.ownerId);
    const long = await post(
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: c.appId,
        client_secret: secret,
        fb_exchange_token: short,
      }),
      [secret, short, code],
      "el intercambio por un token de larga duración",
    );
    await activeSession(row.sessionId, row.ownerId);
    const token = tokenValue(long),
      proof = createHmac("sha256", secret).update(token).digest("hex"),
      headers = { Authorization: "Bearer " + token };
    const read = (path: string, fields: string) => {
      const u = new URL(`https://graph.facebook.com/${c.apiVersion}/${path}`);
      u.search = new URLSearchParams({
        fields,
        appsecret_proof: proof,
      }).toString();
      return graphJSON(
        u.href,
        { headers },
        [secret, short, token, code, proof],
        "la verificación de " + path,
      );
    };
    const me = await read("me", "id");
    demand(
      typeof me.id === "string" && /^\d{1,40}$/.test(me.id),
      "Meta no confirmó una identidad de usuario válida.",
      502,
    );
    await activeSession(row.sessionId, row.ownerId);
    const permissions = await read("me/permissions", "permission,status");
    demand(
      Array.isArray(permissions.data) &&
        permissions.data.some(
          (r: any) => r.permission === "ads_read" && r.status === "granted",
        ),
      "Facebook no concedió ads_read. Revisa los permisos de tu app y vuelve a conectar.",
      403,
    );
    if (flow === "marketing-manage-flow")
      demand(
        permissions.data.some(
          (r: { permission: string; status: string }) =>
            r.permission === "ads_management" && r.status === "granted",
        ),
        "Facebook no concedió ads_management. Habilita ese permiso en la app y autoriza nuevamente. Tu conexión anterior se conserva.",
        403,
      );
    await activeSession(row.sessionId, row.ownerId);
    await new MetaReader(token, "API", c.apiVersion, secret).get("accounts", {
      accountView: "minimal",
    });
    await activeSession(row.sessionId, row.ownerId);
    const revision = await saveToken(c.id, token, row.connectionRevision, {
      method: "OAUTH",
      expiresAt:
        long.expires_in === undefined
          ? null
          : new Date(Date.now() + Number(long.expires_in) * 1000),
      metaUserId: me.id,
      sessionId: row.sessionId,
      actorId: row.ownerId,
    });
    await discover(await metaActor(row.ownerId), c.id, revision, row.sessionId);
    await activeSession(row.sessionId, row.ownerId);
    return finishResponse(
      NextResponse.redirect(
        new URL("/?view=metaads&metaTab=connections", info.origin),
        303,
      ),
    );
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : "No se pudo completar OAuth con tu app. Comprueba su configuración y vuelve a Conexiones.";
    const escaped = message.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
    return finishResponse(
      new NextResponse(
        `<!doctype html><html lang="es"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><title>Autorización de Marketing API</title><h1>No se completó la conexión con Facebook</h1><p>${escaped}</p><a href="/?view=metaads&amp;metaTab=connections">Volver a Conexiones</a></html>`,
        {
          status: error instanceof AppError ? error.status : 503,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy":
              "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        },
      ),
    );
  }
}
function finishResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    secure: (process.env.APP_ORIGIN ?? "").startsWith("https:"),
    sameSite: "lax",
    path: cookiePath,
    maxAge: 0,
  });
  return response;
}
