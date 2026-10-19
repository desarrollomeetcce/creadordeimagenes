import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { fullProjectFilter, categoryFullFilter, ownerOnly } from "./auth";
import { demand } from "./errors";
type Actor = { id: string; role: string };
// Library organization survives soft deletion. Membership/ownership is still
// checked on every request; this never grants access to source instructions.
export function librarySubproductFilter(
  user: Actor,
): Prisma.SubproductWhereInput {
  return user.role === "OWNER"
    ? {}
    : {
        OR: [
          { category: categoryFullFilter(user) },
          { members: { some: { userId: user.id } } },
        ],
      };
}
export function libraryCategoryFilter(user: Actor): Prisma.CategoryWhereInput {
  return user.role === "OWNER"
    ? {}
    : {
        OR: [
          categoryFullFilter(user),
          { subproducts: { some: { members: { some: { userId: user.id } } } } },
        ],
      };
}
export function libraryProjectFilter(user: Actor): Prisma.ProjectWhereInput {
  return user.role === "OWNER"
    ? {}
    : {
        OR: [
          fullProjectFilter(user),
          {
            categories: {
              some: {
                OR: [
                  { members: { some: { userId: user.id } } },
                  {
                    subproducts: {
                      some: { members: { some: { userId: user.id } } },
                    },
                  },
                ],
              },
            },
          },
        ],
      };
}
export async function libraryResourceAccess(
  user: Actor,
  scope: string,
  id: string,
  permission = "VIEW",
) {
  demand(
    ["VIEW", "NAVIGATE", "EDIT"].includes(permission),
    "Acción no disponible en Biblioteca.",
    403,
  );
  demand(
    permission !== "EDIT" || user.role !== "OBSERVER",
    "El rol Observador solo permite ver y descargar.",
    403,
  );
  const row =
    scope === "project"
      ? await db.project.findFirst({
          where: {
            id,
            ...(permission === "NAVIGATE"
              ? libraryProjectFilter(user)
              : fullProjectFilter(user)),
          },
          select: { id: true },
        })
      : scope === "category"
        ? await db.category.findFirst({
            where: {
              id,
              ...(permission === "NAVIGATE"
                ? libraryCategoryFilter(user)
                : categoryFullFilter(user)),
            },
            select: { id: true },
          })
        : scope === "subproduct"
          ? await db.subproduct.findFirst({
              where: { id, ...librarySubproductFilter(user) },
              select: { id: true },
            })
          : null;
  demand(row, "No tienes acceso a esta carpeta de Biblioteca.", 404);
  return row;
}
export async function libraryJobAccess(
  user: Actor,
  job: { projectId: string; subproductId?: string | null },
  permission = "VIEW",
) {
  if (job.projectId === "connection-test") {
    ownerOnly(user);
    return;
  }
  return libraryResourceAccess(
    user,
    job.subproductId ? "subproduct" : "project",
    job.subproductId ?? job.projectId,
    permission,
  );
}
