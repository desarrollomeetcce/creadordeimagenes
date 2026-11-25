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
  const linkedId = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS || "", assertion);
  if (!linkedId && !assertion.provision) return denied();

  const localSession = request.cookies.get("session")?.value;
  const raw = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (assertion.provision ? 30 * 60_000 : 8 * 3600_000));
  const admitted = await db.$transaction(async (tx) => {
    const now = new Date();
    const deadline = new Date(assertion.exp * 1000);
    if (deadline <= now) return false;
    await tx.rateLimit.deleteMany({ where: { key: { startsWith: "pulpo-sso:" }, expiresAt: { lt: now } } });
    const used = await tx.rateLimit.createMany({
      data: [{ key: "pulpo-sso:" + assertion.nonce, count: 1, expiresAt: deadline }],
      skipDuplicates: true,
    });
    if (used.count !== 1) return false;
    let userId = linkedId;
    if (!userId && assertion.provision) {
      let user = await tx.user.findUnique({ where: { pulpoUserId: assertion.sub } });
      if (!user) {
        if (assertion.page !== "home") return false;
        const occupied = await tx.user.findFirst({
          where: { email: { equals: assertion.email, mode: "insensitive" } },
          select: { id: true },
        });
        if (occupied) {
          // Linking an existing account requires its authenticated browser session.
          const signedIn = localSession && await tx.session.findFirst({
            where: {
              id: tokenHash(localSession),
              userId: occupied.id,
              expiresAt: { gt: now },
              user: { status: "APPROVED", archivedAt: null, pulpoUserId: null },
            },
            select: { id: true },
          });
          if (!signedIn) return false;
          const linked = await tx.user.updateMany({
            where: { id: occupied.id, pulpoUserId: null, status: "APPROVED", archivedAt: null },
            data: { pulpoUserId: assertion.sub },
          });
          if (!linked.count) return false;
        } else {
          await tx.user.createMany({
            data: [{
              pulpoUserId: assertion.sub,
              pulpoManagedLogin: true,
              email: assertion.email,
              name: assertion.name!.trim(),
              passwordHash: "$pulpo$" + randomBytes(32).toString("base64url"),
              role: "USER",
              status: "APPROVED",
            }],
            skipDuplicates: true,
          });
        }
        user = await tx.user.findUnique({ where: { pulpoUserId: assertion.sub } });
      }
      userId = user?.id ?? null;
    }
    if (!userId) return false;
    const [user] = await tx.$queryRaw<
      { email: string; status: string; role: string; archivedAt: Date | null; pulpoUserId: string | null }[]
    >`SELECT "email", "status", "role", "archivedAt", "pulpoUserId" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!user || user.email.trim().toLowerCase() !== assertion.email ||
        user.status !== "APPROVED" || user.archivedAt ||
        (user.pulpoUserId && user.pulpoUserId !== assertion.sub) ||
        (assertion.page === "plans" && user.role !== "OWNER") ||
        Date.now() >= deadline.getTime()) return false;
    await tx.session.create({ data: { id: tokenHash(raw), userId, expiresAt: expires } });
    return true;
  });
  if (!admitted) return denied();

  const path = assertion.page === "plans" ? "/?view=users&tab=plans"
    : assertion.view ? "/?view=" + assertion.view : "/";
  const response = NextResponse.redirect("https://generator.agenciamagneto.org" + path, { status: 303, headers });
  response.cookies.set("session", raw, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", expires,
  });
  return response;
}
