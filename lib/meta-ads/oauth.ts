import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { ownerOnly, tokenHash, rateLimit } from "../auth";
import { encryptKey, decryptKey } from "../crypto";
import { demand, AppError } from "../errors";
import { MCP_URL, external, boundedResponse, safeMetaURL } from "./provider";
import { saveToken, discover, type Actor } from "./service";
import { oauthClientMetadata, oauthDiscovery } from "./oauth-policy";
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");
async function json(url: string, init?: RequestInit) {
  const r = await external(url, init);
  demand(
    r.ok,
    "Meta no aceptó la solicitud OAuth o el registro de este cliente. Necesitas un cliente MCP oficial con esta URL de retorno autorizada; Marketing API sigue disponible.",
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
  await rateLimit("meta:oauth:" + actor.id, 20);
  const rawSession = req.cookies.get("session")?.value;
  demand(
    rawSession &&
      (await db.session.findFirst({
        where: {
          id: tokenHash(rawSession),
          userId: actor.id,
          expiresAt: { gt: new Date() },
          user: { role: "OWNER", status: "APPROVED" },
        },
      })),
    "Inicia sesión de nuevo.",
    401,
  );
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
  const policy = oauthDiscovery(protectedResource, meta, issuer.href);
  const { auth, token } = policy;
  const origin = process.env.APP_ORIGIN;
  demand(origin, "Falta configurar APP_ORIGIN en el servidor.", 503);
  const client = oauthClientMetadata(origin),
    redirectUri = client.redirect_uris[0];
  if (!clientId && meta.client_id_metadata_document_supported === true)
    clientId = client.client_id;
  if (!clientId) {
    demand(
      meta.registration_endpoint,
      "Meta requiere un ID de cliente MCP registrado con esta URL de retorno. Un ID de app Graph no lo sustituye. Utiliza Marketing API si no dispones de ese cliente.",
      409,
    );
    const registrationURL = safeMetaURL(meta.registration_endpoint);
    demand(
      registrationURL.origin === issuer.origin,
      "Meta publicó un registro OAuth no compatible.",
      409,
    );
    const { client_id: _publicId, ...metadata } = client;
    const registration = await json(registrationURL.href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    demand(
      typeof registration.client_id === "string" &&
        registration.client_id.length > 0 &&
        registration.client_id.length <= 300 &&
        registration.token_endpoint_auth_method === "none" &&
        !registration.client_secret,
      "Meta no registró un cliente público compatible. Necesitas un cliente MCP oficialmente autorizado y su URL de retorno registrada, o Marketing API.",
      409,
    );
    demand(
      !registration.redirect_uris ||
        (Array.isArray(registration.redirect_uris) &&
          registration.redirect_uris.includes(redirectUri)),
      "Meta no registró la URL de retorno de esta plataforma. Utiliza un cliente autorizado para esta URL o Marketing API.",
      409,
    );
    clientId = registration.client_id;
  }
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url"),
    browser = randomBytes(32).toString("base64url");
  demand(
    typeof clientId === "string" &&
      clientId.length > 0 &&
      clientId.length <= 300,
    "Meta no devolvió un ID de cliente compatible.",
    409,
  );
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
      verifier: encryptKey(
        JSON.stringify({
          verifier,
          issuer: policy.issuer,
          requireIssuer: policy.requireIssuer,
        }),
        "meta-oauth:" + hash(state),
      ),
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
  auth.searchParams.set("scope", policy.scopes.join(" "));
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
    const binding = JSON.parse(
      decryptKey(row.verifier, "meta-oauth:" + row.id),
    );
    demand(
      typeof binding.verifier === "string" &&
        typeof binding.issuer === "string",
      "Inicia una nueva autorización MCP.",
      400,
    );
    demand(
      (!binding.requireIssuer && !params.has("iss")) ||
        params.get("iss")?.replace(/\/$/, "") === binding.issuer,
      "El emisor de la respuesta OAuth no coincide.",
      400,
    );
    const currentSession = async () =>
      demand(
        await db.session.findFirst({
          where: {
            id: row.sessionId,
            userId: row.ownerId,
            expiresAt: { gt: new Date() },
            user: { role: "OWNER", status: "APPROVED" },
          },
        }),
        "La sesión original ya no está autorizada.",
        401,
      );
    const token = await json(row.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: row.clientId,
        redirect_uri: row.redirectUri,
        code_verifier: binding.verifier,
        resource: MCP_URL,
      }).toString(),
    });
    demand(
      typeof token.access_token === "string" &&
        token.access_token.length > 0 &&
        token.access_token.length < 12000 &&
        !/\s/.test(token.access_token) &&
        typeof token.token_type === "string" &&
        token.token_type.toLowerCase() === "bearer" &&
        (token.expires_in === undefined ||
          (Number.isFinite(Number(token.expires_in)) &&
            Number(token.expires_in) > 0)),
      "Meta no devolvió un token compatible.",
      502,
    );
    await currentSession();
    const revision = await saveToken(
      row.connectionId,
      token.access_token,
      row.connectionRevision,
    );
    const verified = await discover(
      { id: row.ownerId, role: "OWNER" },
      row.connectionId,
      revision,
      row.sessionId,
    );
    await currentSession();
    demand(
      verified.accounts >= 0,
      "No se pudo consultar las cuentas publicitarias.",
      502,
    );
    const response = NextResponse.redirect(
      new URL("/?view=metaads&metaTab=connections", row.redirectUri),
      303,
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set("meta_oauth", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/meta/oauth/callback",
      maxAge: 0,
    });
    return response;
  } catch (e) {
    const message =
      e instanceof AppError
        ? e.message
        : "No se pudo completar la autorización MCP. Vuelve a Conexiones.";
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
    const response = new NextResponse(
      `<!doctype html><html lang="es"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width"><title>Conexión MCP no verificada</title><body><h1>No se completó la conexión con Meta</h1><p>${escaped}</p><p>No se ha confirmado acceso a las cuentas. Puedes volver a intentar OAuth o configurar Marketing API.</p><a href="/?view=metaads&amp;metaTab=connections">Volver a Conexiones</a></body></html>`,
      {
        status: e instanceof AppError ? e.status : 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        },
      },
    );
    response.cookies.set("meta_oauth", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/api/meta/oauth/callback",
      maxAge: 0,
    });
    return response;
  }
}
