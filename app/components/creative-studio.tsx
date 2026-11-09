"use client";
import dynamic from "next/dynamic";
import {
  readGenerationPreferences,
  type GenerationPreferences,
} from "../../lib/creative-studio/generation-preferences";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CurrentUserId } from "./role-guide";
import { templateForAnotherDiploma } from "../../lib/creative-studio/campaign-workbench-policy";
import { StudioColumns, StudioMaximize } from "./studio-columns";
import { SheetSearchSelect } from "./sheet-search-select";
import { SearchSelect } from "./search-select";
import { studioRequest } from "./inventory-meta-picker";
import { StudioInventorySlots } from "./studio-inventory-slots";
import { readGroupDirectory } from "./inventory-group-directory-cache";
import { StudioCampaign } from "./studio-campaign";
import {
  ProductionControls,
  useProductionController,
} from "./production-controls";
import { orderRequest, OrderProgressCard } from "./order-progress";
import { StudioGenerationCard } from "./studio-generation-card";
import { ImagePreviewModal } from "./image-preview-modal";
import { countryName } from "../../lib/meta-ads/countries";
import type { CampaignItem } from "../../lib/creative-studio/campaign-policy";
import "./studio-workspace.css";
import "./studio-campaign-workbench.css";
const Attachments = dynamic(() =>
  import("./attachments").then((m) => m.Attachments),
);
const modes = [
  { id: "Imagen + Texto", label: "Imagen + texto" },
  { id: "Texto", label: "Texto y logos" },
  { id: "Imagen", label: "Solo imagen" },
  { id: "Aleatorio", label: "Aleatorio" },
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
    [projectConfigOpen, setProjectConfigOpen] = useState(true),
    [generationPreferences, setGenerationPreferences] = useState<
      Record<string, GenerationPreferences>
    >({}),
    [settings, setSettings] = useState<any>(baseSettings),
    [activeSub, setActiveSub] = useState(""),
    [prompts, setPrompts] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<Record<string, string[]>>({}),
    [targetSubs, setTargetSubs] = useState<string[]>([]),
    [gallery, setGallery] = useState<any>({ items: [], total: 0, pages: 1 }),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [ownMode, setOwnMode] = useState(false),
    [uploadStorage, setUploadStorage] = useState("campaign"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [zone, setZone] = useState("canvas"),
    [inventoryId, setInventoryId] = useState(""),
    [inventoryFocusRequest, setInventoryFocusRequest] = useState(0),
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
  useEffect(() => {
    try {
      setOwnMode(localStorage.getItem("studio-own-mode:" + userId) === "own");
    } catch {}
  }, [userId]);
  function preparationMode(own: boolean) {
    setOwnMode(own);
    try {
      localStorage.setItem("studio-own-mode:" + userId, own ? "own" : "ai");
    } catch {}
  }
  const handoffCountry = useRef("");
  const handoffSelection = useRef<any>(null);
  const draftProducts = useRef(new Map<string, Record<string, string>>());
  const mounted = useRef(true),
    projectSeq = useRef(0),
    productSeq = useRef(0),
    gallerySeq = useRef(0),
    action = useRef(false),
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
    if (action.current) return false;
    action.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
      return false;
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
      setProjectConfigOpen(!!draft || !p.prompt?.trim());
      setSettings(s);
      setCount(s.count);
      setMode(s.mode);
      setReferencesOpen(false);
      if (handoffSelection.current) {
        const selection = handoffSelection.current;
        const prepared = await studioRequest(
          "/selections/" + selection.id + "/prepare",
          "POST",
          {
            projectId: p.id,
            ...(initialProduct ? { preferredCategoryId: initialProduct } : {}),
          },
        );
        if (
          !mounted.current ||
          seq !== projectSeq.current ||
          handoffSelection.current?.id !== selection.id
        )
          return;
        try {
          localStorage.setItem(
            "studio-unpinned:v1:" + userId + ":" + prepared.category.id,
            JSON.stringify(
              unpinnedIds(prepared.category.id).filter(
                (id) => !prepared.items.some((s: any) => s.id === id),
              ),
            ),
          );
        } catch {}
        setProject((current: any) => ({
          ...current,
          categories: current.categories.some(
            (c: any) => c.id === prepared.category.id,
          )
            ? current.categories
            : [...current.categories, prepared.category],
        }));
        const opened = await chooseProduct(
          prepared.category.id,
          prepared.items[0]?.id,
        );
        if (opened && opened.studio?.country !== prepared.country)
          throw Error("La carpeta cambió de país. Reintenta la preparación.");
        if (!mounted.current || seq !== projectSeq.current) return;
        setInventoryId(prepared.listId);
        setCountry(prepared.country);
        setTargetSubs(prepared.items.map((s: any) => s.id));
        handoffCountry.current = "";
        handoffSelection.current = null;
        setPendingSelection(null);
        const canonicalQuery = new URLSearchParams(location.search);
        canonicalQuery.delete("selection");
        history.replaceState(null, "", "?" + canonicalQuery);
        setZone("canvas");
        setNotice(
          "✓ " +
            prepared.items.length +
            " diplomados listos para generar · " +
            countryName(prepared.country),
        );
        return;
      }
      const compatible = handoffCountry.current
        ? p.categories.filter(
            (c: any) => c.studio?.country === handoffCountry.current,
          )
        : p.categories;
      const next =
        compatible.find((c: any) => c.id === initialProduct) ??
        (handoffCountry.current
          ? compatible[0]
          : compatible.length === 1
            ? compatible[0]
            : null);
      if (next) await chooseProduct(next.id, initialSub);
    } finally {
      if (seq === projectSeq.current) setLoading(false);
    }
  }
  const contextRef = useRef(context);
  contextRef.current = context;
  function unpinnedIds(id: string): string[] {
    try {
      const value = JSON.parse(
        localStorage.getItem("studio-unpinned:v1:" + userId + ":" + id) || "[]",
      );
      return Array.isArray(value)
        ? value.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }
  function visibleProduct(p: any) {
    const hidden = unpinnedIds(p.id);
    return {
      ...p,
      subproducts: p.subproducts.filter(
        (s: any) =>
          !hidden.includes(s.id) ||
          (handoffSelection.current &&
            s.studio?.listId === handoffSelection.current.listId &&
            handoffSelection.current.itemIds.includes(s.studio?.itemId)),
      ),
    };
  }
  async function removeSubproduct(sub: any) {
    if (
      !confirm(
        `¿Desfijar «${sub.name}» de este espacio de trabajo? Sus afiches, carpeta y campañas se conservarán. Puedes volver a seleccionarlo desde grupos.`,
      )
    )
      return;
    try {
      localStorage.setItem(
        "studio-unpinned:v1:" + userId + ":" + product.id,
        JSON.stringify([...new Set([...unpinnedIds(product.id), sub.id])]),
      );
    } catch {
      throw Error("No se pudo guardar la selección en este navegador.");
    }
    const remaining = product.subproducts.filter((s: any) => s.id !== sub.id);
    setProduct((p: any) => ({ ...p, subproducts: remaining }));
    setSelected((p) => {
      const next = { ...p };
      delete next[sub.id];
      return next;
    });
    setTargetSubs((ids) => ids.filter((id) => id !== sub.id));
    if (activeSub === sub.id) {
      setActiveSub(remaining[0]?.id ?? "");
      setPage(1);
    }
    setNotice("Desfijado. Sus afiches y carpeta se conservan.");
  }
  async function chooseProduct(id: string, initialSub?: string) {
    const seq = ++productSeq.current;
    setLoading(true);
    try {
      const p = visibleProduct(await studioRequest("/products/" + id));
      if (!mounted.current || seq !== productSeq.current) return;
      setProduct(p);
      setInventoryFocusRequest(0);
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
            ...(handoffSelection.current
              ? { selection: handoffSelection.current.id }
              : {}),
          }),
      );
      try {
        localStorage.setItem(
          "creative-studio-view:v1:" + userId,
          JSON.stringify({ project: projectId, product: p.id }),
        );
      } catch {}
      return p;
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
        if (selectionId) {
          const selection = await studioRequest("/selections/" + selectionId);
          if (!alive) return;
          handoffCountry.current = selection.country;
          handoffSelection.current = selection;
          setPendingSelection(selection);
          setZone("canvas");
          setInventoryId(selection.listId);
          setCountry(selection.country);
        }
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
        if (c.inventories.length)
          setInventoryId((x) =>
            c.inventories.some((i: any) => i.id === x)
              ? x
              : c.inventories[0].id,
          );
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
  useEffect(() => {
    if (!product || loading) return;
    const query = new URLSearchParams(window.location.search);
    if (activeSub) query.set("subproduct", activeSub);
    else query.delete("subproduct");
    history.replaceState(null, "", "?" + query);
  }, [activeSub, product?.id, loading]);
  useEffect(() => {
    setGallery({ items: [], total: 0, pages: 1 });
    if (activeSub) void refreshGallery().catch((e) => setError(e.message));
  }, [activeSub, page, refreshGallery]);
  useEffect(() => {
    if (product) draftProducts.current.set(product.id, prompts);
  }, [product?.id, prompts]);
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
    setNotice("✓ Configuración guardada");
    setProjectConfigOpen(false);
  }
  async function createProject() {
    const fromSelection = !!handoffSelection.current;
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
    if (!fromSelection) setZone("project");
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
    if (product) {
      await studioRequest("/products/" + product.id, "PATCH", {
        country: value,
      });
      setProduct((p: any) => ({
        ...p,
        studio: { ...p.studio, country: value },
      }));
    }
    setCountry(value);
  }
  async function reloadProduct() {
    const next = visibleProduct(
      await studioRequest("/products/" + productRef.current.id),
    );
    setProduct(next);
    setPrompts((p) => ({
      ...Object.fromEntries(next.subproducts.map((s: any) => [s.id, s.prompt])),
      ...p,
    }));
    return next;
  }
  async function addItems(ids: string[], value: string) {
    if (!product) return;
    if (
      pendingSelection &&
      (product.studio?.country !== pendingSelection.country ||
        inventoryId !== pendingSelection.listId)
    )
      throw Error(
        `Elige o crea una carpeta de ${countryName(pendingSelection.country)} y conserva el Inventario de la selección.`,
      );
    if (product.studio?.country !== value) await changeCountry(value);
    const added = await studioRequest(
      "/products/" + product.id + "/items",
      "POST",
      { listId: inventoryId, itemIds: ids },
    );
    try {
      localStorage.setItem(
        "studio-unpinned:v1:" + userId + ":" + product.id,
        JSON.stringify(
          unpinnedIds(product.id).filter(
            (id) => !added.some((s: any) => s.id === id),
          ),
        ),
      );
    } catch {}
    await reloadProduct();
    if (added.length) {
      setActiveSub(added[0].id);
      setTargetSubs(added.map((s: any) => s.id));
    }
    handoffCountry.current = "";
    handoffSelection.current = null;
    setPendingSelection(null);
    setZone("canvas");
    setNotice("✓ " + added.length + " elementos listos en esta carpeta");
  }
  const loadInventoryDirectory = useCallback(
    (id: string) =>
      readGroupDirectory(userId, id, () => studioRequest("/inventory/" + id)),
    [userId],
  );
  function focusInventorySelector() {
    setZone("project");
    setInventoryFocusRequest((n) => n + 1);
  }
  async function addName() {
    const added = await studioRequest(
      "/products/" + product.id + "/items",
      "POST",
      { names: [manualName.trim()] },
    );
    try {
      localStorage.setItem(
        "studio-unpinned:v1:" + userId + ":" + product.id,
        JSON.stringify(
          unpinnedIds(product.id).filter(
            (id) => !added.some((s: any) => s.id === id),
          ),
        ),
      );
    } catch {}
    await reloadProduct();
    setActiveSub(added[0].id);
    setTargetSubs((ids) => [...new Set([...ids, added[0].id])]);
    setManualName("");
    setZone("canvas");
  }
  function generationFor(id: string) {
    return (
      generationPreferences[id] ??
      readGenerationPreferences(
        product?.subproducts.find((s: any) => s.id === id)?.studio
          ?.generationPreferences,
        { count, mode },
      )
    );
  }
  function changeGeneration(value: Partial<GenerationPreferences>) {
    if (!activeSub) return;
    setGenerationPreferences((p) => ({
      ...p,
      [activeSub]: { ...(p[activeSub] ?? generationFor(activeSub)), ...value },
    }));
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
        options: Object.fromEntries(ids.map((id) => [id, generationFor(id)])),
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
    if (files.length > 20)
      throw Error("Selecciona hasta20 archivos por subida.");
    for (const file of [...files]) {
      const form = new FormData();
      form.set("file", file);
      form.set("requestId", crypto.randomUUID());
      form.set("storage", uploadStorage);
      const r = await fetch("/api/creative-studio/upload/" + activeSub, {
        method: "POST",
        body: form,
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error ?? "No se pudo subir el recurso.");
      if (b.id)
        setSelected((s) => ({
          ...s,
          [activeSub]: [...new Set([...(s[activeSub] ?? []), b.id])],
        }));
    }
    await refreshGallery();
    if (uploadStorage === "folder") await reloadProduct();
    setNotice("✓ Recursos propios listos para la campaña");
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
  const campaignUser = useContext(CurrentUserId);
  const campaignSessions = useRef<{ user: string; values: Map<string, any> }>({
    user: campaignUser,
    values: new Map(),
  });
  if (campaignSessions.current.user !== campaignUser)
    campaignSessions.current = { user: campaignUser, values: new Map() };
  const [batchCampaign, setBatchCampaign] = useState(false);
  useEffect(() => setBatchCampaign(false), [product?.id]);
  const campaignScopeIds = batchCampaign
    ? (product?.subproducts ?? []).map((s: any) => s.id)
    : activeSub
      ? [activeSub]
      : [];
  const campaignSessionKey = [
    campaignUser,
    product?.id,
    country,
    batchCampaign ? "batch" : activeSub,
  ].join(":");
  const scopedCampaignItems = batchCampaign
    ? campaignItems
    : campaignItems.filter((i) => i.subproductId === activeSub);
  const restoreSelection = useCallback(
    (items: CampaignItem[]) =>
      setSelected((old) => {
        const next = { ...old };
        for (const id of campaignScopeIds) delete next[id];
        return {
          ...next,
          ...Object.fromEntries(
            items.map((i) => [i.subproductId, i.variationIds]),
          ),
        };
      }),
    [campaignScopeIds.join("|")],
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
      {pendingSelection && (
        <aside className="notice studio-replacement-handoff" role="status">
          <strong>
            Para anuncios · {countryName(pendingSelection.country)}
          </strong>
          <p>{pendingSelection.items.map((i: any) => i.name).join(" · ")}</p>
          {error && project && (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void run(() => chooseProject(project.id))}
            >
              Reintentar preparación
            </button>
          )}
          <small>
            {error
              ? "La selección sigue guardada."
              : project
                ? "Preparando carpeta y diplomados…"
                : "Elige un proyecto para preparar esta selección."}
          </small>
        </aside>
      )}
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
            <StudioMaximize pane="project" label="Tu proyecto" />
            <span className="studio-step mint">01</span>
            <div>
              <span className="studio-eyebrow">DALE UNA DIRECCIÓN</span>
              <h2>Tu proyecto</h2>
            </div>
          </header>
          <div
            className="studio-preparation-mode"
            role="group"
            aria-label="Preparar recursos"
          >
            <button
              type="button"
              aria-pressed={!ownMode}
              onClick={() => preparationMode(false)}
            >
              Con IA
            </button>
            <button
              type="button"
              aria-pressed={ownMode}
              onClick={() => preparationMode(true)}
            >
              Sin IA · fotos y videos
            </button>
          </div>
          <div className="studio-project-picker">
            <SearchSelect
              label="Proyecto"
              disabled={busy || loading}
              value={projectQuery}
              onChange={setProjectQuery}
              onSelect={(o) => void run(() => chooseProject(o.id))}
              options={names(context.projects)}
            />
            <button
              type="button"
              title={projectExists ? "Ya existe el proyecto" : "Crear proyecto"}
              disabled={
                busy || loading || !projectQuery.trim() || projectExists
              }
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
              {!ownMode && (
                <details
                  className="studio-project-config"
                  key={project.id}
                  open={projectConfigOpen}
                  onToggle={(e) => {
                    if (e.currentTarget.open !== projectConfigOpen)
                      setProjectConfigOpen(e.currentTarget.open);
                  }}
                >
                  <summary>Configuración</summary>
                  <div className="studio-project-config-content">
                    <label className="studio-prompt-label">
                      Instrucciones del proyecto
                      <textarea
                        aria-label="Configuración del proyecto"
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
                        {projectPrompt.length.toLocaleString("es-PE")}{" "}
                        caracteres
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
                              const s = {
                                ...settings,
                                quality: e.target.value,
                              };
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
                            const s = {
                              ...settings,
                              resolution: e.target.value,
                            };
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
                            const s = {
                              ...settings,
                              previewFirst: e.target.checked,
                            };
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
                      ✓ Guardar configuración
                    </button>
                  </div>
                </details>
              )}
              <div className="studio-section-divider" />

              <div className="studio-project-picker studio-product-picker">
                <SearchSelect
                  label="Producto / carpeta"
                  hideEmpty
                  value={productQuery}
                  disabled={busy || loading}
                  onChange={(value) => {
                    setProductQuery(value);
                    if (product && value !== product.name) {
                      setProduct(null);
                      setActiveSub("");
                      setCountry(pendingSelection?.country ?? "");
                      setTargetSubs([]);
                      setSelected({});
                    }
                  }}
                  onSelect={(o) => void run(() => chooseProduct(o.id))}
                  options={names(project.categories)}
                />
              </div>
              <div className="studio-country-create-row">
                <div className="studio-country-choice">
                  <span>
                    País de destino{" "}
                    {product && country && <small>✓ Guardado</small>}
                  </span>
                  <SheetSearchSelect
                    label="País de destino"
                    placeholder={
                      !product ? "Sin país por ahora" : "Selecciona un país"
                    }
                    value={country}
                    disabled={busy}
                    options={[
                      ...(!product
                        ? [{ value: "", label: "Sin país por ahora" }]
                        : []),
                      ...context.countries.map((c: any) => ({
                        value: c.code,
                        label: c.name + " · " + c.code,
                      })),
                    ]}
                    onSelect={(value) => void run(() => changeCountry(value))}
                  />
                </div>
                {!productExists && (
                  <button
                    type="button"
                    className="studio-create-product"
                    onMouseDown={(e) => e.preventDefault()}
                    disabled={busy || !productQuery.trim() || !project.canEdit}
                    onClick={() => void run(createProduct)}
                    title="Crear la carpeta con el nombre indicado"
                  >
                    ＋ Crear carpeta
                  </button>
                )}
              </div>
              {!product && (
                <small className="muted studio-country-hint">
                  Puedes elegir el país ahora o antes de preparar la campaña.
                </small>
              )}
              {product && (
                <>
                  <div className="studio-inventory-launch">
                    <label>
                      {ownMode ? "Lista de diplomados" : "Inventario"}
                      <select
                        aria-label="Inventario de productos"
                        disabled={busy || !!pendingSelection}
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
                    <StudioInventorySlots
                      manual={ownMode}
                      key={product.id + ":" + inventoryId + ":" + country}
                      listId={inventoryId}
                      country={country}
                      existingNames={product.subproducts.map(
                        (s: any) => s.name,
                      )}
                      predefined={!!pendingSelection || targetSubs.length > 0}
                      disabled={busy || !!pendingSelection}
                      focusRequest={inventoryFocusRequest}
                      loadDirectory={loadInventoryDirectory}
                      onChoose={(ids) => run(() => addItems(ids, country))}
                    />
                  </div>
                  <div className="studio-add-sub">
                    <input
                      aria-label="Nombre nuevo"
                      placeholder="O escribe un nombre…"
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
                      aria-label="Añadir nombre"
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
                          <small className="studio-folder-status">
                            {s.folderExists
                              ? `${s.folderCount ?? 0} afiches · Carpeta existente`
                              : "Nueva carpeta · Por guardar"}
                          </small>
                        </button>
                        <button
                          type="button"
                          className="studio-unpin"
                          aria-label={"Desfijar " + s.name}
                          title="Desfijar sin borrar"
                          disabled={busy}
                          onClick={() => void run(() => removeSubproduct(s))}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="studio-left-generate" hidden={ownMode}>
                    <span>
                      {targetSubs.length
                        ? targetSubs.length + " seleccionados"
                        : "Todos los elementos"}{" "}
                      ·{" "}
                      {(targetSubs.length
                        ? targetSubs
                        : product.subproducts.map((s: any) => s.id)
                      ).reduce(
                        (n: number, id: string) => n + generationFor(id).count,
                        0,
                      )}{" "}
                      variaciones en total
                    </span>
                    <button
                      type="button"
                      className="studio-generate-button"
                      hidden={ownMode}
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
                      elementos
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
          <header className="studio-pane-title">
            <StudioMaximize pane="canvas" label="Afiches" />
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
                    {production.orders.some(
                      (o) =>
                        o.scope?.subproduct === s.id &&
                        (o.running > 0 || o.pending > 0),
                    ) && (
                      <small
                        className="studio-tab-generation"
                        data-running={
                          production.orders.some(
                            (o) =>
                              o.scope?.subproduct === s.id && o.running > 0,
                          ) || undefined
                        }
                      >
                        {production.orders.some(
                          (o) => o.scope?.subproduct === s.id && o.running > 0,
                        )
                          ? "● Generando"
                          : "En espera"}
                      </small>
                    )}
                    {selected[s.id]?.length ? (
                      <span>{selected[s.id].length} ✓</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="studio-remove-tab"
                    aria-label={"Desfijar " + s.name}
                    title={"Desfijar " + s.name}
                    disabled={busy}
                    onClick={() => void run(() => removeSubproduct(s))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="studio-add-tab"
                disabled={!inventoryId || busy}
                onClick={focusInventorySelector}
                aria-label="Elegir más del inventario"
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
                  Seleccionar todos los recursos de este diplomado
                </label>
                <span>
                  {gallery.total} recursos · {currentSelection.length} elegidos
                </span>
              </div>
              <div className="studio-own-upload">
                <div>
                  <strong>Recursos para {active.name}</strong>
                  <small>
                    Fotos PNG/JPG/WebP · videos MP4/MOV H.264. Sin generación ni
                    cargo de IA.
                  </small>
                </div>
                <select
                  aria-label="Destino de los recursos propios"
                  value={uploadStorage}
                  onChange={(e) => setUploadStorage(e.target.value)}
                  disabled={busy}
                >
                  <option value="campaign">Solo campaña · temporal24h</option>
                  <option value="folder">Guardar en esta carpeta</option>
                </select>
                <label className="studio-upload-button">
                  ↑ Subir fotos o videos
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime"
                    disabled={busy}
                    onChange={(e) => {
                      const files = e.target.files;
                      void run(() => upload(files));
                      e.target.value = "";
                    }}
                  />
                </label>
                <small>
                  Los temporales se eliminan tras publicar o al vencer. Para
                  enviarlos a Meta se necesita una copia temporal. Fotos hasta{" "}
                  {Math.min(
                    16,
                    Math.round(
                      (context.maxOwnMediaBytes ?? 67108864) / 1048576,
                    ),
                  )}
                  MB; videos hasta{" "}
                  {Math.round((context.maxOwnMediaBytes ?? 67108864) / 1048576)}
                  MB.
                </small>
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
                    {i.mediaType === "VIDEO" ? (
                      <video
                        className="studio-own-video"
                        controls
                        preload="none"
                        src={`/api/variations/${i.id}?v=${i.revision}`}
                        aria-label={i.originalName ?? "Video propio"}
                      />
                    ) : (
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
                    )}
                    <div className="studio-poster-meta">
                      {i.originalName && (
                        <small title={i.originalName}>{i.originalName}</small>
                      )}
                      <span>
                        {i.permanent
                          ? "✓ En Biblioteca"
                          : i.isSample && i.reviewStatus !== "APPROVED"
                            ? "Primera muestra"
                            : i.ownResource
                              ? i.mediaType === "VIDEO"
                                ? "Video propio · temporal"
                                : "Foto propia · temporal"
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
                      {i.isSample &&
                        i.reviewStatus !== "APPROVED" &&
                        production.orders
                          .filter((o) => o.sample?.id === i.id)
                          .map((o) => (
                            <OrderProgressCard
                              key={o.id}
                              order={o}
                              refresh={production.refresh}
                              inline
                              approvalInImage
                            />
                          ))}
                    </div>
                  </article>
                ))}
                {production.orders
                  .filter((o) => o.scope?.subproduct === activeSub)
                  .map((o) => (
                    <StudioGenerationCard
                      key={o.id}
                      order={o}
                      refresh={production.refresh}
                      visibleImageIds={gallery.items.map((i: any) => i.id)}
                    />
                  ))}
                {Array.from(
                  {
                    length: production.orders.some(
                      (o) => o.scope?.subproduct === activeSub,
                    )
                      ? 0
                      : ownMode
                        ? 0
                        : Math.max(
                            1,
                            Math.min(6, generationFor(activeSub).count) -
                              (gallery.items.length
                                ? Math.min(
                                    gallery.items.length,
                                    Math.min(6, generationFor(activeSub).count),
                                  )
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
                  <strong>{currentSelection.length} recursos elegidos</strong>
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
                <ProductionControls
                  controller={{
                    ...production,
                    orders: [],
                  }}
                />
              </div>
              {!ownMode && (
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
                    value={
                      allPrompt ? commonPrompt : (prompts[activeSub] ?? "")
                    }
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
                    <label>
                      Variaciones
                      <input
                        aria-label="Cantidad de variaciones"
                        type="number"
                        min="1"
                        max="100"
                        value={generationFor(activeSub).count}
                        onChange={(e) =>
                          changeGeneration({
                            count: Math.max(
                              1,
                              Math.min(100, Number(e.target.value) || 1),
                            ),
                          })
                        }
                      />
                    </label>
                    <select
                      aria-label="Tipo de afiche"
                      value={generationFor(activeSub).mode}
                      onChange={(e) =>
                        changeGeneration({
                          mode: e.target.value as GenerationPreferences["mode"],
                        })
                      }
                    >
                      {modes.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <label className="studio-price-field">
                      Precio
                      <input
                        aria-label="Precio de este diplomado"
                        type="text"
                        maxLength={160}
                        placeholder="Sin precio"
                        title={
                          generationFor(activeSub).priceText.trim()
                            ? "Se incluirá tal como está escrito, junto con las condiciones del prompt."
                            : "Opcional. Vacío: se respeta lo indicado en el prompt. Ej.: 40 USD, 90 mil pesos, 30 soles."
                        }
                        value={generationFor(activeSub).priceText}
                        onChange={(e) =>
                          changeGeneration({ priceText: e.target.value })
                        }
                      />
                    </label>
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
                          (allPrompt
                            ? product.subproducts.reduce(
                                (n: number, s: any) =>
                                  n + generationFor(s.id).count,
                                0,
                              )
                            : generationFor(activeSub).count)}
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
              )}
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
            key={campaignSessionKey}
            categoryId={product.id}
            country={country}
            countryBusy={busy}
            onCountryChange={(value) => run(() => changeCountry(value))}
            accounts={context.accounts}
            items={scopedCampaignItems}
            scopeIds={campaignScopeIds}
            scopeName={
              batchCampaign
                ? "Selección de diplomados"
                : (active?.name ?? "Selecciona un diplomado")
            }
            batch={batchCampaign}
            onBatchChange={setBatchCampaign}
            batchCount={campaignItems.length}
            workspaceState={campaignSessions.current.values.get(
              campaignSessionKey,
            )}
            onWorkspaceState={(value) => {
              campaignSessions.current.values.set(campaignSessionKey, value);
              if (campaignSessions.current.values.size > 50)
                campaignSessions.current.values.delete(
                  campaignSessions.current.values.keys().next().value!,
                );
            }}
            template={
              (!batchCampaign
                ? active?.studio?.campaignTemplates?.[country]
                : undefined) ??
              templateForAnotherDiploma(
                project?.studio?.campaignTemplates?.[country],
              )
            }
            latestLaunchId={
              !batchCampaign
                ? (product.latestLaunchIds?.[activeSub] ??
                  product.latestLaunchId)
                : product.latestLaunchId
            }
            onRestore={restoreSelection}
          />
        ) : (
          <aside className="studio-pane studio-campaign studio-campaign-empty">
            <header className="studio-pane-title">
              <StudioMaximize pane="campaign" label="De afiche a anuncio" />
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
      {preview && (
        <ImagePreviewModal {...preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}
