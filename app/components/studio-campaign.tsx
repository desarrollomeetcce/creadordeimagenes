"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { createAiPausedCampaigns } from "../../lib/creative-studio/ai-campaign-flow";
import { CurrentUserId } from "./role-guide";
import { metaPageWhatsAppNumber } from "../../lib/creative-studio/page-whatsapp";
import { StudioPagePicker } from "./studio-page-picker";
import { StudioMaximize } from "./studio-columns";
import { studioRequest } from "./inventory-meta-picker";
import {
  campaignText,
  imageDistribution,
  launchSummary,
  type CampaignConfig,
  type CampaignItem,
} from "../../lib/creative-studio/campaign-policy";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
const initial: CampaignConfig = {
  planVersion: 2,
  campaignName: "{pais} · {diplomado}",
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
}: {
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
  const [mode, setMode] = useState<"TRADITIONAL" | "AI">("TRADITIONAL"),
    [aiPrompt, setAiPrompt] = useState(""),
    [aiConsent, setAiConsent] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [aiRequest, setAiRequest] = useState<string | null>(null),
    [aiProposal, setAiProposal] = useState<any>(null);
  const aiPending = useRef(false);
  const [leadForms, setLeadForms] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [leadError, setLeadError] = useState(""),
    [leadLoading, setLeadLoading] = useState(false);
  const [variableKey, setVariableKey] = useState(""),
    [variableValue, setVariableValue] = useState("");
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
      country,
    })),
    [resources, setResources] = useState<any>({ pages: [], audiences: [] }),
    [loading, setLoading] = useState(false),
    [pageError, setPageError] = useState(""),
    [resourceReload, setResourceReload] = useState(0),
    [pageRetryAt, setPageRetryAt] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [review, setReview] = useState(false),
    [spend, setSpend] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [halted, setHalted] = useState(false);
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
  const aiContext = useRef("");
  aiContext.current = JSON.stringify({
    categoryId,
    country,
    items: items.map((i) => ({ id: i.subproductId, images: i.variationIds })),
    form: { ...form, whatsapp: "" },
  });
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
    if (!latestLaunchId) return;
    const controller = new AbortController();
    void studioRequest(
      "/launches/" + latestLaunchId,
      "GET",
      undefined,
      controller.signal,
    )
      .then((d) => {
        setDraft(d);
        setForm(onlyConfig(d.config));
        restore.current(d.items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [latestLaunchId]);
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
    if (!advanced || !form.accountId || audiencesFor === form.accountId) return;
    const controller = new AbortController();
    setAudienceLoading(true);
    void studioRequest(
      "/account-resources/" + form.accountId + "?part=audiences",
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (controller.signal.aborted) return;
        setResources((current: any) => ({
          ...current,
          audiences: r.audiences,
          audienceWarning: r.audienceWarning,
        }));
        setAudiencesFor(form.accountId);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResources((current: any) => ({
            ...current,
            audienceWarning: "No se pudieron consultar los públicos guardados.",
          }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAudienceLoading(false);
      });
    return () => controller.abort();
  }, [advanced, form.accountId, audiencesFor]);
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
            next.completed > draft.completed ? 300 : 1500,
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
    timer = setTimeout(step, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draft?.id, draft?.status, halted]);
  const locked = busy || aiBusy || draft?.status === "PUBLISHING",
    account = accounts.find((a) => a.id === form.accountId),
    summary = launchSummary(items, { ...form, planVersion: 2 }),
    currency = account?.currency ?? draft?.config.currency ?? "",
    money = (n: number) =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: currency || "USD",
      }).format(n);
  function update(key: keyof CampaignConfig, value: unknown) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "accountId"
        ? { pageId: "", whatsapp: "", leadFormId: "" }
        : {}),
      ...(key === "pageId" ? { leadFormId: "" } : {}),
      ...(key === "specialCategory" && value !== "NONE"
        ? {
            audiences: f.audiences.map((a) => ({
              ...a,
              ageMin: 18,
              ageMax: 65,
              gender: "ALL" as const,
              strictAge: false,
              savedAudienceId: undefined,
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
      const result = await createAiPausedCampaigns({
        requestId,
        categoryId,
        config: form,
        items,
        prompt: aiPrompt,
        request: studioRequest,
        isCurrent: () => aiContext.current === context,
        proposal: aiProposal,
        onProposal: setAiProposal,
        onPrepared: (d) => setDraft(d),
      });
      setDraft(result);
      setForm(onlyConfig(result.config));
      setHalted(false);
      setReview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la campaña.");
    } finally {
      aiPending.current = false;
      setAiBusy(false);
    }
  }
  async function prepare(open: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await studioRequest("/launches", "POST", {
        requestId: crypto.randomUUID(),
        categoryId,
        config: { ...form, planVersion: 2 },
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
      setError(message);
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
      className="studio-pane studio-campaign"
      aria-label="Preparar y publicar campaña"
    >
      <header className="studio-pane-title">
        <StudioMaximize pane="campaign" label="De afiche a anuncio" />
        <span className="studio-step violet">03</span>
        <div>
          <span className="studio-eyebrow">TU SIGUIENTE CAMPAÑA</span>
          <h2>De afiche a anuncio</h2>
        </div>
        <span className="studio-chip">
          {form.objective === "LEADS"
            ? "Clientes potenciales"
            : form.objective === "TRAFFIC"
              ? "Visitas web"
              : "WhatsApp"}
        </span>
      </header>
      <div className="studio-selected-summary">
        <span className="studio-orbit">↗</span>
        <strong>
          {summary.campaigns || 0} campañas ·{" "}
          {items.reduce((n, i) => n + i.variationIds.length, 0)} afiches
        </strong>
        <small>
          {country ? countryName(country) : "Selecciona el país en el producto"}
        </small>
        {items.length > 0 && (
          <div className="studio-mini-tags">
            {items.map((i) => (
              <span key={i.subproductId}>
                {i.name} <b>{i.variationIds.length}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <fieldset disabled={locked} className="studio-campaign-fields">
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
        {onCountryChange && (
          <label>
            País de destino
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
        <StudioPagePicker
          key={form.accountId}
          pinScope={userId + ":" + form.accountId}
          onRefresh={refreshPages}
          refreshDisabled={!!pageRetryAt}
          pages={resources.accountId === form.accountId ? resources.pages : []}
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
                    En la configuración de Facebook Login para empresas incluye
                    pages_show_list, ads_read y ads_management y permite las
                    páginas que usarás.
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
        <label>
          Objetivo de campaña
          <select
            aria-label="Objetivo de campaña"
            value={form.objective}
            onChange={(e) => update("objective", e.target.value)}
          >
            <option value="WHATSAPP">Conversaciones por WhatsApp</option>
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
        <div className="studio-budget">
          <label>
            Presupuesto diario por campaña <span>{currency}</span>
            <input
              aria-label="Presupuesto diario por campaña"
              type="number"
              min="0.01"
              step="0.01"
              value={form.dailyBudget || ""}
              placeholder="0.00"
              onChange={(e) => update("dailyBudget", Number(e.target.value))}
            />
          </label>
          {summary.campaigns > 0 && form.dailyBudget > 0 && (
            <strong>{money(summary.dailyTotal)} / día en total</strong>
          )}
        </div>
        <label>
          Nombre de campaña
          <input
            aria-label="Nombre de campaña"
            value={form.campaignName ?? "{pais} · {diplomado}"}
            maxLength={250}
            onChange={(e) => update("campaignName", e.target.value)}
          />
          <small>Los conjuntos tomarán este nombre más 1, 2…</small>
        </label>
        <section className="studio-adset-distribution">
          <label>
            Cantidad de conjuntos de anuncios
            <input
              aria-label="Cantidad de conjuntos de anuncios"
              type="number"
              min="1"
              max="10"
              value={form.audiences.length}
              onChange={(e) => {
                const n = Math.max(
                  1,
                  Math.min(10, Number(e.target.value) || 1),
                );
                update(
                  "audiences",
                  Array.from(
                    { length: n },
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
              }}
            />
          </label>
          <small>
            Los afiches se reparten una sola vez. El presupuesto pertenece a la
            campaña.
          </small>
          {items.map((item) => {
            let counts: number[] = [];
            try {
              counts = imageDistribution(item, form);
            } catch {
              counts = form.distribution?.[item.subproductId] ?? [];
            }
            return (
              <div key={item.subproductId} className="studio-distribution-item">
                <strong>
                  {item.name} · {item.variationIds.length} afiches
                </strong>
                {!counts.length ? (
                  <small role="status">
                    Selecciona al menos {form.audiences.length} afiches o reduce
                    los conjuntos.
                  </small>
                ) : (
                  <>
                    <div className="studio-distribution-counts">
                      {counts.map((n, i) => (
                        <label key={i}>
                          Conjunto {i + 1}
                          <input
                            type="number"
                            min="1"
                            max="50"
                            aria-label={
                              item.name + " · afiches del conjunto " + (i + 1)
                            }
                            value={
                              form.distribution?.[item.subproductId]?.[i] ?? n
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
                      {counts.join(" + ")} = {counts.reduce((a, b) => a + b, 0)}{" "}
                      / {item.variationIds.length} anuncios
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
        <small className="studio-template-help">{"{diplomado} · {pais}"}</small>
        <details className="studio-custom-variables">
          <summary>Variables del anuncio</summary>
          <small>
            Se reemplazan en texto, headline y descripción. El nombre del
            inventario se conserva en {"{diplomado}"}.
          </small>
          {Object.entries(form.variables).map(([k, v]) => (
            <div className="studio-variable-row" key={k}>
              <code>{"{" + k + "}"}</code>
              <span>{v}</span>
              <button
                type="button"
                aria-label={"Quitar variable " + k}
                onClick={() => {
                  const next = { ...form.variables };
                  delete next[k];
                  update("variables", next);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <label>
            Nombre de variable
            <input
              aria-label="Nombre de variable"
              value={variableKey}
              placeholder="institucion"
              onChange={(e) => setVariableKey(e.target.value)}
            />
          </label>
          <label>
            Valor
            <input
              aria-label="Valor de variable"
              value={variableValue}
              onChange={(e) => setVariableValue(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={
              !/^[a-z][a-z0-9_]{0,39}$/.test(variableKey) ||
              ["diplomado", "producto", "pais", "codigo"].includes(
                variableKey,
              ) ||
              Object.keys(form.variables).length >= 20
            }
            onClick={() => {
              update("variables", {
                ...form.variables,
                [variableKey]: variableValue,
              });
              setVariableKey("");
              setVariableValue("");
            }}
          >
            Añadir variable
          </button>
        </details>
        <section className="studio-placements">
          <strong>Ubicaciones</strong>
          <small>
            Todas las ubicaciones compatibles de las plataformas que
            selecciones.
          </small>
          <div>
            {(
              [
                ["facebook", "Facebook"],
                ["instagram", "Instagram"],
                ["messenger", "Messenger"],
                ["audience_network", "Audience Network"],
              ] as const
            ).map(([key, name]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={form.platforms.includes(key)}
                  onChange={(e) =>
                    update(
                      "platforms",
                      e.target.checked
                        ? [...form.platforms, key]
                        : form.platforms.filter((p) => p !== key),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
          <small>
            Meta validará la compatibilidad con el objetivo. WhatsApp es el
            destino de conversación, no una ubicación añadida automáticamente.
          </small>
        </section>
        <div
          className="studio-campaign-modes"
          role="group"
          aria-label="Preparación de campaña"
        >
          <button
            type="button"
            aria-pressed={mode === "TRADITIONAL"}
            onClick={() => {
              setMode("TRADITIONAL");
              setAdvanced(true);
            }}
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
            <label>
              Instrucciones para la IA · opcional
              <textarea
                aria-label="Prompt de campaña IA"
                rows={4}
                value={aiPrompt}
                onChange={(e) => {
                  setAiPrompt(e.target.value);
                  setAiRequest(null);
                  setAiProposal(null);
                }}
                placeholder="Indica el enfoque del anuncio y del público…"
              />
            </label>
            <small>
              La IA completa texto, descripción y públicos. Conserva tu
              headline, país, presupuesto y ubicaciones. Las campañas se crean
              pausadas.
            </small>
            <label>
              Descripción opcional
              <textarea
                aria-label="Descripción opcional para IA"
                rows={2}
                maxLength={500}
                value={form.description}
                placeholder="Déjala vacía para que la redacte la IA"
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
            <label className="studio-check">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => setAiConsent(e.target.checked)}
              />
              Autorizo la IA y su posible cargo, y crear estas campañas pausadas
              en Meta.
            </label>
          </section>
        )}
        {mode === "TRADITIONAL" && (
          <>
            <label>
              Texto del anuncio
              <textarea
                aria-label="Texto del anuncio"
                rows={4}
                value={form.body}
                onChange={(e) => update("body", e.target.value)}
              />
            </label>
            <label>
              Descripción
              <textarea
                aria-label="Descripción del anuncio"
                rows={2}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </label>
          </>
        )}
        <button
          className="studio-advanced-trigger"
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          ◈ {mode === "AI" ? "Configuración legal" : "Públicos y configuración"}{" "}
          {advanced ? "−" : "+"}
        </button>
        {advanced && (
          <div className="studio-advanced">
            {mode === "TRADITIONAL" && (
              <>
                <div className="studio-audience-tabs">
                  {form.audiences.map((a, i) => (
                    <section key={i}>
                      <h3>
                        {i + 1}. {a.name}
                      </h3>
                      <label>
                        Nombre
                        <input
                          value={a.name}
                          onChange={(e) =>
                            update(
                              "audiences",
                              form.audiences.map((x, j) =>
                                j === i ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Público guardado{" "}
                        {audienceLoading ? "· consultando…" : ""}
                        {resources.audienceWarning && (
                          <small>{resources.audienceWarning}</small>
                        )}
                        <select
                          value={a.savedAudienceId ?? ""}
                          onChange={(e) =>
                            update(
                              "audiences",
                              form.audiences.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      savedAudienceId:
                                        e.target.value || undefined,
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">Público amplio</option>
                          {resources.audiences.map((x: any) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="studio-field-pair">
                        <label>
                          Edad desde
                          <input
                            type="number"
                            min="18"
                            max="65"
                            value={a.ageMin}
                            onChange={(e) =>
                              update(
                                "audiences",
                                form.audiences.map((x, j) =>
                                  j === i
                                    ? { ...x, ageMin: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Hasta
                          <input
                            type="number"
                            min="18"
                            max="65"
                            value={a.ageMax}
                            onChange={(e) =>
                              update(
                                "audiences",
                                form.audiences.map((x, j) =>
                                  j === i
                                    ? { ...x, ageMax: Number(e.target.value) }
                                    : x,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Género
                        <select
                          value={a.gender}
                          onChange={(e) =>
                            update(
                              "audiences",
                              form.audiences.map((x, j) =>
                                j === i ? { ...x, gender: e.target.value } : x,
                              ),
                            )
                          }
                        >
                          <option value="ALL">Todos</option>
                          <option value="WOMEN">Mujeres</option>
                          <option value="MEN">Hombres</option>
                        </select>
                      </label>
                      <label className="studio-check">
                        <input
                          type="checkbox"
                          checked={a.strictAge}
                          onChange={(e) =>
                            update(
                              "audiences",
                              form.audiences.map((x, j) =>
                                j === i
                                  ? { ...x, strictAge: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        Aplicar edades estrictas
                      </label>
                      {!a.strictAge && (
                        <small>Edades sugeridas · Advantage+ Audience</small>
                      )}
                    </section>
                  ))}
                </div>
                <label>
                  Descripción adicional
                  <input
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Categoría publicitaria
              <select
                value={form.specialCategory}
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
            <label>
              Beneficiario
              <input
                value={form.beneficiary}
                onChange={(e) => update("beneficiary", e.target.value)}
              />
            </label>
            <label>
              Pagador
              <input
                value={form.payor}
                onChange={(e) => update("payor", e.target.value)}
              />
            </label>
          </div>
        )}
        {mode === "AI" ? (
          <p className="hint">Se crearán pausadas, sin activar la entrega.</p>
        ) : (
          <label>
            Al publicar
            <select
              aria-label="Estado de publicación"
              value={form.targetStatus}
              onChange={(e) => update("targetStatus", e.target.value)}
            >
              <option value="PAUSED">Crear pausadas para revisar</option>
              <option value="ACTIVE">
                Activar y enviar a revisión de Meta
              </option>
            </select>
          </label>
        )}
      </fieldset>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div
          className={"studio-publish-progress " + draft.status.toLowerCase()}
          role="status"
        >
          <strong>
            {
              (
                {
                  DRAFT: "Borrador guardado",
                  PUBLISHING: "Publicando en Meta…",
                  PUBLISHED: "✓ Publicación confirmada por Meta",
                  NEEDS_REVIEW: "Requiere revisión",
                } as any
              )[draft.status]
            }
          </strong>
          {draft.status === "PUBLISHING" && (
            <progress max={draft.total} value={draft.completed} />
          )}
          <small>
            {Math.round((100 * draft.completed) / Math.max(1, draft.total))} %
            confirmado
          </small>
          {draft.error && <p>{draft.error}</p>}
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
          {halted && (
            <button
              type="button"
              onClick={() =>
                void studioRequest("/launches/" + draft.id)
                  .then((d) => {
                    setDraft(d);
                    setHalted(false);
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Consultar estado y continuar pendientes
            </button>
          )}
        </div>
      )}
      <footer className="studio-campaign-footer">
        {mode === "AI" ? (
          <button
            type="button"
            className="studio-publish-button"
            disabled={locked || !aiConsent || !items.length}
            onClick={() => void suggest()}
          >
            {aiBusy
              ? "Preparando campañas con IA…"
              : "Crear campañas pausadas con IA"}
          </button>
        ) : (
          <>
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
              disabled={locked || !items.length || !form.accountId || !country}
              onClick={() => void prepare(true)}
            >
              ↗ Revisar y publicar
            </button>
          </>
        )}
        <small>
          {summary.adsets} conjuntos · {summary.ads} anuncios
        </small>
      </footer>
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
            <strong>{money(draft.summary.dailyTotal)} / día</strong>
            <small>
              {money(draft.config.dailyBudget)} por campaña ·{" "}
              {draft.summary.adsets} conjuntos · {draft.summary.ads} anuncios
            </small>
          </div>
          <p>
            Ubicaciones:{" "}
            {(draft.config.platforms ?? ["facebook", "instagram"]).join(" · ")}
          </p>
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
              {(!draft.config.objective ||
                draft.config.objective === "WHATSAPP") && (
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
