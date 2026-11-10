"use client";
import { useContext, useEffect, useRef, useState } from "react";
import {
  StudioRequestError,
  campaignFieldPath,
  campaignProblemLabel,
  campaignProblemMessage,
  campaignMessageProblem,
  type CampaignFieldProblem,
} from "../../lib/creative-studio/campaign-validation";
import { CurrentUserId } from "./role-guide";
import { metaPageWhatsAppNumber } from "../../lib/creative-studio/page-whatsapp";
import { StudioCampaignHistory } from "./studio-campaign-history";
import { StudioPagePicker } from "./studio-page-picker";
import {
  StudioMaximize,
  StudioRestore,
  useStudioColumns,
} from "./studio-columns";
import { studioRequest } from "./inventory-meta-picker";
import {
  campaignText,
  requiresMetaPayer,
  imageDistribution,
  launchSummary,
  campaignConfigSchema,
  validateCampaignDestination,
  type CampaignConfig,
  type CampaignItem,
} from "../../lib/creative-studio/campaign-policy";
import {
  useNamedConfiguration,
  NamedConfigurationPicker,
  NamedConfigurationSave,
} from "./studio-named-configuration";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import { launchPollDelay } from "../../lib/creative-studio/launch-wait";
import {
  StudioConversationEditor,
  useCampaignPresets,
} from "./studio-campaign-presets";
import {
  StudioCampaignParentPicker,
  type CampaignParentOption,
} from "./studio-campaign-parents";
import { StudioCampaignPlacements } from "./studio-campaign-placements";
import { StudioCampaignAudience } from "./studio-campaign-audience";
const initial: CampaignConfig = {
  existingCampaignId: undefined,
  existingAdsetId: undefined,
  existingAdsetIds: undefined,
  adsetDailyBudget: undefined,
  conversation: undefined,
  placements: undefined,
  allowExcludedPlacementSpend: false,
  multiAdvertiser: false,
  planVersion: 2,
  campaignName: "{pais} · {diplomado}",
  aiSuggestionJobId: undefined,
  objective: "WHATSAPP",
  website: "",
  leadFormId: "",
  platforms: ["facebook", "instagram"],
  variables: {},
  distribution: {},
  accountId: "",
  pageId: "",
  country: "",
  whatsapp: "",
  dailyBudget: 0,
  body: "Solicita información sobre el diplomado en {diplomado}.",
  headline: "{diplomado}",
  description: "",
  code: "",
  targetStatus: "PAUSED",
  specialCategory: "NONE",
  beneficiary: "",
  payor: "",
  audiences: [
    {
      name: "Público 1",
      ageMin: 18,
      ageMax: 65,
      gender: "ALL",
      strictAge: false,
    },
    {
      name: "Público 2",
      ageMin: 25,
      ageMax: 65,
      gender: "ALL",
      strictAge: false,
    },
  ],
};
function onlyConfig(value: any): CampaignConfig {
  return Object.fromEntries(
    Object.keys(initial).map((k) => [k, value[k] ?? (initial as any)[k]]),
  ) as CampaignConfig;
}
export function StudioCampaign({
  categoryId,
  country,
  accounts,
  items,
  template,
  latestLaunchId,
  onRestore,
  onCountryChange,
  countryBusy = false,
  scopeIds = [],
  scopeName = "",
  batch = false,
  onBatchChange,
  batchCount = 0,
  workspaceState,
  onWorkspaceState,
}: {
  scopeIds?: string[];
  scopeName?: string;
  batch?: boolean;
  onBatchChange?: (value: boolean) => void;
  batchCount?: number;
  workspaceState?: any;
  onWorkspaceState?: (value: any) => void;
  onCountryChange?: (country: string) => Promise<unknown>;
  countryBusy?: boolean;
  categoryId: string;
  country: string;
  accounts: any[];
  items: CampaignItem[];
  template?: any;
  latestLaunchId?: string | null;
  onRestore: (items: CampaignItem[]) => void;
}) {
  const userId = useContext(CurrentUserId);
  const { setMaximized } = useStudioColumns();
  const validationRoot = useRef<HTMLElement>(null);
  const validationSummary = useRef<HTMLDivElement>(null);
  const validationAnnounce = useRef(false);
  const [fieldProblems, setFieldProblems] = useState<CampaignFieldProblem[]>(
    [],
  );

  const [mode, setMode] = useState<"TRADITIONAL" | "AI">(
      workspaceState?.mode ?? "TRADITIONAL",
    ),
    [aiPrompt, setAiPrompt] = useState(workspaceState?.aiPrompt ?? ""),
    [aiConsent, setAiConsent] = useState(workspaceState?.aiConsent ?? false),
    [aiBusy, setAiBusy] = useState(false),
    [aiRequest, setAiRequest] = useState<string | null>(
      workspaceState?.aiRequest ?? null,
    ),
    [aiProposal, setAiProposal] = useState<any>(
      workspaceState?.aiProposal ?? null,
    );
  const aiPending = useRef(false);
  const presets = useCampaignPresets(categoryId);
  const [selectedCampaign, setSelectedCampaign] = useState<
    CampaignParentOption | undefined
  >(workspaceState?.selectedCampaign);
  const [selectedAdsets, setSelectedAdsets] = useState<CampaignParentOption[]>(
    workspaceState?.selectedAdsets ?? [],
  );
  const [aiFields, setAiFields] = useState({
    headline: false,
    conversation: false,
    ...(workspaceState?.aiFields ?? {
      audiences: true,
      body: false,
      description: !String(
        workspaceState?.form?.description ?? template?.description ?? "",
      ).trim(),
    }),
  });
  const [aiNotice, setAiNotice] = useState("");
  const [aiCompletion, setAiCompletion] = useState(
    workspaceState?.aiCompletion ?? "",
  );
  const stages = useRef<Record<string, HTMLDetailsElement | null>>({});
  const [leadForms, setLeadForms] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [leadError, setLeadError] = useState(""),
    [leadLoading, setLeadLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [accountPins, setAccountPins] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(
        localStorage.getItem("studio-account-pins:" + userId) || "[]",
      );
      setAccountPins(
        Array.isArray(v)
          ? v
              .filter((x) => typeof x === "string" && /^\d{1,40}$/.test(x))
              .slice(0, 12)
          : [],
      );
    } catch {
      setAccountPins([]);
    }
  }, [userId]);
  function pinAccount() {
    const next = accountPins.includes(form.accountId)
      ? accountPins.filter((x) => x !== form.accountId)
      : [...accountPins, form.accountId].slice(-12);
    setAccountPins(next);
    try {
      localStorage.setItem(
        "studio-account-pins:" + userId,
        JSON.stringify(next),
      );
    } catch {}
  }

  const forceAccount = useRef<string | null>(null),
    loadedAccount = useRef("");
  const [audiencesFor, setAudiencesFor] = useState(""),
    [audienceLoading, setAudienceLoading] = useState(false);
  const refreshPages = () => {
    forceAccount.current = form.accountId;
    setResourceReload((n) => n + 1);
  };
  const [form, setForm] = useState<CampaignConfig>(() => ({
      ...initial,
      ...onlyConfig(template ?? initial),
      existingCampaignId: undefined,
      existingAdsetId: undefined,
      existingAdsetIds: undefined,
      ...workspaceState?.form,
      country,
    })),
    [resources, setResources] = useState<any>({ pages: [], audiences: [] }),
    [loading, setLoading] = useState(false),
    [pageError, setPageError] = useState(""),
    [resourceReload, setResourceReload] = useState(0),
    [pageRetryAt, setPageRetryAt] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [retrying, setRetrying] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<any>(workspaceState?.draft ?? null),
    [review, setReview] = useState(false),
    [spend, setSpend] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [halted, setHalted] = useState(false);
  const retryInFlight = useRef(false);
  const sessionWriter = useRef(onWorkspaceState);
  sessionWriter.current = onWorkspaceState;
  useEffect(() => {
    sessionWriter.current?.({
      form,
      draft,
      mode,
      aiPrompt,
      aiConsent,
      aiRequest,
      aiProposal,
      selectedCampaign,
      selectedAdsets,
      aiFields,
      aiCompletion,
    });
  }, [
    form,
    draft,
    mode,
    aiPrompt,
    aiConsent,
    aiRequest,
    aiProposal,
    selectedCampaign,
    selectedAdsets,
    aiFields,
    aiCompletion,
  ]);
  useEffect(() => {
    if (!pageRetryAt) return;
    const timer = setTimeout(
      () => setPageRetryAt(null),
      Math.max(0, pageRetryAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pageRetryAt]);
  const [phone, setPhone] = useState<{ scope: string; number: string } | null>(
    null,
  );
  const phoneScope = form.accountId + ":" + form.pageId;
  const selectedPage =
    resources.accountId === form.accountId
      ? resources.pages.find((p: any) => p.id === form.pageId)
      : null;
  const directoryPhone = metaPageWhatsAppNumber(selectedPage?.whatsapp);
  const phoneNumber = phone?.scope === phoneScope ? phone.number : "";
  useEffect(() => {
    const controller = new AbortController();
    setPhone(null);
    if (!form.accountId || !form.pageId || !selectedPage) {
      return () => controller.abort();
    }
    if (directoryPhone) {
      setPhone({ scope: phoneScope, number: directoryPhone });
      return () => controller.abort();
    }
    void studioRequest(
      "/page-whatsapp/" +
        form.accountId +
        "?" +
        new URLSearchParams({
          pageId: form.pageId,
        }),
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setPhone({ scope: phoneScope, number: r.number });
          setResources((current: any) => ({
            ...current,
            pages: current.pages.map((p: any) =>
              p.id === r.pageId ? { ...p, whatsapp: r.number } : p,
            ),
          }));
        }
      })
      // Reading the number is optional; Meta validates the linked default when publishing.
      .catch(() => {});
    return () => controller.abort();
  }, [form.accountId, form.pageId, !!selectedPage, directoryPhone]);
  useEffect(() => {
    if (form.whatsapp !== phoneNumber)
      setForm((f) => ({ ...f, whatsapp: phoneNumber }));
  }, [phoneNumber, form.whatsapp]);
  useEffect(() => {
    setLeadForms([]);
    setLeadError("");
    if (form.objective !== "LEADS" || !form.pageId || !form.accountId) return;
    const controller = new AbortController();
    setLeadLoading(true);
    void studioRequest(
      "/page-lead-forms/" + form.accountId + "?pageId=" + form.pageId,
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setLeadForms(r.forms);
          if (!r.forms.length)
            setLeadError(
              "Esta página no tiene formularios activos disponibles. Revisa sus permisos o crea uno en Meta.",
            );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLeadError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLeadLoading(false);
      });
    return () => controller.abort();
  }, [form.objective, form.pageId, form.accountId]);
  const effectiveAiFields = {
    ...aiFields,
    audiences:
      !!aiFields.audiences &&
      !form.existingAdsetId &&
      !form.existingAdsetIds?.length,
    conversation:
      !!aiFields.conversation &&
      ["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective),
  };
  const aiSelectionKey = JSON.stringify({
    fields: effectiveAiFields,
    prompt: aiPrompt.trim(),
    items: items.map((i) => ({ id: i.subproductId, images: i.variationIds })),
    country,
    account: form.accountId,
    page: form.pageId,
    objective: form.objective,
    special: form.specialCategory,
    count: form.audiences.length,
  });
  const aiContext = useRef("");
  aiContext.current = JSON.stringify({
    categoryId,
    country,
    items: items.map((i) => ({ id: i.subproductId, images: i.variationIds })),
    form: { ...form, whatsapp: "" },
    aiFields,
    aiPrompt,
  });
  const lastCategory = useRef(categoryId);
  useEffect(() => {
    if (lastCategory.current === categoryId) return;
    lastCategory.current = categoryId;
    setFieldProblems([]);
    setDraft(null);
    setReview(false);
    setError("");
    setAiRequest(null);
    setAiProposal(null);
    setForm({ ...initial, ...onlyConfig(template ?? initial), country });
  }, [categoryId]);
  const lastCountry = useRef(country);
  const pending = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    restore = useRef(onRestore);
  restore.current = onRestore;
  useEffect(() => {
    if (lastCountry.current !== country) {
      lastCountry.current = country;
      setForm((f) => ({
        ...initial,
        ...onlyConfig(template ?? initial),
        accountId: f.accountId,
        pageId: f.pageId,
        whatsapp: f.whatsapp,
        country,
      }));
      setDraft(null);
    } else setForm((f) => ({ ...f, country }));
    setSpend(false);
  }, [country]);
  useEffect(() => {
    if (!latestLaunchId || workspaceState?.draft || workspaceState?.form)
      return;
    try {
      const stored = localStorage.getItem(
        "studio-campaign-dismissed:v1:" + userId + ":" + categoryId,
      );
      const ids = stored?.startsWith("[") ? JSON.parse(stored) : [stored];
      if (Array.isArray(ids) && ids.includes(latestLaunchId)) return;
    } catch {}
    const controller = new AbortController();
    void studioRequest(
      "/launches/" + latestLaunchId,
      "GET",
      undefined,
      controller.signal,
    )
      .then((d) => {
        if (
          d.config.country !== country ||
          (scopeIds.length &&
            (!d.items?.length ||
              !d.items.every((i: CampaignItem) =>
                scopeIds.includes(i.subproductId),
              )))
        )
          return;
        setDraft(d);
        setForm(onlyConfig(d.config));
        if (d.config.existingCampaign)
          setSelectedCampaign({
            id: String(d.config.existingCampaign.id),
            name: String(d.config.existingCampaign.name),
            objective: d.config.existingCampaign.objective,
            dailyBudget: d.config.existingCampaign.daily_budget,
            lifetimeBudget: d.config.existingCampaign.lifetime_budget,
          });
        if (d.config.existingAdsets)
          setSelectedAdsets(
            d.config.existingAdsets.map((v: any) => ({
              id: String(v.id),
              name: v.name,
              destination: v.destination_type,
              pageId: v.promoted_object?.page_id,
              targeting: v.targeting,
              placementSoftOptOut: v.placement_soft_opt_out,
            })),
          );
        restore.current(d.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [latestLaunchId, userId, categoryId, scopeIds.join("|")]);
  useEffect(() => {
    if (!form.accountId) return;
    setPageError("");
    setPageRetryAt(null);
    const force = forceAccount.current === form.accountId;
    forceAccount.current = null;
    const same = loadedAccount.current === form.accountId;
    loadedAccount.current = form.accountId;
    const controller = new AbortController();
    setLoading(true);
    if (!same)
      setResources({ accountId: form.accountId, pages: [], audiences: [] });
    void studioRequest(
      "/account-resources/" +
        form.accountId +
        "?part=pages" +
        (force ? "&refresh=1" : ""),
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (controller.signal.aborted) return;
        if (r.pageWarning || !r.pages.length)
          setPageError(
            r.pageWarning ||
              "Meta no devolvió páginas para esta conexión. Revisa que la credencial tenga acceso a la página y permiso pages_show_list.",
          );
        setPageRetryAt(
          r.pageIssue?.retryAt
            ? Date.parse(r.pageIssue.retryAt)
            : r.pageIssue?.kind === "RATE_LIMIT"
              ? Date.now() + 60000
              : null,
        );
        setResources((current: any) => ({
          ...current,
          ...r,
          accountId: form.accountId,
          audiences: current.audiences ?? [],
        }));
        setForm((f) =>
          f.pageId && !r.pages.some((p: any) => p.id === f.pageId)
            ? { ...f, pageId: "" }
            : f,
        );
        if (r.pages.length === 1)
          setForm((f) => ({
            ...f,
            pageId: r.pages[0].id,
            whatsapp: f.whatsapp || r.pages[0].whatsapp,
          }));
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setPageError(e.message);
          setResources({ accountId: form.accountId, pages: [], audiences: [] });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [form.accountId, resourceReload]);
  useEffect(() => {
    if (review) dialog.current?.showModal();
  }, [review]);
  useEffect(() => {
    if (!draft || draft.status !== "PUBLISHING" || halted) return;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    async function step() {
      try {
        const next = await studioRequest(
          "/launches/" + draft.id + "/tick",
          "POST",
          {},
        );
        if (!alive) return;
        setDraft(next);
        if (next.status === "PUBLISHING")
          timer = setTimeout(
            step,
            next.waiting
              ? launchPollDelay(next)
              : next.completed > draft.completed
                ? 300
                : 1500,
          );
      } catch (e) {
        if (alive) {
          setError(
            e instanceof Error ? e.message : "No se confirmó el avance.",
          );
          setHalted(true);
        }
      }
    }
    timer = setTimeout(step, launchPollDelay(draft));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft?.id, draft?.status, halted]);
  const locked = busy || aiBusy || draft?.status === "PUBLISHING",
    publishing = retrying || (draft?.status === "PUBLISHING" && !halted),
    publishPercent = draft
      ? Math.round((100 * draft.completed) / Math.max(1, draft.total))
      : 0,
    account = accounts.find((a) => a.id === form.accountId),
    summary = launchSummary(items, { ...form, planVersion: 2 }),
    currency = account?.currency ?? draft?.config.currency ?? "",
    money = (n: number) =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: currency || "USD",
      }).format(n);
  const campaignConfiguration = useNamedConfiguration({
    kind: "campaign",
    categoryId,
    form,
    store: presets,
    disabled: locked,
    onApply: (settings) => {
      const { adsetCount, ...rest } = settings;
      setSelectedCampaign(undefined);
      setSelectedAdsets([]);
      const audiences = Array.from(
        { length: adsetCount ?? form.audiences.length },
        (_, i) =>
          form.audiences[i] ?? {
            name: "Público " + (i + 1),
            ageMin: 18,
            ageMax: 65,
            gender: "ALL",
            strictAge: false,
          },
      );
      applyConfig({
        ...rest,
        audiences,
        existingCampaignId: undefined,
        existingAdsetId: undefined,
        existingAdsetIds: undefined,
        distribution: {},
        ...(!["WHATSAPP", "LEADS_WHATSAPP"].includes(settings.objective)
          ? { conversation: undefined }
          : {}),
      });
    },
  });
  const adConfiguration = useNamedConfiguration({
    kind: "ad",
    categoryId,
    form,
    store: presets,
    disabled: locked,
    onApply: (settings) =>
      applyConfig({
        ...settings,
        ...(!["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective)
          ? { conversation: undefined }
          : {}),
      }),
  });
  async function retryPublication() {
    if (!draft || retryInFlight.current) return;
    retryInFlight.current = true;
    const context = aiContext.current;
    setRetrying(true);
    setBusy(true);
    setError("");
    try {
      const resumable = draft.canResumeWait || draft.canResumeVerification;
      const next = await studioRequest(
        "/launches/" + draft.id + (resumable ? "/resume-wait" : ""),
        resumable ? "POST" : "GET",
        resumable ? { revision: draft.revision } : undefined,
      );
      if (aiContext.current !== context) return;
      setDraft(next);
      setHalted(false);
    } catch (e) {
      if (aiContext.current !== context) return;
      // A lost resume response can still have advanced the saved attempt. Read
      // its state before offering another request with an obsolete revision.
      try {
        const current = await studioRequest("/launches/" + draft.id);
        if (aiContext.current !== context) return;
        setDraft(current);
        if (current.status === "PUBLISHING" || current.status === "PUBLISHED") {
          setHalted(false);
          return;
        }
      } catch {
        if (aiContext.current !== context) return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo reintentar la publicación.",
      );
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
      setBusy(false);
    }
  }
  function update(key: keyof CampaignConfig, value: unknown) {
    if (key === "accountId") {
      setSelectedCampaign(undefined);
      setSelectedAdsets([]);
    }
    if (key === "pageId") setSelectedAdsets([]);
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "accountId"
        ? {
            pageId: "",
            whatsapp: "",
            leadFormId: "",
            existingCampaignId: undefined,
            existingAdsetId: undefined,
            existingAdsetIds: undefined,
          }
        : {}),
      ...(key === "pageId"
        ? {
            leadFormId: "",
            existingAdsetId: undefined,
            existingAdsetIds: undefined,
          }
        : {}),
      ...(key === "specialCategory" && value !== "NONE"
        ? {
            audiences: f.audiences.map((a) => ({
              ...a,
              ageMin: 18,
              ageMax: 65,
              gender: "ALL" as const,
              strictAge: false,
              savedAudienceId: undefined,
              platformPresetId: undefined,
              interests: undefined,
              detailedTargeting: undefined,
              customAudiences: undefined,
              excludedCustomAudiences: undefined,
              selectionProofs: undefined,
            })),
          }
        : {}),
    }));
    if (draft?.status === "DRAFT") setDraft(null);
    setSpend(false);
    setAiRequest(null);
    setAiProposal(null);
    setError("");
  }
  async function suggest() {
    if (aiPending.current || pending.current || !aiConsent) return;
    aiPending.current = true;
    const context = aiContext.current;
    setAiBusy(true);
    setError("");
    const requestId = aiRequest ?? crypto.randomUUID();
    setAiRequest(requestId);
    try {
      const fields = {
        ...aiFields,
        conversation:
          !!aiFields.conversation &&
          ["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective),
      };
      const config = campaignConfigSchema.parse({
        ...form,
        body: fields.body ? "Texto generado por IA" : form.body,
        description: form.description,
        headline: fields.headline ? "{diplomado}" : form.headline,
        conversation: fields.conversation ? undefined : form.conversation,
        planVersion: 2,
      });
      validateCampaignDestination(config);
      if (!items.length)
        throw Error(
          "Selecciona los afiches de este diplomado antes de generar con IA.",
        );
      items.forEach((i) => imageDistribution(i, config));
      if (
        !fields.audiences &&
        !fields.body &&
        !fields.description &&
        !fields.headline &&
        !fields.conversation
      )
        throw Error("Selecciona al menos un campo para generar con IA.");
      const result = await studioRequest("/campaign-suggestion", "POST", {
        requestId,
        categoryId,
        confirmAi: true,
        prompt:
          aiPrompt.trim() ||
          "Propón públicos y textos apropiados para el diplomado. No inventes beneficios.",
        config,
        subproductIds: items.map((i) => i.subproductId),
        fields: {
          ...fields,
          audiences:
            !!fields.audiences &&
            !form.existingAdsetId &&
            !form.existingAdsetIds?.length,
        },
      });
      if (aiContext.current !== context)
        throw Error(
          "Cambió el diplomado o la configuración. La propuesta quedó guardada sin aplicarse.",
        );
      setAiProposal(result.proposal);
      setAiCompletion(aiSelectionKey);
      setForm((f) => ({
        ...f,
        ...(fields.audiences &&
        !f.existingAdsetId &&
        !f.existingAdsetIds?.length
          ? {
              audiences: result.proposal.audiences.map((a: any) => ({
                ...a,
                interestSource: "AI",
              })),
              aiSuggestionJobId: result.jobId,
            }
          : {}),
        ...(fields.body ? { body: result.proposal.body } : {}),
        ...(fields.headline ? { headline: result.proposal.headline } : {}),
        ...(fields.conversation
          ? { conversation: result.proposal.conversation }
          : {}),
        ...(fields.description
          ? { description: result.proposal.description }
          : {}),
      }));
      setAiNotice(
        "Listo. Revisa los campos completados y publica cuando quieras.",
      );
      setAiRequest(null);
      if (
        fields.body ||
        fields.description ||
        fields.headline ||
        fields.conversation
      )
        stages.current.ads?.setAttribute("open", "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la campaña.");
    } finally {
      aiPending.current = false;
      setAiBusy(false);
    }
  }

  function changeAudienceCount(n: number) {
    update(
      "audiences",
      Array.from(
        { length: Math.max(1, Math.min(10, n)) },
        (_, i) =>
          form.audiences[i] ?? {
            name: "Público " + (i + 1),
            ageMin: 18,
            ageMax: 65,
            gender: "ALL",
            strictAge: false,
          },
      ),
    );
    update("distribution", {});
  }
  function applyConfig(patch: Partial<CampaignConfig>) {
    setForm((f) => ({ ...f, ...patch }));
    if (draft?.status === "DRAFT") setDraft(null);
    setAiRequest(null);
    setAiProposal(null);
    setError("");
  }
  function chooseCampaign(rows: CampaignParentOption[]) {
    const selected = rows[0];
    setSelectedCampaign(selected);
    setSelectedAdsets([]);
    const objective =
      selected.objective === "OUTCOME_LEADS"
        ? "LEADS_WHATSAPP"
        : selected.objective === "OUTCOME_TRAFFIC"
          ? "TRAFFIC"
          : "WHATSAPP";
    applyConfig({
      existingCampaignId: selected.id,
      existingAdsetId: undefined,
      existingAdsetIds: undefined,
      objective,
      specialCategory: (selected.specialCategories?.[0] ??
        "NONE") as CampaignConfig["specialCategory"],
      conversation: objective === "TRAFFIC" ? undefined : form.conversation,
      distribution: {},
    });
  }
  function chooseAdsets(rows: CampaignParentOption[]) {
    setSelectedAdsets(rows);
    if (!rows.length) {
      applyConfig({ existingAdsetIds: undefined, existingAdsetId: undefined });
      return;
    }
    const objective =
      rows[0].destination === "ON_AD"
        ? "LEADS"
        : rows[0].destination === "WEBSITE"
          ? "TRAFFIC"
          : selectedCampaign?.objective === "OUTCOME_LEADS"
            ? "LEADS_WHATSAPP"
            : "WHATSAPP";
    applyConfig({
      existingAdsetId: undefined,
      existingAdsetIds: rows.map((r) => r.id),
      objective,
      conversation:
        objective === "LEADS" || objective === "TRAFFIC"
          ? undefined
          : form.conversation,
      audiences: rows.map((r) => ({
        name: r.name,
        ageMin: Number(r.targeting?.age_min ?? 18),
        ageMax: Number(r.targeting?.age_max ?? 65),
        gender:
          r.targeting?.genders?.[0] === 1
            ? "MEN"
            : r.targeting?.genders?.[0] === 2
              ? "WOMEN"
              : "ALL",
        strictAge: false,
      })),
      distribution: {},
    });
    setAiFields((f: any) => ({ ...f, audiences: false }));
  }
  const leavingBlocked =
    busy || aiBusy || (draft?.status === "PUBLISHING" && !halted);
  function closeNotice() {
    setFieldProblems([]);
    try {
      const id = draft?.id ?? latestLaunchId;
      if (id) {
        const key = "studio-campaign-dismissed:v1:" + userId + ":" + categoryId,
          stored = localStorage.getItem(key);
        const prior = stored?.startsWith("[")
          ? JSON.parse(stored)
          : stored
            ? [stored]
            : [];
        localStorage.setItem(
          key,
          JSON.stringify(
            [...new Set([...(Array.isArray(prior) ? prior : []), id])].slice(
              -20,
            ),
          ),
        );
      }
    } catch {}
    setDraft(null);
    setReview(false);
    setHalted(false);
    setSpend(false);
    setError("");
  }
  function newCampaign(saved?: CampaignConfig) {
    closeNotice();
    setAiRequest(null);
    setAiProposal(null);
    setAiConsent(false);
    setAiPrompt("");
    setAiCompletion("");
    restore.current([]);
    setForm((f) => {
      const next = saved ? onlyConfig(saved) : f;
      return {
        ...next,
        country,
        targetStatus: "PAUSED",
        body: saved ? next.body : initial.body,
        description: saved ? next.description : "",
        campaignName: saved ? next.campaignName : initial.campaignName,
        aiSuggestionJobId: undefined,
        existingCampaignId: undefined,
        existingAdsetId: undefined,
        existingAdsetIds: undefined,
        adsetDailyBudget: undefined,
        audiences: next.audiences.map((a, i) => ({
          ...a,
          name: "Público " + (i + 1),
          interests: undefined,
          detailedTargeting: undefined,
          savedAudienceId: undefined,
          platformPresetId: undefined,
          customAudiences: undefined,
          excludedCustomAudiences: undefined,
          locations: undefined,
          locales: undefined,
          selectionProofs: undefined,
          interestSource: undefined,
        })),
      };
    });
    setSelectedCampaign(undefined);
    setSelectedAdsets([]);
    setHistoryOpen(false);
  }
  async function authorizePageAccess() {
    if (!resources.canAuthorizePages || !resources.connectionId) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        "/api/meta-ads/connections/" +
          encodeURIComponent(resources.connectionId) +
          "/pages-oauth",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "No se pudo autorizar la página.");
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir Facebook.");
    } finally {
      setBusy(false);
    }
  }
  function problemTarget(problem: CampaignFieldProblem): HTMLElement | null {
    const path = campaignFieldPath(problem.field),
      root = path.split(".")[0];
    const labels: Record<string, string> = {
      accountId: "Cuenta publicitaria principal",
      pageId: "Buscar página de Facebook",
      country: "País de la campaña",
      dailyBudget: "Presupuesto diario por campaña",
      adsetDailyBudget: "Presupuesto diario por conjunto",
      campaignName: "Nombre de campaña",
      objective: "Objetivo de campaña",
      body: "Texto principal",
      headline: "Headline del anuncio",
      description: "Descripción del anuncio",
      website: "Página web de destino",
      leadFormId: "Formulario de clientes potenciales",
      conversation: "Plantilla de conversación",
      beneficiary: "Beneficiario",
      payor: "Pagador",
      specialCategory: "Categoría publicitaria",
      targetStatus: "Estado de publicación",
    };
    const parts = path.split(".");
    let label =
      root === "dailyBudget" && form.existingCampaignId
        ? labels.adsetDailyBudget
        : labels[root];
    if (root === "audiences" && /^\d+$/.test(parts[1] ?? "")) {
      const audienceLabels: Record<string, string> = {
        ageMin: "Edad mínima del público",
        ageMax: "Edad máxima del público",
        name: "Nombre del conjunto",
        gender: "Género del público",
      };
      if (audienceLabels[parts[2]])
        label = audienceLabels[parts[2]] + " " + (Number(parts[1]) + 1);
    }
    if (label) {
      const control = [
        ...(validationRoot.current?.querySelectorAll<HTMLElement>(
          "[aria-label]",
        ) ?? []),
      ].find((el) => el.getAttribute("aria-label") === label);
      if (control) return control;
    }
    if (root === "audiences" && /^\d+$/.test(parts[1] ?? "")) {
      const card = validationRoot.current?.querySelector<HTMLElement>(
        `[data-campaign-audience-index="${parts[1]}"]`,
      );
      if (card) return card;
    }
    if (root === "items" || root === "categoryId")
      return document.querySelector<HTMLElement>(
        '[data-campaign-field="items"]',
      );
    const group = ["platforms", "placements"].includes(root)
      ? "placements"
      : [
            "audiences",
            "distribution",
            "existingAdsetId",
            "existingAdsetIds",
          ].includes(root)
        ? "audiences"
        : ["beneficiary", "payor", "specialCategory"].includes(root)
          ? "legal"
          : ["body", "headline", "description", "conversation"].includes(root)
            ? mode === "AI"
              ? "ai"
              : "ads"
            : root === "ai"
              ? "ai"
              : "campaign";
    return (
      validationRoot.current?.querySelector<HTMLElement>(
        `[data-campaign-field="${group}"]`,
      ) ?? validationRoot.current
    );
  }
  function goToProblem(problem: CampaignFieldProblem) {
    if (
      ["items", "categoryId"].includes(
        campaignFieldPath(problem.field).split(".")[0],
      )
    )
      setMaximized("");
    campaignConfiguration.setEditing(true);
    adConfiguration.setEditing(true);
    requestAnimationFrame(() => {
      const target = problemTarget(problem);
      if (!target) return;
      for (
        let node: HTMLElement | null = target;
        node;
        node = node.parentElement
      ) {
        if (node instanceof HTMLDetailsElement) node.open = true;
      }
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const focus = target.matches("input,select,textarea,button,[tabindex]")
        ? target
        : target.querySelector<HTMLElement>(
            "input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])",
          );
      if (focus) focus.focus({ preventScroll: true });
      else {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    });
  }
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    fieldProblems.forEach((problem, index) => {
      const target = problemTarget(problem);
      if (!target) return;
      const box = target.closest<HTMLElement>("label") ?? target;
      box.classList.add("studio-field-invalid");
      const previous = target.getAttribute("aria-invalid"),
        described = target.getAttribute("aria-describedby");
      target.setAttribute("aria-invalid", "true");
      target.setAttribute(
        "aria-describedby",
        [described, `campaign-issue-${index}`].filter(Boolean).join(" "),
      );
      const stage = target.closest("details");
      stage?.classList.add("studio-stage-invalid");
      cleanups.push(() => {
        box.classList.remove("studio-field-invalid");
        stage?.classList.remove("studio-stage-invalid");
        if (previous === null) target.removeAttribute("aria-invalid");
        else target.setAttribute("aria-invalid", previous);
        if (described === null) target.removeAttribute("aria-describedby");
        else target.setAttribute("aria-describedby", described);
      });
    });
    if (fieldProblems.length && validationAnnounce.current) {
      validationAnnounce.current = false;
      validationSummary.current?.focus({ preventScroll: true });
      validationSummary.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
    return () => cleanups.reverse().forEach((cleanup) => cleanup());
  }, [
    fieldProblems,
    campaignConfiguration.collapsed,
    adConfiguration.collapsed,
  ]);
  async function prepare(open: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setFieldProblems([]);
    try {
      if (
        mode === "AI" &&
        Object.values(effectiveAiFields).some(Boolean) &&
        aiCompletion !== aiSelectionKey
      )
        throw Error("Completa los campos marcados con IA antes de revisar.");
      const checked = campaignConfigSchema.safeParse({
        ...form,
        planVersion: 2,
      });
      if (!checked.success) {
        throw new StudioRequestError(
          "Corrige los campos indicados para continuar.",
          checked.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        );
      }
      if (!checked.data.existingCampaignId && checked.data.dailyBudget <= 0)
        throw new StudioRequestError("Indica el presupuesto de la campaña.", [
          {
            field: "dailyBudget",
            message: "Indica un presupuesto mayor que cero.",
          },
        ]);
      if (!items.length)
        throw Error("Selecciona los afiches de este diplomado.");
      items.forEach((i) => {
        imageDistribution(i, checked.data);
        validateCampaignDestination(checked.data);
      });
      const d = await studioRequest("/launches", "POST", {
        requestId: crypto.randomUUID(),
        categoryId,
        config: checked.data,
        items: items.map((i) => ({
          subproductId: i.subproductId,
          variationIds: i.variationIds,
        })),
      });
      setDraft(d);
      if (open) setReview(true);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "No se pudo preparar la campaña.";
      const fields =
        e instanceof StudioRequestError && e.fields.length
          ? e.fields
          : [campaignMessageProblem(message)].filter(
              (p): p is CampaignFieldProblem => !!p,
            );
      if (
        fields.some((p) =>
          /^(campaignName|objective|platforms|placements|website|leadFormId)/.test(
            campaignFieldPath(p.field),
          ),
        )
      )
        campaignConfiguration.setEditing(true);
      if (
        fields.some((p) =>
          /^(body|headline|description|conversation)/.test(
            campaignFieldPath(p.field),
          ),
        )
      )
        adConfiguration.setEditing(true);
      validationAnnounce.current = true;
      setFieldProblems(fields);
      setError(
        fields.length
          ? "Corrige los campos indicados para continuar."
          : message,
      );
      if (/beneficiario|pagador|edades|público/i.test(message))
        setAdvanced(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function publish() {
    if (pending.current || !draft) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await studioRequest(
        "/launches/" + draft.id + "/publish",
        "POST",
        { revision: draft.revision, confirmPublish: true, confirmSpend: spend },
      );
      setDraft(d);
      setHalted(false);
      setReview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se confirmó el envío.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <aside
      ref={validationRoot}
      onChangeCapture={(event) => {
        if (!fieldProblems.length) return;
        const remaining = fieldProblems.filter((problem) => {
          const target = problemTarget(problem);
          return !target || !target.contains(event.target as Node);
        });
        if (remaining.length !== fieldProblems.length) {
          setFieldProblems(remaining);
          if (!remaining.length) setError("");
        }
      }}
      className="studio-pane studio-campaign"
      aria-label="Preparar y publicar campaña"
    >
      <header className="studio-pane-title studio-campaign-title">
        <StudioMaximize pane="campaign" label="Preparar campaña" />
        <span className="studio-step violet">03</span>
        <div>
          <span className="studio-eyebrow">TU PUBLICIDAD</span>
          <h2>Campañas</h2>
        </div>
        <nav className="studio-campaign-navigation" aria-label="Campañas">
          <button
            type="button"
            disabled={leavingBlocked}
            onClick={() => newCampaign()}
          >
            ＋ Nueva
          </button>
          <button
            type="button"
            disabled={leavingBlocked}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            Bitácora
          </button>
        </nav>
      </header>
      <div className="studio-campaign-scope">
        <strong title={scopeName}>
          {scopeName ||
            items.map((i) => i.name).join(" · ") ||
            "Selecciona un diplomado"}
        </strong>
        {onBatchChange && (
          <button
            type="button"
            disabled={locked}
            onClick={() => onBatchChange(!batch)}
          >
            {batch
              ? "Volver a este diplomado"
              : `Selección múltiple${batchCount ? " · " + batchCount : ""}`}
          </button>
        )}
      </div>
      {historyOpen && (
        <StudioCampaignHistory
          categoryId={categoryId}
          onUse={(c) => newCampaign(c)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      <fieldset
        disabled={locked}
        className="studio-campaign-fields studio-workbench-fields"
      >
        <section
          className="studio-campaign-identity"
          data-campaign-field="identity"
        >
          <label>
            Cuenta publicitaria principal
            <select
              aria-label="Cuenta publicitaria principal"
              value={form.accountId}
              onChange={(e) => update("accountId", e.target.value)}
            >
              <option value="">Selecciona tu cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.canPublish}>
                  {a.name} · {a.currency}
                  {a.canPublish ? "" : " · revisar conexión"}
                </option>
              ))}
            </select>
          </label>
          <div className="studio-personal-pins" aria-label="Cuentas fijadas">
            <button
              type="button"
              disabled={!form.accountId || locked}
              onClick={pinAccount}
            >
              {accountPins.includes(form.accountId)
                ? "★ Fijada"
                : "☆ Fijar cuenta"}
            </button>
            {accounts
              .filter((a) => accountPins.includes(a.id))
              .map((a) => (
                <button
                  type="button"
                  key={a.id}
                  disabled={!a.canPublish || locked}
                  title={a.name}
                  aria-pressed={form.accountId === a.id}
                  onClick={() => update("accountId", a.id)}
                >
                  {a.name}
                </button>
              ))}
          </div>
          <StudioPagePicker
            key={form.accountId}
            pinScope={userId + ":" + form.accountId}
            onRefresh={refreshPages}
            refreshDisabled={!!pageRetryAt}
            pages={
              resources.accountId === form.accountId ? resources.pages : []
            }
            value={form.pageId}
            loading={loading && !resources.pages.length}
            disabled={!form.accountId || locked}
            onChange={(id) => {
              if (id !== form.pageId) {
                update("pageId", id);
                setForm((f) => ({ ...f, whatsapp: "" }));
              }
            }}
          />
          {resources.pageCached && resources.pageSavedAt && (
            <small className="studio-pages-saved">
              Páginas guardadas ·{" "}
              {new Date(resources.pageSavedAt).toLocaleString("es-PE", {
                timeZone: "America/Lima",
              })}{" "}
              · Lima
            </small>
          )}
          {form.accountId &&
            !loading &&
            (pageError || !resources.pages.length) && (
              <div className="studio-page-error" role="status">
                <p>
                  {pageError || "No hay páginas disponibles en esta conexión."}
                </p>
                {pageRetryAt && (
                  <p>
                    Próximo intento disponible:{" "}
                    {new Date(pageRetryAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}{" "}
                    (Lima).
                  </p>
                )}
                <button
                  type="button"
                  disabled={locked || !!pageRetryAt}
                  onClick={refreshPages}
                >
                  Volver a consultar páginas
                </button>
                {resources.pageIssue?.kind !== "RATE_LIMIT" &&
                  resources.pageIssue?.kind !== "UNAVAILABLE" &&
                  resources.canAuthorizePages &&
                  resources.connectionId && (
                    <button
                      type="button"
                      disabled={busy || locked}
                      onClick={() => {
                        setBusy(true);
                        void fetch(
                          "/api/meta-ads/connections/" +
                            encodeURIComponent(resources.connectionId) +
                            "/pages-oauth",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: "{}",
                          },
                        )
                          .then(async (response) => {
                            const auth = await response.json();
                            if (!response.ok)
                              throw Error(
                                auth.error || "No se pudo abrir Facebook.",
                              );
                            window.location.assign(auth.url);
                          })
                          .catch((e) => setPageError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Autorizar páginas con Facebook
                    </button>
                  )}
                {resources.pageIssue?.kind !== "RATE_LIMIT" &&
                  resources.usesLoginConfiguration && (
                    <p>
                      En la configuración de Facebook Login para empresas
                      incluye pages_show_list, ads_read y ads_management y
                      permite las páginas que usarás.
                    </p>
                  )}
                {resources.pageIssue?.kind !== "RATE_LIMIT" &&
                  resources.pageIssue?.kind !== "UNAVAILABLE" &&
                  !resources.canAuthorizePages && (
                    <p>
                      Si usas un token manual, actualízalo con pages_show_list y
                      acceso a la página en Conexiones de Meta Ads. Si es un
                      usuario del sistema, asígnale la página en tu negocio de
                      Meta.
                    </p>
                  )}
                <a href="?view=metaads">Revisar conexión Meta</a>
              </div>
            )}
          {onCountryChange && (
            <label>
              Lugar · país
              <SheetSearchSelect
                label="País de la campaña"
                value={country}
                placeholder="Selecciona un país"
                disabled={locked || countryBusy}
                options={countryOptions.map((c) => ({
                  value: c.code,
                  label: c.name + " · " + c.code,
                }))}
                onSelect={(v) => void onCountryChange(v)}
              />
            </label>
          )}
          {!accounts.length && (
            <p className="hint">
              Marca tus cuentas principales en{" "}
              <a href="?view=metaads">Meta Ads</a> para usarlas aquí.
            </p>
          )}
        </section>
        <section className="studio-preparation-data">
          <div className="studio-budget">
            {!form.existingCampaignId ? (
              <label>
                Presupuesto diario por campaña <span>{currency}</span>
                <input
                  aria-label="Presupuesto diario por campaña"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.dailyBudget || ""}
                  placeholder="Ej. 7, 15, 20…"
                  onChange={(e) =>
                    update("dailyBudget", Number(e.target.value))
                  }
                />
              </label>
            ) : !form.existingAdsetId &&
              !form.existingAdsetIds?.length &&
              !Number(selectedCampaign?.dailyBudget) &&
              !Number(selectedCampaign?.lifetimeBudget) ? (
              <label>
                Presupuesto diario por conjunto nuevo <span>{currency}</span>
                <input
                  aria-label="Presupuesto diario por conjunto"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.adsetDailyBudget ?? ""}
                  onChange={(e) =>
                    update(
                      "adsetDailyBudget",
                      Number(e.target.value) || undefined,
                    )
                  }
                />
              </label>
            ) : (
              <div className="studio-existing-budget">
                <strong>Presupuesto existente</strong>
                <span>Se conserva el presupuesto de Meta.</span>
              </div>
            )}
          </div>
        </section>
        <StudioCampaignParentPicker
          kind="campaigns"
          configurationSelected={!!campaignConfiguration.selected}
          trailing={<NamedConfigurationPicker model={campaignConfiguration} />}
          accountId={form.accountId}
          selected={selectedCampaign ? [selectedCampaign] : []}
          disabled={locked}
          onSelect={(rows) => {
            campaignConfiguration.clear();
            chooseCampaign(rows);
          }}
          onCreate={() => {
            campaignConfiguration.clear();
            setSelectedCampaign(undefined);
            setSelectedAdsets([]);
            applyConfig({
              existingCampaignId: undefined,
              existingAdsetId: undefined,
              existingAdsetIds: undefined,
              distribution: {},
            });
          }}
        />
        <details
          className="studio-campaign-stage stage-campaign"
          data-campaign-field="campaign"
          hidden={campaignConfiguration.collapsed}
          open
          ref={(el) => {
            stages.current.campaign = el;
          }}
        >
          <summary>
            <span className="studio-stage-number">01</span>
            <span>
              <strong>Campaña</strong>
              <small>
                {form.existingCampaignId
                  ? "Campaña existente"
                  : "Nombre y objetivo"}
              </small>
            </span>
            <span className="studio-stage-caret">⌄</span>
          </summary>
          <div className="studio-stage-body">
            <label>
              Cantidad de conjuntos de anuncios
              <input
                aria-label="Cantidad de conjuntos de anuncios"
                type="number"
                min="1"
                max="10"
                disabled={
                  !!form.existingAdsetId || !!form.existingAdsetIds?.length
                }
                value={form.audiences.length}
                onChange={(e) =>
                  changeAudienceCount(Number(e.target.value) || 1)
                }
              />
            </label>

            <label>
              Nombre de campaña
              <input
                aria-label="Nombre de campaña"
                value={
                  form.existingCampaignId
                    ? (selectedCampaign?.name ?? form.campaignName)
                    : (form.campaignName ?? "{pais} · {diplomado}")
                }
                disabled={!!form.existingCampaignId}
                maxLength={250}
                onChange={(e) => update("campaignName", e.target.value)}
              />
              <small>Variables: [pais] · [diplomado]</small>
            </label>
            <label>
              Objetivo de campaña
              <select
                aria-label="Objetivo de campaña"
                disabled={
                  !!form.existingCampaignId &&
                  (selectedCampaign?.objective !== "OUTCOME_LEADS" ||
                    !!form.existingAdsetId ||
                    !!form.existingAdsetIds?.length)
                }
                value={form.objective}
                onChange={(e) =>
                  applyConfig({
                    objective: e.target.value as CampaignConfig["objective"],
                    conversation: ["WHATSAPP", "LEADS_WHATSAPP"].includes(
                      e.target.value,
                    )
                      ? form.conversation
                      : undefined,
                  })
                }
              >
                <option value="WHATSAPP">Conversaciones por WhatsApp</option>
                <option value="LEADS_WHATSAPP">
                  Clientes potenciales · WhatsApp
                </option>
                <option value="LEADS">Clientes potenciales · formulario</option>
                <option value="TRAFFIC">Visitas a tu página web</option>
              </select>
            </label>
            {form.objective === "TRAFFIC" && (
              <label>
                Página web de destino
                <input
                  aria-label="Página web de destino"
                  type="url"
                  placeholder="https://…"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                />
              </label>
            )}
            {form.objective === "LEADS" && (
              <label>
                Formulario de esta página
                <select
                  aria-label="Formulario de clientes potenciales"
                  disabled={leadLoading}
                  value={form.leadFormId}
                  onChange={(e) => update("leadFormId", e.target.value)}
                >
                  <option value="">
                    {leadLoading
                      ? "Consultando formularios…"
                      : "Selecciona un formulario activo"}
                  </option>
                  {leadForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {leadError && <small role="status">{leadError}</small>}
              </label>
            )}
          </div>
        </details>
        <details
          className="studio-campaign-stage stage-placements"
          data-campaign-field="placements"
          hidden={campaignConfiguration.collapsed}
          ref={(el) => {
            stages.current.placements = el;
          }}
        >
          <summary>
            <span className="studio-stage-number">02</span>
            <span>
              <strong>Plataformas y ubicaciones</strong>
              <small>General para los nuevos anuncios</small>
            </span>
            <span className="studio-stage-caret">⌄</span>
          </summary>
          <div className="studio-stage-body">
            {selectedAdsets.length ? (
              <div className="studio-existing-placements">
                {selectedAdsets.map((s) => (
                  <div key={s.id}>
                    <strong>{s.name}</strong>
                    <small>
                      {(s.targeting?.publisher_platforms ?? []).join(" · ") ||
                        "Ubicaciones configuradas en Meta"}
                    </small>
                    <small>
                      Se conservan las ubicaciones de este conjunto.
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <StudioCampaignPlacements
                value={form}
                onChange={applyConfig}
                readonly={
                  !!form.existingAdsetId || !!form.existingAdsetIds?.length
                }
              />
            )}
          </div>
        </details>
        <NamedConfigurationSave model={campaignConfiguration} />
        <section
          className="studio-campaign-method"
          data-campaign-field="ai"
          aria-label="Método de preparación"
        >
          <div
            className="studio-campaign-modes"
            role="group"
            aria-label="Preparación de campaña"
          >
            <button
              type="button"
              aria-pressed={mode === "TRADITIONAL"}
              onClick={() => setMode("TRADITIONAL")}
            >
              Tradicional
            </button>
            <button
              type="button"
              aria-pressed={mode === "AI"}
              onClick={() => setMode("AI")}
            >
              Con IA
            </button>
          </div>
          {mode === "AI" && (
            <section className="studio-campaign-ai">
              <div className="studio-ai-fields">
                <strong>¿Qué completará la IA?</strong>
                <label className="studio-check">
                  <input
                    aria-label="IA para públicos"
                    type="checkbox"
                    checked={
                      !!aiFields.audiences &&
                      !form.existingAdsetId &&
                      !form.existingAdsetIds?.length
                    }
                    disabled={
                      !!form.existingAdsetId || !!form.existingAdsetIds?.length
                    }
                    onChange={(e) => {
                      setAiRequest(null);
                      setAiNotice("");
                      setAiFields((f: any) => ({
                        ...f,
                        audiences: e.target.checked,
                      }));
                    }}
                  />
                  Públicos
                </label>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={aiFields.description}
                    onChange={(e) => {
                      setAiRequest(null);
                      setAiNotice("");
                      setAiFields((f: any) => ({
                        ...f,
                        description: e.target.checked,
                      }));
                    }}
                  />
                  Descripción
                </label>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={aiFields.body}
                    onChange={(e) => {
                      setAiRequest(null);
                      setAiNotice("");
                      setAiFields((f: any) => ({
                        ...f,
                        body: e.target.checked,
                      }));
                    }}
                  />
                  Texto principal
                </label>
                <label className="studio-check">
                  <input
                    aria-label="IA para headline"
                    type="checkbox"
                    checked={!!aiFields.headline}
                    onChange={(e) => {
                      setAiRequest(null);
                      setAiNotice("");
                      setAiFields((f: any) => ({
                        ...f,
                        headline: e.target.checked,
                      }));
                    }}
                  />
                  Headline
                </label>
                <label className="studio-check">
                  <input
                    aria-label="IA para plantilla de mensaje"
                    type="checkbox"
                    checked={
                      !!aiFields.conversation &&
                      ["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective)
                    }
                    disabled={
                      !["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective)
                    }
                    onChange={(e) => {
                      setAiRequest(null);
                      setAiNotice("");
                      setAiFields((f: any) => ({
                        ...f,
                        conversation: e.target.checked,
                      }));
                    }}
                  />
                  Plantilla de mensaje <small>(se creará nueva)</small>
                </label>
              </div>
              <label>
                Instrucciones para la IA
                <textarea
                  aria-label="Prompt de campaña IA"
                  value={aiPrompt}
                  rows={3}
                  maxLength={12000}
                  placeholder="Enfoque del público, profesión o beneficios comprobables…"
                  onChange={(e) => {
                    setAiPrompt(e.target.value);
                    setAiRequest(null);
                    setAiProposal(null);
                  }}
                />
              </label>
              <small>La IA completará solo los campos marcados.</small>
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                Autorizo esta consulta de IA y su posible cargo.
              </label>
              <button
                type="button"
                className="studio-ai-generate"
                disabled={locked || !aiConsent || !items.length}
                onClick={() => void suggest()}
              >
                {aiBusy ? "Completando con IA…" : "✦ Completar campos con IA"}
              </button>
              {aiNotice && <small role="status">{aiNotice}</small>}
            </section>
          )}
        </section>
        <details
          className="studio-campaign-stage stage-audiences"
          data-campaign-field="audiences"
          ref={(el) => {
            stages.current.audiences = el;
          }}
        >
          <summary>
            <span className="studio-stage-number">03</span>
            <span>
              <strong>Públicos</strong>
              <small>
                {form.audiences.length}{" "}
                {form.existingAdsetId || form.existingAdsetIds?.length
                  ? "existentes, sin cambios"
                  : "por configurar · manual o IA"}
              </small>
            </span>
            <span className="studio-stage-caret">⌄</span>
          </summary>
          <div className="studio-stage-body">
            {form.existingCampaignId && (
              <StudioCampaignParentPicker
                kind="adsets"
                accountId={form.accountId}
                campaignId={form.existingCampaignId}
                selected={selectedAdsets}
                disabled={locked}
                onSelect={chooseAdsets}
                onCreate={() => {
                  setSelectedAdsets([]);
                  applyConfig({
                    existingAdsetId: undefined,
                    existingAdsetIds: undefined,
                    distribution: {},
                  });
                }}
              />
            )}

            <section className="studio-adset-distribution">
              <strong>Anuncios por público</strong>
              <small>
                {items.reduce((n, i) => n + i.variationIds.length, 0)} afiches
                elegidos · reparto editable, sin duplicar imágenes.
              </small>
              {items.map((item) => {
                let counts: number[] = [];
                try {
                  counts = imageDistribution(item, form);
                } catch {
                  counts = form.distribution?.[item.subproductId] ?? [];
                }
                return (
                  <div
                    key={item.subproductId}
                    className="studio-distribution-item"
                  >
                    <strong>
                      {item.name} · {item.variationIds.length} afiches
                    </strong>
                    <label>
                      Reparto
                      <select
                        aria-label={"Distribución de anuncios · " + item.name}
                        value={
                          form.distribution?.[item.subproductId]
                            ? "custom"
                            : "equal"
                        }
                        onChange={(e) => {
                          const d = { ...form.distribution };
                          if (e.target.value === "equal")
                            delete d[item.subproductId];
                          else d[item.subproductId] = counts;
                          update("distribution", d);
                        }}
                      >
                        <option value="equal">Equitativo</option>
                        <option value="custom">Personalizado</option>
                      </select>
                    </label>
                    {!counts.length ? (
                      <small role="status">
                        Selecciona al menos {form.audiences.length} afiches o
                        reduce los conjuntos.
                      </small>
                    ) : (
                      <>
                        <div className="studio-distribution-counts">
                          {counts.map((n, i) => (
                            <label key={i}>
                              Público {i + 1}
                              <input
                                type="number"
                                min="1"
                                max="50"
                                aria-label={
                                  item.name +
                                  " · afiches del conjunto " +
                                  (i + 1)
                                }
                                value={
                                  form.distribution?.[item.subproductId]?.[i] ??
                                  n
                                }
                                onChange={(e) =>
                                  update("distribution", {
                                    ...form.distribution,
                                    [item.subproductId]: counts.map((x, j) =>
                                      j === i ? Number(e.target.value) : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <small role="status">
                          {counts.join(" + ")} ={" "}
                          {counts.reduce((a, b) => a + b, 0)} /{" "}
                          {item.variationIds.length} anuncios
                          {counts.some((n) => n < 1) ||
                          counts.reduce((a, b) => a + b, 0) !==
                            item.variationIds.length
                            ? " · Ajusta la suma para incluir todos los afiches."
                            : ""}
                        </small>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const d = { ...form.distribution };
                        delete d[item.subproductId];
                        update("distribution", d);
                      }}
                    >
                      Repartir equitativamente
                    </button>
                  </div>
                );
              })}
            </section>

            {(mode === "TRADITIONAL" || !aiFields.audiences) && (
              <div className="studio-audience-grid">
                {form.audiences.map((a, i) => (
                  <StudioCampaignAudience
                    key={
                      (form.existingAdsetIds?.[i] ??
                        form.existingAdsetId ??
                        "new") +
                      ":" +
                      i
                    }
                    index={i}
                    value={a}
                    config={form}
                    categoryId={categoryId}
                    accountId={form.accountId}
                    existing={
                      !!form.existingAdsetId || !!form.existingAdsetIds?.length
                    }
                    onChange={(value) =>
                      update(
                        "audiences",
                        form.audiences.map((a, j) => (i === j ? value : a)),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </details>

        <NamedConfigurationPicker model={adConfiguration} />
        <details
          className="studio-campaign-stage stage-ads"
          data-campaign-field="ads"
          hidden={adConfiguration.collapsed}
          ref={(el) => {
            stages.current.ads = el;
          }}
        >
          <summary>
            <span className="studio-stage-number">04</span>
            <span>
              <strong>Anuncios y conversación</strong>
              <small>
                {items.reduce((n, i) => n + i.variationIds.length, 0)} afiches ·
                textos comunes
              </small>
            </span>
            <span className="studio-stage-caret">⌄</span>
          </summary>
          <div className="studio-stage-body">
            <label className="studio-check studio-multi-advertiser">
              <input
                aria-label="Multianunciante"
                type="checkbox"
                checked={!!form.multiAdvertiser}
                onChange={(e) => update("multiAdvertiser", e.target.checked)}
              />
              Multianunciante
            </label>
            {!(mode === "AI" && aiFields.body) && (
              <>
                {" "}
                <label>
                  Texto principal
                  <textarea
                    aria-label="Texto principal"
                    value={form.body}
                    maxLength={5000}
                    rows={4}
                    onChange={(e) => update("body", e.target.value)}
                  />
                </label>
              </>
            )}
            {!(mode === "AI" && aiFields.headline) && (
              <>
                {" "}
                <div className="studio-field-pair">
                  <label>
                    Headline
                    <input
                      aria-label="Headline del anuncio"
                      value={form.headline}
                      onChange={(e) => update("headline", e.target.value)}
                    />
                  </label>
                </div>
                <small className="studio-template-help">
                  {"{diplomado} · {pais}"}
                </small>
              </>
            )}
            {!(mode === "AI" && aiFields.description) && (
              <>
                {" "}
                <label>
                  Descripción
                  <textarea
                    aria-label="Descripción del anuncio"
                    value={form.description}
                    rows={2}
                    maxLength={500}
                    onChange={(e) => update("description", e.target.value)}
                  />
                </label>
              </>
            )}
            {["WHATSAPP", "LEADS_WHATSAPP"].includes(form.objective) &&
              !(mode === "AI" && aiFields.conversation) && (
                <StudioConversationEditor
                  categoryId={categoryId}
                  value={form.conversation}
                  onChange={(value) => update("conversation", value)}
                  store={presets}
                  disabled={locked}
                />
              )}
            <NamedConfigurationSave model={adConfiguration} />
          </div>
        </details>
        <details className="studio-legal-options" data-campaign-field="legal">
          <summary>Configuración legal</summary>
          <label>
            Categoría publicitaria
            <select
              aria-label="Categoría publicitaria"
              value={form.specialCategory}
              disabled={!!form.existingCampaignId}
              onChange={(e) => update("specialCategory", e.target.value)}
            >
              <option value="NONE">Ninguna categoría especial</option>
              <option value="EMPLOYMENT">Empleo</option>
              <option value="HOUSING">Vivienda</option>
              <option value="FINANCIAL_PRODUCTS_SERVICES">
                Servicios financieros
              </option>
            </select>
          </label>
          {requiresMetaPayer(country) && (
            <>
              <label>
                Beneficiario
                <input
                  aria-label="Beneficiario"
                  value={form.beneficiary}
                  onChange={(e) => update("beneficiary", e.target.value)}
                />
              </label>
              <label>
                Pagador
                <input
                  aria-label="Pagador"
                  value={form.payor}
                  onChange={(e) => update("payor", e.target.value)}
                />
              </label>
            </>
          )}
        </details>
        <label className="studio-publish-state">
          Al publicar
          <select
            aria-label="Estado de publicación"
            value={form.targetStatus}
            onChange={(e) => update("targetStatus", e.target.value)}
          >
            <option value="PAUSED">Crear pausadas para revisar</option>
            <option value="ACTIVE">Activar y enviar a revisión de Meta</option>
          </select>
        </label>
      </fieldset>
      {error && (
        <div
          ref={validationSummary}
          className="notice error studio-validation-summary"
          role="alert"
          tabIndex={-1}
        >
          <strong>{error}</strong>
          {fieldProblems.length > 0 && (
            <ul>
              {fieldProblems.map((problem, index) => (
                <li key={problem.field + index} id={`campaign-issue-${index}`}>
                  <button type="button" onClick={() => goToProblem(problem)}>
                    <strong>{campaignProblemLabel(problem)}</strong>:{" "}
                    {campaignProblemMessage(problem)}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {draft && (
        <div
          className={
            "studio-publish-progress " +
            (draft.waiting || draft.canResumeWait || draft.canResumeVerification
              ? "waiting"
              : draft.status.toLowerCase())
          }
          role="status"
        >
          <strong>
            {retrying
              ? "Reintentando publicación…"
              : draft.canResumeVerification
                ? "Verificación pendiente"
                : draft.waiting || draft.canResumeWait
                  ? "En espera de turno"
                  : (
                      {
                        DRAFT: "Borrador guardado",
                        PUBLISHING: "Publicando en Meta…",
                        PUBLISHED: "✓ Publicación confirmada por Meta",
                        NEEDS_REVIEW: "Intento incompleto",
                      } as any
                    )[draft.status]}
          </strong>
          {(retrying || draft.status === "PUBLISHING") && (
            <progress
              aria-label="Avance de publicación"
              max={draft.total}
              value={draft.completed}
            />
          )}
          <small>{publishPercent} % confirmado</small>
          {draft.waiting && (
            <p>
              {draft.waitReason === "processing"
                ? "Meta está procesando el video. Continuará al confirmarse, sin volver a subirlo."
                : "El avance está guardado. Continuará automáticamente después de la espera, sin repetir los pasos confirmados."}
            </p>
          )}
          {!retrying &&
            draft.status !== "PUBLISHING" &&
            (draft.canResumeWait || draft.canResumeVerification || halted) && (
              <>
                <p>
                  Se conserva la configuración y el avance confirmado al
                  reintentar.
                </p>
                <button
                  type="button"
                  disabled={busy || aiBusy}
                  onClick={() => void retryPublication()}
                >
                  Reintentar
                </button>
              </>
            )}
          {draft.error &&
            !draft.canResumeWait &&
            !draft.canResumeVerification && (
              <details>
                <summary>Ver motivo del intento</summary>
                <p>{draft.error}</p>
              </details>
            )}
          {!retrying && (draft.status !== "PUBLISHING" || halted) && (
            <div className="studio-campaign-recovery">
              <button
                type="button"
                disabled={leavingBlocked}
                onClick={closeNotice}
              >
                Cerrar aviso
              </button>
              <button
                type="button"
                disabled={leavingBlocked}
                onClick={() => newCampaign()}
              >
                Nueva campaña
              </button>
            </div>
          )}
          {draft.status === "NEEDS_REVIEW" &&
            !draft.canResumeWait &&
            /permis|permission|token|authorization|autorizaci[oó]n/i.test(
              draft.error ?? "",
            ) &&
            resources.canAuthorizePages && (
              <button
                type="button"
                disabled={locked}
                onClick={() => void authorizePageAccess()}
              >
                Autorizar página y anuncios
              </button>
            )}

          {draft.createdCampaigns.map((c: any) => (
            <a
              key={c.id}
              target="_blank"
              rel="noopener noreferrer"
              href={
                "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=" +
                form.accountId +
                "&selected_campaign_ids=" +
                c.id
              }
            >
              {c.name} ↗
            </a>
          ))}
          {!retrying && halted && draft.status === "PUBLISHING" && (
            <button
              type="button"
              disabled={busy || aiBusy}
              onClick={() => void retryPublication()}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
      <footer className="studio-campaign-footer">
        <button
          type="button"
          disabled={locked || !items.length || !form.accountId || !country}
          onClick={() => void prepare(false)}
        >
          Guardar borrador
        </button>
        <button
          type="button"
          className="studio-publish-button"
          aria-busy={publishing}
          disabled={locked || !items.length || !form.accountId || !country}
          onClick={() => void prepare(true)}
        >
          {publishing && (
            <span className="studio-publish-spinner" aria-hidden="true" />
          )}
          {publishing
            ? `Publicando… ${publishPercent}%`
            : "↗ Revisar y publicar"}
        </button>
        <small>
          {summary.campaigns} campaña{summary.campaigns !== 1 ? "s" : ""} ·{" "}
          {summary.adsets} conjuntos · {summary.ads} anuncios
        </small>
      </footer>
      <StudioRestore pane="campaign" />
      {review && draft && (
        <dialog
          ref={dialog}
          className="studio-publish-dialog"
          onCancel={(e) => {
            e.preventDefault();
            if (!busy) setReview(false);
          }}
        >
          <header>
            <div>
              <span className="studio-eyebrow">
                TODO LISTO PARA TU REVISIÓN
              </span>
              <h2>
                {draft.summary.campaigns} campañas ·{" "}
                {draft.config.objective === "LEADS"
                  ? "Clientes potenciales"
                  : draft.config.objective === "TRAFFIC"
                    ? "Visitas web"
                    : "WhatsApp"}
              </h2>
            </div>
            <button
              type="button"
              className="ui-close-button"
              aria-label="Cerrar revisión de campaña"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              ×
            </button>
          </header>
          <div className="studio-review-budget">
            <span>
              {account?.name} · {countryName(draft.config.country)}
            </span>
            <strong>
              {draft.config.existingCampaignId
                ? "Se conserva el presupuesto existente"
                : money(draft.summary.dailyTotal) + " / día"}
            </strong>
            <small>
              {draft.config.existingCampaignId
                ? draft.config.adsetDailyBudget
                  ? money(draft.config.adsetDailyBudget) +
                    " por conjunto nuevo · "
                  : ""
                : money(draft.config.dailyBudget) + " por campaña · "}
              {draft.summary.adsets} conjuntos · {draft.summary.ads} anuncios
            </small>
          </div>
          <p>
            Ubicaciones:{" "}
            {(draft.config.platforms ?? ["facebook", "instagram"]).join(" · ")}
          </p>
          <details className="studio-review-audiences">
            <summary>Públicos · {draft.config.audiences.length}</summary>
            {draft.config.audiences.map((a: any, index: number) => (
              <p key={index}>
                <strong>{a.name}</strong>
                {draft.config.existingAdsetId ||
                draft.config.existingAdsetIds?.length
                  ? " · Se conserva la segmentación existente"
                  : (a.savedAudienceId
                      ? " · Edades del público guardado · "
                      : ` · ${a.ageMin}–${a.ageMax}${(a.advantageAudience ?? !a.strictAge) ? " · Edades sugeridas (Advantage+)" : " · Rango de edad obligatorio"} · `) +
                    [...(a.interests ?? []), ...(a.detailedTargeting ?? [])]
                      .map((v: any) => v.name)
                      .join(" · ")}
              </p>
            ))}
          </details>
          {draft.items.map((i: CampaignItem) => (
            <section key={i.subproductId} className="studio-ad-preview">
              <div className="studio-preview-thumbs">
                {i.variationIds.map((id) => (
                  <img
                    key={id}
                    loading="lazy"
                    src={"/api/variations/" + id + "?thumbnail=true"}
                    alt={"Afiche de " + i.name}
                  />
                ))}
              </div>
              <h3>{i.name}</h3>
              <p>{campaignText(draft.config.body, i, draft.config)}</p>
              <strong>
                {campaignText(draft.config.headline, i, draft.config)}
              </strong>
              {draft.config.description && (
                <p>{campaignText(draft.config.description, i, draft.config)}</p>
              )}
              {draft.config.conversation && (
                <div className="studio-conversation-preview">
                  <span>
                    {campaignText(
                      draft.config.conversation.greeting,
                      i,
                      draft.config,
                    )}
                  </span>
                  <span>
                    {campaignText(
                      draft.config.conversation.autofill,
                      i,
                      draft.config,
                    )}
                  </span>
                </div>
              )}
              {(!draft.config.objective ||
                ["WHATSAPP", "LEADS_WHATSAPP"].includes(
                  draft.config.objective,
                )) && (
                <small>
                  WhatsApp:{" "}
                  {draft.config.whatsapp ||
                    "Predeterminado de la página en Meta"}
                </small>
              )}
              {draft.config.objective === "TRAFFIC" && (
                <small>Destino: {draft.config.website}</small>
              )}
              {draft.config.objective === "LEADS" && (
                <small>Formulario: {draft.config.leadFormId}</small>
              )}
              {draft.config.planVersion === 2 && (
                <small>
                  Afiches por conjunto:{" "}
                  {imageDistribution(i, draft.config).join(" + ")}
                </small>
              )}
            </section>
          ))}
          <p>
            {draft.config.targetStatus === "ACTIVE"
              ? "Meta recibirá las campañas activas para su revisión y podrá gastar el presupuesto indicado."
              : "Las campañas se crearán pausadas, sin activar la entrega."}
          </p>
          {draft.config.targetStatus === "ACTIVE" && (
            <label className="studio-check">
              <input
                type="checkbox"
                checked={spend}
                onChange={(e) => setSpend(e.target.checked)}
              />
              Autorizo publicar activas con este presupuesto diario.
            </label>
          )}
          <footer>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Volver a editar
            </button>
            <button
              type="button"
              className="studio-publish-button"
              disabled={
                busy || (draft.config.targetStatus === "ACTIVE" && !spend)
              }
              onClick={() => void publish()}
            >
              {busy ? "Confirmando…" : "Publicar en Meta"}
            </button>
          </footer>
        </dialog>
      )}
    </aside>
  );
}
