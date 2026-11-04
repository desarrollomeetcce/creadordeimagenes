import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { rateLimit } from "./auth";
import { recordActivity } from "./activity";

const profile = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z
      .string()
      .trim()
      .pipe(z.email().max(200))
      .transform((v) => v.toLowerCase()),
    expected: z
      .object({ name: z.string().max(100), email: z.string().max(200) })
      .strict(),
  })
  .strict();
/** Owner identity edits keep the same user ID; email changes revoke old login/recovery credentials. */
export async function updateUserProfile(
  actor: { id: string; role: string },
  targetId: string,
  input: unknown,
) {
  demand(
    actor.role === "OWNER",
    "Solo el OWNER puede editar nombres y correos desde Equipo.",
    403,
  );
  const b = profile.parse(input);
  await rateLimit(`account-profile:${actor.id}`, 20);
  return db
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
      const rows = await tx.$queryRaw<
        {
          id: string;
          role: string;
          status: string;
          archivedAt: Date | null;
          name: string;
          email: string;
        }[]
      >`SELECT id,role,status,"archivedAt",name,email FROM "User" WHERE id IN (${actor.id},${targetId}) ORDER BY id FOR UPDATE`;
      const current = rows.find((u) => u.id === actor.id),
        target = rows.find((u) => u.id === targetId);
      demand(
        current?.role === "OWNER" &&
          current.status === "APPROVED" &&
          !current.archivedAt,
        "Tu autorización cambió. Inicia sesión nuevamente.",
        403,
      );
      demand(target, "Cuenta no encontrada.", 404);
      demand(
        target.name === b.expected.name && target.email === b.expected.email,
        "El nombre o correo cambió. Actualiza la lista antes de editarlo.",
        409,
      );
      const nameChanged = target.name !== b.name,
        emailChanged = target.email !== b.email;
      if (!nameChanged && !emailChanged)
        return { ok: true, closesOwnSession: false, reloadOwn: false };
      if (emailChanged)
        demand(
          !(await tx.user.findFirst({
            where: {
              email: { equals: b.email, mode: "insensitive" },
              id: { not: target.id },
            },
          })),
          "Ya existe una cuenta con ese correo.",
          409,
        );
      await tx.user.update({
        where: { id: target.id },
        data: { name: b.name, email: b.email },
      });
      if (emailChanged) {
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.passwordReset.deleteMany({ where: { userId: target.id } });
        await tx.ownerRecovery.deleteMany({ where: { userId: target.id } });
      }
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "USUARIO_IDENTIDAD_ACTUALIZADA",
          resourceId: target.id,
          detail: { nameChanged, emailChanged },
        },
      });
      return {
        ok: true,
        closesOwnSession: emailChanged && target.id === actor.id,
        reloadOwn: nameChanged && target.id === actor.id,
      };
    })
    .catch((error) => {
      if (error?.code === "P2002")
        demand(false, "Ya existe una cuenta con ese correo.", 409);
      throw error;
    });
}
