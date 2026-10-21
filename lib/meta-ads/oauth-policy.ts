import { demand } from "../errors";
import { MCP_URL, safeMetaURL } from "./provider";
const canonical = (url: string) => safeMetaURL(url).href.replace(/\/$/, "");
export function oauthClientMetadata(origin: string) {
  const u = new URL(origin);
  demand(
    !u.username &&
      !u.password &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(u.hostname))),
    "APP_ORIGIN debe usar HTTPS (salvo desarrollo local).",
    503,
  );
  return {
    client_id: new URL("/api/meta/oauth/client", u.origin).href,
    client_name: "Creador de Imágenes · Meta Ads",
    client_uri: u.origin,
    redirect_uris: [new URL("/api/meta/oauth/callback", u.origin).href],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}
export function oauthDiscovery(
  resource: Record<string, any>,
  meta: Record<string, any>,
  issuerURL: string,
) {
  const issuer = canonical(issuerURL);
  demand(
    [MCP_URL, "https://mcp.facebook.com"].includes(issuer),
    "El recurso MCP publicó un servidor de autorización no compatible. Utiliza Marketing API.",
    409,
  );
  demand(
    resource.resource === MCP_URL &&
      Array.isArray(resource.authorization_servers) &&
      resource.authorization_servers.some(
        (s: unknown) => typeof s === "string" && canonical(s) === issuer,
      ),
    "Los metadatos OAuth no corresponden al recurso Meta Ads.",
    409,
  );
  demand(
    typeof meta.issuer === "string" && canonical(meta.issuer) === issuer,
    "Meta publicó un emisor OAuth distinto al servidor anunciado. No se omitirá esta validación; utiliza Marketing API o espera la corrección de Meta.",
    409,
  );
  const auth = safeMetaURL(meta.authorization_endpoint),
    token = safeMetaURL(meta.token_endpoint);
  demand(
    auth.hostname === "www.facebook.com" &&
      /^\/(?:v\d{1,3}\.0\/)?dialog\/oauth$/.test(auth.pathname) &&
      token.hostname === "graph.facebook.com" &&
      /^\/(?:v\d{1,3}\.0\/)?oauth\/access_token$/.test(token.pathname) &&
      !auth.hash &&
      !token.hash,
    "Meta publicó endpoints OAuth no compatibles. Utiliza Marketing API.",
    409,
  );
  demand(
    Array.isArray(meta.code_challenge_methods_supported) &&
      meta.code_challenge_methods_supported.includes("S256"),
    "Meta no declara PKCE S256; no se iniciará un flujo inseguro.",
    409,
  );
  demand(
    !meta.token_endpoint_auth_methods_supported ||
      meta.token_endpoint_auth_methods_supported.includes("none"),
    "Meta exige un cliente confidencial no admitido por esta conexión. Necesitas un cliente MCP público autorizado o Marketing API.",
    409,
  );
  const advertised = resource.scopes_supported ?? meta.scopes_supported;
  demand(
    !advertised ||
      (Array.isArray(advertised) && advertised.includes("ads_read")),
    "El servidor no anuncia ads_read para esta conexión. Utiliza Marketing API.",
    409,
  );
  const scopes = [
    "ads_read",
    "business_management",
    "ads_mcp_management",
  ].filter((s) => (!advertised ? s === "ads_read" : advertised.includes(s)));
  return {
    issuer,
    auth,
    token,
    scopes,
    requireIssuer: meta.authorization_response_iss_parameter_supported === true,
  };
}
