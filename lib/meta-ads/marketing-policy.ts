import { demand } from "../errors";
export function marketingOAuthInfo(raw: string | undefined) {
  demand(raw, "Falta configurar APP_ORIGIN en el servidor.", 503);
  let origin: URL;
  try { origin = new URL(raw); } catch { throw Error("APP_ORIGIN no es una URL válida."); }
  demand(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash && (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))), "APP_ORIGIN debe ser el dominio HTTPS de esta instalación (HTTP solo en desarrollo local).", 503);
  return { origin: origin.origin, callbackUrl: new URL("/api/meta/marketing/oauth/callback", origin.origin).href, scope: "ads_read" };
}
