"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioColumns, StudioMaximize } from "./studio-columns";
import { SearchSelect } from "./search-select";
import { studioRequest } from "./inventory-meta-picker";
import { StudioCampaign } from "./studio-campaign";
import {
  ProductionControls,
  useProductionController,
} from "./production-controls";
import { orderRequest } from "./order-progress";
import { ImagePreviewModal } from "./image-preview-modal";
import { countryName } from "../../lib/meta-ads/countries";
import type { CampaignItem } from "../../lib/creative-studio/campaign-policy";
import "./studio-workspace.css";
const Attachments = dynamic(() =>
  import("./attachments").then((m) => m.Attachments),
);
const InventoryGroupEditor = dynamic(() =>
  import("./inventory-group-editor").then((m) => m.InventoryGroupEditor),
);
const modes = [
  { id: "Imagen + Texto", label: "Imagen + texto" },
  { id: "Texto", label: "Texto y logos" },
  { id: "Imagen", label: "Solo imagen" },
];
const baseSettings = {
  format: "1:1",
  count: 3,
  mode: "Imagen + Texto",
  previewFirst: true,
  quality: "",
  resolution: "",
};
export function CreativeStudio({ userId }: { userId: string }) {
  const [context, setContext] = useState<any>(null),
    [project, setProject] = useState<any>(null),
    [product, setProduct] = useState<any>(null),
    [projectQuery, setProjectQuery] = useState(""),
    [productQuery, setProductQuery] = useState(""),
    [country, setCountry] = useState(""),
    [projectPrompt, setProjectPrompt] = useState(""),
    [settings, setSettings] = useState<any>(baseSettings),
    [activeSub, setActiveSub] = useState(""),
    [prompts, setPrompts] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Record<string, string[]>>({}),
    [targetSubs, setTargetSubs] = useState<string[]>([]),
    [gallery, setGallery] = useState<any>({ items: [], total: 0, pages: 1 }),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [zone, setZone] = useState("canvas"),
    [inventoryId, setInventoryId] = useState(""),
    [picker, setPicker] = useState<any>(null),
    [pendingSelection, setPendingSelection] = useState<any>(null),
    [manualName, setManualName] = useState(""),
    [web, setWeb] = useState(""),
    [referencesOpen, setReferencesOpen] = useState(false),
    [attachmentsRevision, setAttachmentsRevision] = useState(0),
    [preview, setPreview] = useState<any>(null),
    [charge, setCharge] = useState(false),
    [count, setCount] = useState(3),
    [mode, setMode] = useState("Imagen + Texto"),
    [allPrompt, setAllPrompt] = useState(false),
    [commonPrompt, setCommonPrompt] = useState("");
  const draftProducts = useRef(new Map<string, Record<string, string>>());
  const mounted = useRef(true),
    projectSeq = useRef(0),
    productSeq = useRef(0),
    gallerySeq = useRef(0),
    action = useRef(false),
    inventoryCache = useRef(new Map<string, any>()),
    draftProjects = useRef(new Map<string, any>()),
    activeRef = useRef(activeSub),
    pageRef = useRef(page),
    productRef = useRef(product);
  activeRef.current = activeSub;
  pageRef.current = page;
  productRef.current = product;
  const refreshGallery = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    const seq = ++gallerySeq.current;
    const next = await studioRequest(
      "/images/" + id + "?page=" + pageRef.current,
    );
    if (
      mounted.current &&
      seq === gallerySeq.current &&
      activeRef.current === id
    )
      setGallery(next);
  }, []);
  const production = useProductionController(
    undefined,
    { project: project?.id ?? "", product: product?.id ?? "" },
    !!product,
  );
  const progressSignature = production.orders
      .filter((o) => o.completed > 0 && o.scope?.subproduct === activeSub)
      .map((o) => o.id + ":" + o.completed + ":" + o.sample?.reviewStatus)
      .join("|"),
    lastProgress = useRef("");
  useEffect(() => {
    if (lastProgress.current !== progressSignature) {
      const prior = lastProgress.current;
      lastProgress.current = progressSignature;
      if (progressSignature || prior)
        void refreshGallery().catch((e) => setError(e.message));
    }
  }, [progressSignature, refreshGallery]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run(fn: () => Promise<void>) {
    if (action.current) return;
    action.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
    } finally {
      action.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function chooseProject(
    id: string,
    initialProduct?: string,
    initialSub?: string,
  ) {
    const seq = ++projectSeq.current;
    ++productSeq.current;
    setLoading(true);
    setProduct(null);
    setActiveSub("");
    setSelected({});
    setTargetSubs([]);
    try {
      const p = await studioRequest("/projects/" + id);
      if (!mounted.current || seq !== projectSeq.current) return;
      setProject(p);
      setProjectQuery(p.name);
      setProductQuery("");
      const draft = draftProjects.current.get(id);
      const s = {
        ...baseSettings,
        ...contextRef.current?.defaults,
        ...p.studio?.settings,
        ...draft?.settings,
      };
      setProjectPrompt(draft?.prompt ?? p.prompt);
      setSettings(s);
      setCount(s.count);
      setMode(s.mode);
      setReferencesOpen(false);
      const next =
        p.categories.find((c: any) => c.id === initialProduct) ??
        (p.categories.length === 1 ? p.categories[0] : null);
      if (next) await chooseProduct(next.id, initialSub);
    } finally {
      if (seq === projectSeq.current) setLoading(false);
    }
  }
  const contextRef = useRef(context);
  contextRef.current = context;
  function unpinnedIds(id: string): string[] { try { const value = JSON.parse(localStorage.getItem("studio-unpinned:v1:"+userId+":"+id) || "[]"); return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : []; } catch { return []; } }
  function visibleProduct(p: any) { const hidden = unpinnedIds(p.id); return { ...p, subproducts: p.subproducts.filter((s: any) => !hidden.includes(s.id)) }; }
  async function removeSubproduct(sub: any) {
    if (!confirm(`¿Desfijar «${sub.name}» de este espacio de trabajo? Sus afiches, carpeta y campañas se conservarán. Puedes volver a seleccionarlo desde grupos.`)) return;
    try { localStorage.setItem("studio-unpinned:v1:"+userId+":"+product.id, JSON.stringify([...new Set([...unpinnedIds(product.id), sub.id])])); } catch { throw Error("No se pudo guardar la selección en este navegador."); }
    const remaining = product.subproducts.filter((s: any) => s.id !== sub.id);
    setProduct((p: any) => ({ ...p, subproducts: remaining }));
    setSelected((p) => { const next = { ...p }; delete next[sub.id]; return next; });
    setTargetSubs((ids) => ids.filter(id => id !== sub.id));
    if (activeSub === sub.id) { setActiveSub(remaining[0]?.id ?? ""); setPage(1); }
    setNotice("Desfijado. Sus afiches y carpeta se conservan.");
  }
  async function chooseProduct(id: string, initialSub?: string) {
    const seq = ++productSeq.current;
    setLoading(true);
    try {
      const p = visibleProduct(await studioRequest("/products/" + id));
      if (!mounted.current || seq !== productSeq.current) return;
      setProduct(p);
      setProductQuery(p.name);
      setCountry(p.studio?.country ?? "");
      setPrompts({
        ...Object.fromEntries(p.subproducts.map((s: any) => [s.id, s.prompt])),
        ...draftProducts.current.get(p.id),
      });
      setSelected({});
      setTargetSubs([]);
      setActiveSub(
        p.subproducts.find((s: any) => s.id === initialSub)?.id ??
          p.subproducts[0]?.id ??
          "",
      );
      setPage(1);
      const projectId = p.projectId;
      history.replaceState(
        null,
        "",
        "?" +
          new URLSearchParams({
            view: "projects",
            project: projectId,
            category: p.id,
          }),
      );
      try {
        localStorage.setItem(
          "creative-studio-view:v1:" + userId,
          JSON.stringify({ project: projectId, product: p.id }),
        );
      } catch {}
    } finally {
      if (seq === productSeq.current) setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    void studioRequest("")
      .then(async (c) => {
        if (!alive) return;
        setContext(c);
        contextRef.current = c;
        const query = new URLSearchParams(location.search);
        const selectionId = query.get("selection");
        if (selectionId)
          void studioRequest("/selections/" + selectionId)
            .then((s) => {
              if (alive) {
                setPendingSelection(s);
                setInventoryId(s.listId);
              }
            })
            .catch((e) => {
              if (alive) setError(e.message);
            });
        let saved: any = {};
        try {
          saved = JSON.parse(
            localStorage.getItem("creative-studio-view:v1:" + userId) ?? "{}",
          );
        } catch {}
        const categoryId = query.get("category") ?? saved.product;
        const found =
          c.projects.find(
            (p: any) => p.id === (query.get("project") ?? saved.project),
          ) ??
          c.projects.find((p: any) =>
            p.categories.some((x: any) => x.id === categoryId),
          ) ??
          (c.projects.length === 1 ? c.projects[0] : null);
        if (found)
          await chooseProject(
            found.id,
            categoryId,
            query.get("subproduct") ?? query.get("gallery") ?? undefined,
          );
        if (c.inventories.length === 1)
          setInventoryId((x) => x || c.inventories[0].id);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  useEffect(() => { if (!product || loading) return; const query = new URLSearchParams(window.location.search); if (activeSub) query.set("subproduct",activeSub); else query.delete("subproduct"); history.replaceState(null,"","?"+query); }, [activeSub, product?.id, loading]);
  useEffect(() => {
    setGallery({ items: [], total: 0, pages: 1 });
    if (activeSub) void refreshGallery().catch((e) => setError(e.message));
  }, [activeSub, page, refreshGallery]);
  useEffect(() => {
    if (product) draftProducts.current.set(product.id, prompts);
  }, [product?.id, prompts]);
  const importedSelection = useRef("");
  useEffect(() => {
    if (!pendingSelection || !product || !inventoryId || importedSelection.current === pendingSelection.id || busy || loading) return;
    importedSelection.current = pendingSelection.id;
    void run(() => addItems(pendingSelection.items.map((i: any) => i.id), pendingSelection.country));
  }, [pendingSelection, product?.id, inventoryId, busy, loading]);
  function draftProject(prompt: string, s: any) {
    if (project) draftProjects.current.set(project.id, { prompt, settings: s });
  }
  async function saveProject() {
    if (!project?.canEdit) return;
    const s = { ...settings, count, mode };
    if (!s.quality) delete s.quality;
    if (!s.resolution) delete s.resolution;
    const r = await studioRequest("/projects/" + project.id, "PATCH", {
      prompt: projectPrompt,
      settings: s,
    });
    setProject((p: any) => ({ ...p, prompt: r.prompt, studio: r.studio }));
    draftProjects.current.delete(project.id);
    setNotice("✓ Proyecto guardado");
  }
  async function createProject() {
    const p = await studioRequest("/projects", "POST", {
      name: projectQuery.trim(),
      requestId: crypto.randomUUID(),
    });
    setContext((c: any) => ({
      ...c,
      projects: [
        ...c.projects,
        { ...p, categories: [], canCreateProduct: true },
      ],
    }));
    await chooseProject(p.id);
    setZone("project");
  }
  async function createProduct() {
    if (!project) return;
    const p = await studioRequest(
      "/projects/" + project.id + "/products",
      "POST",
      { name: productQuery.trim(), country, requestId: crypto.randomUUID() },
    );
    setProject((current: any) => ({
      ...current,
      categories: [
        ...current.categories,
        { id: p.id, name: p.name, studio: p.studio },
      ],
    }));
    setContext((c: any) => ({
      ...c,
      projects: c.projects.map((x: any) =>
        x.id === project.id
          ? { ...x, categories: [...x.categories, { id: p.id, name: p.name }] }
          : x,
      ),
    }));
    await chooseProduct(p.id);
    setZone("canvas");
  }
  async function changeCountry(value: string) {
    setCountry(value);
    if (product) {
      await studioRequest("/products/" + product.id, "PATCH", {
        country: value,
      });
      setProduct((p: any) => ({
        ...p,
        studio: { ...p.studio, country: value },
      }));
    }
  }
  async function reloadProduct() {
    const next = visibleProduct(await studioRequest("/products/" + productRef.current.id));
    setProduct(next);
    setPrompts((p) => ({
      ...Object.fromEntries(next.subproducts.map((s: any) => [s.id, s.prompt])),
      ...p,
    }));
    return next;
  }
  async function addItems(ids: string[], value: string) {
    if (!product) return;
    await changeCountry(value);
    const added = await studioRequest(
      "/products/" + product.id + "/items",
      "POST",
      { listId: inventoryId, itemIds: ids },
    );
    try { localStorage.setItem("studio-unpinned:v1:"+userId+":"+product.id, JSON.stringify(unpinnedIds(product.id).filter(id => !added.some((s: any) => s.id === id)))); } catch {}
    await reloadProduct();
    if (added.length) {
      setActiveSub(added[0].id);
      setTargetSubs(added.map((s: any) => s.id));
    }
    setPicker(null);
    setPendingSelection(null);
    setZone("canvas");
    setNotice("✓ " + added.length + " diplomados listos en este producto");
  }
  const [pickerGroupId, setPickerGroupId] = useState("");
  async function refreshPicker() {
    const next = await studioRequest("/inventory/" + inventoryId);
    inventoryCache.current.set(inventoryId, next);
    setPicker(next);
  }
  async function openInventory() {
    setPickerGroupId("");
    if (!inventoryId) return;
    let dir = inventoryCache.current.get(inventoryId);
    if (!dir) {
      dir = await studioRequest("/inventory/" + inventoryId);
      inventoryCache.current.set(inventoryId, dir);
    }
    setPicker(dir);
  }
  async function addName() {
    const added = await studioRequest(
      "/products/" + product.id + "/items",
      "POST",
      { names: [manualName.trim()] },
    );
    try { localStorage.setItem("studio-unpinned:v1:"+userId+":"+product.id, JSON.stringify(unpinnedIds(product.id).filter(id => !added.some((s: any) => s.id === id)))); } catch {}
    await reloadProduct();
    setActiveSub(added[0].id);
    setManualName("");
    setZone("canvas");
  }
  async function generate(ids: string[]) {
    if (!product || !ids.length) return;
    await saveProject();
    const values = Object.fromEntries(
      ids.map((id) => [id, allPrompt ? commonPrompt : (prompts[id] ?? "")]),
    );
    const result = await studioRequest(
      "/products/" + product.id + "/generate",
      "POST",
      {
        requestId: crypto.randomUUID(),
        subproductIds: ids,
        prompts: values,
        count,
        mode,
        format: settings.format,
        previewFirst: settings.previewFirst,
        confirmCharge: true,
      },
    );
    setPrompts((p) => ({ ...p, ...values }));
    await production.start(result.runnable, "background", result.jobs);
    setNotice("✓ " + ids.length + " diplomado(s) en producción");
    setZone("canvas");
  }
  async function upload(files: FileList | null) {
    if (!activeSub || !files?.length) return;
    for (const file of [...files].slice(0, 20)) {
      const form = new FormData();
      form.set("file", file);
      form.set("requestId", crypto.randomUUID());
      const r = await fetch("/api/creative-studio/upload/" + activeSub, {
        method: "POST",
        body: form,
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error ?? "No se pudo subir el afiche.");
    }
    await refreshGallery();
    setNotice("✓ Afiches subidos sin generar con IA");
  }
  function toggleImage(id: string) {
    setSelected((s) => ({
      ...s,
      [activeSub]: (s[activeSub] ?? []).includes(id)
        ? s[activeSub].filter((x) => x !== id)
        : [...(s[activeSub] ?? []), id],
    }));
  }
  const active = product?.subproducts.find((s: any) => s.id === activeSub),
    currentSelection = selected[activeSub] ?? [],
    imageSet = new Set(currentSelection),
    allChosen =
      gallery.items.length > 0 &&
      gallery.items.every((i: any) => imageSet.has(i.id));
  const campaignItems: CampaignItem[] = useMemo(
    () =>
      Object.entries(selected)
        .filter(
          ([sub, ids]) =>
            ids.length && product?.subproducts.some((s: any) => s.id === sub),
        )
        .map(([subproductId, variationIds]) => ({
          subproductId,
          variationIds,
          name: product.subproducts.find((s: any) => s.id === subproductId)
            .name,
        })),
    [selected, product],
  );
  const restoreSelection = useCallback(
    (items: CampaignItem[]) =>
      setSelected(
        Object.fromEntries(items.map((i) => [i.subproductId, i.variationIds])),
      ),
    [],
  );
  const names = (list: any[]) => list.map((p) => ({ id: p.id, label: p.name })),
    same = (a: string, b: string) =>
      a.trim().normalize("NFKC").toLocaleLowerCase("es") ===
      b.trim().normalize("NFKC").toLocaleLowerCase("es"),
    projectExists = context?.projects.some((p: any) =>
      same(p.name, projectQuery),
    ),
    productExists = project?.categories.some((p: any) =>
      same(p.name, productQuery),
    );
  if (!context)
    return (
      <section className="studio-boot" role="status">
        <span className="studio-spark">✦</span>
        <h1>Preparando tu estudio creativo</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Proyectos, afiches y campañas en un mismo lugar.</p>
        )}
      </section>
    );
  return (
    <section className="creative-studio">
      <nav className="studio-mobile-tabs" aria-label="Áreas del estudio">
        {[
          ["project", "01 Proyecto"],
          ["canvas", "02 Afiches"],
          ["campaign", "03 Campaña"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={zone === id}
            onClick={() => setZone(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {(error || notice) && (
        <div
          className={"studio-notification " + (error ? "is-error" : "")}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <StudioColumns zone={zone}>
        <aside className="studio-pane studio-project">
          <header className="studio-pane-title">
            <StudioMaximize pane="project" label="Tu proyecto"/>
            <span className="studio-step mint">01</span>
            <div>
              <span className="studio-eyebrow">DALE UNA DIRECCIÓN</span>
              <h2>Tu proyecto</h2>
            </div>
          </header>
          <div className="studio-project-picker">
            <SearchSelect
              label="Proyecto"
              value={projectQuery}
              onChange={setProjectQuery}
              onSelect={(o) => void run(() => chooseProject(o.id))}
              options={names(context.projects)}
            />
            <button
              type="button"
              title={projectExists ? "Ya existe el proyecto" : "Crear proyecto"}
              disabled={busy || !projectQuery.trim() || projectExists}
              onClick={() => void run(createProject)}
            >
              ＋ Crear
            </button>
          </div>
          {projectExists && projectQuery !== project?.name && (
            <small className="studio-existing">
              Ya existe el proyecto. Selecciónalo en la lista.
            </small>
          )}
          {project ? (
            <>
              <label className="studio-prompt-label">
                Prompt / comportamiento
                <textarea
                  aria-label="Prompt del proyecto"
                  rows={7}
                  maxLength={30000}
                  value={projectPrompt}
                  disabled={!project.canEdit}
                  placeholder="Define el estilo, los textos y las reglas que compartirán tus afiches…"
                  onChange={(e) => {
                    setProjectPrompt(e.target.value);
                    draftProject(e.target.value, settings);
                  }}
                />
                <span>
                  {projectPrompt.length.toLocaleString("es-PE")} caracteres
                </span>
              </label>
              <details
                className="studio-reference-details"
                onToggle={(e) => {
                  if (e.currentTarget.open) setReferencesOpen(true);
                }}
              >
                <summary>
                  ⌁ Referencias opcionales <span>＋</span>
                </summary>
                {referencesOpen && (
                  <div className="studio-reference-content">
                    <label>
                      Enlace web
                      <input
                        type="url"
                        placeholder="https://…"
                        value={web}
                        onChange={(e) => setWeb(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !web.trim()}
                      onClick={() =>
                        void run(async () => {
                          await studioRequest(
                            "/projects/" + project.id + "/web",
                            "POST",
                            { url: web },
                          );
                          setWeb("");
                          setAttachmentsRevision((x) => x + 1);
                          setNotice("✓ Referencia web añadida");
                        })
                      }
                    >
                      Añadir enlace
                    </button>
                    <Attachments
                      key={project.id + ":" + attachmentsRevision}
                      scope="project"
                      id={project.id}
                    />
                  </div>
                )}
              </details>
              <details className="studio-settings">
                <summary>◈ Formato y acabado</summary>
                <div className="studio-field-pair">
                  <label>
                    Formato
                    <select
                      value={settings.format}
                      onChange={(e) => {
                        const s = { ...settings, format: e.target.value };
                        setSettings(s);
                        draftProject(projectPrompt, s);
                      }}
                    >
                      <option value="1:1">Cuadrado · 1:1</option>
                      <option value="4:5">Vertical · 4:5</option>
                      <option value="9:16">Historia · 9:16</option>
                      <option value="16:9">Horizontal · 16:9</option>
                    </select>
                  </label>
                  <label>
                    Calidad
                    <select
                      value={settings.quality}
                      onChange={(e) => {
                        const s = { ...settings, quality: e.target.value };
                        setSettings(s);
                        draftProject(projectPrompt, s);
                      }}
                    >
                      {context.qualities.length ? (
                        context.qualities.map((x: string) => (
                          <option key={x} value={x}>
                            {(
                              {
                                low: "Baja",
                                medium: "Media",
                                high: "Alta",
                                xhigh: "Muy alta",
                                max: "Máxima",
                                default: "Predeterminada",
                              } as any
                            )[x] ?? x}
                          </option>
                        ))
                      ) : (
                        <option value="">Configurar IA</option>
                      )}
                    </select>
                  </label>
                </div>
                <label>
                  Resolución
                  <select
                    value={settings.resolution}
                    onChange={(e) => {
                      const s = { ...settings, resolution: e.target.value };
                      setSettings(s);
                      draftProject(projectPrompt, s);
                    }}
                  >
                    {context.resolutions.map((x: string) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <small className="studio-model-label">
                  {context.model ?? "Selecciona un modelo en Ajustes IA"}
                </small>
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={settings.previewFirst}
                    onChange={(e) => {
                      const s = { ...settings, previewFirst: e.target.checked };
                      setSettings(s);
                      draftProject(projectPrompt, s);
                    }}
                  />
                  Aprobar la primera muestra antes del resto
                </label>
              </details>
              <button
                type="button"
                className="studio-save-project"
                disabled={busy || !project.canEdit}
                onClick={() => void run(saveProject)}
              >
                ✓ Guardar proyecto
              </button>
              <div className="studio-section-divider" />
              <div className="studio-project-picker">
                <SearchSelect
                  label="Producto / carpeta"
                  value={productQuery}
                  onChange={setProductQuery}
                  onSelect={(o) => void run(() => chooseProduct(o.id))}
                  options={names(project.categories)}
                />
                <button
                  type="button"
                  title={
                    productExists ? "Ya existe el producto" : "Crear producto"
                  }
                  disabled={
                    busy ||
                    !productQuery.trim() ||
                    productExists ||
                    !country ||
                    !project.canEdit
                  }
                  onClick={() => void run(createProduct)}
                >
                  ＋ Crear
                </button>
              </div>
              <label>
                País
                <select
                  aria-label="País del producto"
                  value={country}
                  onChange={(e) =>
                    void run(() => changeCountry(e.target.value))
                  }
                >
                  <option value="">Selecciona un país</option>
                  {context.countries.map((c: any) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {product && (
                <>
                  <div className="studio-inventory-launch">
                    <label>
                      Inventario
                      <select
                        aria-label="Inventario de productos"
                        value={inventoryId}
                        onChange={(e) => setInventoryId(e.target.value)}
                      >
                        <option value="">Selecciona un inventario</option>
                        {context.inventories.map((i: any) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!inventoryId || busy}
                      onClick={() => void run(openInventory)}
                    >
                      ▦ Elegir diplomados / grupos
                    </button>
                  </div>
                  {pendingSelection && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          addItems(
                            pendingSelection.items.map((i: any) => i.id),
                            pendingSelection.country,
                          ),
                        )
                      }
                    >
                      Añadir selección guardada ({pendingSelection.items.length}
                      )
                    </button>
                  )}
                  <div className="studio-add-sub">
                    <input
                      aria-label="Añadir subproducto manualmente"
                      placeholder="O escribe un diplomado…"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualName.trim()) {
                          e.preventDefault();
                          void run(addName);
                        }
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Añadir subproducto"
                      disabled={busy || !manualName.trim()}
                      onClick={() => void run(addName)}
                    >
                      ＋
                    </button>
                  </div>
                  <div className="studio-sub-list">
                    {product.subproducts.map((s: any) => (
                      <div
                        key={s.id}
                        className={activeSub === s.id ? "active" : ""}
                      >
                        <input
                          type="checkbox"
                          aria-label={"Generar en " + s.name}
                          checked={targetSubs.includes(s.id)}
                          onChange={() =>
                            setTargetSubs((ids) =>
                              ids.includes(s.id)
                                ? ids.filter((x) => x !== s.id)
                                : [...ids, s.id],
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSub(s.id);
                            setPage(1);
                            setZone("canvas");
                          }}
                        >
                          <span className="studio-sub-initial">
                            {s.name.slice(0, 1)}
                          </span>
                          <span>{s.name}</span>
                          <small className="studio-folder-status">{s.folderExists ? `${s.folderCount ?? 0} afiches · Carpeta existente` : "Nueva carpeta · Por guardar"}</small>
                        </button>
                        <button type="button" className="studio-unpin" aria-label={"Desfijar " + s.name} title="Desfijar sin borrar" disabled={busy} onClick={() => void run(() => removeSubproduct(s))}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className="studio-left-generate">
                    <span>
                      {targetSubs.length
                        ? targetSubs.length + " seleccionados"
                        : "Todos los diplomados"}{" "}
                      · {count} variaciones cada uno
                    </span>
                    <button
                      type="button"
                      className="studio-generate-button"
                      disabled={
                        busy ||
                        !charge ||
                        !product.subproducts.length ||
                        production.dispatching
                      }
                      onClick={() =>
                        void run(() =>
                          generate(
                            targetSubs.length
                              ? targetSubs
                              : product.subproducts.map((s: any) => s.id),
                          ),
                        )
                      }
                    >
                      ✦ Generar en{" "}
                      {targetSubs.length || product.subproducts.length}{" "}
                      diplomados
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="studio-left-empty">
              <span>✧</span>
              <p>
                Busca un proyecto o escribe su nombre para crear tu próximo
                espacio creativo.
              </p>
            </div>
          )}
        </aside>
        <section
          className="studio-pane studio-canvas"
          aria-label="Afiches del producto"
        >
          <header className="studio-pane-title"><StudioMaximize pane="canvas" label="Afiches"/>
            <span className="studio-step amber">02</span>
            <div>
              <span className="studio-eyebrow">EXPLORA. CREA. ELIGE.</span>
              <h2>{active?.name ?? "Tus próximas ideas"}</h2>
            </div>
            {country && (
              <span className="studio-chip">{countryName(country)}</span>
            )}
          </header>
          {product && (
            <nav
              className="studio-sub-tabs"
              aria-label="Diplomados del producto"
            >
              {product.subproducts.map((s: any) => (
                <div className="studio-sub-tab" key={s.id}>
                <button
                  type="button"
                  aria-pressed={activeSub === s.id}
                  onClick={() => {
                    setActiveSub(s.id);
                    setPage(1);
                  }}
                >
                  {s.name}
                  {selected[s.id]?.length ? (
                    <span>{selected[s.id].length} ✓</span>
                  ) : null}
                </button>
                <button type="button" className="studio-remove-tab" aria-label={"Desfijar " + s.name} title={"Desfijar " + s.name} disabled={busy} onClick={() => void run(() => removeSubproduct(s))}>×</button>
                </div>
              ))}
              <button
                type="button"
                className="studio-add-tab"
                disabled={!inventoryId || busy}
                onClick={() => void run(openInventory)}
                aria-label="Añadir diplomados del inventario"
              >
                ＋
              </button>
            </nav>
          )}
          {active ? (
            <>
              <div className="studio-canvas-toolbar">
                <label className="studio-check">
                  <input
                    type="checkbox"
                    checked={allChosen}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      void run(async () => {
                        const ids = checked
                          ? gallery.pages > 1
                            ? (
                                await studioRequest(
                                  "/images/" + activeSub + "/selection",
                                )
                              ).ids
                            : gallery.items.map((i: any) => i.id)
                          : [];
                        setSelected((s) => ({ ...s, [activeSub]: ids }));
                      });
                    }}
                  />
                  Seleccionar todos los afiches de este diplomado
                </label>
                <span>
                  {gallery.total} afiches · {currentSelection.length} elegidos
                </span>
              </div>
              <div className="studio-poster-grid">
                {gallery.items.map((i: any) => (
                  <article
                    key={i.id}
                    className={
                      "studio-poster-card" +
                      (imageSet.has(i.id) ? " chosen" : "")
                    }
                  >
                    <label className="studio-poster-check">
                      <input
                        type="checkbox"
                        aria-label={"Elegir afiche " + i.id}
                        checked={imageSet.has(i.id)}
                        onChange={() => toggleImage(i.id)}
                      />
                      <span>{imageSet.has(i.id) ? "✓" : "Elegir"}</span>
                    </label>
                    <button
                      type="button"
                      className="studio-poster-preview"
                      aria-label={"Ampliar afiche de " + active.name}
                      onClick={() =>
                        setPreview({
                          id: i.id,
                          revision: i.revision,
                          name: active.name,
                        })
                      }
                    >
                      <img
                        loading="lazy"
                        src={`/api/variations/${i.id}?thumbnail=true&v=${i.revision}`}
                        alt={"Afiche de " + active.name}
                      />
                    </button>
                    <div className="studio-poster-meta">
                      <span>
                        {i.permanent
                          ? "✓ En Biblioteca"
                          : i.isSample && i.reviewStatus !== "APPROVED"
                            ? "Primera muestra"
                            : "Variación"}
                      </span>
                      {i.isSample && i.reviewStatus !== "APPROVED" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const o = production.orders.find(
                                (o) => o.sample?.id === i.id,
                              );
                              if (o)
                                await orderRequest("/" + o.id + "/approve", {
                                  jobId: i.jobId,
                                });
                              else {
                                const r = await fetch(
                                  "/api/jobs/" + i.jobId + "/approve",
                                  {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    body: "{}",
                                  },
                                );
                                if (!r.ok)
                                  throw Error("No se pudo aprobar la muestra.");
                              }
                              await production.refresh();
                              await refreshGallery();
                            })
                          }
                        >
                          Aprobar muestra
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {Array.from(
                  {
                    length: Math.max(
                      1,
                      Math.min(6, count) -
                        (gallery.items.length
                          ? Math.min(gallery.items.length, Math.min(6, count))
                          : 0),
                    ),
                  },
                  (_, i) => (
                    <button
                      key={"empty-" + i}
                      className="studio-poster-placeholder"
                      type="button"
                      onClick={() =>
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".studio-composer textarea",
                          )
                          ?.focus()
                      }
                    >
                      <span>＋</span>
                      <small>
                        {gallery.items.length
                          ? "Una nueva posibilidad"
                          : "Tu próxima creación"}
                      </small>
                    </button>
                  ),
                )}
              </div>
              {gallery.pages > 1 && (
                <div className="studio-gallery-pages">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Anterior
                  </button>
                  <span>
                    {page} / {gallery.pages}
                  </span>
                  <button
                    disabled={page >= gallery.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              )}
              {currentSelection.length > 0 && (
                <div className="studio-selection-bar">
                  <strong>{currentSelection.length} afiches elegidos</strong>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await studioRequest("/images/save", "POST", {
                          ids: currentSelection,
                        });
                        await refreshGallery();
                        await reloadProduct();
                        setNotice(
                          "✓ Solo los afiches elegidos se guardaron en su carpeta de Biblioteca",
                        );
                      })
                    }
                  >
                    ▧ Subir seleccionados a carpeta
                  </button>
                  <button
                    type="button"
                    className="studio-campaign-shortcut"
                    onClick={() => setZone("campaign")}
                  >
                    Preparar campaña →
                  </button>
                </div>
              )}
              <div className="studio-order-area">
                <ProductionControls controller={production} />
              </div>
              <div className="studio-composer">
                <div className="studio-composer-heading">
                  <strong>
                    ✦ Dale una dirección a{" "}
                    {allPrompt ? "todos los diplomados" : active.name}
                  </strong>
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      checked={allPrompt}
                      onChange={(e) => setAllPrompt(e.target.checked)}
                    />
                    Usar en todos
                  </label>
                </div>
                <textarea
                  aria-label="Instrucciones del afiche"
                  value={allPrompt ? commonPrompt : (prompts[activeSub] ?? "")}
                  maxLength={30000}
                  placeholder="¿Cómo quieres que se vea? El comportamiento del proyecto ya se aplica…"
                  onChange={(e) =>
                    allPrompt
                      ? setCommonPrompt(e.target.value)
                      : setPrompts((p) => ({
                          ...p,
                          [activeSub]: e.target.value,
                        }))
                  }
                />
                <div className="studio-composer-tools">
                  <label className="studio-upload-button">
                    ↑ Subir afiches
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp"
                      disabled={busy}
                      onChange={(e) => {
                        const files = e.target.files;
                        void run(() => upload(files));
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label>
                    Variaciones
                    <input
                      aria-label="Cantidad de variaciones"
                      type="number"
                      min="1"
                      max="100"
                      value={count}
                      onChange={(e) =>
                        setCount(
                          Math.max(
                            1,
                            Math.min(100, Number(e.target.value) || 1),
                          ),
                        )
                      }
                    />
                  </label>
                  <select
                    aria-label="Tipo de afiche"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    {modes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="studio-generate-button"
                    disabled={busy || !charge || production.dispatching}
                    onClick={() =>
                      void run(() =>
                        generate(
                          allPrompt
                            ? product.subproducts.map((s: any) => s.id)
                            : [activeSub],
                        ),
                      )
                    }
                  >
                    ✦{" "}
                    {busy
                      ? "Preparando…"
                      : "Generar " +
                        count +
                        (allPrompt ? " por diplomado" : "")}
                  </button>
                </div>
                <label className="studio-check studio-charge">
                  <input
                    type="checkbox"
                    checked={charge}
                    onChange={(e) => setCharge(e.target.checked)}
                  />
                  Autorizo las llamadas de IA y su posible cargo de API.
                </label>
              </div>
            </>
          ) : (
            <div className="studio-canvas-empty">
              <div className="studio-empty-art">
                <span>✦</span>
                <i />
                <i />
                <i />
              </div>
              <h2>Tu próxima campaña empieza aquí</h2>
              <p>
                {project
                  ? "Elige o crea un producto y añade los diplomados que quieres trabajar."
                  : "Elige un proyecto para comenzar a crear."}
              </p>
              <div className="studio-empty-steps">
                <span>01 Elige tu tema</span>
                <span>02 Crea tus afiches</span>
                <span>03 Publica en Meta</span>
              </div>
            </div>
          )}
          {loading && (
            <span className="studio-loading-pill" role="status">
              Actualizando tu espacio…
            </span>
          )}
        </section>
        {product ? (
          <StudioCampaign
            key={product.id}
            categoryId={product.id}
            country={country}
            accounts={context.accounts}
            items={campaignItems}
            template={project?.studio?.campaignTemplates?.[country]}
            latestLaunchId={product.latestLaunchId}
            onRestore={restoreSelection}
          />
        ) : (
          <aside className="studio-pane studio-campaign studio-campaign-empty">
            <header className="studio-pane-title"><StudioMaximize pane="campaign" label="De afiche a anuncio"/>
              <span className="studio-step violet">03</span>
              <div>
                <span className="studio-eyebrow">DEL ESTUDIO A META</span>
                <h2>Tu próxima campaña</h2>
              </div>
            </header>
            <span className="studio-campaign-illustration">↗</span>
            <h3>Elige tus mejores afiches</h3>
            <p>
              Aquí prepararás tu campaña a WhatsApp con dos públicos y tu cuenta
              publicitaria principal.
            </p>
            <div className="studio-destination-pill">◉ WhatsApp</div>
          </aside>
        )}
      </StudioColumns>
      {picker && (
        <InventoryGroupEditor
          directory={picker}
          group={picker.groups.find((g: any) => g.id === pickerGroupId)}
          initialNames={[]}
          initialCountry={country}
          onClose={() => setPicker(null)}
          initialTab="ads"
          adsDestination={{project: project.id, category: product.id}}
          onChooseGroup={setPickerGroupId}
          onSaved={async id => { await refreshPicker(); setPickerGroupId(id); }}
          onGroupsChanged={refreshPicker}
        />
      )}
      {preview && (
        <ImagePreviewModal {...preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
