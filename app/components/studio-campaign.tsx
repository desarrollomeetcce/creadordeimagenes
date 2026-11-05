"use client";
import { useEffect, useRef, useState } from "react";
import { studioRequest } from "./inventory-meta-picker";
import {
  campaignText,
  launchSummary,
  type CampaignConfig,
  type CampaignItem,
} from "../../lib/creative-studio/campaign-policy";
import { countryName } from "../../lib/meta-ads/countries";
const initial: CampaignConfig = {
  accountId: "",
  pageId: "",
  country: "",
  whatsapp: "",
  dailyBudget: 0,
  body: "Solicita información sobre el diplomado en {diplomado}.",
  headline: "{diplomado} · {codigo}",
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
}: {
  categoryId: string;
  country: string;
  accounts: any[];
  items: CampaignItem[];
  template?: any;
  latestLaunchId?: string | null;
  onRestore: (items: CampaignItem[]) => void;
}) {
  const [form, setForm] = useState<CampaignConfig>(() => ({
      ...initial,
      ...onlyConfig(template ?? initial),
      country,
    })),
    [resources, setResources] = useState<any>({ pages: [], audiences: [] }),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [review, setReview] = useState(false),
    [spend, setSpend] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [halted, setHalted] = useState(false);
  const lastCountry = useRef(country);
  const pending = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    resourceCache = useRef(new Map<string, any>()),
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
    const cached = resourceCache.current.get(form.accountId);
    if (cached) {
      setResources(cached);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setResources({ pages: [], audiences: [] });
    void studioRequest(
      "/account-resources/" + form.accountId,
      "GET",
      undefined,
      controller.signal,
    )
      .then((r) => {
        resourceCache.current.set(form.accountId, r);
        setResources(r);
        if (r.pages.length === 1)
          setForm((f) => ({
            ...f,
            pageId: r.pages[0].id,
            whatsapp: f.whatsapp || r.pages[0].whatsapp,
          }));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [form.accountId]);
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
  const locked = busy || draft?.status === "PUBLISHING",
    account = accounts.find((a) => a.id === form.accountId),
    summary = launchSummary(items, form),
    currency = account?.currency ?? draft?.config.currency ?? "",
    money = (n: number) =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: currency || "USD",
      }).format(n);
  function update(key: keyof CampaignConfig, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
    if (draft?.status === "DRAFT") setDraft(null);
    setSpend(false);
    setError("");
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
        config: form,
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
        <span className="studio-step violet">03</span>
        <div>
          <span className="studio-eyebrow">TU SIGUIENTE CAMPAÑA</span>
          <h2>De afiche a anuncio</h2>
        </div>
        <span className="studio-chip">WhatsApp</span>
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
        {!accounts.length && (
          <p className="hint">
            Marca tus cuentas principales en{" "}
            <a href="?view=metaads">Meta Ads</a> para usarlas aquí.
          </p>
        )}
        <label>
          Página de Facebook
          <select
            aria-label="Página de Facebook"
            value={form.pageId}
            disabled={!form.accountId || loading || locked}
            onChange={(e) => {
              update("pageId", e.target.value);
              const p = resources.pages.find(
                (p: any) => p.id === e.target.value,
              );
              if (p?.whatsapp) setForm((f) => ({ ...f, whatsapp: p.whatsapp }));
            }}
          >
            <option value="">
              {loading ? "Consultando páginas…" : "Selecciona la página"}
            </option>
            {resources.pages.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          WhatsApp vinculado a la página
          <input
            aria-label="WhatsApp de campaña"
            placeholder="+51 999 999 999"
            type="tel"
            value={form.whatsapp}
            onChange={(e) =>
              update("whatsapp", e.target.value.replace(/[ ()-]/g, ""))
            }
          />
        </label>
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
          Texto del anuncio
          <textarea
            aria-label="Texto del anuncio"
            rows={4}
            value={form.body}
            onChange={(e) => update("body", e.target.value)}
          />
        </label>
        <div className="studio-field-pair">
          <label>
            Código del país
            <input
              aria-label="Código de campaña"
              placeholder="Ej. ACERO UR"
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
            />
          </label>
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
          {"{diplomado} · {pais} · {codigo}"}
        </small>
        <button
          className="studio-advanced-trigger"
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          ◈ Públicos y configuración {advanced ? "−" : "+"}
        </button>
        {advanced && (
          <div className="studio-advanced">
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
                    Público guardado
                    <select
                      value={a.savedAudienceId ?? ""}
                      onChange={(e) =>
                        update(
                          "audiences",
                          form.audiences.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  savedAudienceId: e.target.value || undefined,
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
                            j === i ? { ...x, strictAge: e.target.checked } : x,
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
        <label>
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
              <h2>{draft.summary.campaigns} campañas a WhatsApp</h2>
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
              <small>WhatsApp: {draft.config.whatsapp}</small>
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
