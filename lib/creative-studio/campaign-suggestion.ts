import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db";
import { resourceAccess, rateLimit } from "../auth";
import { configured } from "../ai";
import { creativeConnection } from "../provider-connections";
import { decryptKey } from "../crypto";
import { adapter } from "../providers";
import { checkReservationBudget } from "../reservation-budget";
import { startJobHeartbeat } from "../job-lease";
import { demand, AppError } from "../errors";
import { studioAccess, json, type Actor } from "./service";
import {
  audienceSchema,
  campaignConfigSchema,
  campaignText,
  type CampaignItem,
} from "./campaign-policy";
export const campaignSuggestionSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    description: z.string().max(500),
    audiences: z.array(audienceSchema).min(1).max(10),
  })
  .strict();
export function parseCampaignSuggestion(text: string, count: number) {
  const result = campaignSuggestionSchema.parse(
    JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")),
  );
  demand(
    result.audiences.length === count,
    "La IA no confirmó la cantidad de públicos solicitada.",
    502,
  );
  demand(
    !result.audiences.some((a) => a.savedAudienceId),
    "La IA no puede inventar identificadores de públicos.",
    502,
  );
  return result;
}
export async function suggestCampaign(actor: Actor, input: unknown) {
  studioAccess(actor);
  const b = z
    .object({
      requestId: z.string().uuid(),
      categoryId: z.string().min(1).max(100),
      confirmAi: z.literal(true),
      prompt: z.string().trim().min(1).max(12000),
      config: campaignConfigSchema,
      subproductIds: z.array(z.string().min(1).max(100)).min(1).max(10),
    })
    .strict()
    .parse(input);
  await resourceAccess(actor, "category", b.categoryId, "EDIT");
  const category = await db.category.findUniqueOrThrow({
    where: { id: b.categoryId },
  });
  const subs = await db.subproduct.findMany({
    where: {
      id: { in: b.subproductIds },
      categoryId: b.categoryId,
      deletedAt: null,
    },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  demand(
    subs.length === new Set(b.subproductIds).size,
    "La selección ya no está disponible.",
    409,
  );
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        categoryId: b.categoryId,
        prompt: b.prompt,
        config: b.config,
        subs,
      }),
    )
    .digest("hex");
  const key = "campaign-suggestion:" + actor.id + ":" + b.requestId;
  function existingResult(job: any) {
    demand(
      job.actorId === actor.id && job.snapshot?.fingerprint === fingerprint,
      "Esta solicitud corresponde a otra configuración.",
      409,
    );
    demand(
      job.status === "COMPLETED" && job.snapshot?.proposal,
      "La consulta ya fue iniciada. Revisa su estado y consumo antes de autorizar otra.",
      409,
    );
    return { jobId: job.id, proposal: job.snapshot.proposal };
  }
  const existing = await db.generationJob.findUnique({
    where: { idempotencyKey: key },
  });
  if (existing) return existingResult(existing);
  await rateLimit("campaign-suggestion:" + actor.id, 10);
  const c = await configured(true),
    creative = await creativeConnection(c),
    token = randomUUID();
  const snapshot = {
    kind: "CAMPAIGN_SUGGESTION",
    fingerprint,
    provider: creative.provider,
    model: creative.model.id,
  };
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const known = await tx.generationJob.findUnique({
      where: { idempotencyKey: key },
    });
    if (known) return { known };
    const fresh = await tx.providerConfiguration.findUniqueOrThrow({
      where: { id: "global" },
    });
    demand(
      fresh.revision === c.revision,
      "La configuración de IA cambió.",
      409,
    );
    const connection = await creativeConnection(fresh, tx);
    demand(
      connection.revision === creative.revision &&
        connection.encryptedKey === creative.encryptedKey,
      "La conexión de IA cambió.",
      409,
    );
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, status: true },
    });
    demand(
      user?.status === "APPROVED" && user.role === actor.role,
      "Tu acceso cambió.",
      403,
    );
    const reserve = await checkReservationBudget(
        tx,
        c,
        actor.id,
        category.projectId,
        1,
      ),
      now = new Date();
    const job = await tx.generationJob.create({
      data: {
        actorId: actor.id,
        projectId: category.projectId,
        idempotencyKey: key,
        status: "RUNNING",
        snapshot: json(snapshot),
        reservedMicros: reserve,
        leaseToken: token,
        heartbeatAt: now,
        startedAt: now,
      },
    });
    await tx.usageLedger.create({
      data: {
        jobId: job.id,
        actorId: actor.id,
        projectId: category.projectId,
        model: creative.model.id,
        reservedMicros: reserve,
      },
    });
    return { job };
  });
  if ("known" in result && result.known) return existingResult(result.known);
  const job = result.job!;
  const heartbeat = startJobHeartbeat(job.id, token);
  let called = false;
  try {
    await resourceAccess(actor, "category", b.categoryId, "EDIT");
    await heartbeat.check();
    const tasks = subs.map((s) => ({
      name: s.name,
      instructions: campaignText(
        b.prompt,
        { subproductId: s.id, name: s.name, variationIds: [] } as CampaignItem,
        b.config,
      ),
    }));
    const prompt =
      'Devuelve SOLO JSON: {"body":"texto con {diplomado} para reutilizar por campaña","description":"descripción breve","audiences":[{"name":"nombre","ageMin":18,"ageMax":65,"gender":"ALL","strictAge":false}]}. Exactamente ' +
      b.config.audiences.length +
      " públicos. No inventes IDs, intereses, credenciales, resultados ni garantías. Solo segmentación demográfica permitida. Para categorías especiales no restrinjas edad ni género. No devuelvas headline, país, presupuesto ni ubicaciones. Esos campos los controla el usuario. Contexto JSON: " +
      JSON.stringify({
        country: b.config.country,
        objective: b.config.objective,
        specialCategory: b.config.specialCategory,
        tasks,
      });
    const secret = decryptKey(creative.encryptedKey);
    called = true;
    const response = await adapter(creative.provider).direct(
      secret,
      creative.model.id,
      prompt,
      true,
      AbortSignal.any([heartbeat.signal, AbortSignal.timeout(120000)]),
      undefined,
      2500,
    );
    demand(!response.incomplete, "La IA no terminó su propuesta.", 502);
    const proposal = parseCampaignSuggestion(
      response.text,
      b.config.audiences.length,
    );
    await heartbeat.check();
    const currentUser = await db.user.findUnique({
      where: { id: actor.id },
      select: { status: true, role: true },
    });
    demand(
      currentUser?.status === "APPROVED" && currentUser.role === actor.role,
      "Tu acceso cambió durante la consulta.",
      403,
    );
    await resourceAccess(actor, "category", b.categoryId, "EDIT");
    await db.$transaction(async (tx) => {
      const done = await tx.generationJob.updateMany({
        where: { id: job.id, status: "RUNNING", leaseToken: token },
        data: {
          status: "COMPLETED",
          snapshot: json({ ...snapshot, proposal }),
          completedAt: new Date(),
          leaseToken: null,
          heartbeatAt: null,
        },
      });
      demand(done.count, "Se perdió la confirmación de la consulta.", 409);
      await tx.usageLedger.update({
        where: { jobId: job.id },
        data: {
          status: "CONSUMED_ESTIMATE",
          usage: json({ creative: response.usage }),
        },
      });
    });
    return { jobId: job.id, proposal };
  } catch {
    await db.$transaction(async (tx) => {
      const changed = await tx.generationJob.updateMany({
        where: { id: job.id, status: "RUNNING", leaseToken: token },
        data: {
          status: called ? "UNCERTAIN" : "FAILED",
          leaseToken: null,
          heartbeatAt: null,
          error: called
            ? "No se confirmó una propuesta válida. Revisa consumo antes de otra consulta."
            : "No se inició la consulta.",
        },
      });
      if (changed.count)
        await tx.usageLedger.update({
          where: { jobId: job.id },
          data: {
            status: called ? "UNCERTAIN" : "RELEASED",
            ...(called ? {} : { actualMicros: 0n }),
          },
        });
    });
    throw new AppError(
      called
        ? "No se confirmó la propuesta de IA. La consulta no se repetirá automáticamente; revisa su consumo."
        : "No se pudo iniciar la consulta de IA.",
      409,
    );
  } finally {
    await heartbeat.stop();
  }
}
