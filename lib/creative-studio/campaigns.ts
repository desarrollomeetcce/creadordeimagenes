import { z } from "zod";
import { db } from "../db";
import { demand, AppError } from "../errors";
import { resourceAccess, rateLimit } from "../auth";
import { metaEditorOnly, workspaceAccess } from "../meta-ads/workspace-access";
import { access, reader } from "../meta-ads/service";
import { load } from "../storage";
import { recordActivity } from "../activity";
import { studioAccess, object, json, type Actor } from "./service";
import {
  campaignConfigSchema,
  campaignText,
  minorBudget,
  audienceTargeting,
  launchPlan,
  launchSummary,
  type CampaignItem,
  type LaunchStep,
  type CampaignConfig,
} from "./campaign-policy";
const id = z.string().min(1).max(100);
async function primaryAccount(actor: Actor, accountId: string) {
  await metaEditorOnly(actor);
  const rights = await workspaceAccess(actor);
  demand(
    rights.primaryAccountIds.includes(accountId),
    "Selecciona una cuenta principal de Meta Ads.",
    409,
  );
  const a = await access(actor, accountId);
  demand(
    a.connection.transport === "API" &&
      a.connection.verifiedAt &&
      !a.connection.disconnectedAt,
    "Verifica la conexión de Marketing API de esta cuenta antes de publicar.",
    409,
  );
  return a;
}
export async function launchResources(actor: Actor, accountId: string) {
  studioAccess(actor);
  const a = await primaryAccount(actor, accountId);
  const { reader: r } = await reader(a.connectionId, false, true);
  const settled = await Promise.allSettled([
    r.launchRequest(a.id, "promote_pages"),
    r.launchRequest(a.id, "saved_audiences"),
  ]);
  if (settled[0].status === "rejected") throw settled[0].reason;
  const pages = settled[0].value;
  const saved =
    settled[1].status === "fulfilled" ? settled[1].value : { data: [] };
  return {
    pages: (pages.data ?? []).map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      whatsapp: typeof p.whatsapp_number === "string" ? p.whatsapp_number : "",
    })),
    audiences: (saved.data ?? []).map((s: any) => ({
      id: String(s.id),
      name: String(s.name),
    })),
    partial: !!pages.paging?.next || !!saved.paging?.next,
    currency: a.currency,
  };
}
export async function createLaunch(actor: Actor, input: unknown) {
  studioAccess(actor);
  const b = z
    .object({
      requestId: z.uuid(),
      categoryId: id,
      config: campaignConfigSchema,
      items: z
        .array(
          z
            .object({
              subproductId: id,
              variationIds: z.array(id).min(1).max(50),
            })
            .strict(),
        )
        .min(1)
        .max(10),
    })
    .strict()
    .parse(input);
  await resourceAccess(actor, "category", b.categoryId, "EDIT");
  const a = await primaryAccount(actor, b.config.accountId);
  minorBudget(b.config.dailyBudget, a.currency);
  const c = await db.category.findUniqueOrThrow({
    where: { id: b.categoryId },
  });
  demand(
    object(c.studio).country === b.config.country,
    "El país no coincide con el producto seleccionado.",
    409,
  );
  const uniqueSub = new Set(b.items.map((i) => i.subproductId));
  demand(
    uniqueSub.size === b.items.length,
    "Cada diplomado debe aparecer una sola vez.",
  );
  const subs = await db.subproduct.findMany({
    where: { id: { in: [...uniqueSub] }, categoryId: c.id, deletedAt: null },
    select: { id: true, name: true, studio: true },
  });
  demand(
    subs.length === uniqueSub.size,
    "Uno de los subproductos ya no está disponible.",
    409,
  );
  const ids = b.items.flatMap((i) => i.variationIds);
  demand(
    new Set(ids).size === ids.length,
    "No repitas un afiche en la selección.",
  );
  const vs = await db.variation.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      expired: false,
      OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      subproductId: true,
      job: { select: { status: true } },
      revision: true,
    },
  });
  demand(
    vs.length === ids.length &&
      b.items.every((i) =>
        i.variationIds.every((id) =>
          vs.some(
            (v) =>
              v.id === id &&
              v.subproductId === i.subproductId &&
              v.job.status === "COMPLETED",
          ),
        ),
      ),
    "Un afiche ya no pertenece al subproducto o no está disponible.",
    409,
  );
  const items: CampaignItem[] = b.items.map((i) => {
    const s = subs.find((s) => s.id === i.subproductId)!;
    return {
      ...i,
      name: s.name,
      source: {
        listId: object(s.studio).listId,
        itemId: object(s.studio).itemId,
      },
    };
  });
  const { reader: r } = await reader(a.connectionId, false, true);
  const pages = await r.launchRequest(a.id, "promote_pages");
  demand(
    (pages.data ?? []).some((p: any) => String(p.id) === b.config.pageId),
    "La página no está autorizada para anunciar desde esta cuenta. Comprueba la vinculación.",
    409,
  );
  const eu =
    "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(
      " ",
    );
  if (eu.includes(b.config.country))
    demand(
      b.config.beneficiary.trim() && b.config.payor.trim(),
      "Indica beneficiario y pagador para el país seleccionado.",
    );
  const audiences: any[] = [];
  if (b.config.audiences.some((s) => s.savedAudienceId)) {
    const saved = await r.launchRequest(a.id, "saved_audiences");
    for (const spec of b.config.audiences) {
      if (!spec.savedAudienceId) {
        audiences.push(null);
        continue;
      }
      const found = (saved.data ?? []).find(
        (s: any) => String(s.id) === spec.savedAudienceId,
      );
      demand(
        found?.targeting,
        "El público guardado ya no está disponible.",
        409,
      );
      audiences.push(found.targeting);
    }
  }
  const config = {
    ...b.config,
    currency: a.currency,
    minorBudget: minorBudget(b.config.dailyBudget, a.currency),
    savedTargeting: audiences,
    variationRevisions: Object.fromEntries(vs.map((v) => [v.id, v.revision])),
  };
  const existing = await db.creativeMetaLaunch.findUnique({
    where: { requestId: b.requestId },
  });
  if (existing) {
    demand(
      existing.actorId === actor.id && existing.categoryId === c.id,
      "La solicitud ya existe.",
      409,
    );
    return publicLaunch(existing);
  }
  const result = await db.$transaction(async (tx) => {
    const result = await tx.creativeMetaLaunch.create({
      data: {
        actorId: actor.id,
        projectId: c.projectId,
        categoryId: c.id,
        requestId: b.requestId,
        accountId: a.id,
        connectionId: a.connectionId,
        connectionRevision: a.connection.revision,
        config: json(config),
        campaigns: json(items),
        steps: json(launchPlan(items, b.config.targetStatus === "ACTIVE")),
      },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "META_CAMPAÑAS_PREPARADAS",
        resourceId: result.id,
        detail: {
          ...launchSummary(items, b.config),
          country: b.config.country,
          accountId: a.id,
        },
      },
    });
    const p = await tx.project.findUniqueOrThrow({
      where: { id: c.projectId },
    });
    await tx.project.update({
      where: { id: c.projectId },
      data: {
        studio: json({
          ...object(p.studio),
          campaignTemplates: {
            ...object(object(p.studio).campaignTemplates),
            [b.config.country]: b.config,
          },
        }),
      },
    });
    return result;
  });
  return publicLaunch(result);
}
function publicLaunch(d: any) {
  const steps = d.steps as LaunchStep[],
    config = d.config as CampaignConfig;
  return {
    id: d.id,
    status: d.status,
    revision: d.revision,
    error: d.error,
    config,
    items: d.campaigns,
    summary: launchSummary(d.campaigns, config),
    completed: steps.filter((s) => s.state === "DONE").length,
    total: steps.length,
    current: steps.find((s) => s.state !== "DONE")?.kind ?? null,
    createdCampaigns: steps
      .filter((s) => s.kind === "CAMPAIGN" && s.receipt?.id)
      .map((s) => ({
        id: s.receipt!.id,
        name: (d.campaigns as CampaignItem[])[s.campaign].name,
      })),
    receipts: steps
      .filter((s) => s.receipt?.id)
      .map((s) => ({ key: s.key, id: s.receipt!.id, state: s.state })),
    updatedAt: d.updatedAt,
  };
}
async function launchAccess(actor: Actor, id: string) {
  studioAccess(actor);
  await metaEditorOnly(actor);
  const d = await db.creativeMetaLaunch.findUnique({ where: { id } });
  demand(
    d && (d.actorId === actor.id || actor.role === "OWNER"),
    "Publicación no encontrada.",
    404,
  );
  await resourceAccess(actor, "category", d.categoryId, "EDIT");
  const a = await primaryAccount(actor, d.accountId);
  demand(
    a.connectionId === d.connectionId &&
      a.connection.revision === d.connectionRevision,
    "La conexión cambió. Revisa los objetos creados antes de preparar otra publicación.",
    409,
  );
  return { d, a };
}
export async function getLaunch(actor: Actor, id: string) {
  return publicLaunch((await launchAccess(actor, id)).d);
}
export async function beginLaunch(actor: Actor, id: string, input: unknown) {
  const b = z
    .object({
      revision: z.number().int(),
      confirmPublish: z.literal(true),
      confirmSpend: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  const { d } = await launchAccess(actor, id);
  if (["PUBLISHED", "PUBLISHING"].includes(d.status)) return publicLaunch(d);
  demand(
    d.status === "DRAFT",
    "Esta publicación requiere revisión. No se repetirán solicitudes inciertas.",
    409,
  );
  const config = d.config as CampaignConfig;
  demand(
    config.targetStatus !== "ACTIVE" || b.confirmSpend,
    "Confirma el presupuesto diario antes de publicar activas.",
  );
  const result = await db.creativeMetaLaunch.updateMany({
    where: { id, status: "DRAFT", revision: b.revision },
    data: { status: "PUBLISHING", revision: { increment: 1 }, error: null },
  });
  demand(result.count, "La publicación cambió. Actualiza su resumen.", 409);
  return getLaunch(actor, id);
}
async function receiptStep(
  actor: Actor,
  d: any,
  steps: LaunchStep[],
  step: LaunchStep,
  result: Record<string, any>,
) {
  step.state = "DONE";
  step.receipt = result;
  const done = steps.every((s) => s.state === "DONE");
  await db.$transaction(async (tx) => {
    const written = await tx.creativeMetaLaunch.updateMany({
      where: { id: d.id, status: "PUBLISHING", revision: d.revision + 1 },
      data: {
        steps: json(steps),
        status: done ? "PUBLISHED" : "PUBLISHING",
        revision: { increment: 1 },
      },
    });
    demand(
      written.count,
      "No se confirmó el guardado del resultado. Revisa la publicación antes de continuar.",
      409,
    );
    if (
      (step.kind === "VERIFY" || step.kind === "VERIFY_LIVE") &&
      Array.isArray(result.confirmed)
    ) {
      const config = d.config as CampaignConfig,
        item = (d.campaigns as CampaignItem[])[step.campaign];
      const canonical = item.source?.itemId
        ? await tx.metaInventoryItem.findUnique({ where: { id: item.source.itemId }, select: { sheetId: true, name: true } })
        : null;
      const aliases = canonical && canonical.sheetId === item.source?.listId && canonical.name.normalize("NFKC").trim().toLocaleLowerCase() === item.name.normalize("NFKC").trim().toLocaleLowerCase()
        ? await tx.metaAlias.findMany({
            where: {
              inventorySheetId: item.source.listId,
              name: { equals: item.name, mode: "insensitive" },
              table: { defaultCountry: { in: [config.country, ""] } },
            },
            select: { id: true, table: { select: { defaultCountry: true } } },
            take: 3,
          })
        : [];
      const exact = aliases.filter(
          (a) => a.table.defaultCountry === config.country,
        ),
        generic = aliases.filter((a) => !a.table.defaultCountry);
      const alias =
        aliases.length === 3
          ? null
          : exact.length === 1
            ? exact[0]
            : !exact.length && generic.length === 1
              ? generic[0]
              : null;
      const campaignId = steps.find(
        (s) => s.key === `campaign:${step.campaign}`,
      )?.receipt?.id;
      for (const o of result.confirmed) {
        const source = steps.find(
          (s) =>
            s.campaign === step.campaign &&
            ["CAMPAIGN", "ADSET", "AD"].includes(s.kind) &&
            s.receipt?.id === o.id,
        );
        if (!source) continue;
        const previous = await tx.metaAdObject.findUnique({
          where: { id: o.id },
          select: { accountId: true },
        });
        demand(
          !previous || previous.accountId === d.accountId,
          "El identificador ya pertenece a otra cuenta.",
          409,
        );
        const level =
          source.kind === "CAMPAIGN"
            ? "campaign"
            : source.kind === "ADSET"
              ? "adset"
              : "ad";
        const data = {
          accountId: d.accountId,
          level,
          name:
            level === "campaign"
              ? `${config.country} · ${item.name}`
              : level === "adset"
                ? config.audiences[source.audience!].name
                : `${item.name} · Afiche ${source.image! + 1}`,
          status: o.status,
          effectiveStatus: o.effectiveStatus,
          seenAt: new Date(),
          ...(level !== "campaign" ? { campaignId } : {}),
          ...(level === "ad"
            ? {
                adsetId: steps.find(
                  (s) => s.key === `set:${step.campaign}:${source.audience}`,
                )?.receipt?.id,
              }
            : {}),
          ...(level === "campaign" ? { objective: "OUTCOME_ENGAGEMENT" } : {}),
          ...(level === "adset" ? { optimizationGoal: "CONVERSATIONS" } : {}),
          ...(alias ? { aliasId: alias.id, aliasCountry: config.country } : {}),
        };
        await tx.metaAdObject.upsert({
          where: { id: o.id },
          create: { id: o.id, ...data },
          update: data,
        });
      }
    }
    if (done)
      await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "META_CAMPAÑAS_PUBLICADAS",
          resourceId: d.id,
          detail: {
            accountId: d.accountId,
            campaignCount: d.campaigns.length,
            targetStatus: d.config.targetStatus,
          },
        },
      });
  });
}
export async function tickLaunch(actor: Actor, id: string) {
  await rateLimit("creative-meta:" + actor.id, 120);
  const { d, a } = await launchAccess(actor, id);
  if (d.status !== "PUBLISHING") return publicLaunch(d);
  const steps = structuredClone(d.steps) as LaunchStep[],
    step = steps.find((s) => s.state !== "DONE");
  if (!step) return publicLaunch(d);
  if (step.state === "RUNNING") {
    if (Date.now() - Date.parse(step.startedAt ?? "") < 90000)
      return publicLaunch(d);
    await db.creativeMetaLaunch.updateMany({
      where: { id, revision: d.revision, status: "PUBLISHING" },
      data: {
        status: "NEEDS_REVIEW",
        error:
          "Se interrumpió la confirmación de una solicitud a Meta. Revisa los objetos creados; no se repetirá automáticamente.",
        revision: { increment: 1 },
      },
    });
    return getLaunch(actor, id);
  }
  demand(
    step.state === "PENDING",
    "El último resultado necesita revisión.",
    409,
  );
  const { reader: r } = await reader(a.connectionId, false, true),
    config = d.config as unknown as CampaignConfig & {
      currency: string;
      minorBudget: number;
      savedTargeting: any[];
      variationRevisions: Record<string, number>;
    },
    items = d.campaigns as unknown as CampaignItem[],
    item = items[step.campaign];
  const resolve = (key: string) => {
    const s = steps.find((s) => s.key === key);
    demand(
      s?.state === "DONE" && s.receipt,
      "No se confirmó un paso anterior.",
      409,
    );
    return s.receipt!;
  };
  // Everything that can fail locally is prepared before claiming a remote request.
  let edge:
      "adimages" | "campaigns" | "adsets" | "adcreatives" | "ads" | "object" =
      "object",
    body: Record<string, unknown> | undefined,
    remoteId: string | undefined,
    fields: string | undefined;
  try {
    if (step.kind === "IMAGE") {
      const variation = await db.variation.findFirst({
        where: {
          id: item.variationIds[step.image!],
          subproductId: item.subproductId,
          deletedAt: null,
          expired: false,
          OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
        },
        select: { path: true, revision: true },
      });
      demand(
        variation &&
          variation.revision ===
            config.variationRevisions[item.variationIds[step.image!]],
        "El afiche cambió desde la revisión. Prepara de nuevo la campaña.",
        409,
      );
      edge = "adimages";
      body = { bytes: (await load(variation.path)).toString("base64") };
    } else if (step.kind === "CAMPAIGN") {
      edge = "campaigns";
      body = {
        name: `${config.country} · ${item.name}`,
        objective: "OUTCOME_ENGAGEMENT",
        buying_type: "AUCTION",
        status: "PAUSED",
        daily_budget: config.minorBudget,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        special_ad_categories:
          config.specialCategory === "NONE" ? [] : [config.specialCategory],
      };
    } else if (step.kind === "ADSET") {
      edge = "adsets";
      body = {
        name: config.audiences[step.audience!].name,
        campaign_id: resolve(`campaign:${step.campaign}`).id,
        billing_event: "IMPRESSIONS",
        optimization_goal: "CONVERSATIONS",
        destination_type: "WHATSAPP",
        promoted_object: {
          page_id: config.pageId,
          whatsapp_phone_number: config.whatsapp.replace(/^\+/, ""),
        },
        targeting: audienceTargeting(
          config,
          step.audience!,
          config.savedTargeting?.[step.audience!],
        ),
        status: "PAUSED",
        ...(config.beneficiary
          ? { dsa_beneficiary: config.beneficiary, dsa_payor: config.payor }
          : {}),
      };
    } else if (step.kind === "CREATIVE") {
      edge = "adcreatives";
      body = {
        name: `${item.name} · Afiche ${step.image! + 1}`,
        object_story_spec: {
          page_id: config.pageId,
          link_data: {
            image_hash: resolve(`image:${step.campaign}:${step.image}`).hash,
            link: "https://api.whatsapp.com/send",
            message: campaignText(config.body, item, config),
            name: campaignText(config.headline, item, config),
            description: campaignText(config.description, item, config),
            call_to_action: {
              type: "WHATSAPP_MESSAGE",
              value: { app_destination: "WHATSAPP" },
            },
          },
        },
      };
    } else if (step.kind === "VERIFY_CREATIVE") {
      remoteId = resolve(`creative:${step.campaign}:${step.image}`).id;
      fields = "id,account_id,object_story_spec";
    } else if (step.kind === "AD") {
      edge = "ads";
      body = {
        name: `${item.name} · ${config.audiences[step.audience!].name} · ${step.image! + 1}`,
        adset_id: resolve(`set:${step.campaign}:${step.audience}`).id,
        creative: {
          creative_id: resolve(`creative:${step.campaign}:${step.image}`).id,
        },
        status: "PAUSED",
      };
    } else if (step.kind === "ACTIVATE") {
      remoteId = resolve(step.target!).id;
      body = { status: "ACTIVE" };
    } else {
      remoteId = resolve(`campaign:${step.campaign}`).id;
      fields =
        "id,name,status,effective_status,account_id,daily_budget,objective";
    }
  } catch (e) {
    const error =
      e instanceof AppError
        ? e.message
        : "No se pudo preparar el siguiente paso. Revisa los afiches y la configuración.";
    await db.creativeMetaLaunch.updateMany({
      where: { id, revision: d.revision, status: "PUBLISHING" },
      data: { status: "NEEDS_REVIEW", error, revision: { increment: 1 } },
    });
    return getLaunch(actor, id);
  }
  step.state = "RUNNING";
  step.startedAt = new Date().toISOString();
  const claim = await db.creativeMetaLaunch.updateMany({
    where: { id, status: "PUBLISHING", revision: d.revision },
    data: { steps: json(steps), revision: { increment: 1 } },
  });
  if (!claim.count) return getLaunch(actor, id);
  try {
    const result = await r.launchRequest(a.id, edge, body, remoteId, fields);
    let receipt: Record<string, any> = {};
    if (step.kind === "IMAGE") {
      const image = Object.values(result.images ?? {})[0] as any;
      demand(
        typeof image?.hash === "string" &&
          /^[a-f0-9]{16,128}$/i.test(image.hash),
        "Meta no confirmó la imagen cargada.",
        502,
      );
      receipt = { hash: image.hash };
    } else if (["CAMPAIGN", "ADSET", "CREATIVE", "AD"].includes(step.kind)) {
      demand(
        typeof result.id === "string" && /^\d{1,40}$/.test(result.id),
        "Meta no confirmó el identificador creado.",
        502,
      );
      receipt = { id: result.id };
    } else if (step.kind === "ACTIVATE") {
      demand(result.success === true, "Meta no confirmó la activación.", 502);
      receipt = { id: remoteId, status: "ACTIVE" };
    } else if (step.kind === "VERIFY_CREATIVE") {
      demand(
        String(result.id) === remoteId &&
          String(result.account_id).replace(/^act_/, "") === a.id,
        "Meta devolvió un creativo de otra cuenta.",
        502,
      );
      demand(
        result.object_story_spec?.link_data?.call_to_action?.type ===
          "WHATSAPP_MESSAGE",
        "Meta no confirmó el botón de WhatsApp. Revisa el creativo antes de publicarlo.",
        409,
      );
      receipt = { id: remoteId, whatsapp: true };
    } else {
      demand(
        String(result.id) === remoteId &&
          String(result.account_id).replace(/^act_/, "") === a.id,
        "Meta devolvió una campaña de otra cuenta.",
        502,
      );
      demand(
        result.objective === "OUTCOME_ENGAGEMENT" &&
          Number(result.daily_budget) === config.minorBudget &&
          result.status === (step.kind === "VERIFY_LIVE" ? "ACTIVE" : "PAUSED"),
        "Meta no confirmó el estado o presupuesto revisado.",
        409,
      );
      const confirmed: Record<string, any> = { [remoteId!]: result };
      const wanted = steps
        .filter(
          (s) =>
            s.campaign === step.campaign &&
            (s.kind === "ADSET" || s.kind === "AD") &&
            s.state === "DONE",
        )
        .map((s) => String(s.receipt?.id));
      for (let start = 0; start < wanted.length; start += 25) {
        const ids = wanted.slice(start, start + 25),
          objects = await r.launchRequest(
            a.id,
            "objects",
            undefined,
            ids.join(","),
            "id,status,effective_status,account_id",
          );
        demand(
          ids.every(
            (id) =>
              String(objects[id]?.id) === id &&
              String(objects[id]?.account_id).replace(/^act_/, "") === a.id &&
              objects[id]?.status ===
                (step.kind === "VERIFY_LIVE" ? "ACTIVE" : "PAUSED"),
          ),
          "Meta no confirmó todos los conjuntos y anuncios. Revisa los objetos creados.",
          409,
        );
        for (const id of ids) confirmed[id] = objects[id];
      }
      receipt = {
        confirmed: Object.values(confirmed).map((o: any) => ({
          id: String(o.id),
          status: o.status,
          effectiveStatus: o.effective_status ?? null,
        })),
        id: remoteId,
        status: result.status,
        effectiveStatus: result.effective_status,
      };
    }
    await receiptStep(actor, d, steps, step, receipt);
  } catch (e) {
    step.state = "UNCERTAIN";
    const error =
      e instanceof AppError
        ? e.message
        : "No se confirmó la solicitud a Meta. Revisa su administrador antes de repetirla.";
    await db.creativeMetaLaunch.updateMany({
      where: { id, status: "PUBLISHING", revision: d.revision + 1 },
      data: {
        status: "NEEDS_REVIEW",
        steps: json(steps),
        error,
        revision: { increment: 1 },
      },
    });
  }
  return getLaunch(actor, id);
}
