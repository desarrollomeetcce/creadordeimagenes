import type { Role } from "@prisma/client";
import { db } from "./db";
import { demand } from "./errors";
import { readMenuVisibility, type Module } from "./pulpo-menu-model";

export async function saveRoleMenu(actorId: string, role: Role, menu: Module[] | null, expected: Module[] | null) {
  demand(role !== "OWNER", "El Owner conserva el menú completo.", 409);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(891234)`;
    const issuer = await tx.user.findFirst({
      where: { id: actorId, role: "OWNER", status: "APPROVED", archivedAt: null }, select: { id: true },
    });
    demand(issuer, "Solo el Owner puede configurar menús por rol.", 403);
    const current = await tx.roleMenu.findUnique({ where: { role } });
    demand(JSON.stringify(readMenuVisibility(current?.menu ?? null) ?? null) === JSON.stringify(expected),
      "El menú cambió. Vuelve a abrirlo antes de guardar.", 409);
    if (menu === null) await tx.roleMenu.deleteMany({ where: { role } });
    else await tx.roleMenu.upsert({ where: { role }, create: { role, menu }, update: { menu } });
  });
}
