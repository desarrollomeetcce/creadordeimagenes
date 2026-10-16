import { recordActivity } from "./activity";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { presetAccess } from "./preset-access";
export async function presetShares(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const preset = await presetAccess(user, parts[1], true);
  const send = (v: unknown) =>
    NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
  if (req.method === "GET" && parts.length === 3) {
    const shares = await db.presetShare.findMany({
      where: { presetId: preset.id },
    });
    return send(
      await db.user.findMany({
        where: { id: { in: shares.map((s) => s.userId) } },
        select: { id: true, name: true, email: true, role: true },
      }),
    );
  }
  if (req.method === "POST" && parts.length === 3) {
    const b = z
      .object({ email: z.email().transform((v) => v.toLowerCase()) })
      .strict()
      .parse(await body());
    const target = await db.user.findUnique({ where: { email: b.email } });
    demand(
      target?.status === "APPROVED",
      "Cuenta aprobada no encontrada.",
      404,
    );
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SavedPreset" WHERE id=${preset.id} FOR UPDATE`;
      const current = await presetAccess(user, preset.id, true);
      await tx.presetShare.upsert({
        where: { presetId_userId: { presetId: preset.id, userId: target.id } },
        create: { presetId: preset.id, userId: target.id },
        update: {},
      });
      if (current.visibility !== "OFFICIAL")
        await tx.savedPreset.update({
          where: { id: preset.id },
          data: { visibility: "SHARED" },
        });
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "CONFIGURACION_COMPARTIDA",
          resourceId: preset.id,
          detail: { userId: target.id },
        },
      });
    });
    return send({ ok: true });
  }
  if (req.method === "DELETE" && parts.length === 4) {
    await db.presetShare.deleteMany({
      where: { presetId: preset.id, userId: parts[3] },
    });
    return send({ ok: true });
  }
  demand(false, "Operación no encontrada.", 404);
}
