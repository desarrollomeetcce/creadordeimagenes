import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../app/api/pulpo/sso/route";
import { db } from "../lib/db";
import { tokenHash } from "../lib/auth";

test("provisions one Generator profile and only links an existing email with account proof", async () => {
  assert.match(process.env.DATABASE_URL ?? "", /localhost:55439\/delivery_qa$/);
  const key = randomBytes(32).toString("hex");
  process.env.PULPO_GENERATOR_SSO_KEY = key;
  process.env.PULPO_GENERATOR_LINKS = "{}";
  const fresh = { sub: randomUUID(), email: randomUUID() + "@example.test" };
  const existing = { sub: randomUUID(), email: randomUUID() + "@example.test" };
  const send = (identity: typeof fresh, nonce: string, session?: string) => {
    const payload = Buffer.from(JSON.stringify({
      ...identity, aud: "pulpo-generador", exp: Math.floor(Date.now() / 1000) + 30,
      nonce, page: "home", provision: true, name: "Usuario de prueba",
    })).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(key, "hex"))
      .update("pulpo-sso:v1:" + payload).digest("base64url");
    return POST(new NextRequest("https://generator.agenciamagneto.org/api/pulpo/sso", {
      method: "POST",
      headers: {
        origin: "https://pulpo.agenciamagneto.org",
        "sec-fetch-site": "same-site",
        ...(session ? { cookie: "session=" + session } : {}),
      },
      body: new URLSearchParams({ assertion: payload + "." + sig }),
    }));
  };
  const nonce = () => randomBytes(24).toString("base64url");
  try {
    const firstNonce = nonce();
    const created = await send(fresh, firstNonce);
    assert.equal(created.status, 303);
    assert.equal(created.headers.get("location"), "https://generator.agenciamagneto.org/");
    assert.ok(created.headers.get("set-cookie")?.includes("HttpOnly"));
    assert.equal((await send(fresh, firstNonce)).status, 403);
    assert.equal((await send(fresh, nonce())).status, 303);
    const profile = await db.user.findUniqueOrThrow({ where: { email: fresh.email } });
    assert.equal(profile.pulpoUserId, fresh.sub);
    assert.equal(profile.role, "USER");
    assert.equal(profile.pulpoManagedLogin, true);

    const native = await db.user.create({
      data: { email: existing.email, name: "Cuenta existente", passwordHash: "fixture", role: "ADMIN", status: "APPROVED" },
    });
    assert.equal((await send(existing, nonce())).status, 403);
    const local = randomBytes(32).toString("base64url");
    await db.session.create({ data: { id: tokenHash(local), userId: native.id, expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await send(existing, nonce(), local)).status, 303);
    assert.equal((await send(existing, nonce())).status, 303);
    const linked = await db.user.findUniqueOrThrow({ where: { id: native.id } });
    assert.equal(linked.pulpoUserId, existing.sub);
    assert.equal(linked.role, "ADMIN");
    assert.equal(linked.passwordHash, "fixture");
  } finally {
    await db.session.deleteMany({ where: { user: { email: { in: [fresh.email, existing.email] } } } });
    await db.user.deleteMany({ where: { email: { in: [fresh.email, existing.email] } } });
    await db.$disconnect();
  }
});
