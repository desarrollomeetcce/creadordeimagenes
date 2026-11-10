import { randomBytes } from "node:crypto";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";
import { tokenHash, rateLimit } from "./auth";
import { AppError, demand } from "./errors";
import { catalog as inventoryCatalog } from "./meta-ads/inventory-trials";
import { catalogNameKey } from "./meta-ads/inventory-syllabi-policy";
import type { Prisma } from "@prisma/client";
type Actor = { id: string; role: string };
const userSelect = { role: true, status: true, archivedAt: true } as const;
const publicKey = {
  id: true,
  name: true,
  mask: true,
  createdAt: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  lists: {
    select: { list: { select: { id: true, name: true, archivedAt: true } } },
  },
} as const;
const id = z.string().min(1).max(100);
export const diplomaQuery = z
  .object({
    listId: id.optional(),
    q: z.string().trim().max(100).default(""),
    category: z.string().trim().max(150).default(""),
    id: id.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export function newDiplomaToken() {
  return "dip_" + randomBytes(32).toString("base64url");
}
async function currentOwner(
  actor: Actor,
  tx: Pick<Prisma.TransactionClient, "user"> = db,
) {
  const u = await tx.user.findUnique({
    where: { id: actor.id },
    select: userSelect,
  });
  demand(
    actor.role === "OWNER" &&
      u?.role === "OWNER" &&
      u.status === "APPROVED" &&
      !u.archivedAt,
    "Esta acción requiere una cuenta OWNER vigente.",
    403,
  );
}
export async function diplomaApiKeys(actor: Actor) {
  await currentOwner(actor);
  const [keys, lists] = await Promise.all([
    db.diplomaApiKey.findMany({
      where: { ownerId: actor.id },
      select: publicKey,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.metaEffectivenessSheet.findMany({
      where: { kind: "INVENTORY", archivedAt: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 1000,
    }),
  ]);
  return { keys, lists };
}
export async function createDiplomaKey(actor: Actor, input: unknown) {
  await currentOwner(actor);
  const b = z
    .object({
      name: z.string().trim().min(1).max(80),
      listIds: z
        .array(id)
        .min(1)
        .max(20)
        .refine((a) => new Set(a).size === a.length),
      expiresInDays: z
        .union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)])
        .default(0),
    })
    .strict()
    .parse(input);
  const raw = newDiplomaToken(),
    expiresAt = b.expiresInDays
      ? new Date(Date.now() + b.expiresInDays * 86400000)
      : null;
  const key = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(904621)`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR SHARE`;
    await currentOwner(actor, tx);
    demand(
      (await tx.diplomaApiKey.count({
        where: {
          ownerId: actor.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })) < 20,
      "Puedes mantener hasta veinte claves activas. Revoca una antes de crear otra.",
      409,
    );
    demand(
      (await tx.metaEffectivenessSheet.count({
        where: { id: { in: b.listIds }, kind: "INVENTORY", archivedAt: null },
      })) === b.listIds.length,
      "Selecciona inventarios vigentes.",
      400,
    );
    const row = await tx.diplomaApiKey.create({
      data: {
        ownerId: actor.id,
        name: b.name,
        tokenHash: tokenHash(raw),
        mask: "dip_…" + raw.slice(-6),
        expiresAt,
        lists: { create: b.listIds.map((listId) => ({ listId })) },
      },
      select: publicKey,
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        action: "API_DIPLOMADOS_CLAVE_CREADA",
        resourceId: row.id,
        detail: { name: b.name, listIds: b.listIds },
      },
    });
    return row;
  });
  return { key, token: raw };
}
export async function revokeDiplomaKey(actor: Actor, keyId: string) {
  await currentOwner(actor);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(904621)`;
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR SHARE`;
    await currentOwner(actor, tx);
    const key = await tx.diplomaApiKey.findFirst({
      where: { id: keyId, ownerId: actor.id },
      select: { id: true, revokedAt: true },
    });
    demand(key, "Clave no encontrada.", 404);
    if (!key.revokedAt) {
      await tx.diplomaApiKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: "API_DIPLOMADOS_CLAVE_REVOCADA",
          resourceId: key.id,
        },
      });
    }
    return { ok: true };
  });
}
export async function authenticateDiplomaKey(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "",
    match = /^Bearer (dip_[A-Za-z0-9_-]{43})$/i.exec(header);
  demand(
    match,
    "Se requiere una clave API válida en Authorization: Bearer.",
    401,
  );
  const now = new Date(),
    key = await db.diplomaApiKey.findUnique({
      where: { tokenHash: tokenHash(match[1]) },
      select: {
        id: true,
        revokedAt: true,
        expiresAt: true,
        owner: { select: userSelect },
        lists: {
          where: { list: { kind: "INVENTORY", archivedAt: null } },
          select: { list: { select: { id: true, name: true } } },
        },
      },
    });
  demand(
    key &&
      !key.revokedAt &&
      (!key.expiresAt || key.expiresAt > now) &&
      key.owner.role === "OWNER" &&
      key.owner.status === "APPROVED" &&
      !key.owner.archivedAt,
    "La clave API no es válida, venció o fue revocada.",
    401,
  );
  await rateLimit("diploma-api:" + key.id, 600);
  await db.diplomaApiKey
    .updateMany({
      where: {
        id: key.id,
        revokedAt: null,
        OR: [
          { lastUsedAt: null },
          { lastUsedAt: { lt: new Date(now.valueOf() - 300000) } },
        ],
      },
      data: { lastUsedAt: now },
    })
    .catch(() => {});
  return { id: key.id, lists: key.lists.map((x) => x.list) };
}
export async function diplomaAPI(
  req: NextRequest,
  mode: "diplomas" | "lists" = "diplomas",
) {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const principal = await authenticateDiplomaKey(req),
      params = req.nextUrl.searchParams;
    if (mode === "lists") {
      demand(
        [...params.keys()].length === 0,
        "Esta consulta no admite parámetros.",
        400,
      );
      return NextResponse.json({ data: principal.lists }, { headers });
    }
    const keys = [...params.keys()];
    demand(
      new Set(keys).size === keys.length,
      "No repitas parámetros de consulta.",
      400,
    );
    const b = diplomaQuery.parse(Object.fromEntries(params));
    const listId =
      b.listId ??
      (principal.lists.length === 1 ? principal.lists[0].id : undefined);
    demand(listId, "Indica listId; consulta primero /api/v1/inventarios.", 400);
    const list = principal.lists.find((l) => l.id === listId);
    demand(list, "Inventario no autorizado o no disponible.", 404);
    const catalog = await db.$transaction(
      async (tx) => {
        const [items, aliases] = await Promise.all([
          tx.metaInventoryItem.count({ where: { sheetId: listId } }),
          tx.metaAlias.count({ where: { inventorySheetId: listId } }),
        ]);
        demand(
          items + aliases <= 20000,
          "Este inventario supera el tamaño admitido por esta versión de la API.",
          413,
        );
        return inventoryCatalog(tx, listId);
      },
      { timeout: 15000 },
    );
    const query = catalogNameKey(b.q),
      category = catalogNameKey(b.category),
      filtered = catalog.filter(
        (item) =>
          (!b.id || item.id === b.id) &&
          (!query || catalogNameKey(item.name).includes(query)) &&
          (!category ||
            [...item.primaryNames, ...(item.secondaryNames ?? [])].some(
              (name) => catalogNameKey(name) === category,
            )),
      );
    const data = filtered
      .slice((b.page - 1) * b.limit, b.page * b.limit)
      .map((item) => ({
        id: item.id,
        name: item.name,
        list: { id: list.id, name: list.name },
        categories: {
          primary: item.primaryNames,
          secondary: item.secondaryNames ?? [],
        },
      }));
    return NextResponse.json(
      {
        data,
        pagination: {
          page: b.page,
          limit: b.limit,
          total: filtered.length,
          pages: Math.max(1, Math.ceil(filtered.length / b.limit)),
          hasMore: b.page * b.limit < filtered.length,
        },
      },
      { headers },
    );
  } catch (e) {
    const status =
      e instanceof AppError ? e.status : e instanceof z.ZodError ? 400 : 500;
    if (status === 401) headers["WWW-Authenticate"] = "Bearer";
    if (status === 429) headers["Retry-After"] = "900";
    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHORIZED"
              : status === 404
                ? "NOT_FOUND"
                : status === 429
                  ? "RATE_LIMITED"
                  : status === 400
                    ? "INVALID_REQUEST"
                    : "API_ERROR",
          message:
            e instanceof AppError
              ? e.message
              : status === 400
                ? "Parámetros no válidos."
                : "No se pudo consultar el catálogo.",
        },
      },
      { status, headers },
    );
  }
}
export async function diplomaApiManagement(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  await currentOwner(actor);
  if (parts.length === 2 && parts[1] === "keys") {
    if (req.method === "GET")
      return NextResponse.json(await diplomaApiKeys(actor), {
        headers: { "Cache-Control": "private, no-store" },
      });
    if (req.method === "POST")
      return NextResponse.json(await createDiplomaKey(actor, await body()), {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      });
  }
  if (parts.length === 3 && parts[1] === "keys" && req.method === "DELETE")
    return NextResponse.json(
      await revokeDiplomaKey(actor, id.parse(parts[2])),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  return NextResponse.json({ error: "Ruta no encontrada." }, { status: 404 });
}
