import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { conversationSchema } from "./campaign-workbench-policy";
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
  validateCampaignText,
  type CampaignItem,
} from "./campaign-policy";
export const campaignSuggestionSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    description: z.string().max(500),
    audiences: z.array(audienceSchema).min(1).max(10),
    headline: z.string().trim().min(1).max(250).optional(),
    conversation: conversationSchema.optional(),
  })
  .strict();
export function parseCampaignSuggestion(
  text: string,
  count: number,
  allow: { headline?: boolean; conversation?: boolean } = {},
) {
  const result = campaignSuggestionSchema.parse(
    JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")),
  );
  demand(
    (allow.headline || result.headline === undefined) &&
      (allow.conversation || result.conversation === undefined),
    "La IA devolvió campos que no fueron solicitados.",
    502,
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
        a.detailedTargeting?.length ||
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
          headline: z.boolean().default(false),
          conversation: z.boolean().default(false),
        })
        .strict()
        .default({
          audiences: true,
          body: true,
          description: true,
          headline: false,
          conversation: false,
        }),
      prompt: z.string().trim().min(1).max(12000),
      config: z.preprocess((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value))
          return value;
        const c = value as Record<string, unknown>;
        return {
          ...c,
          headline:
            typeof c.headline === "string" && c.headline.trim()
              ? c.headline
              : "{diplomado}",
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
    b.fields.audiences ||
      b.fields.body ||
      b.fields.description ||
      b.fields.headline ||
      b.fields.conversation,
    "Selecciona al menos un campo para completar con IA.",
  );
  demand(
    !b.fields.audiences ||
      (!b.config.existingAdsetId && !b.config.existingAdsetIds?.length),
    "Los públicos de conjuntos existentes no se modifican con IA.",
  );
  demand(
    !b.fields.conversation ||
      ["WHATSAPP", "LEADS_WHATSAPP"].includes(b.config.objective),
    "La bienvenida requiere un destino WhatsApp.",
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
        audienceVersion: 4,
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
    const outputShape = {
      body: "texto reutilizable con {diplomado}",
      description: "descripción breve",
      ...(b.fields.audiences
        ? {
            audiences: [
              {
                name: "perfil concreto",
                ageMin: 18,
                ageMax: 65,
                gender: "ALL",
                strictAge: false,
                interests: [
                  { id: "ID del catálogo", name: "nombre del catálogo" },
                ],
              },
            ],
          }
        : {}),
      ...(b.fields.headline
        ? {
            headline:
              "título común para todos los anuncios, máximo250 caracteres",
          }
        : {}),
      ...(b.fields.conversation
        ? {
            conversation: {
              name: "nombre breve",
              greeting: "saludo del negocio",
              autofill: "mensaje inicial del interesado, máximo80 caracteres",
            },
          }
        : {}),
    };
    const prompt =
      "Devuelve SOLO JSON: " +
      JSON.stringify(outputShape) +
      (b.fields.audiences
        ? ` Exactamente ${b.config.audiences.length} públicos. Usa perfiles e intereses diferentes por conjunto del catálogo de Meta, sin inventar IDs. Como máximo uno amplio; los demás con intereses relevantes distintos. Categorías especiales: intereses vacíos, edades18–65 y géneroALL.`
        : " No generes públicos.") +
      (b.fields.headline
        ? " El headline se solicitó expresamente y debe ser común a todos los anuncios; usa {diplomado} si hay varios temas."
        : " No devuelvas ni cambies el headline.") +
      (b.fields.conversation
        ? " Redacta una NUEVA bienvenida, no busques plantillas antiguas ni declares aprobación de WhatsApp Business. Saludo máximo1024 y mensaje inicial máximo80 caracteres incluso después de reemplazar variables; evita nombres largos en el mensaje inicial."
        : " No generes conversación.") +
      " No inventes beneficios, precios ni acreditaciones. Conserva país, presupuesto y ubicaciones. Contexto JSON: " +
      JSON.stringify({
        country: b.config.country,
        objective: b.config.objective,
        specialCategory: b.config.specialCategory,
        tasks,
        metaInterestCatalog: interestCatalog,
      });
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
      ? parseCampaignSuggestion(
          response.text,
          b.config.audiences.length,
          b.fields,
        )
      : {
          ...campaignSuggestionSchema
            .omit({ audiences: true })
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
    if (b.fields.headline)
      demand(
        proposal.headline?.trim(),
        "La IA no confirmó el headline solicitado.",
        502,
      );
    else delete proposal.headline;
    if (b.fields.conversation)
      demand(
        proposal.conversation,
        "La IA no confirmó la bienvenida solicitada.",
        502,
      );
    else delete proposal.conversation;
    for (const sub of subs)
      validateCampaignText(
        { subproductId: sub.id, name: sub.name, variationIds: [] },
        {
          ...b.config,
          body: proposal.body,
          description: proposal.description,
          ...(proposal.headline ? { headline: proposal.headline } : {}),
          ...(proposal.conversation
            ? { conversation: proposal.conversation }
            : {}),
        },
      );
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
