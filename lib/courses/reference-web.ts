import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";
import { demand } from "../errors";
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
export function publicReferenceURL(raw: string) {
  const u = new URL(raw);
  demand(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443"),
    "Usa un enlace HTTPS público sin credenciales.",
  );
  demand(
    !isIP(u.hostname) &&
      !u.hostname.includes(":") &&
      u.hostname.includes(".") &&
      !/\.(?:local|internal|localhost)\.?$/i.test(u.hostname),
    "Usa un dominio web público.",
  );
  u.hash = "";
  return u;
}
export function publicReferenceAddress(ip: string) {
  return isIP(ip) === 4 && !blocked.check(ip, "ipv4");
}
export function webReferenceText(html: string) {
  return html
    .replace(
      /<(script|style|nav|header|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos);/g,
      (e) =>
        ({
          "&nbsp;": " ",
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
        })[e]!,
    )
    .replace(/\s+/g, " ")
    .trim();
}
export async function readWebReference(
  raw: string,
  redirects = 0,
): Promise<{ url: string; text: string }> {
  demand(redirects <= 3, "El enlace redirige demasiadas veces.");
  const u = publicReferenceURL(raw),
    addresses = await lookup(u.hostname, { family: 4, all: true });
  demand(
    addresses.length > 0 &&
      addresses.every((a) => publicReferenceAddress(a.address)),
    "El enlace no resuelve a una web pública permitida.",
  );
  const result = await new Promise<{ redirect?: string; text?: string }>(
    (resolve, reject) => {
      const req = request(
        u,
        {
          method: "GET",
          headers: {
            Accept: "text/html, text/plain",
            "User-Agent": "CursosIA-Reference/1.0",
          },
          lookup: (_host, options, callback) => {
            if (options.all)
              callback(null, [{ address: addresses[0].address, family: 4 }]);
            else callback(null, addresses[0].address, 4);
          },
        },
        (res) => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0)) {
            res.resume();
            resolve({ redirect: res.headers.location });
            return;
          }
          if (
            res.statusCode !== 200 ||
            !/^(text\/html|text\/plain)(?:;|$)/i.test(
              res.headers["content-type"] ?? "",
            )
          ) {
            res.resume();
            reject(
              Error(
                "No se pudo leer texto público del enlace. Pega el contenido o adjunta un documento.",
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (b: Buffer) => {
            size += b.length;
            if (size > 2_000_000)
              res.destroy(
                Error(
                  "La página supera el tamaño de lectura; adjunta un extracto.",
                ),
              );
            else chunks.push(b);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              text: webReferenceText(Buffer.concat(chunks).toString("utf8")),
            }),
          );
        },
      );
      req.setTimeout(12000, () =>
        req.destroy(Error("La página tardó demasiado. Puedes pegar su texto.")),
      );
      const deadline = setTimeout(
        () => req.destroy(Error("Tiempo de lectura agotado.")),
        15000,
      );
      req.on("close", () => clearTimeout(deadline));
      req.on("error", reject);
      req.end();
    },
  );
  if (result.redirect)
    return readWebReference(new URL(result.redirect, u).href, redirects + 1);
  demand(
    result.text && result.text.length >= 30,
    "No se encontró texto utilizable. Pega el contenido de la página.",
  );
  return { url: u.href, text: result.text };
}
