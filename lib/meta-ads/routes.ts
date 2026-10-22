import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  connectionSelect,
  accountSelect,
  accountWhere,
  access,
  discover,
  saveToken,
  queueSync,
  syncStep,
  type Actor,
} from "./service";
import { dashboard } from "./dashboard";
import { syncProgress } from "./sync-progress";
import { beginOAuth } from "./oauth";
import { beginMarketingOAuth, configureMarketingApp } from "./marketing-oauth";
import { marketingOAuthInfo } from "./marketing-policy";
import { accountActivities } from "./account-activity";
const cfg = z
  .object({
    name: z.string().trim().min(1).max(100),
    transport: z.enum(["API", "MCP"]),
    apiVersion: z
      .string()
      .regex(/^v\d{2}\.0$/)
      .default("v26.0"),
    appId: z
      .string()
      .regex(/^\d{1,40}$/)
      .optional(),
    token: z.string().trim().min(10).max(12000).optional(),
  })
  .strict();
const send = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
export async function metaRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  const path = parts.slice(1).join("/"),
    method = req.method;
  if (path === "marketing-oauth-config" && method === "GET") {
    ownerOnly(actor); return send(marketingOAuthInfo(process.env.APP_ORIGIN));
  }
  if (path === "connections") {
    ownerOnly(actor);
    if (method === "GET")
      return send(
        await db.metaConnection.findMany({
          select: connectionSelect,
          orderBy: { createdAt: "desc" },
        }),
      );
    if (method === "POST") {
      const b = cfg.parse(await body());
      const c = await db.metaConnection.create({
        data: {
          name: b.name,
          transport: b.transport,
          apiVersion: b.apiVersion,
          appId: b.appId,
          ownerId: actor.id,
        },
      });
      if (b.token) await saveToken(c.id, b.token);
      await recordActivity(db, {
        data: {
          actorId: actor.id,
          action: "META_CONEXION_CREADA",
          resourceId: c.id,
          detail: { transport: c.transport },
        },
      });
      return send(
        await db.metaConnection.findUnique({
          where: { id: c.id },
          select: connectionSelect,
        }),
        201,
      );
    }
  }
  if (parts[1] === "connections" && parts[2]) {
    ownerOnly(actor);
    const id = parts[2];
    const c = await db.metaConnection.findUnique({ where: { id } });
    demand(c, "Conexión no encontrada.", 404);
    if (parts[3] === "app" && method === "PATCH") return send(await configureMarketingApp(actor, id, await body()));
    if (parts[3] === "verify" && method === "POST")
      return send(await discover(actor, id));
    if (parts[3] === "oauth" && method === "POST") {
      if (c.transport === "API") {
        z.object({}).strict().parse(await body());
        return beginMarketingOAuth(req, actor, id);
      }
      const b = z
        .object({ clientId: z.string().max(300).optional() })
        .strict()
        .parse(await body());
      return beginOAuth(req, actor, id, b.clientId);
    }
    if (parts[3] === "tools" && method === "GET") return send(c.tools);
    if (method === "PATCH" && !parts[3]) {
      const b = cfg.partial().parse(await body());
      demand(!b.appId || b.appId === c.appId || !c.encryptedAppSecret, "Cambia el ID y la clave de la app desde Configuración OAuth.", 409);
      demand(
        !b.transport || b.transport === c.transport,
        "Crea otra conexión para cambiar de tipo.",
      );
      await db.metaConnection.update({
        where: { id },
        data: {
          ...(b.name ? { name: b.name } : {}),
          ...(b.apiVersion ? { apiVersion: b.apiVersion } : {}),
          ...(b.appId ? { appId: b.appId } : {}),
          ownerId: actor.id,
          revision: { increment: 1 },
          verifiedAt: null,
        },
      });
      if (b.token) await saveToken(id, b.token);
      return send({ ok: true });
    }
    if (method === "DELETE" && !parts[3]) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        await tx.metaConnection.update({
          where: { id },
          data: {
            encryptedToken: null,
            encryptedAppSecret: null,
            appSecretConfiguredAt: null,
            tokenExpiresAt: null,
            tokenMask: null,
            verifiedAt: null,
            disconnectedAt: new Date(),
            revision: { increment: 1 },
            tools: [],
          },
        });
        await tx.metaAdAccount.updateMany({
          where: { connectionId: id },
          data: { enabled: false, nextSyncAt: null, schedulerToken: null },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_CONEXION_DESCONECTADA",
            resourceId: id,
          },
        });
      });
      return send({ ok: true });
    }
  }
  if (path === "accounts" && method === "GET") {
    const rows = await db.metaAdAccount.findMany({
      where: accountWhere(actor),
      select: {
        ...accountSelect,
        connection: { select: { transport:true, name: true, revision: true, verifiedAt: true, disconnectedAt: true } },
        grants: { where: { userId: actor.id }, select: { canSync: true } },
        ...(actor.role === "OWNER"
          ? {
              sources: {
                select: {
                  connectionId: true,
                  revision: true,
                  connection: {
                    select: {
                      name: true,
                      transport: true,
                      revision: true,
                      disconnectedAt: true,
                      verifiedAt: true,
                    },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    const activity = await accountActivities(rows);
    return send(
      rows.map((a) => ({
        ...a,
        activity: activity.get(a.id),
        progress: syncProgress(a),
        syncState: { phase: (a.syncState as { phase?: number }).phase ?? null },
        canSync:
          actor.role === "OWNER" ||
          (actor.role === "ADMIN" && a.grants.some((g) => g.canSync)),
        grants: undefined,
      })),
    );
  }
  if(path === "sync-status" && method === "GET"){
    const ids=[...new Set((req.nextUrl.searchParams.get("accounts")??"").split(",").filter(Boolean))];
    demand(ids.length>0&&ids.length<=100&&ids.every(id=>/^\d{1,40}$/.test(id)),"Selección de cuentas inválida.");
    const rows=await db.metaAdAccount.findMany({where:{AND:[accountWhere(actor),{id:{in:ids}}]},select:{id:true,enabled:true,syncedAt:true,nextSyncAt:true,syncError:true,syncState:true}});
    demand(rows.length===ids.length,"Hay cuentas no autorizadas en la selección.",404);
    return send(rows.map(a=>({id:a.id,syncedAt:a.syncedAt,syncError:a.syncError,syncState:{phase:(a.syncState as {phase?:number}).phase??null},progress:syncProgress(a)})));
  }
  if (parts[1] === "accounts" && parts[2]) {
    const id = parts[2];
    const a = await access(actor, id);
    if(parts[3] === "control" && method === "POST") {
      const b=z.object({action:z.enum(["pause","cancel"])}).strict().parse(await body());
      return send(await (await import("./service")).controlSync(actor,id,b.action));
    }
    if (parts[3] === "sync" && method === "POST") {
      const b = z
        .object({ full: z.boolean().default(false), focused:z.boolean().default(false), recentDays:z.union([z.literal(7),z.literal(15),z.literal(30),z.literal(90),z.literal(180)]).optional() })
        .strict()
        .parse(await body());
      if (b.full) ownerOnly(actor);
      const result = await queueSync(actor, id, b.full, b.recentDays, b.focused);
      // The explicit action checks one page immediately; remaining pages stay durable.
      const advanced = b.focused ? false : await syncStep(id);
      const { startMetaSchedule } = await import("./schedule");
      const scheduled = await startMetaSchedule(id);
      const account = await db.metaAdAccount.findUnique({
        where: { id },
        select: { schedulerRunId: true },
      });
      if (account?.schedulerRunId) {
        try {
          const { getRun } = await import("workflow/api");
          await getRun(account.schedulerRunId).wakeUp();
        } catch {}
      }
      const state=await db.metaAdAccount.findUniqueOrThrow({where:{id},select:{syncError:true}});
      return send({ ...result, ...scheduled, advanced, syncError: state.syncError }, 202);
    }
    if (parts[3] === "grants") {
      ownerOnly(actor);
      if (method === "GET")
        return send(
          await db.metaAccountGrant.findMany({
            where: { accountId: id },
            select: { userId: true, canSync: true },
          }),
        );
      if (method === "PUT") {
        const b = z
          .object({
            grants: z
              .array(
                z
                  .object({
                    userId: z.string().min(1).max(100),
                    canSync: z.boolean().default(false),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict()
          .parse(await body());
        demand(
          new Set(b.grants.map((g) => g.userId)).size === b.grants.length,
          "Usuarios repetidos.",
        );
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
          const users = await tx.user.findMany({
            where: {
              id: { in: b.grants.map((g) => g.userId) },
              status: "APPROVED",
            },
          });
          demand(
            users.length === b.grants.length,
            "Hay usuarios no disponibles.",
            409,
          );
          demand(
            b.grants.every(
              (g) =>
                !g.canSync ||
                users.find((u) => u.id === g.userId)?.role === "ADMIN",
            ),
            "Solo ADMIN puede recibir sincronización delegada.",
          );
          await tx.metaAccountGrant.deleteMany({ where: { accountId: id } });
          if (b.grants.length)
            await tx.metaAccountGrant.createMany({
              data: b.grants.map((g) => ({ ...g, accountId: id })),
            });
          await recordActivity(tx, {
            data: {
              actorId: actor.id,
              action: "META_ACCESOS_ACTUALIZADOS",
              resourceId: id,
              detail: { count: b.grants.length },
            },
          });
        });
        return send({ ok: true });
      }
    }
    if (method === "PATCH" && !parts[3]) {
      ownerOnly(actor);
      const b = z
        .object({
          enabled: z.boolean().optional(),
          metric: z
            .enum(["AUTO", "MESSAGES", "LEADS", "PURCHASES", "LINK_CLICKS"])
            .optional(),
          targetCost: z.number().positive().max(1000000).nullable().optional(),
          minResults: z.number().int().min(1).max(10000).optional(),
          intervalMinutes: z.number().int().min(15).max(1440).optional(),
          connectionId: z.string().max(100).optional(),
        })
        .strict()
        .parse(await body());
      if (b.connectionId) {
        const c = await db.metaConnection.findFirst({
          where: {
            id: b.connectionId,
            verifiedAt: { not: null },
            disconnectedAt: null,
          },
        });
        demand(c, "Verifica primero la conexión de destino.", 409);
        const link = await db.metaAccountSource.findUnique({
          where: {
            accountId_connectionId: {
              accountId: id,
              connectionId: b.connectionId,
            },
          },
        });
        demand(
          link && link.revision === c.revision,
          "Esta cuenta todavía no se verificó con la conexión de destino. Pulsa Verificar en esa conexión.",
          409,
        );
      }
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        await tx.metaAdAccount.update({
          where: { id },
          data: {
            ...b,
            ...(b.connectionId && b.connectionId !== a.connectionId
              ? {
                  syncState: {},
                  syncToken: null,
                  syncLeaseAt: null,
                  schedulerToken: null,
                  schedulerRunId: null,
                  nextSyncAt: new Date(),
                }
              : {}),
            ...(b.enabled === false
              ? { schedulerToken: null, nextSyncAt: null }
              : b.enabled === true
                ? { nextSyncAt: new Date() }
                : {}),
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_CUENTA_CONFIGURADA",
            resourceId: id,
            detail: { enabled: b.enabled },
          },
        });
      });
      if (b.enabled || (b.connectionId && a.enabled))
        await (await import("./schedule")).startMetaSchedule(id);
      return send({ ok: true });
    }
  }
  if (path === "dashboard" && method === "GET")
    return send(await dashboard(actor, req.nextUrl.searchParams));
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "thumbnail" &&
    method === "GET"
  )
    return (await import("./thumbnail")).metaThumbnail(actor, parts[2]);
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "daily" &&
    method === "GET"
  ) {
    const obj = await db.metaAdObject.findUnique({ where: { id: parts[2] } });
    demand(obj, "Anuncio no disponible.", 404);
    const a = await access(actor, obj.accountId);
    const { localDay, shiftDay } = await import("./analytics");
    const today = localDay(a.timezone);
    return send(
      await db.metaAdDaily.findMany({
        where: {
          objectId: obj.id,
          scope: "7d_click,1d_view|impression",
          day: { gte: shiftDay(today, -29), lte: today },
        },
        select: {
          day: true,
          spend: true,
          impressions: true,
          clicks: true,
          actions: true,
        },
        orderBy: { day: "asc" },
      }),
    );
  }
  if (path === "objects" && method === "GET") {
    const allowed = await db.metaAdAccount.findMany({
      where: accountWhere(actor),
      select: { id: true,selectionSince:true,syncState:true },
    });
    const ids = (req.nextUrl.searchParams.get("accounts") ?? "")
      .split(",")
      .filter(Boolean);
    demand(
      ids.every((id) => allowed.some((a) => a.id === id)),
      "Cuenta no autorizada.",
      404,
    );
    return send(
      await db.metaAdObject.findMany({
        where: {
          accountId: { in: ids.length ? ids : allowed.map((a) => a.id) },
          level: { in: ["campaign", "adset"] },
          AND:[{OR:allowed.filter(a=>!ids.length || ids.includes(a.id)).map(a=>{const started=(a.syncState as {plan?:string;started?:string}).plan==="focus"?(a.syncState as {started?:string}).started:undefined;const cutoff=a.selectionSince??(started?new Date(started):null);return {accountId:a.id,...(cutoff?{selectedAt:{gte:cutoff}}:{})};})}],
        },
        select: {
          id: true,
          name: true,
          accountId: true,
          campaignId: true,
          level: true,
        },
        orderBy: { name: "asc" },
        take: 10000,
      }),
    );
  }
  if (path === "directory" && method === "GET") {
    ownerOnly(actor);
    return send(
      await db.user.findMany({
        where: { status: "APPROVED" },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
    );
  }
  return send({ error: "Operación Meta Ads no disponible." }, 404);
}
