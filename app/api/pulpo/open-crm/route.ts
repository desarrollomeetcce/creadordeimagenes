import { randomBytes } from "node:crypto";
import { actor } from "@/lib/auth";
import { crmDestination } from "@/lib/pulpo-crm-destinations";
import { signMenu } from "@/lib/pulpo-menu-token";
import { linkedMessagingUser } from "@/lib/pulpo-sso";

const origin = "https://pulpo.agenciamagneto.org";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("module") ?? "";
  const dest = crmDestination(id);
  if (!dest) return new Response("Módulo no disponible.", { status: 400 });
  const user = await actor().catch(() => null);
  const sub = user && linkedMessagingUser(user);
  const token =
    user &&
    sub &&
    signMenu("open-crm", sub, user.email.trim().toLowerCase(), undefined, id);
  if (!token) return Response.redirect(origin + dest, 303);
  const nonce = randomBytes(18).toString("base64url");
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><title>Abriendo Pulpo</title>
      <form id="open" method="post" action="${origin}/api/workspace-menu/open">
        <input type="hidden" name="grant" value="${token}">
        <button>Continuar a Pulpo</button>
      </form><script nonce="${nonce}">document.getElementById("open").submit()</script></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "origin",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action ${origin}; script-src 'nonce-${nonce}'`,
      },
    },
  );
}
