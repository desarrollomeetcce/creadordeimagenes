import { metaPageWhatsAppNumber, readMetaPageWhatsApp } from "./page-whatsapp";
import { inventoryMetaStatusChange } from "../meta-ads/inventory-sheet-activation";
import {
  authorizeFinancialRequest,
  financialAccess,
  scopePermission,
} from "../meta-ads/financial-access";
import { campaignPageDirectory } from "./page-directory";
import { campaignPageIssue } from "./page-errors";
import { z } from "zod";
import { MetaGraphError } from "../meta-ads/graph-error";
import { MetaQuotaWait } from "../meta-ads/quota";
import { canResumeLocalWait, canResumeReadVerification } from "./launch-wait";
import { existingCampaignContext } from "./campaign-existing";
import { verifyManualAudienceSelections } from "./campaign-audience-selection";
import { resolvePlatformAudiencePresets } from "./campaign-audience-presets";
import {
  placementSoftOptOut,
  whatsappConversationPayload,
} from "./campaign-workbench-policy";
import { discoverCampaignPages } from "./pages";
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
  campaignObjective,
  campaignDestination,
  campaignOptimization,
  campaignCTA,
  campaignLink,
  imageDistribution,
  validateCampaignDestination,
  validateCampaignText,
  campaignText,
  campaignDisplayName,
  minorBudget,
  audienceTargeting,
  whatsappPromotedObject,
  launchPlan,
  launchSummary,
  type CampaignItem,
  type LaunchStep,
  type CampaignConfig,
} from "./campaign-policy";
const id = z.string().min(1).max(100);
export async function primaryAccount(actor: Actor, accountId: string) {
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
export async function launchResources(
  actor: Actor,
  accountId: string,
  part: "pages" | "audiences" | "all" = "all",
  refresh = false,
) {
  studioAccess(actor);
  const a = await primaryAccount(actor, accountId);
  const loadPages = () =>
    campaignPageDirectory(
      a,
      async () => {
        const { reader: r } = await reader(a.connectionId, false, true);
        return discoverCampaignPages(async (edge, after) => {
          try {
            return await r.launchRequest(
              a.id,
              edge,
              undefined,
              undefined,
              "id,name,picture.type(square){url},whatsapp_number",
              after,
            );
          } catch (error) {
            if (
              error instanceof MetaGraphError &&
              [100, 200].includes(error.diagnostic.code ?? 0)
            )
              return r.launchRequest(
                a.id,
                edge,
                undefined,
                undefined,
                undefined,
                after,
              );
            throw error;
          }
        });
      },
      refresh,
    );
  const loadAudiences = async () => {
    try {
      const { reader: r } = await reader(a.connectionId, false, true);
      const saved = await r.launchRequest(a.id, "saved_audiences");
      return {
        audiences: (saved.data ?? []).map((s: any) => ({
          id: String(s.id),
          name: String(s.name),
        })),
        audiencesPartial: !!saved.paging?.next,
        audienceWarning: "",
      };
    } catch {
      return {
        audiences: [],
        audiencesPartial: false,
        audienceWarning:
          "No se pudieron consultar los públicos guardados. Puedes configurar tus públicos manualmente.",
      };
    }
  };
  const [pages, audiences] = await Promise.all([
    part === "audiences"
      ? Promise.resolve({
          pages: [],
          partial: false,
          pageIssue: null,
          pageCached: false,
          pageSavedAt: null,
        })
      : loadPages(),
    part === "pages"
      ? Promise.resolve({
          audiences: [],
          audiencesPartial: false,
          audienceWarning: "",
        })
      : loadAudiences(),
  ]);
  return {
    ...pages,
    ...audiences,
    partial: pages.partial || audiences.audiencesPartial,
    pageWarning: pages.pageIssue?.message ?? "",
    currency: a.currency,
    connectionId: a.connectionId,
    canAuthorizePages:
      !!a.connection.appId && !!a.connection.encryptedAppSecret,
    usesLoginConfiguration: !!a.connection.loginConfigId,
  };
}
const pagePhonePending = new Map<
  string,
  Promise<{ pageId: string; number: string }>
>();
/** A single selected-page read; no page scanning or campaign/history imports. */
export async function campaignPageWhatsApp(
  actor: Actor,
  accountId: string,
  pageId: string,
  refresh = false,
) {
  studioAccess(actor);
  demand(/^\d{1,40}$/.test(pageId), "Página no válida.");
  const a = await primaryAccount(actor, accountId);
  const directory = await launchResources(actor, accountId, "pages");
  const page = directory.pages.find((p) => p.id === pageId);
  demand(
    page,
    "La página no está autorizada para esta cuenta. Actualiza las páginas.",
    403,
  );
  const saved = metaPageWhatsAppNumber(page.whatsapp);
  if (saved && !refresh) return { pageId, number: saved };
  const key = JSON.stringify([
    accountId,
    a.connectionId,
    a.connection.revision,
    pageId,
  ]);
  let pending = pagePhonePending.get(key);
  if (!pending) {
    pending = (async () => {
      const { reader: r } = await reader(a.connectionId, false, true);
      const number = await readMetaPageWhatsApp(r, a.id, pageId);
      const current = await primaryAccount(actor, accountId);
      demand(
        current.connectionId === a.connectionId &&
          current.connection.revision === a.connection.revision,
        "La conexión cambió. Actualiza antes de continuar.",
        409,
      );
      const cached = await db.creativeMetaPageDirectory.findUnique({
        where: { accountId },
      });
      if (
        cached &&
        cached.connectionId === a.connectionId &&
        cached.credentialRevision === a.connection.revision &&
        Array.isArray(cached.pages)
      ) {
        const pages = cached.pages.map((p: any) =>
          p && p.id === pageId ? { ...p, whatsapp: number } : p,
        );
        await db.creativeMetaPageDirectory.updateMany({
          where: {
            accountId,
            connectionId: a.connectionId,
            credentialRevision: a.connection.revision,
            fetchedAt: cached.fetchedAt,
          },
          data: { pages: json(pages) },
        });
      }
      return { pageId, number };
    })();
    pagePhonePending.set(key, pending);
    void pending
      .finally(() => {
        if (pagePhonePending.get(key) === pending) pagePhonePending.delete(key);
      })
      .catch(() => {});
  }
  return pending;
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
  if (!b.config.existingCampaignId)
    minorBudget(b.config.dailyBudget, a.currency);
  b.config.planVersion = 2;
  validateCampaignDestination(b.config);
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
    "No repitas un recurso en la selección.",
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
      mediaType: true,
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
    "Un recurso ya no pertenece al diplomado o no está disponible.",
    409,
  );
  const items: CampaignItem[] = b.items.map((i) => {
    const s = subs.find((s) => s.id === i.subproductId)!;
    return {
      ...i,
      name: s.name,
      mediaTypes: Object.fromEntries(
        i.variationIds.map((id) => [
          id,
          vs.find((v) => v.id === id)!.mediaType,
        ]),
      ),
      source: {
        listId: object(s.studio).listId,
        itemId: object(s.studio).itemId,
      },
    };
  });
  const resolvedPresets = await resolvePlatformAudiencePresets(
    a,
    c.id,
    b.config,
  );
  b.config.audiences = verifyManualAudienceSelections(
    actor,
    a,
    { ...b.config, audiences: resolvedPresets.audiences },
    resolvedPresets.trusted,
  );
  const aiAudienceIndexes = b.config.audiences
    .map((audience, index) => ({ audience, index }))
    .filter(({ audience }) => audience.interestSource !== "MANUAL");
  if (aiAudienceIndexes.some(({ audience }) => audience.interests?.length)) {
    const proof = b.config.aiSuggestionJobId
      ? await db.generationJob.findUnique({
          where: { id: b.config.aiSuggestionJobId },
        })
      : null;
    const snapshot = object(proof?.snapshot);
    demand(
      proof?.actorId === actor.id &&
        proof.projectId === c.projectId &&
        proof.status === "COMPLETED" &&
        Date.now() - proof.createdAt.getTime() < 3600000 &&
        snapshot.categoryId === c.id &&
        JSON.stringify([...(snapshot.subproductIds ?? [])].sort()) ===
          JSON.stringify(b.items.map((i) => i.subproductId).sort()) &&
        snapshot.accountId === a.id &&
        snapshot.country === b.config.country &&
        snapshot.connectionRevision === a.connection.revision,
      "Los intereses requieren una selección reciente de Meta para esta cuenta y país.",
      409,
    );
    const { verifiedAudienceInterests } = await import("./audience-interests");
    const verified = verifiedAudienceInterests(
      aiAudienceIndexes.map(({ audience }) => audience),
      snapshot.interestCatalog ?? [],
      b.config.specialCategory !== "NONE",
    );
    aiAudienceIndexes.forEach(({ index }, i) => {
      b.config.audiences[index] = verified[i];
    });
  }
  const { reader: r } = await reader(a.connectionId, false, true);
  const existing = await existingCampaignContext(r, a.id, b.config);
  const pages = await discoverCampaignPages((edge, after) =>
    r.launchRequest(a.id, edge, undefined, undefined, undefined, after),
  );
  demand(
    (pages.data ?? []).some((p: any) => String(p.id) === b.config.pageId),
    "La página no está autorizada para anunciar desde esta cuenta. Comprueba la vinculación.",
    409,
  );
  items.forEach((i) => {
    imageDistribution(i, b.config);
    validateCampaignText(i, b.config);
  });
  if (b.config.objective === "LEADS") {
    const forms = await campaignLeadForms(actor, a.id, b.config.pageId);
    demand(
      forms.forms.some((f: { id: string }) => f.id === b.config.leadFormId),
      "El formulario no está activo o no pertenece a esta página.",
      409,
    );
  }
  if (
    ["WHATSAPP", "LEADS_WHATSAPP"].includes(b.config.objective) &&
    b.config.whatsapp
  ) {
    const metaNumber = await readMetaPageWhatsApp(r, a.id, b.config.pageId);
    demand(
      metaPageWhatsAppNumber(b.config.whatsapp) === metaNumber,
      "El WhatsApp de la página cambió. Vuelve a consultarlo antes de preparar la campaña.",
      409,
    );
    b.config.whatsapp = metaNumber;
  }
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
    minorBudget: b.config.existingCampaignId
      ? Number(existing.existingCampaign?.daily_budget ?? 0)
      : minorBudget(b.config.dailyBudget, a.currency),
    ...(b.config.adsetDailyBudget
      ? { minorAdsetBudget: minorBudget(b.config.adsetDailyBudget, a.currency) }
      : {}),
    ...existing,
    savedTargeting: audiences,
    variationRevisions: Object.fromEntries(vs.map((v) => [v.id, v.revision])),
  };
  const existingLaunch = await db.creativeMetaLaunch.findUnique({
    where: { requestId: b.requestId },
  });
  if (existingLaunch) {
    demand(
      existingLaunch.actorId === actor.id && existingLaunch.categoryId === c.id,
      "La solicitud ya existe.",
      409,
    );
    return publicLaunch(existingLaunch);
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
        steps: json(
          launchPlan(items, b.config.targetStatus === "ACTIVE", b.config),
        ),
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
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${c.projectId} FOR UPDATE`;
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
    for (const item of items) {
      await tx.$queryRaw`SELECT id FROM "Subproduct" WHERE id=${item.subproductId} FOR UPDATE`;
      const sub = await tx.subproduct.findUniqueOrThrow({
        where: { id: item.subproductId },
        select: { studio: true },
      });
      await tx.subproduct.update({
        where: { id: item.subproductId },
        data: {
          studio: json({
            ...object(sub.studio),
            campaignTemplates: {
              ...object(object(sub.studio).campaignTemplates),
              [b.config.country]: b.config,
            },
          }),
        },
      });
    }
    return result;
  });
  return publicLaunch(result);
}
function publicLaunch(d: any) {
  const steps = d.steps as LaunchStep[],
    config = d.config as CampaignConfig,
    wait = steps.find((s) => s.state !== "DONE")?.wait;
  return {
    id: d.id,
    status: d.status,
    revision: d.revision,
    error: d.error,
    waiting:
      d.status === "PUBLISHING" &&
      !!wait &&
      Date.parse(wait.until) > Date.now(),
    nextAttemptAt: wait?.until ?? null,
    waitReason: wait?.reason ?? null,
    canResumeWait: canResumeLocalWait({
      status: d.status,
      error: d.error,
      steps,
    }),
    canResumeVerification: canResumeReadVerification({
      status: d.status,
      error: d.error,
      steps,
    }),
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
        name: s.existing
          ? String(d.config.existingCampaign?.name ?? s.receipt!.id)
          : campaignDisplayName(
              (d.campaigns as CampaignItem[])[s.campaign],
              config,
            ),
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
export async function resumeLaunchWait(
  actor: Actor,
  id: string,
  input: unknown,
) {
  const b = z.object({ revision: z.number().int() }).strict().parse(input);
  const { d } = await launchAccess(actor, id);
  const steps = structuredClone(d.steps) as LaunchStep[];
  demand(
    d.revision === b.revision &&
      (canResumeLocalWait({ status: d.status, error: d.error, steps }) ||
        canResumeReadVerification({ status: d.status, error: d.error, steps })),
    "Este resultado requiere revisión; no se puede repetir automáticamente.",
    409,
  );
  const step = steps.find((s) => s.state !== "DONE")!;
  step.state = "PENDING";
  delete step.startedAt;
  delete step.wait;
  const changed = await db.creativeMetaLaunch.updateMany({
    where: { id, revision: b.revision, status: "NEEDS_REVIEW" },
    data: {
      steps: json(steps),
      status: "PUBLISHING",
      error: null,
      revision: { increment: 1 },
    },
  });
  demand(
    changed.count === 1,
    "El intento cambió. Consulta su estado antes de continuar.",
    409,
  );
  return getLaunch(actor, id);
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
  const { d, a } = await launchAccess(actor, id);
  if (["PUBLISHED", "PUBLISHING"].includes(d.status)) return publicLaunch(d);
  demand(
    d.status === "DRAFT",
    "Esta publicación requiere revisión. No se repetirán solicitudes inciertas.",
    409,
  );
  const config = d.config as CampaignConfig;
  if (config.existingCampaignId) {
    const { reader: r } = await reader(a.connectionId, false, true);
    await existingCampaignContext(r, a.id, config);
  }
  demand(
    config.targetStatus !== "ACTIVE" || b.confirmSpend,
    "Confirma el presupuesto diario antes de publicar activas.",
  );
  if (
    (!config.objective || config.objective === "WHATSAPP") &&
    config.whatsapp
  ) {
    const { reader: r } = await reader(a.connectionId, false, true);
    const metaNumber = await readMetaPageWhatsApp(r, a.id, config.pageId);
    demand(
      metaPageWhatsAppNumber(config.whatsapp) === metaNumber,
      "El WhatsApp de la página cambió. Actualiza y prepara la campaña nuevamente.",
      409,
    );
  }
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
    if (step.kind === "VERIFY" || step.kind === "VERIFY_LIVE")
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
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
      let canonical = item.source?.itemId
        ? await tx.metaInventoryItem.findUnique({
            where: { id: item.source.itemId },
            select: { sheetId: true, name: true },
          })
        : null;
      if (!canonical && item.source?.itemId) {
        const legacy = await tx.metaAlias.findUnique({
          where: { id: item.source.itemId },
          select: { inventorySheetId: true, name: true },
        });
        if (legacy?.inventorySheetId)
          canonical = { sheetId: legacy.inventorySheetId, name: legacy.name };
      }
      const pendingAliases =
        canonical && item.source?.listId
          ? await tx.$queryRaw<
              { id: string }[]
            >`SELECT a.id FROM "MetaAlias" a JOIN "MetaEffectivenessSheet" s ON s.id=a."inventorySheetId" WHERE s.id=${item.source.listId} AND lower(a.name)=lower(${item.name}) AND jsonb_extract_path_text(s.config,'inventoryActivation','rows',a.id||'|'||${config.country},'campaignTask')='CREATE' AND COALESCE(jsonb_extract_path(s.config,'inventoryActivation','rows',a.id||'|'||${config.country},'metaOrigin','accountIds'),'[]'::jsonb) ? ${d.accountId}`
          : [];
      const aliases =
        canonical &&
        canonical.sheetId === item.source?.listId &&
        canonical.name.normalize("NFKC").trim().toLocaleLowerCase() ===
          item.name.normalize("NFKC").trim().toLocaleLowerCase()
          ? await tx.metaAlias.findMany({
              where: {
                inventorySheetId: item.source.listId,
                name: { equals: item.name, mode: "insensitive" },
                OR: [
                  { table: { defaultCountry: { in: [config.country, ""] } } },
                  { id: { in: pendingAliases.map((a) => a.id) } },
                ],
              },
              select: {
                id: true,
                tableId: true,
                name: true,
                table: { select: { defaultCountry: true } },
              },
              take: 3,
            })
          : [];
      const exact = aliases.filter(
          (a) => a.table.defaultCountry === config.country,
        ),
        generic = aliases.filter((a) => !a.table.defaultCountry);
      const pending = aliases.filter((a) =>
        pendingAliases.some((p) => p.id === a.id),
      );
      const alias =
        pending.length === 1
          ? pending[0]
          : aliases.length === 3
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
        if (!source || source.existing) continue;
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
              ? campaignDisplayName(item, config)
              : level === "adset"
                ? `${campaignDisplayName(item, config)} · ${(source.audience ?? 0) + 1}`
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
          ...(level === "campaign"
            ? { objective: campaignObjective(config) }
            : {}),
          ...(level === "adset"
            ? { optimizationGoal: campaignOptimization(config) }
            : {}),
          ...(alias ? { aliasId: alias.id, aliasCountry: config.country } : {}),
        };
        await tx.metaAdObject.upsert({
          where: { id: o.id },
          create: { id: o.id, ...data },
          update: data,
        });
      }
      if (
        step.kind === "VERIFY_LIVE" &&
        !config.existingCampaignId &&
        alias &&
        result.confirmed.some(
          (o: any) => o.id === campaignId && o.status === "ACTIVE",
        ) &&
        item.source?.listId
      ) {
        const listId = item.source.listId,
          access = await financialAccess(actor, tx);
        if (scopePermission(access, "TAB:" + listId) === "EDIT") {
          let cap: Awaited<
            ReturnType<typeof authorizeFinancialRequest>
          > | null = null;
          try {
            cap = await authorizeFinancialRequest(
              actor,
              "inventory/sheet-activation",
              "PATCH",
              new URLSearchParams(),
              { listId, tableId: alias.tableId },
              "TAB:" + listId,
            );
          } catch {
            /* Publishing permission never grants financial editing. */
          }
          const rows = await tx.$queryRaw<
            { task: string | null }[]
          >`SELECT jsonb_extract_path_text(config,'inventoryActivation','rows',${alias.id + "|" + config.country},'campaignTask') AS task FROM "MetaEffectivenessSheet" WHERE id=${listId}`;
          if (cap && rows[0]?.task === "CREATE")
            await inventoryMetaStatusChange(
              tx,
              cap,
              {
                listId,
                tableId: alias.tableId,
                aliasId: alias.id,
                name: alias.name,
                country: config.country,
              },
              { active: true, campaignTask: "NONE" },
            );
        }
      }
    }
    if (done) {
      const temporary = await tx.variation.findMany({
        where: {
          id: {
            in: (d.campaigns as CampaignItem[]).flatMap((i) => i.variationIds),
          },
          ownResource: true,
          permanent: false,
        },
        select: { id: true },
      });
      for (const v of temporary) {
        const other = await tx.creativeMetaLaunch.count({
          where: {
            id: { not: d.id },
            status: { in: ["DRAFT", "PUBLISHING", "NEEDS_REVIEW"] },
            campaigns: { array_contains: [{ variationIds: [v.id] }] },
          },
        });
        if (!other)
          await tx.variation.update({
            where: { id: v.id },
            data: { expiresAt: new Date() },
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
  const { d, a } = await launchAccess(actor, id);
  if (d.status !== "PUBLISHING") return publicLaunch(d);
  const steps = structuredClone(d.steps) as LaunchStep[],
    step = steps.find((s) => s.state !== "DONE");
  if (
    !step ||
    (step.state === "PENDING" &&
      step.wait &&
      Date.parse(step.wait.until) > Date.now())
  )
    return publicLaunch(d);
  // A confirmed batch has a finite plan. Another batch must not exhaust its progress allowance.
  await rateLimit(
    "creative-meta:" + actor.id + ":" + id,
    Math.max(120, (d.steps as unknown[]).length * 3),
  );
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
      existingCampaign?: Record<string, any>;
      existingAdset?: Record<string, any>;
      minorAdsetBudget?: number;
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
      | "adimages"
      | "advideos"
      | "campaigns"
      | "adsets"
      | "adcreatives"
      | "ads"
      | "object" = "object",
    body: Record<string, unknown> | undefined,
    remoteId: string | undefined,
    fields: string | undefined;
  try {
    if (step.kind === "IMAGE" || step.kind === "VIDEO") {
      const variation = await db.variation.findFirst({
        where: {
          id: item.variationIds[step.image!],
          subproductId: item.subproductId,
          deletedAt: null,
          expired: false,
          OR: [{ permanent: true }, { expiresAt: { gt: new Date() } }],
        },
        select: { path: true, revision: true, mediaType: true, mime: true },
      });
      demand(
        variation &&
          variation.revision ===
            config.variationRevisions[item.variationIds[step.image!]],
        "El recurso cambió desde la revisión. Prepara de nuevo la campaña.",
        409,
      );
      demand(
        (variation.mediaType === "VIDEO") === (step.kind === "VIDEO"),
        "El tipo de recurso cambió.",
        409,
      );
      edge = step.kind === "VIDEO" ? "advideos" : "adimages";
      const bytes = await load(variation.path);
      body =
        step.kind === "VIDEO"
          ? {
              source: new Blob([new Uint8Array(bytes)], {
                type: variation.mime,
              }),
            }
          : { bytes: bytes.toString("base64") };
    } else if (step.kind === "VIDEO_READY") {
      remoteId = resolve(`image:${step.campaign}:${step.image}`).id;
      fields = "id,status,picture";
    } else if (step.kind === "CAMPAIGN") {
      edge = "campaigns";
      body = {
        name: campaignDisplayName(item, config),
        objective: campaignObjective(config),
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
        name: `${campaignDisplayName(item, config)} · ${(step.audience ?? 0) + 1}`,
        campaign_id: resolve(`campaign:${step.campaign}`).id,
        billing_event: "IMPRESSIONS",
        optimization_goal: campaignOptimization(config),
        destination_type: campaignDestination(config),
        ...(config.objective !== "TRAFFIC"
          ? {
              promoted_object:
                config.objective === "LEADS"
                  ? { page_id: config.pageId }
                  : whatsappPromotedObject(config),
            }
          : {}),
        targeting: audienceTargeting(
          config,
          step.audience!,
          config.savedTargeting?.[step.audience!],
        ),
        ...(config.existingCampaignId &&
        !Number(config.existingCampaign?.daily_budget) &&
        !Number(config.existingCampaign?.lifetime_budget)
          ? {
              daily_budget: config.minorAdsetBudget,
              bid_strategy: "LOWEST_COST_WITHOUT_CAP",
            }
          : {}),
        placement_soft_opt_out: placementSoftOptOut(config),
        status: "PAUSED",
        ...(config.beneficiary
          ? { dsa_beneficiary: config.beneficiary, dsa_payor: config.payor }
          : {}),
      };
    } else if (step.kind === "CREATIVE") {
      edge = "adcreatives";
      body = {
        name: `${campaignDisplayName(item, config)} · Afiche ${step.image! + 1}`,
        contextual_multi_ads: { enroll_status: "OPT_OUT" },
        object_story_spec: {
          page_id: config.pageId,
          link_data: {
            image_hash: resolve(`image:${step.campaign}:${step.image}`).hash,
            link:
              config.objective === undefined || config.objective === "WHATSAPP"
                ? "https://api.whatsapp.com/send"
                : campaignLink(config),
            message: campaignText(config.body, item, config),
            name: campaignText(config.headline, item, config),
            description: campaignText(config.description, item, config),
            ...(config.conversation
              ? {
                  page_welcome_message: whatsappConversationPayload(
                    config.conversation,
                    (t) => campaignText(t, item, config),
                  ),
                }
              : {}),
            call_to_action: campaignCTA(config),
          },
        },
      };
      if (item.mediaTypes?.[item.variationIds[step.image!]] === "VIDEO") {
        const story = (body as any).object_story_spec,
          link = story.link_data;
        story.video_data = {
          video_id: resolve(`image:${step.campaign}:${step.image}`).id,
          image_url: resolve(`video-ready:${step.campaign}:${step.image}`)
            .picture,
          message: link.message,
          title: link.name,
          link_description: link.description,
          call_to_action: {
            ...link.call_to_action,
            value: { ...link.call_to_action.value, link: link.link },
          },
          ...(link.page_welcome_message
            ? { page_welcome_message: link.page_welcome_message }
            : {}),
        };
        delete story.link_data;
      }
    } else if (step.kind === "VERIFY_CREATIVE") {
      remoteId = resolve(`creative:${step.campaign}:${step.image}`).id;
      fields = "id,account_id,object_story_spec,contextual_multi_ads";
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
        "id,name,status,effective_status,account_id,daily_budget,lifetime_budget,objective";
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
  delete step.wait;
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
    } else if (step.kind === "VIDEO_READY") {
      demand(String(result.id) === remoteId, "Meta devolvió otro video.", 502);
      const status = result.status?.video_status;
      demand(
        !["error", "failed"].includes(status),
        "Meta no pudo procesar el video. Revisa el archivo.",
        409,
      );
      if (status !== "ready" || !result.picture) {
        step.processingSince ??= new Date().toISOString();
        demand(
          Date.now() - Date.parse(step.processingSince) < 30 * 60000,
          "Meta aún no termina de procesar el video. Revísalo antes de continuar.",
          409,
        );
        step.state = "PENDING";
        delete step.startedAt;
        step.wait = {
          reason: "processing",
          until: new Date(Date.now() + 15000).toISOString(),
        };
        await db.creativeMetaLaunch.updateMany({
          where: { id, status: "PUBLISHING", revision: d.revision + 1 },
          data: { steps: json(steps), revision: { increment: 1 } },
        });
        return getLaunch(actor, id);
      }
      let cover: URL | undefined;
      try {
        cover = new URL(result.picture);
      } catch {}
      demand(
        cover?.protocol === "https:" &&
          !cover.username &&
          !cover.password &&
          !cover.searchParams.has("access_token") &&
          !cover.searchParams.has("appsecret_proof") &&
          (cover.hostname.endsWith(".fbcdn.net") ||
            cover.hostname.endsWith(".facebook.com") ||
            cover.hostname.endsWith(".fbsbx.com")),
        "Meta no confirmó una portada válida del video.",
        502,
      );
      receipt = { id: remoteId, picture: cover.href };
    } else if (
      ["VIDEO", "CAMPAIGN", "ADSET", "CREATIVE", "AD"].includes(step.kind)
    ) {
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
      const video =
        item.mediaTypes?.[item.variationIds[step.image!]] === "VIDEO";
      const returnedStory = video
        ? result.object_story_spec?.video_data
        : result.object_story_spec?.link_data;
      if (video)
        demand(
          String(returnedStory?.video_id) ===
            resolve(`image:${step.campaign}:${step.image}`).id,
          "Meta no confirmó el video elegido.",
          409,
        );
      demand(
        String(result.id) === remoteId &&
          String(result.account_id).replace(/^act_/, "") === a.id,
        "Meta devolvió un creativo de otra cuenta.",
        502,
      );
      demand(
        returnedStory?.call_to_action?.type === campaignCTA(config).type,
        "Meta no confirmó el botón del objetivo elegido. Revisa el creativo antes de publicarlo.",
        409,
      );
      demand(
        String(result.object_story_spec?.page_id) === config.pageId &&
          (video ? returnedStory?.title : returnedStory?.name) ===
            campaignText(config.headline, item, config),
        "Meta no confirmó la página o el headline exacto. Revisa el creativo antes de activarlo.",
        409,
      );
      demand(
        result.contextual_multi_ads?.enroll_status !== "OPT_IN",
        "Meta devolvió el creativo con multianunciante activado; revisa el anuncio.",
        409,
      );
      if (config.conversation) {
        const expected = JSON.parse(
          whatsappConversationPayload(config.conversation, (t) =>
            campaignText(t, item, config),
          ),
        );
        let returned = returnedStory?.page_welcome_message;
        if (typeof returned === "string") {
          try {
            returned = JSON.parse(returned);
          } catch {}
        }
        demand(
          returned?.text_format?.message?.text ===
            expected.text_format.message.text &&
            returned?.text_format?.message?.autofill_message?.content ===
              expected.text_format.message.autofill_message.content,
          "Meta no confirmó la plantilla de conversación elegida.",
          409,
        );
      }
      if (config.objective === "LEADS")
        demand(
          String(returnedStory?.call_to_action?.value?.lead_gen_form_id) ===
            config.leadFormId,
          "Meta no confirmó el formulario seleccionado.",
          409,
        );
      receipt = {
        id: remoteId,
        objective: config.objective ?? "WHATSAPP",
        headlineVerified: true,
      };
    } else {
      demand(
        String(result.id) === remoteId &&
          String(result.account_id).replace(/^act_/, "") === a.id,
        "Meta devolvió una campaña de otra cuenta.",
        502,
      );
      demand(
        result.objective === campaignObjective(config) &&
          (config.existingCampaignId
            ? String(result.daily_budget ?? "") ===
                String(config.existingCampaign?.daily_budget ?? "") &&
              String(result.lifetime_budget ?? "") ===
                String(config.existingCampaign?.lifetime_budget ?? "")
            : Number(result.daily_budget) === config.minorBudget) &&
          result.status ===
            (config.existingCampaignId || step.kind === "VERIFY_LIVE"
              ? "ACTIVE"
              : "PAUSED"),
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
                (step.kind === "VERIFY_LIVE" ||
                steps.some((s) => s.existing && s.receipt?.id === id)
                  ? "ACTIVE"
                  : "PAUSED"),
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
    if (e instanceof MetaQuotaWait) {
      // beforeRead rejected locally: this invocation never reached Meta. Retain
      // the same pending step and all receipts; network/Meta errors stay uncertain.
      step.state = "PENDING";
      delete step.startedAt;
      step.wait = { reason: e.reason, until: e.retryAt.toISOString() };
      await db.creativeMetaLaunch.updateMany({
        where: { id, status: "PUBLISHING", revision: d.revision + 1 },
        data: { steps: json(steps), error: null, revision: { increment: 1 } },
      });
      return getLaunch(actor, id);
    }
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

export async function campaignLeadForms(
  actor: Actor,
  accountId: string,
  pageId: string,
) {
  studioAccess(actor);
  const a = await primaryAccount(actor, accountId);
  const directory = await launchResources(actor, accountId, "pages");
  demand(
    directory.pages.some((p: any) => p.id === pageId),
    "La página no está autorizada.",
    403,
  );
  const { reader: r } = await reader(a.connectionId, false, true);
  const result = await r.launchRequest(
    accountId,
    "object",
    undefined,
    pageId,
    "id,leadgen_forms.limit(100){id,name,status}",
  );
  demand(String(result.id) === pageId, "Meta no confirmó la página.", 502);
  await primaryAccount(actor, accountId);
  return {
    forms: (result.leadgen_forms?.data ?? [])
      .filter(
        (f: any) => f.status === "ACTIVE" && /^\d{1,40}$/.test(String(f.id)),
      )
      .map((f: any) => ({ id: String(f.id), name: String(f.name ?? f.id) })),
    partial: !!result.leadgen_forms?.paging?.next,
  };
}

export async function launchHistory(actor: Actor, categoryId: string) {
  studioAccess(actor);
  await metaEditorOnly(actor);
  await resourceAccess(actor, "category", categoryId, "EDIT");
  const rows = await db.$queryRaw<
    {
      id: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      accountId: string;
      error: string | null;
      config: unknown;
    }[]
  >`SELECT "id","status","createdAt","updatedAt","accountId","error",("config" - ARRAY['variationRevisions','savedTargeting']) AS "config" FROM "CreativeMetaLaunch" WHERE "categoryId"=${categoryId} AND (${actor.role}='OWNER' OR "actorId"=${actor.id}) ORDER BY "createdAt" DESC LIMIT 20`;
  const accessCache = new Map<string, Promise<boolean>>();
  for (const row of rows)
    if (!accessCache.has(row.accountId))
      accessCache.set(
        row.accountId,
        primaryAccount(actor, row.accountId)
          .then(() => true)
          .catch(() => false),
      );
  const allowed = await Promise.all(
    [...accessCache.entries()].map(async ([id, p]) => [id, await p] as const),
  );
  const ids = new Set(allowed.filter(([, ok]) => ok).map(([id]) => id));
  return {
    items: rows
      .filter((r) => ids.has(r.accountId))
      .map((r) => {
        const c = campaignConfigSchema.strip().safeParse(r.config);
        return {
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          error: r.error,
          config: c.success ? c.data : null,
        };
      }),
  };
}
