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
import { primaryAccount } from "./campaigns";
import { reader } from "../meta-ads/service";
import {
  interestQueries,
  verifiedAudienceInterests,
  type MetaInterest,
} from "./audience-interests";
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
    !result.audiences.some(
      (a) =>
        a.savedAudienceId ||
        a.platformPresetId ||
        a.selectionProofs?.length ||
        a.customAudiences?.length ||
        a.excludedCustomAudiences?.length ||
        a.locations?.length ||
        a.locales?.length,
    ),
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
      fields: z
        .object({
          audiences: z.boolean(),
          body: z.boolean(),
          description: z.boolean(),
        })
        .strict()
        .default({ audiences: true, body: true, description: true }),
      prompt: z.string().trim().min(1).max(12000),
      config: z.preprocess((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return value;
        const c = value as Record<string, unknown>;
        return {
          ...c,
          body:
            typeof c.body === "string" && c.body.trim()
              ? c.body
              : "Texto generado por IA",
        };
      }, campaignConfigSchema),
      subproductIds: z.array(z.string().min(1).max(100)).min(1).max(10),
    })
    .strict()
    .parse(input);
  demand(
    b.fields.audiences || b.fields.body || b.fields.description,
    "Selecciona al menos un campo para completar con IA.",
  );
  demand(
    !b.fields.audiences ||
      (!b.config.existingAdsetId && !b.config.existingAdsetIds?.length),
    "Los públicos de conjuntos existentes no se modifican con IA.",
  );
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
        audienceVersion: 3,
        fields: b.fields,
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
  const meta = await primaryAccount(actor, b.config.accountId);
  const c = await configured(true),
    creative = await creativeConnection(c),
    token = randomUUID();
  const snapshot = {
    kind: "CAMPAIGN_SUGGESTION",
    categoryId: b.categoryId,
    subproductIds: subs.map((s) => s.id),
    accountId: b.config.accountId,
    country: b.config.country,
    connectionRevision: meta.connection.revision,
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
  let interestCatalog: MetaInterest[] = [];
  const usages: unknown[] = [];
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
    const secret = decryptKey(creative.encryptedKey),
      signal = AbortSignal.any([heartbeat.signal, AbortSignal.timeout(240000)]);
    if (b.fields.audiences && b.config.specialCategory === "NONE") {
      called = true;
      const seed = await adapter(creative.provider).direct(
        secret,
        creative.model.id,
        'Devuelve SOLO JSON {"queries":["término"]}, de 2 a 4 consultas breves en español o inglés para encontrar intereses de publicidad REALES relacionados con estos diplomados. No IDs ni edades ni intereses sensibles. Usa sectores distintos y relevantes. Contexto: ' +
          JSON.stringify({
            names: subs.map((s) => s.name),
            country: b.config.country,
            instructions: b.prompt,
          }),
        true,
        signal,
        "low",
        1500,
      );
      usages.push(seed.usage);
      demand(!seed.incomplete, "La IA no terminó la selección de temas.", 502);
      const queries = interestQueries(seed.text),
        { reader: r } = await reader(meta.connectionId, false, true);
      const map = new Map<string, MetaInterest>();
      for (const query of [...new Set(queries)]) {
        await heartbeat.check();
        for (const interest of await r.targetingInterests(meta.id, query))
          map.set(interest.id, interest);
      }
      interestCatalog = [...map.values()];
      demand(
        interestCatalog.length > 0,
        "Meta no devolvió intereses válidos para estos temas. No se publicará una segmentación genérica.",
        409,
      );
    }
    const prompt = b.fields.audiences
      ? 'Devuelve SOLO JSON: {"body":"texto reutilizable con {diplomado}","description":"descripción breve","audiences":[{"name":"perfil concreto","ageMin":18,"ageMax":65,"gender":"ALL","strictAge":false,"interests":[{"id":"ID del catálogo","name":"nombre del catálogo"}]}]}. Exactamente ' +
        b.config.audiences.length +
        " públicos. Elige perfiles e intereses diferentes por conjunto del catálogo consultado a Meta. Como máximo un conjunto puede ser amplio (interests vacío); los demás requieren intereses relevantes del catálogo, sin repetir la misma combinación. No inventes IDs, beneficios ni acreditaciones. Para categorías especiales usa interests vacío, edades18–65 y géneroALL. Conserva headline, país, presupuesto y ubicaciones: no los devuelvas. Contexto JSON: " +
        JSON.stringify({
          country: b.config.country,
          objective: b.config.objective,
          specialCategory: b.config.specialCategory,
          tasks,
          metaInterestCatalog: interestCatalog,
        })
      : 'Devuelve SOLO JSON {"body":"texto para {diplomado}","description":"descripción breve"}. No generes públicos ni cambies configuraciones. No inventes beneficios, precios ni acreditaciones. Contexto: ' +
        JSON.stringify({ country: b.config.country, tasks });
    called = true;
    const response = await adapter(creative.provider).direct(
      secret,
      creative.model.id,
      prompt,
      true,
      signal,
      "low",
      4500,
    );
    usages.push(response.usage);
    demand(!response.incomplete, "La IA no terminó su propuesta.", 502);
    const proposal = b.fields.audiences
      ? parseCampaignSuggestion(response.text, b.config.audiences.length)
      : {
          ...z
            .object({
              body: z.string().trim().min(1).max(5000),
              description: z.string().max(500),
            })
            .strict()
            .parse(
              JSON.parse(
                response.text
                  .replace(/^```(?:json)?\s*/, "")
                  .replace(/\s*```$/, ""),
              ),
            ),
          audiences: b.config.audiences,
        };
    if (b.fields.audiences)
      proposal.audiences = verifiedAudienceInterests(
        proposal.audiences,
        interestCatalog,
        b.config.specialCategory !== "NONE",
      );
    if (!b.fields.body) proposal.body = b.config.body;
    if (!b.fields.description) proposal.description = b.config.description;
    await heartbeat.check();
    const freshMeta = await primaryAccount(actor, b.config.accountId);
    demand(
      freshMeta.connectionId === meta.connectionId &&
        freshMeta.connection.revision === meta.connection.revision,
      "La conexión de Meta cambió durante la selección.",
      409,
    );
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
          snapshot: json({ ...snapshot, proposal, interestCatalog }),
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
          usage: json({ creative: usages }),
        },
      });
    });
    return { jobId: job.id, proposal };
  } catch (e) {
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
        ? "No se confirmó la propuesta de IA. " +
            (e instanceof AppError ? e.message + " " : "") +
            "La consulta no se repetirá automáticamente; revisa su consumo."
        : "No se pudo iniciar la consulta de IA.",
      409,
    );
  } finally {
    await heartbeat.stop();
  }
}
