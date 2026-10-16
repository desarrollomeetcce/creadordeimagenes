import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { ownerOnly, projectFilter } from "./auth";
import { demand } from "./errors";
import { accessibleVariation } from "./versions";
export async function retainVariation(
  user: { id: string; role: string },
  id: string,
  permanent: boolean,
  folderId?: string | null,
) {
  await accessibleVariation(user, id, "VIEW");
  if (folderId) {
    const folder = await db.libraryFolder.findUnique({
      where: { id: folderId },
    });
    demand(folder?.userId === user.id, "Carpeta no disponible.", 404);
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Variation" WHERE id=${id} FOR UPDATE`;
    const v = await tx.variation.findUniqueOrThrow({ where: { id } });
    demand(
      !v.expired && !v.deletedAt && (v.permanent || v.expiresAt > new Date()),
      "El afiche ya caducó.",
      410,
    );
    if (permanent)
      await tx.libraryItem.upsert({
        where: { userId_variationId: { userId: user.id, variationId: id } },
        create: { userId: user.id, variationId: id, folderId },
        update: folderId !== undefined ? { folderId } : {},
      });
    else
      await tx.libraryItem.deleteMany({
        where: { userId: user.id, variationId: id },
      });
    const count = await tx.libraryItem.count({ where: { variationId: id } });
    await tx.variation.update({
      where: { id },
      data: { permanent: count > 0 },
    });
    await tx.auditEvent.create({
      data: {
        actorId: user.id,
        action: permanent ? "BIBLIOTECA_GUARDAR" : "BIBLIOTECA_RETIRAR",
        resourceId: id,
      },
    });
  });
}
export async function productivityRoutes(
  req: NextRequest,
  parts: string[],
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const route = parts[0],
    method = req.method,
    send = (value: unknown, status = 200) =>
      NextResponse.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
  if (route === "library") {
    if (parts[1] === "folders" && method === "GET")
      return send(
        await db.libraryFolder.findMany({
          where: { userId: user.id },
          orderBy: { name: "asc" },
        }),
      );
    if (parts[1] === "folders" && method === "POST") {
      const b = z
        .object({
          name: z.string().trim().min(1).max(100),
          parentId: z.string().nullable().default(null),
        })
        .parse(await body());
      if (b.parentId) {
        const parent = await db.libraryFolder.findUnique({
          where: { id: b.parentId },
        });
        demand(parent?.userId === user.id, "Carpeta no disponible.", 404);
      }
      return send(
        await db.libraryFolder.create({ data: { ...b, userId: user.id } }),
        201,
      );
    }
    if (parts[1] === "folders" && parts[2] && method === "PATCH") {
      const b = z
        .object({ name: z.string().trim().min(1).max(100) })
        .parse(await body());
      const changed = await db.libraryFolder.updateMany({
        where: { id: parts[2], userId: user.id },
        data: b,
      });
      demand(changed.count, "Carpeta no disponible.", 404);
      return send({ ok: true });
    }
    if (parts[1] === "folders" && parts[2] && method === "DELETE") {
      const folder = await db.libraryFolder.findUnique({
        where: { id: parts[2] },
        include: { _count: { select: { children: true, items: true } } },
      });
      demand(folder?.userId === user.id, "Carpeta no disponible.", 404);
      demand(
        !folder._count.children && !folder._count.items,
        "Vacía la carpeta antes de eliminarla.",
      );
      await db.libraryFolder.delete({ where: { id: folder.id } });
      return send({ ok: true });
    }
    if (parts[1] === "items" && parts[2] && method === "POST") {
      const b = z
        .object({
          folderId: z.string().nullable().optional(),
          permanent: z.boolean().default(true),
        })
        .parse(await body());
      await retainVariation(user, parts[2], b.permanent, b.folderId);
      return send({ ok: true });
    }
    if (method === "GET" && parts.length === 1) {
      const projects = await db.project.findMany({
        where: { ...projectFilter(user), deletedAt: null },
        select: { id: true },
      });
      const folder = req.nextUrl.searchParams.get("folder");
      return send(
        await db.libraryItem.findMany({
          where: {
            userId: user.id,
            ...(folder ? { folderId: folder === "root" ? null : folder } : {}),
            variation: {
              deletedAt: null,
              expired: false,
              job: { projectId: { in: projects.map((x) => x.id) } },
            },
          },
          include: {
            variation: {
              select: {
                id: true,
                model: true,
                reviewStatus: true,
                subproduct: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      );
    }
  }
  if (route === "presets") {
    const { presetRoutes } = await import("./presets");
    return await presetRoutes(req, parts, user, body);
  }
  if (route === "budgets") {
    ownerOnly(user);
    if (method === "GET")
      return send(
        (await db.budgetLimit.findMany()).map((b) => ({
          ...b,
          monthlyMicros: String(b.monthlyMicros),
          dailyMicros: String(b.dailyMicros),
        })),
      );
    if (method === "PUT") {
      const b = z
        .object({
          scope: z.enum(["USER", "PROJECT"]),
          targetId: z.string().min(1),
          monthlyMicros: z.string().regex(/^\d{1,15}$/),
          dailyMicros: z.string().regex(/^\d{1,15}$/),
          maxJobsPerDay: z.number().int().min(0).max(100000),
        })
        .parse(await body());
      demand(
        b.scope === "USER"
          ? await db.user.findUnique({ where: { id: b.targetId } })
          : await db.project.findUnique({ where: { id: b.targetId } }),
        "El usuario o proyecto no existe.",
        404,
      );
      const data = {
        ...b,
        monthlyMicros: BigInt(b.monthlyMicros),
        dailyMicros: BigInt(b.dailyMicros),
      };
      await db.budgetLimit.upsert({
        where: { scope_targetId: { scope: b.scope, targetId: b.targetId } },
        create: data,
        update: data,
      });
      await db.auditEvent.create({
        data: {
          actorId: user.id,
          action: "PRESUPUESTO_PARTICULAR_GUARDADO",
          resourceId: b.targetId,
        },
      });
      return send({ ok: true });
    }
  }
  return null;
}
