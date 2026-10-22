import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { ownerOnly, rateLimit, tokenHash } from "./auth";
import { recordActivity } from "./activity";
export const privacyRequestSchema = z.object({
  kind: z.enum(["PRIVACY", "DELETE_ACCOUNT", "DELETE_META", "DELETE_FILES", "OTHER"]),
  name: z.string().trim().max(100).default(""),
  email: z.email().max(200).transform(v => v.toLowerCase()),
  message: z.string().trim().min(15).max(6000),
  consent: z.literal(true),
  website: z.literal("").default(""),
}).strict();
const publicSelect = { id: true, status: true, reply: true, createdAt: true, updatedAt: true } as const;
export async function createPrivacyRequest(input: unknown, origin: string) {
  const b = privacyRequestSchema.parse(input);
  await rateLimit("privacy:public", 100);
  await rateLimit("privacy:sender:" + tokenHash(b.email), 5);
  const receipt = randomBytes(32).toString("hex");
  const row = await db.privacyRequest.create({ data: {
    receiptHash: tokenHash(receipt), kind: b.kind, name: b.name, email: b.email,
    message: b.message, origin,
  }, select: publicSelect });
  return { ...row, receipt };
}
export async function lookupPrivacyRequest(input: unknown) {
  const { receipt } = z.object({ receipt: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  await rateLimit("privacy:lookup", 300);
  const row = await db.privacyRequest.findUnique({ where: { receiptHash: tokenHash(receipt) }, select: publicSelect });
  demand(row, "No encontramos una solicitud con ese código.", 404);
  return row;
}
export async function listPrivacyRequests(actor: { id: string; role: string }, status: string, page: number) {
  ownerOnly(actor);
  const filter = z.enum(["ALL", "PENDING", "IN_REVIEW", "ANSWERED", "CLOSED"]).parse(status);
  const where = filter === "ALL" ? {} : { status: filter };
  const [items, total] = await Promise.all([
    db.privacyRequest.findMany({ where, select: { ...publicSelect, kind: true, name: true, email: true, message: true, origin: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 }),
    db.privacyRequest.count({ where }),
  ]);
  return { items, total, page };
}
export async function answerPrivacyRequest(actor: { id: string; role: string }, id: string, input: unknown) {
  ownerOnly(actor);
  const b = z.object({ status: z.enum(["IN_REVIEW", "ANSWERED", "CLOSED"]), reply: z.string().trim().min(5).max(4000), revision: z.iso.datetime() }).strict().parse(input);
  return db.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, status: true } });
    demand(current?.role === "OWNER" && current.status === "APPROVED", "La autorización cambió.", 403);
    const changed = await tx.privacyRequest.updateMany({ where: { id, updatedAt: new Date(b.revision) }, data: { status: b.status, reply: b.reply } });
    demand(changed.count, "La solicitud cambió o ya no está disponible. Actualiza la bandeja.", 409);
    await recordActivity(tx, { data: { actorId: actor.id, action: "SOLICITUD_PRIVACIDAD_ATENDIDA", resourceId: id, detail: { status: b.status } } });
    return { ok: true };
  });
}
