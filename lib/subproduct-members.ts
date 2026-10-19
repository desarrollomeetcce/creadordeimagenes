import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity } from "./activity";

export async function selectedSubproductMembers(
  req: NextRequest,
  categoryId: string,
  memberId: string | undefined,
  user: { id: string; role: string },
  body: () => Promise<unknown>,
) {
  const ids = [
    ...new Set(
      z
        .array(z.string().min(1).max(100))
        .min(1)
        .max(200)
        .parse(
          (req.nextUrl.searchParams.get("ids") ?? "")
            .split(",")
            .filter(Boolean),
        ),
    ),
  ];
  const authorize = async (
    tx: Pick<typeof db, "category" | "user" | "subproduct">,
  ) => {
    const [category, issuer] = await Promise.all([
      tx.category.findUnique({
        where: { id: categoryId },
        include: { project: true },
      }),
      tx.user.findUnique({ where: { id: user.id } }),
    ]);
    demand(
      category && !category.deletedAt && !category.project.deletedAt,
      "Producto no disponible.",
      404,
    );
    demand(
      issuer?.status === "APPROVED" &&
        (issuer.role === "OWNER" ||
          (issuer.role !== "OBSERVER" &&
            category.project.ownerId === issuer.id)),
      "Solo el creador del proyecto o el OWNER pueden administrar los accesos.",
      403,
    );
    demand(
      (await tx.subproduct.count({
        where: { id: { in: ids }, categoryId, deletedAt: null },
      })) === ids.length,
      "La selección contiene subproductos eliminados o de otro producto.",
      404,
    );
    return category.project;
  };
  const project = await authorize(db),
    send = (data: unknown) =>
      NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  if (req.method === "GET" && memberId === "directory") {
    const q = z
      .string()
      .max(200)
      .parse(req.nextUrl.searchParams.get("q") ?? "");
    const users = await db.user.findMany({
      where: {
        status: "APPROVED",
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      take: 201,
    });
    return send({ users: users.slice(0, 200), hasMore: users.length > 200 });
  }
  if (req.method === "GET" && !memberId) {
    const rows = await db.subproductMember.findMany({
      where: { subproductId: { in: ids } },
      select: {
        subproductId: true,
        userId: true,
        user: { select: { name: true, email: true, role: true, status: true } },
      },
    });
    const members = new Map<
      string,
      {
        userId: string;
        user: (typeof rows)[number]["user"];
        subproductCount: number;
      }
    >();
    for (const row of rows) {
      const member = members.get(row.userId);
      if (member) member.subproductCount++;
      else
        members.set(row.userId, {
          userId: row.userId,
          user: row.user,
          subproductCount: 1,
        });
    }
    return send({
      members: [...members.values()],
      ownerId: project.ownerId,
      allAdministrators: false,
      canSetAdministrators: false,
      selectedCount: ids.length,
    });
  }
  demand(
    req.method === "POST" ? !memberId : req.method === "DELETE" && !!memberId,
    "Operación no disponible.",
    405,
  );
  const payload =
    req.method === "POST"
      ? z
          .object({
            email: z
              .email()
              .max(200)
              .transform((s) => s.toLowerCase()),
          })
          .strict()
          .parse(await body())
      : null;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${project.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${categoryId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
    const current = await authorize(tx);
    const target = await tx.user.findUnique({
      where:
        req.method === "POST" ? { email: payload!.email } : { id: memberId! },
    });
    demand(
      target && (req.method === "DELETE" || target.status === "APPROVED"),
      "No existe una cuenta aprobada con ese correo.",
      404,
    );
    demand(
      target.id !== current.ownerId,
      "El creador conserva el acceso por propiedad.",
      409,
    );
    if (req.method === "POST")
      await tx.subproductMember.createMany({
        data: ids.map((subproductId) => ({ subproductId, userId: target.id })),
        skipDuplicates: true,
      });
    else
      await tx.subproductMember.deleteMany({
        where: { subproductId: { in: ids }, userId: target.id },
      });
    for (const id of ids)
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: `ACCESO_SUBPRODUCT_${req.method === "POST" ? "ACTUALIZADO" : "REVOCADO"}`,
          resourceId: id,
          detail: { userId: target.id },
        },
      });
  });
  return send({ ok: true, count: ids.length });
}
