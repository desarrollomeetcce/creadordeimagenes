import { db } from "../db";
import { ownerOnly, rateLimit } from "../auth";
import { AppError, demand } from "../errors";
import { recordActivity } from "../activity";
import { reader, type Actor } from "./service";
import { MetaGraphError } from "./graph-error";
import type { Operation } from "./provider";

// A separate explicit write path; never used by polling, import, filters or MCP.
export async function setMetaStatus(
  actor: Actor,
  objectId: string,
  status: "ACTIVE" | "PAUSED",
  expectedStatus: "ACTIVE" | "PAUSED",
) {
  ownerOnly(actor);
  await rateLimit("meta:manage:" + actor.id, 20);
  const object = await db.metaAdObject.findUnique({
    where: { id: objectId },
    include: { account: true },
  });
  demand(object, "Elemento no disponible.", 404);
  const { connection, reader: r } = await reader(
    object.account.connectionId,
    true,
    true,
  );
  demand(
    connection.transport === "API" && connection.verifiedAt,
    "Verifica primero la conexión de Marketing API.",
    409,
  );
  const op = (
    { campaign: "campaigns", adset: "adsets", ad: "ads" } as Record<
      string,
      Operation
    >
  )[object.level];
  demand(op, "Nivel publicitario no permitido.");
  const remote = (await r.get(op, { accountId: object.accountId, objectId }))
    .data[0];
  demand(
    String(remote?.account_id).replace(/^act_/, "") === object.accountId &&
      String(remote?.id) === objectId,
    "Meta devolvió un elemento de otra cuenta.",
    502,
  );
  demand(
    remote.status === expectedStatus,
    "El estado cambió en Meta. Sincroniza y revisa antes de modificarlo.",
    409,
  );
  demand(status !== expectedStatus, "El elemento ya tiene ese estado.", 409);
  let applied = false;
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        demand(
          await tx.user.findFirst({
            where: { id: actor.id, role: "OWNER", status: "APPROVED" },
          }),
          "Ya no tienes permiso para modificar Meta.",
          403,
        );
        demand(
          await tx.user.findFirst({
            where: {
              id: connection.ownerId,
              role: "OWNER",
              status: "APPROVED",
            },
          }),
          "El propietario de la conexión ya no está autorizado.",
          403,
        );
        const current = await tx.metaAdObject.findFirst({
          where: {
            id: objectId,
            accountId: object.accountId,
            account: {
              is: {
                connectionId: connection.id,
                connection: {
                  is: {
                    revision: connection.revision,
                    disconnectedAt: null,
                    verifiedAt: { not: null },
                    ownerId: connection.ownerId,
                  },
                },
              },
            },
          },
        });
        demand(
          current && current.status === expectedStatus,
          "La conexión o los permisos cambiaron. Verifica antes de continuar.",
          409,
        );
        await r.setStatus(objectId, status);
        applied = true;
        // Never invent effective status: parents/review can prevent delivery even when configured active.
        await tx.metaAdObject.update({
          where: { id: objectId },
          data: {
            status,
            effectiveStatus: status === "PAUSED" ? "PAUSED" : null,
          },
        });
        if (object.level !== "ad")
          await tx.metaAdObject.updateMany({
            where: {
              accountId: object.accountId,
              id: { not: objectId },
              ...(object.level === "campaign"
                ? { campaignId: objectId }
                : { adsetId: objectId }),
              status: "ACTIVE",
            },
            data: {
              effectiveStatus:
                status === "PAUSED"
                  ? object.level === "campaign"
                    ? "CAMPAIGN_PAUSED"
                    : "ADSET_PAUSED"
                  : null,
            },
          });
        await tx.metaAdAccount.update({
          where: { id: object.accountId },
          data: { syncToken: null, syncLeaseAt: null },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_ESTADO_CAMBIADO",
            resourceId: objectId,
            detail: {
              accountId: object.accountId,
              level: object.level,
              from: expectedStatus,
              to: status,
            },
          },
        });
        return { ok: true, status };
      },
      { timeout: 45000, maxWait: 10000 },
    );
  } catch (error) {
    if (applied)
      throw new AppError(
        "Meta confirmó el cambio, pero no se pudo actualizar la copia local. Sincroniza para comprobarlo; no repitas la acción.",
        503,
      );
    if (
      error instanceof MetaGraphError &&
      [10, 200].includes(error.diagnostic.code ?? -1)
    )
      throw new AppError(
        error.message +
          " Para activar o pausar, autoriza ads_management y verifica el acceso de administración a esta cuenta.",
        403,
      );
    throw error;
  }
}
