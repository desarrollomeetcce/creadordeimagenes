import {libraryProjectFilter,libraryCategoryFilter,librarySubproductFilter,libraryResourceAccess} from "./library-access";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import {
  projectFilter,
  fullProjectFilter,
  categoryFilter,
  subproductFilter,
  projectAccess,
  resourceAccess,
} from "./auth";
import { demand } from "./errors";
type Actor = { id: string; role: string };
export function dateRange(params: URLSearchParams) {
  const read = (key: string) => {
    const value = params.get(key) ?? "";
    demand(
      !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Introduce fechas válidas en formato año-mes-día.",
    );
    if (!value) return null;
    const date = new Date(value + "T05:00:00.000Z");
    demand(
      Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value,
      "La fecha indicada no existe.",
    );
    return date;
  };
  const from = read("from"),
    until = read("to");
  demand(
    !from || !until || from <= until,
    "La fecha inicial no puede ser posterior a la final.",
  );
  return {
    ...(from ? { gte: from } : {}),
    ...(until ? { lt: new Date(until.getTime() + 86400000) } : {}),
  };
}
export async function hierarchyScope(user: Actor, params: URLSearchParams, library=false) {
  const schema = z.string().max(100);
  const project = schema.parse(params.get("project") ?? ""),
    product = schema.parse(params.get("product") ?? ""),
    subproduct = schema.parse(params.get("subproduct") ?? "");
  demand(
    !product || (!!project && project !== "none"),
    "Selecciona primero un proyecto.",
  );
  demand(!subproduct || !!product, "Selecciona primero un producto.");
  if (project === "none") {
    demand(
      user.role === "OWNER",
      "Las pruebas sin proyecto solo están disponibles para OWNER.",
      403,
    );
    return {
      project,
      product,
      subproduct,
      where: { projectId: "connection-test" } as Prisma.GenerationJobWhereInput,
    };
  }
  if (project) {if(library)await libraryResourceAccess(user,"project",project,"NAVIGATE");else await projectAccess(user, project, "NAVIGATE");}
  if (product) {
    await (library?libraryResourceAccess:resourceAccess)(user, "category", product, "NAVIGATE");
    const row = await db.category.findUnique({
      where: { id: product },
      select: { projectId: true },
    });
    demand(
      row?.projectId === project,
      "El producto no pertenece al proyecto seleccionado.",
      404,
    );
  }
  if (subproduct) {
    await (library?libraryResourceAccess:resourceAccess)(user, "subproduct", subproduct, "VIEW");
    const row = await db.subproduct.findUnique({
      where: { id: subproduct },
      select: { categoryId: true },
    });
    demand(
      row?.categoryId === product,
      "El subproducto no pertenece al producto seleccionado.",
      404,
    );
  }
  const subs = await db.subproduct.findMany({
    where: {
      ...(library?librarySubproductFilter(user):subproductFilter(user)),
      ...(project ? { category: { projectId: project } } : {}),
      ...(product ? { categoryId: product } : {}),
      ...(subproduct ? { id: subproduct } : {}),
    },
    select: { id: true },
  });
  const full = await db.project.findMany({
    where: {
      ...fullProjectFilter(user),
      ...(library?{}:{deletedAt: null}),
      ...(project ? { id: project } : {}),
    },
    select: { id: true },
  });
  const access: Prisma.GenerationJobWhereInput = {
    OR: [
      { subproductId: { in: subs.map((s) => s.id) } },
      ...(!product
        ? [{ projectId: { in: full.map((p) => p.id) }, subproductId: null }]
        : []),
    ],
  };
  const where: Prisma.GenerationJobWhereInput = project
    ? { AND: [{ projectId: project }, access] }
    : {};
  return { project, product, subproduct, where, access };
}
export async function visibleJobWhere(user: Actor, params: URLSearchParams) {
  const scope = await hierarchyScope(user, params);
  const base: Prisma.GenerationJobWhereInput =
    user.role === "OWNER"
      ? {}
      : {
          OR: [
            { actorId: user.id },
            { AND: [{ status: "COMPLETED" }, scope.access ?? { id: "" }] },
          ],
        };
  return {
    scope,
    where: { AND: [base, scope.where] } as Prisma.GenerationJobWhereInput,
  };
}
export async function hierarchyOptions(user: Actor, params: URLSearchParams, library=false) {
  const scope = await hierarchyScope(user, params,library);
  const [projects, products, subproducts] = await Promise.all([
    db.project.findMany({
      where: library?libraryProjectFilter(user):{ ...projectFilter(user), deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    scope.project && scope.project !== "none"
      ? db.category.findMany({
          where: { ...(library?libraryCategoryFilter(user):categoryFilter(user)), projectId: scope.project },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : [],
    scope.product
      ? db.subproduct.findMany({
          where: { ...(library?librarySubproductFilter(user):subproductFilter(user)), categoryId: scope.product },
          select: { id: true, name: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : [],
  ]);
  return {
    projects,
    products,
    subproducts,
    canSeeTests: user.role === "OWNER",
  };
}
export async function jobSearch(
  user: Actor,
  q: string,
): Promise<Prisma.GenerationJobWhereInput> {
  if (!q) return {};
  const query = q.replace(/[\\%_]/g, "\\$&");
  const [projects, subs, products] = await Promise.all([
    db.project.findMany({
      where: {
        ...projectFilter(user),
        deletedAt: null,
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true },
    }),
    db.subproduct.findMany({
      where: {
        ...subproductFilter(user),
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true },
    }),
    db.category.findMany({
      where: {
        ...categoryFilter(user),
        name: { contains: query, mode: "insensitive" },
      },
      select: { id: true },
    }),
  ]);
  const productSubs = products.length
    ? await db.subproduct.findMany({
        where: {
          ...subproductFilter(user),
          categoryId: { in: products.map((p) => p.id) },
        },
        select: { id: true },
      })
    : [];
  return {
    OR: [
      { id: { contains: query, mode: "insensitive" } },
      { projectId: { in: projects.map((p) => p.id) } },
      { subproductId: { in: [...subs, ...productSubs].map((s) => s.id) } },
    ],
  };
}
