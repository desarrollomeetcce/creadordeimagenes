import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import {
  personalFolderAccess,
  type FolderActor,
} from "./personal-folder-access";
import { recordActivity } from "./activity";
export async function personalFolderMembers(
  req: NextRequest,
  id: string,
  memberId: string | undefined,
  user: FolderActor,
  body: () => Promise<unknown>,
) {
  const send = (v: unknown) =>
    NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
  const folder = await personalFolderAccess(user, id, true);
  if (req.method === "GET" && memberId === "directory") {
    const q = z
      .string()
      .max(200)
      .parse(req.nextUrl.searchParams.get("q") ?? "");
    const users = await db.user.findMany({
      where: {
        status: "APPROVED",
        archivedAt: null,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      take: 201,
      orderBy: { email: "asc" },
    });
    return send({ users: users.slice(0, 200), hasMore: users.length > 200 });
  }
  if (req.method === "GET" && !memberId)
    return send({
      allUsers: folder.allUsers,
      canSetAllUsers: true,
      allAdministrators: false,
      canSetAdministrators: false,
      members: await db.libraryFolderMember.findMany({
        where: { folderId: id },
        select: {
          userId: true,
          user: {
            select: { name: true, email: true, role: true, status: true },
          },
        },
      }),
    });
  const value =
    req.method === "POST"
      ? z
          .object({
            email: z
              .email()
              .max(200)
              .transform((v) => v.toLowerCase()),
          })
          .strict()
          .parse(await body())
      : req.method === "PATCH"
        ? z
            .object({ allUsers: z.boolean() })
            .strict()
            .parse(await body())
        : null;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
    const issuer = await tx.user.findUnique({ where: { id: user.id } }),
      current = await tx.libraryFolder.findUnique({ where: { id } });
    demand(
      issuer?.status === "APPROVED" &&
        !issuer.archivedAt &&
        current &&
        (issuer.role === "OWNER" ||
          (issuer.role !== "OBSERVER" && current.userId === user.id)),
      "Los permisos cambiaron.",
      403,
    );
    if (req.method === "PATCH") {
      await tx.libraryFolder.update({
        where: { id },
        data: value as { allUsers: boolean },
      });
    } else if (req.method === "POST") {
      const target = await tx.user.findFirst({
        where: {
          email: {
            equals: (value as { email: string }).email,
            mode: "insensitive",
          },
          status: "APPROVED",
          archivedAt: null,
        },
      });
      demand(target, "No se encontró una cuenta aprobada.", 404);
      demand(
        target.id !== current.userId && target.role !== "OWNER",
        "Esta cuenta ya tiene acceso por propiedad.",
      );
      await tx.libraryFolderMember.upsert({
        where: { folderId_userId: { folderId: id, userId: target.id } },
        create: { folderId: id, userId: target.id },
        update: {},
      });
    } else if (req.method === "DELETE" && memberId) {
      await tx.libraryFolderMember.deleteMany({
        where: { folderId: id, userId: memberId },
      });
    } else demand(false, "Operación no disponible.", 405);
    await recordActivity(tx, {
      data: {
        actorId: user.id,
        action: "ACCESO_CARPETA_PERSONAL_ACTUALIZADO",
        resourceId: id,
        detail: {
          method: req.method,
          allUsers:
            req.method === "PATCH"
              ? (value as { allUsers: boolean }).allUsers
              : undefined,
        },
      },
    });
  });
  return send({ ok: true });
}
