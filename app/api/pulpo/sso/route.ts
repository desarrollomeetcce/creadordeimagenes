import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { tokenHash } from "../../../../lib/auth";
import { linkedGeneratorUser, verifyPulpoAssertion } from "../../../../lib/pulpo-sso";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const denied = () => new NextResponse(
  "No se pudo abrir el Generador con tu cuenta de Pulpo. Revisa el acceso con tu administrador.",
  { status: 403, headers },
);

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== "https://pulpo.agenciamagneto.org" ||
      request.headers.get("sec-fetch-site") === "cross-site" ||
      !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
    return denied();

  const body = await request.text();
  if (body.length > 1500) return denied();
  const token = new URLSearchParams(body).get("assertion") || "";
  const assertion = verifyPulpoAssertion(token, process.env.PULPO_GENERATOR_SSO_KEY || "");
  if (!assertion) return denied();
  const userId = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS || "", assertion);
  if (!userId) return denied();

  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 8 * 3600000);
  const admitted = await db.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<
      { email: string; status: string; role: string; archivedAt: Date | null }[]
    >`SELECT "email", "status", "role", "archivedAt" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!user || user.email.trim().toLowerCase() !== assertion.email ||
        user.status !== "APPROVED" || user.archivedAt ||
        (assertion.page === "plans" && user.role !== "OWNER")) return false;
    const now = new Date();
    const deadline = new Date(assertion.exp * 1000);
    if (deadline <= now) return false;
    await tx.rateLimit.deleteMany({ where: { key: { startsWith: "pulpo-sso:" }, expiresAt: { lt: now } } });
    const used = await tx.rateLimit.createMany({
      data: [{ key: "pulpo-sso:" + assertion.nonce, count: 1, expiresAt: deadline }],
      skipDuplicates: true,
    });
    if (used.count !== 1) return false;
    await tx.session.create({ data: { id: tokenHash(raw), userId, expiresAt: expires } });
    return true;
  });
  if (!admitted) return denied();

  const path = assertion.page === "plans" ? "/?view=users&tab=plans" : "/";
  const response = NextResponse.redirect("https://generator.agenciamagneto.org" + path, { status: 303, headers });
  response.cookies.set("session", raw, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", expires,
  });
  return response;
}
