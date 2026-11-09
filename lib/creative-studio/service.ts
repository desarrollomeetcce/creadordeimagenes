import { z } from "zod";
import { generationPreferenceSchema } from "./generation-preferences";
import { randomUUID, createHash } from "node:crypto";
import { db } from "../db";
import { demand } from "../errors";
import {
  resourceAccess,
  projectAccess,
  projectFilter,
  fullProjectFilter,
  categoryFullFilter,
  rateLimit,
} from "../auth";
import { hasAiModuleAccess } from "../roles";
import { quickStartOptions } from "../quick-start";
import { financialAccess } from "../meta-ads/financial-access";
import { workspaceAccess } from "../meta-ads/workspace-access";
import { accountWhere } from "../meta-ads/service";
import {
  countryOptions,
  countryName,
  isCountryCode,
} from "../meta-ads/countries";
import { defaults } from "../inheritance";
import { recordActivity } from "../activity";
import type { Prisma } from "@prisma/client";
export type Actor = { id: string; role: string };
export const json = (v: unknown) => v as Prisma.InputJsonValue;
export const object = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const name = z.string().trim().min(1).max(200);
const id = z.string().min(1).max(100);
const country = z.string().refine(isCountryCode, "Selecciona el país.");
export const projectSettings = z
  .object({
    quality: z.string().max(30).optional(),
    resolution: z.string().max(30).optional(),
    format: z.enum(["1:1", "4:5", "9:16", "16:9"]).default("1:1"),
    count: z.number().int().min(1).max(100).default(3),
    mode: z
      .enum(["Imagen + Texto", "Texto", "Imagen"])
      .default("Imagen + Texto"),
    previewFirst: z.boolean().default(true),
  })
  .strict();
export function studioAccess(actor: Actor) {
  demand(
    hasAiModuleAccess(actor),
    "Esta cuenta no tiene acceso al estudio creativo.",
    403,
  );
  demand(
    !["SUPERVISOR", "ADVISOR", "OBSERVER"].includes(actor.role),
    "Este estudio requiere permiso de edición. Puedes consultar la Biblioteca.",
    403,
  );
}
const keyName = (s: string) =>
  s.trim().normalize("NFKC").toLocaleLowerCase("es");
export async function studioContext(actor: Actor) {
  studioAccess(actor);
  const [a, financial] = await Promise.all([
    workspaceAccess(actor),
    financialAccess(actor),
  ]);
  const [projects, config, inventories, accounts] = await Promise.all([
    quickStartOptions(actor),
    db.providerConfiguration.findUnique({
      where: { id: "global" },
      select: {
        provider: true,
        imageModel: true,
        quality: true,
        resolution: true,
        models: true,
      },
    }),
    db.metaEffectivenessSheet.findMany({
      where: {
        kind: "INVENTORY",
        archivedAt: null,
        ...(financial.isOwner || financial.grants.some((g) => g.scope === "ALL")
          ? {}
          : {
              id: {
                in: financial.grants
                  .filter((g) => g.scope.startsWith("TAB:"))
                  .map((g) => g.scope.slice(4)),
              },
            }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    a.canEdit && a.primaryAccountIds.length
      ? db.metaAdAccount.findMany({
          where: {
            AND: [
              await accountWhere(actor),
              {
                id: { in: a.primaryAccountIds },
                connection: { disconnectedAt: null },
              },
            ],
          },
          select: {
            id: true,
            name: true,
            currency: true,
            connection: { select: { transport: true, verifiedAt: true } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const capability = (config?.models as any[] | undefined)?.find(
    (m) => m.id === config?.imageModel && m.kind === "image",
  );
  return {
    projects,
    inventories,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      canPublish: a.connection.transport === "API" && !!a.connection.verifiedAt,
    })),
    maxOwnMediaBytes:process.env.VERCEL?3000000:64*1024*1024,
    countries: countryOptions,
    canPublish: a.canEdit,
    model: config?.imageModel ?? null,
    qualities: capability?.qualities ?? [],
    resolutions: capability?.resolutions ?? [],
    defaults: { quality: config?.quality, resolution: config?.resolution },
    primaryConfigured: a.primaryAccountIds.length > 0,
  };
}
export async function studioProject(actor: Actor, projectId: string) {
  studioAccess(actor);
  await projectAccess(actor, projectId, "NAVIGATE");
  const full = await db.project.findFirst({
    where: { id: projectId, ...fullProjectFilter(actor), deletedAt: null },
    select: { prompt: true, studio: true },
  });
  const p = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      categories: {
        where: { ...categoryFullFilter(actor), deletedAt: null },
        select: {
          id: true,
          name: true,
          studio: true,
          _count: { select: { subproducts: { where: { deletedAt: null } } } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  return {
    ...p,
    canEdit: !!full,
    prompt: full?.prompt ?? "",
    studio: full?.studio ?? {},
  };
}
export async function studioProduct(actor: Actor, categoryId: string) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const product = await db.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: {
      id: true,
      name: true,
      projectId: true,
      studio: true,
      subproducts: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          prompt: true,
          studio: true,
          _count: {
            select: {
              variations: {
                where: {
                  deletedAt: null,
                  expired: false,
                  OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
                },
              },
            },
          },
        },
      },
    },
  });
  const saved = await db.variation.groupBy({
    by: ["subproductId"],
    where: {
      subproductId: { in: product.subproducts.map((s) => s.id) },
      deletedAt: null,
      expired: false,
      permanent: true,
      job: { status: "COMPLETED" },
    },
    _count: { _all: true },
  });
  return {
    ...product,
    subproducts: product.subproducts.map((s) => {
      const count =
        saved.find((v) => v.subproductId === s.id)?._count._all ?? 0;
      const pending =
        object(s.studio).folderPending === true ||
        (object(s.studio).folderPending === undefined &&
          !!object(s.studio).country &&
          s._count.variations === 0);
      return {
        ...s,
        savedCount: count,
        folderExists: !pending || count > 0,
        folderCount: count || (pending ? 0 : s._count.variations),
      };
    }),
  };
}
export async function createStudioProject(actor: Actor, input: unknown) {
  studioAccess(actor);
  const b = z.object({ name, requestId: z.uuid() }).strict().parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"creative-project-name:" + keyName(b.name)},0))`;
    const active = await tx.user.findFirst({
      where: { id: actor.id, status: "APPROVED", role: actor.role as any },
    });
    demand(active, "La cuenta cambió.", 403);
    const previous = await tx.project.findUnique({
      where: { id: "studio-" + b.requestId },
    });
    if (previous) {
      demand(
        previous.ownerId === actor.id && previous.name === b.name,
        "La solicitud ya existe.",
        409,
      );
      return previous;
    }
    const matches = await tx.project.findMany({
      where: { ...projectFilter(actor), deletedAt: null },
      select: { name: true },
    });
    demand(
      !matches.some((p) => keyName(p.name) === keyName(b.name)),
      "Ya existe el proyecto.",
      409,
    );
    const p = await tx.project.create({
      data: {
        id: "studio-" + b.requestId,
        ownerId: actor.id,
        name: b.name,
        studio: { version: 1 },
      },
    });
    await recordActivity(tx, {
      data: { actorId: actor.id, action: "PROYECTO_CREADO", resourceId: p.id },
    });
    return { id: p.id, name: p.name };
  });
}
export async function saveStudioProject(
  actor: Actor,
  projectId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "project", projectId, "EDIT");
  const b = z
    .object({
      prompt: z.string().max(30000),
      settings: projectSettings,
      expectedUpdatedAt: z.string().optional(),
    })
    .strict()
    .parse(input);
  const config = await db.providerConfiguration.findUnique({
    where: { id: "global" },
    select: { models: true, imageModel: true },
  });
  const cap = (config?.models as any[] | undefined)?.find(
    (m) => m.id === config?.imageModel && m.kind === "image",
  );
  if (b.settings.quality)
    demand(
      cap?.qualities.includes(b.settings.quality),
      "La calidad no está disponible para el modelo configurado.",
    );
  if (b.settings.resolution)
    demand(
      cap?.resolutions.includes(b.settings.resolution),
      "La resolución no está disponible para el modelo configurado.",
    );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const out = await tx.project.update({
      where: { id: projectId },
      data: {
        prompt: b.prompt,
        studio: json({ ...object(p.studio), version: 1, settings: b.settings }),
      },
    });
    if (p.prompt !== b.prompt)
      await tx.promptVersion.create({
        data: {
          scope: "project",
          resourceId: projectId,
          prompt: b.prompt,
          actorId: actor.id,
        },
      });
    return { id: out.id, studio: out.studio, prompt: out.prompt };
  });
}
export async function createStudioProduct(
  actor: Actor,
  projectId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "project", projectId, "EDIT");
  const b = z
    .object({
      name,
      country: country.or(z.literal("")).default(""),
      requestId: z.uuid(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${projectId} FOR UPDATE`;
    const previous = await tx.category.findUnique({
      where: { id: "studio-product-" + b.requestId },
    });
    if (previous) {
      demand(
        previous.projectId === projectId && previous.name === b.name,
        "La solicitud ya existe.",
        409,
      );
      return previous;
    }
    const current = await tx.category.findMany({
      where: { projectId, deletedAt: null },
      select: { name: true },
    });
    demand(
      !current.some((c) => keyName(c.name) === keyName(b.name)),
      "Ya existe el producto en este proyecto.",
      409,
    );
    return tx.category.create({
      data: {
        id: "studio-product-" + b.requestId,
        projectId,
        createdById: actor.id,
        name: b.name,
        prompt: "",
        applyPromptToAll: false,
        settings: defaults,
        studio: { country: b.country, version: 1 },
      },
    });
  });
}
export async function setProductCountry(
  actor: Actor,
  categoryId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const b = z.object({ country }).strict().parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${categoryId} FOR UPDATE`;
    const c = await tx.category.findUniqueOrThrow({
      where: { id: categoryId },
    });
    return tx.category.update({
      where: { id: categoryId },
      data: { studio: json({ ...object(c.studio), country: b.country }) },
    });
  });
}
export async function addStudioItems(
  actor: Actor,
  categoryId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const b = z
    .object({
      names: z.array(name).max(100).optional(),
      expectedCountry: country.optional(),
      listId: id.optional(),
      itemIds: z.array(id).max(100).optional(),
    })
    .strict()
    .parse(input);
  let items: { name: string; source?: Record<string, string> }[] = (
    b.names ?? []
  ).map((name) => ({ name }));
  if (b.listId) {
    const dir = await studioInventory(actor, b.listId);
    const wanted = new Set(b.itemIds ?? []);
    const selected = [...wanted]
      .map((id) => dir.catalog.find((i) => i.id === id))
      .filter((i): i is NonNullable<typeof i> => !!i);
    demand(
      selected.length === wanted.size,
      "La selección del inventario cambió.",
      409,
    );
    items = selected.map((i) => ({
      name: i.name,
      source: { listId: b.listId!, itemId: i.id },
    }));
  }
  demand(
    items.length > 0,
    "Selecciona al menos un producto del inventario o escribe su nombre.",
  );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Category" WHERE id=${categoryId} FOR UPDATE`;
    const c = await tx.category.findUniqueOrThrow({
        where: { id: categoryId },
      }),
      existing = await tx.subproduct.findMany({
        where: { categoryId, deletedAt: null },
      }),
      out = [];
    demand(!c.deletedAt, "La carpeta no está disponible.", 409);
    demand(
      !b.expectedCountry || object(c.studio).country === b.expectedCountry,
      "La carpeta cambió de país. Vuelve a preparar la selección.",
      409,
    );
    const currentUser = await tx.user.findFirst({
      where: { id: actor.id, status: "APPROVED", role: actor.role as any },
    });
    demand(currentUser, "La cuenta cambió.", 403);
    for (const item of items) {
      const matches = existing.filter(
        (s) => keyName(s.name) === keyName(item.name),
      );
      demand(
        matches.length <= 1,
        "Hay nombres duplicados en este producto. Revisa su organización antes de añadir.",
        409,
      );
      let s = matches[0];
      if (!s) {
        s = await tx.subproduct.create({
          data: {
            categoryId,
            createdById: actor.id,
            name: item.name,
            settings: {},
            instructionPolicy: {
              includeProject: true,
              includeProduct: false,
              includeSelf: true,
            },
            studio: json({
              country: object(c.studio).country,
              ...item.source,
              folderPending: true,
            }),
          },
        });
        existing.push(s);
      }
      if (item.source) {
        const source = object(s.studio);
        demand(
          (!source.listId || source.listId === item.source.listId) &&
            (!source.itemId || source.itemId === item.source.itemId),
          "Este diplomado ya está asociado a otro inventario. Elige otra carpeta.",
          409,
        );
        if (!source.listId || !source.itemId)
          s = await tx.subproduct.update({
            where: { id: s.id },
            data: { studio: json({ ...source, ...item.source }) },
          });
      }
      out.push({ id: s.id, name: s.name });
    }
    return out;
  });
}
export async function studioGenerate(
  actor: Actor,
  categoryId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "category", categoryId, "GENERATE");
  const b = z
    .object({
      requestId: z.uuid(),
      subproductIds: z.array(id).min(1).max(100),
      prompts: z.record(id, z.string().max(30000)).default({}),
      options: z.record(id, generationPreferenceSchema).default({}),
      count: z.number().int().min(1).max(100),
      mode: z.enum(["Imagen + Texto", "Texto", "Imagen"]),
      previewFirst: z.boolean().default(true),
      confirmCharge: z.literal(true),
      format: z.enum(["1:1", "4:5", "9:16", "16:9"]),
    })
    .strict()
    .parse(input);
  demand(
    Object.keys(b.options).every((key) => b.subproductIds.includes(key)),
    "Las opciones deben pertenecer a los diplomados seleccionados.",
  );
  const subs = await db.subproduct.findMany({
    where: { id: { in: b.subproductIds }, categoryId, deletedAt: null },
    select: { id: true, prompt: true },
  });
  demand(
    subs.length === new Set(b.subproductIds).size,
    "La selección ya no está disponible.",
    409,
  );
  await db.$transaction(async (tx) => {
    for (const sub of subs) {
      const prompt = b.prompts[sub.id];
      const options = b.options[sub.id];
      if (options) {
        const current = await tx.subproduct.findUniqueOrThrow({
          where: { id: sub.id },
          select: { studio: true },
        });
        await tx.subproduct.update({
          where: { id: sub.id },
          data: {
            studio: json({
              ...object(current.studio),
              generationPreferences: options,
            }),
          },
        });
      }
      if (prompt !== undefined && prompt !== sub.prompt) {
        await tx.subproduct.update({ where: { id: sub.id }, data: { prompt } });
        await tx.promptVersion.create({
          data: {
            scope: "subproduct",
            resourceId: sub.id,
            prompt,
            actorId: actor.id,
          },
        });
      }
    }
  });
  const c = await db.category.findUniqueOrThrow({
      where: { id: categoryId },
      include: { project: { select: { studio: true } } },
    }),
    settings = projectSettings.parse(object(c.project.studio).settings ?? {});
  const { generateBatch } = await import("../generation");
  const jobs = await generateBatch(
    actor.id,
    categoryId,
    b.requestId,
    b.subproductIds,
    b.previewFirst,
    "ai",
    {
      projectOnly: true,
      perSubproduct: b.options,
      count: b.count,
      mode: b.mode,
      format: b.format,
      quality: settings.quality,
      resolution: settings.resolution,
    },
  );
  return {
    jobs: jobs.map((j) => j.id),
    runnable: jobs
      .filter((j) => !b.previewFirst || (j.snapshot as any).index === 0)
      .map((j) => j.id),
  };
}
export async function saveStudioImages(actor: Actor, input: unknown) {
  studioAccess(actor);
  const b = z
    .object({ ids: z.array(id).min(1).max(100) })
    .strict()
    .parse(input);
  const rows = await db.variation.findMany({
    where: {
      id: { in: b.ids },
      deletedAt: null,
      expired: false,
      OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, subproductId: true, job: { select: { status: true } } },
  });
  demand(
    rows.length === new Set(b.ids).size &&
      rows.every((r) => r.subproductId && r.job.status === "COMPLETED"),
    "Uno de los afiches ya no está disponible.",
    409,
  );
  for (const sub of new Set(rows.map((r) => r.subproductId!)))
    await resourceAccess(actor, "subproduct", sub, "EDIT");
  return db.$transaction(async (tx) => {
    await tx.variation.updateMany({
      where: { id: { in: b.ids } },
      data: { permanent: true },
    });
    for (const subproductId of new Set(rows.map((r) => r.subproductId!))) {
      await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${subproductId} FOR UPDATE`;
      const sub = await tx.subproduct.findUniqueOrThrow({
        where: { id: subproductId },
        select: { studio: true },
      });
      await tx.subproduct.update({
        where: { id: subproductId },
        data: { studio: json({ ...object(sub.studio), folderPending: false }) },
      });
    }
    await tx.libraryItem.createMany({
      data: b.ids.map((variationId) => ({ variationId, userId: actor.id })),
      skipDuplicates: true,
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "AFICHES_GUARDADOS_DESDE_ESTUDIO",
        detail: { count: b.ids.length },
      },
    });
    return { saved: b.ids.length };
  });
}
export async function addStudioWeb(
  actor: Actor,
  projectId: string,
  input: unknown,
) {
  studioAccess(actor);
  await resourceAccess(actor, "project", projectId, "EDIT");
  await rateLimit("studio:web:" + actor.id, 30);
  const b = z
      .object({ url: z.url().max(2000) })
      .strict()
      .parse(input),
    { readWebReference } = await import("../courses/reference-web"),
    r = await readWebReference(b.url),
    { saveAttachment } = await import("../attachments");
  return saveAttachment(actor, {
    scope: "project",
    resourceId: projectId,
    file: new File([`Fuente: ${r.url}\n${r.text}`], "Referencia web.txt", {
      type: "text/plain",
    }),
    purpose: "Referencia web",
  });
}
export async function studioInventory(actor: Actor, listId: string) {
  studioAccess(actor);
  const { authorizeFinancialRequest } =
    await import("../meta-ads/financial-access");
  const cap = await authorizeFinancialRequest(
    actor,
    "inventory/trials",
    "GET",
    new URLSearchParams({ listId }),
    null,
    "TAB:" + listId,
  );
  return (await import("../meta-ads/inventory-trials")).inventoryTrials(cap, {
    listId,
    mode: "directory",
  });
}
export async function saveInventorySelection(actor: Actor, input: unknown) {
  studioAccess(actor);
  const b = z
    .object({ listId: id, country, itemIds: z.array(id).min(1).max(100) })
    .strict()
    .parse(input);
  const dir = await studioInventory(actor, b.listId);
  demand(
    b.itemIds.every((id) => dir.catalog.some((i) => i.id === id)),
    "La selección ya no está disponible.",
    409,
  );
  return db.creativeInventorySelection.create({
    data: { actorId: actor.id, ...b, itemIds: json([...new Set(b.itemIds)]) },
    select: { id: true },
  });
}
export async function getInventorySelection(actor: Actor, selectionId: string) {
  studioAccess(actor);
  const selection = await db.creativeInventorySelection.findFirst({
    where: { id: selectionId, actorId: actor.id },
  });
  demand(selection, "La selección no está disponible.", 404);
  const dir = await studioInventory(actor, selection.listId);
  return {
    ...selection,
    items: (selection.itemIds as string[])
      .map((id) => dir.catalog.find((i) => i.id === id))
      .filter((i): i is NonNullable<typeof i> => !!i),
  };
}
/** Explicit replacement handoff: only prepares editable studio folders/items. */
export async function prepareInventorySelection(
  actor: Actor,
  selectionId: string,
  input: unknown,
) {
  studioAccess(actor);
  const b = z
    .object({ projectId: id, preferredCategoryId: id.optional() })
    .strict()
    .parse(input);
  const selection = await getInventorySelection(actor, selectionId);
  demand(
    selection.items.length === (selection.itemIds as string[]).length &&
      selection.items.length > 0,
    "La selección del inventario cambió. Vuelve a elegir los diplomados.",
    409,
  );
  await projectAccess(actor, b.projectId, "NAVIGATE");
  const available = await db.category.findMany({
    where: {
      projectId: b.projectId,
      deletedAt: null,
      ...categoryFullFilter(actor),
    },
    select: { id: true, name: true, studio: true },
  });
  const sameCountry = available.filter(
    (c) => object(c.studio).country === selection.country,
  );
  const countryLabel = countryName(selection.country);
  let destination =
    sameCountry.find((c) => c.id === b.preferredCategoryId) ??
    sameCountry.find((c) => keyName(c.name) === keyName(countryLabel)) ??
    (sameCountry.length === 1 ? sameCountry[0] : undefined);
  if (!destination) {
    await resourceAccess(actor, "project", b.projectId, "EDIT");
    destination = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${b.projectId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: actor.id, status: "APPROVED", role: actor.role as any },
      });
      demand(user, "La cuenta cambió.", 403);
      const project = await tx.project.findFirst({
        where: { id: b.projectId, deletedAt: null },
      });
      demand(project, "El proyecto no está disponible.", 404);
      const categories = await tx.category.findMany({
        where: { projectId: b.projectId, deletedAt: null },
        select: { id: true, name: true, studio: true },
      });
      const existing = categories.find(
        (c) =>
          object(c.studio).country === selection.country &&
          keyName(c.name) === keyName(countryLabel),
      );
      if (existing) return existing;
      const folderName = categories.some(
        (c) => keyName(c.name) === keyName(countryLabel),
      )
        ? countryLabel + " · " + selection.country
        : countryLabel;
      demand(
        !categories.some((c) => keyName(c.name) === keyName(folderName)),
        "Ya hay una carpeta con ese nombre y otro país. Revisa su organización.",
        409,
      );
      return tx.category.create({
        data: {
          projectId: b.projectId,
          createdById: actor.id,
          name: folderName,
          prompt: "",
          applyPromptToAll: false,
          settings: defaults,
          studio: { country: selection.country, version: 1 },
        },
        select: { id: true, name: true, studio: true },
      });
    });
  }
  await resourceAccess(actor, "category", destination.id, "EDIT");
  const items = await addStudioItems(actor, destination.id, {
    listId: selection.listId,
    expectedCountry: selection.country,
    itemIds: selection.items.map((i) => i.id),
  });
  return {
    category: destination,
    items,
    listId: selection.listId,
    country: selection.country,
  };
}
export async function studioImages(
  actor: Actor,
  subproductId: string,
  page = 1,
) {
  studioAccess(actor);
  await resourceAccess(actor, "subproduct", subproductId, "VIEW");
  const where = {
    subproductId,
    deletedAt: null,
    expired: false,
    OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
  };
  const [items, total] = await db.$transaction([
    db.variation.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 24,
      take: 24,
      select: {
        id: true,
        revision: true,
        reviewStatus: true,
        permanent: true,
        createdAt: true,
        model: true,
        mediaType: true,
        mime: true,
        originalName: true,
        ownResource: true,
        job: { select: { id: true, snapshot: true } },
      },
    }),
    db.variation.count({ where }),
  ]);
  return {
    items: items.map(({ job, ...v }) => ({
      ...v,
      isSample:
        object(job.snapshot).previewFirst === true &&
        object(job.snapshot).index === 0,
      jobId: job.id,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 24)),
  };
}

export async function studioImageIds(actor: Actor, subproductId: string) {
  studioAccess(actor);
  await resourceAccess(actor, "subproduct", subproductId, "VIEW");
  const rows = await db.variation.findMany({
    where: {
      subproductId,
      deletedAt: null,
      expired: false,
      OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: 101,
  });
  demand(
    rows.length <= 100,
    "Hay más de100 afiches en este diplomado. Selecciona los que desees guardar o publicar.",
  );
  return { ids: rows.map((r) => r.id) };
}
