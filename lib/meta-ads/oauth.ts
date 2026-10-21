import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { ownerOnly, tokenHash } from "../auth";
import { encryptKey, decryptKey } from "../crypto";
import { demand, AppError } from "../errors";
import { MCP_URL, external, boundedResponse, safeMetaURL } from "./provider";
import { saveToken, type Actor } from "./service";
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
async function json(url: string, init?: RequestInit) {
  const r = await external(url, init);
  demand(
    r.ok,
    "Meta no aceptó el descubrimiento OAuth. Puedes utilizar un token MCP autorizado o configurar un cliente compatible.",
    409,
  );
  try {
    return JSON.parse(await boundedResponse(r, 200000));
  } catch {
    throw new AppError("La configuración OAuth de Meta no es compatible.", 409);
  }
}
export async function beginOAuth(
  req: NextRequest,
  actor: Actor,
  id: string,
  clientId?: string,
) {
  ownerOnly(actor);
  const c = await db.metaConnection.findUniqueOrThrow({ where: { id } });
  demand(c.transport === "MCP", "Esta autorización corresponde a MCP.");
  const protectedResource = await json(
    "https://mcp.facebook.com/.well-known/oauth-protected-resource/ads",
  );
  demand(
    Array.isArray(protectedResource.authorization_servers) &&
      protectedResource.authorization_servers.length,
    "Meta no publicó un servidor OAuth compatible. Usa un token MCP autorizado.",
    409,
  );
  const issuer = safeMetaURL(protectedResource.authorization_servers[0]);
  const metadataURL = new URL(
    "/.well-known/oauth-authorization-server" +
      (issuer.pathname === "/" ? "" : issuer.pathname),
    issuer.origin,
  );
  const meta = await json(metadataURL.href);
  const auth = safeMetaURL(meta.authorization_endpoint),
    token = safeMetaURL(meta.token_endpoint);
  demand(
    meta.code_challenge_methods_supported?.includes("S256"),
    "Meta no declara PKCE S256; no se iniciará un flujo inseguro.",
    409,
  );
  const origin = process.env.APP_ORIGIN;
  demand(origin, "Falta configurar APP_ORIGIN en el servidor.", 503);
  const redirectUri = new URL("/api/meta/oauth/callback", origin).href;
  if (!clientId) {
    demand(
      meta.registration_endpoint,
      "Este servidor MCP requiere un ID de cliente OAuth registrado. Colócalo en la conexión.",
      409,
    );
    const registration = await json(
      safeMetaURL(meta.registration_endpoint).href,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Creador de Imágenes · Meta Ads",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      },
    );
    demand(
      registration.client_id &&
        (!registration.token_endpoint_auth_method ||
          registration.token_endpoint_auth_method === "none"),
      "El registro MCP requiere un tipo de cliente no admitido. Configura un cliente público con PKCE.",
      409,
    );
    clientId = String(registration.client_id);
  }
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url"),
    browser = randomBytes(32).toString("base64url");
  const rawSession = req.cookies.get("session")?.value;
  demand(rawSession, "Inicia sesión de nuevo.", 401);
  await db.metaOAuthState.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { ownerId: actor.id }] },
  });
  await db.metaOAuthState.create({
    data: {
      id: hash(state),
      connectionId: id,
      ownerId: actor.id,
      sessionId: tokenHash(rawSession),
      connectionRevision: c.revision,
      verifier: encryptKey(verifier, "meta-oauth:" + hash(state)),
      browserHash: hash(browser),
      tokenEndpoint: token.href,
      clientId,
      redirectUri,
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", hash(verifier));
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("resource", MCP_URL);
  if (
    Array.isArray(protectedResource.scopes_supported) &&
    protectedResource.scopes_supported.length
  )
    auth.searchParams.set(
      "scope",
      protectedResource.scopes_supported
        .filter((s: unknown) => typeof s === "string" && /read/i.test(s))
        .join(" "),
    );
  const response = NextResponse.json({ url: auth.href });
  response.cookies.set("meta_oauth", browser, {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax",
    path: "/api/meta/oauth/callback",
    maxAge: 600,
  });
  return response;
}
export async function finishOAuth(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams,
      state = params.get("state"),
      code = params.get("code");
    demand(
      state && code && !params.get("error"),
      "La autorización de Meta no se completó. Vuelve a conectar desde Meta Ads.",
      400,
    );
    const row = await db.metaOAuthState.findUnique({
      where: { id: hash(state) },
    });
    demand(
      row &&
        row.expiresAt > new Date() &&
        hash(req.cookies.get("meta_oauth")?.value ?? "") === row.browserHash,
      "La autorización caducó o no corresponde a este navegador.",
      400,
    );
    const session = await db.session.findFirst({
      where: {
        id: row.sessionId,
        userId: row.ownerId,
        expiresAt: { gt: new Date() },
        user: { role: "OWNER", status: "APPROVED" },
      },
    });
    demand(session, "La sesión original ya no está autorizada.", 401);
    demand(
      (await db.metaOAuthState.deleteMany({ where: { id: row.id } })).count,
      "La autorización ya se utilizó.",
      409,
    );
    const token = await json(row.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: row.clientId,
        redirect_uri: row.redirectUri,
        code_verifier: decryptKey(row.verifier, "meta-oauth:" + row.id),
        resource: MCP_URL,
      }).toString(),
    });
    demand(
      typeof token.access_token === "string" &&
        token.access_token.length < 12000,
      "Meta no devolvió un token compatible.",
      502,
    );
    await saveToken(
      row.connectionId,
      token.access_token,
      row.connectionRevision,
    );
    const response = new NextResponse(
      '<!doctype html><html lang="es"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><title>Meta conectado</title><body><h1>Autorización recibida</h1><p>Ahora verifica las cuentas y herramientas disponibles.</p><a href="/?view=metaads">Volver a Meta Ads</a></body></html>',
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        },
      },
    );
    response.cookies.delete("meta_oauth");
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "No se pudo completar la autorización MCP. Vuelve a Conexiones.",
      },
      {
        status: e instanceof AppError ? e.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
