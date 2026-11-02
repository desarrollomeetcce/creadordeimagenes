import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { unsealHistory } from "../lib/meta-ads/sealed-history";
function seal(value: unknown, key = randomBytes(32)) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("financial-history-import:v1"));
  const body = Buffer.concat([
    cipher.update(gzipSync(JSON.stringify(value))),
    cipher.final(),
  ]);
  return {
    envelope: [
      "v1",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join("."),
    key: key.toString("base64url"),
  };
}
test("Paquete privado: autenticación de contenido, clave separada y límite descomprimido", () => {
  const data = { version: 1, text: "Datos sintéticos con acentos" },
    p = seal(data);
  assert.deepEqual(unsealHistory(p.envelope, p.key), data);
  assert.throws(() =>
    unsealHistory(p.envelope, randomBytes(32).toString("base64url")),
  );
  const parts = p.envelope.split(".");
  parts[2] = randomBytes(16).toString("base64url");
  assert.throws(() => unsealHistory(parts.join("."), p.key));
  assert.throws(() => unsealHistory(p.envelope, "invalid"));
  assert.throws(() => unsealHistory(p.envelope + ".extra", p.key));
  const large = seal({ data: "x".repeat(1800001) });
  assert.throws(() => unsealHistory(large.envelope, large.key));
});
