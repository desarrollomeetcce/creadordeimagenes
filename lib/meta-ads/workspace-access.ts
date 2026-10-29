import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { demand } from "../errors";
import { recordActivity } from "../activity";
type Actor = { id: string; role: string };
type Client = Prisma.TransactionClient;
export const metaEditorUserWhere = (id?: string): Prisma.UserWhereInput => ({
  ...(id ? { id } : {}),
  status: "APPROVED",
  OR: [
    { role: "OWNER" },
    { metaWorkspaceGrant: { is: { permission: "EDIT" } } },
  ],
});
export async function workspaceAccess(actor: Actor, tx: Client = db) {
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: {
      role: true,
      status: true,
      metaWorkspaceGrant: {
        select: { permission: true, pinnedAccountIds: true, grantedById: true },
      },
    },
  });
  demand(user?.status === "APPROVED", "La cuenta no está habilitada.", 403);
  const isOwner = user.role === "OWNER",
    grant = user.metaWorkspaceGrant,
    permission = isOwner ? "EDIT" : (grant?.permission ?? null);
  return {
    permission,
    canEdit: permission === "EDIT",
    canShare: isOwner,
    shared: !isOwner && !!grant,
    pinnedAccountIds:
      grant && Array.isArray(grant.pinnedAccountIds)
        ? grant.pinnedAccountIds.filter(
            (x): x is string => typeof x === "string",
          )
        : [],
    sponsorId: isOwner ? actor.id : (grant?.grantedById ?? null),
  };
}
export async function metaEditorOnly(actor: Actor, tx: Client = db) {
  const access = await workspaceAccess(actor, tx);
  demand(access.canEdit, "Necesitas permiso Puede editar en Meta Ads.", 403);
  return access;
}
export async function metaActor(id: string) {
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  demand(user?.status === "APPROVED", "La cuenta ya no está habilitada.", 403);
  return user;
}
export async function metaCanSync(
  actor: Actor,
  grants: { canSync: boolean }[],
  tx: Client = db,
) {
  const a = await workspaceAccess(actor, tx);
  if (a.permission) return a.canEdit;
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: { role: true },
  });
  return user?.role === "ADMIN" && grants.some((g) => g.canSync);
}
async function sharingOwner(actor: Actor, tx: Client = db) {
  demand(
    (await workspaceAccess(actor, tx)).canShare,
    "Solo el OWNER administra los accesos compartidos de Meta Ads.",
    403,
  );
}
export async function readWorkspaceSharing(actor: Actor) {
  await sharingOwner(actor);
  const [state, grants, users] = await Promise.all([
    db.metaWorkspaceSharing.findUnique({ where: { id: "global" } }),
    db.metaWorkspaceGrant.findMany({
      select: { userId: true, permission: true },
    }),
    db.user.findMany({
      where: { status: "APPROVED" },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { revision: state?.revision ?? 0, grants, users };
}
const shareSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    grants: z
      .array(
        z
          .object({
            userId: z.string().min(1).max(100),
            permission: z.enum(["VIEW", "EDIT"]),
          })
          .strict(),
      )
      .max(500),
    pinnedAccountIds: z.array(z.string().regex(/^\d{1,40}$/)).max(1000),
  })
  .strict();
export async function saveWorkspaceSharing(actor: Actor, input: unknown) {
  await sharingOwner(actor);
  const b = shareSchema.parse(input);
  demand(
    new Set(b.grants.map((g) => g.userId)).size === b.grants.length,
    "Hay personas repetidas.",
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      await sharingOwner(actor, tx);
      const state = await tx.metaWorkspaceSharing.upsert({
        where: { id: "global" },
        create: { id: "global" },
        update: {},
      });
      demand(
        state.revision === b.revision,
        "Los accesos cambiaron. Vuelve a abrir Compartir.",
        409,
      );
      const users = await tx.user.findMany({
        where: {
          id: { in: b.grants.map((g) => g.userId) },
          status: "APPROVED",
          role: { not: "OWNER" },
        },
        select: { id: true },
      });
      demand(
        users.length === b.grants.length,
        "Elige cuentas habilitadas; los OWNER ya tienen acceso.",
        409,
      );
      const pins = await tx.metaAdAccount.findMany({
        where: { id: { in: [...new Set(b.pinnedAccountIds)] } },
        select: { id: true },
      });
      demand(
        pins.length === new Set(b.pinnedAccountIds).size,
        "Una cuenta fijada ya no está disponible.",
        409,
      );
      await tx.metaWorkspaceGrant.deleteMany({
        where: { userId: { notIn: b.grants.map((g) => g.userId) } },
      });
      for (const g of b.grants)
        await tx.metaWorkspaceGrant.upsert({
          where: { userId: g.userId },
          create: {
            ...g,
            grantedById: actor.id,
            pinnedAccountIds: pins.map((p) => p.id),
          },
          update: {
            grantedById: actor.id,
            permission: g.permission,
            pinnedAccountIds: pins.map((p) => p.id),
          },
        });
      await tx.metaWorkspaceSharing.update({
        where: { id: "global" },
        data: { revision: { increment: 1 } },
      });
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_MODULO_COMPARTIDO",
          detail: {
            count: b.grants.length,
            editors: b.grants.filter((g) => g.permission === "EDIT").length,
          },
        },
      });
      return { ok: true };
    },
    { timeout: 30000 },
  );
}
