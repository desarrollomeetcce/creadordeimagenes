"use client";
import { ProjectSharing } from "./project-sharing";
import { uploadResource } from "./resource-upload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchyFromLocation,
  emptyHierarchy,
  type HierarchyValue,
} from "./hierarchy-filters";
import {
  FolderTree,
  FolderBreadcrumbs,
  folderScope,
  hierarchyFolder,
  type FolderNode,
} from "./folder-navigation";
import { DateRange } from "./date-range";
import { SearchSelect } from "./search-select";
import { useCanEdit } from "./role-guide";
import { ErrorNotice } from "./error-notice";
import { ImagePreviewModal } from "./image-preview-modal";
import { ImageEditorModal } from "./image-editor-modal";
import {
  OrderProgressCard,
  orderNeedsControls,
  orderRequest,
  driveOrder,
  type OrderProgress,
} from "./order-progress";
import { usdMicros } from "../../lib/usage-format";
import { costLink } from "./hierarchy-filters";
import { downloadArchive } from "./collection-gallery";
import {
  GenerationImageCard,
  type PendingImage,
} from "./generation-image-card";
type Item = {
  entryId: string;
  selectionId: string;
  copied: boolean;
  sourceNotice?: string | null;
  canEdit: boolean;
  canApprove: boolean;
  actualMicros?: string | null;
  job: { id: string };
  id: string;
  revision: number;
  createdAt: string;
  reviewStatus: string;
  model: string;
  mediaType?: string;
  ownResource?: boolean;
  originalName?: string | null;
  subproduct: {
    id: string;
    name: string;
    category: {
      id: string;
      name: string;
      project: { id: string; name: string };
    };
  } | null;
};
type Doc = {
  id: string;
  name: string;
  size: number;
  mime: string;
  large?: boolean;
  hasPreview?: boolean;
  generationReady?: boolean;
};
type Data = {
  query?: string;
  orders: OrderProgress[];
  inflight: PendingImage[];
  inflightTotal: number;
  entries: { kind: string; id: string }[];
  tree: FolderNode[];
  items: Item[];
  documents: Doc[];
  counts: Record<string, number>;
  total: number;
  page: number;
  pages: number;
};
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/library/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
export type LibraryPicker = {
  selected: string[];
  onChange: (ids: string[], names: Record<string, string>) => void;
};
export function Library({ picker }: { picker?: LibraryPicker } = {}) {
  const [shareFolder, setShareFolder] = useState<FolderNode | null>(null);
  const [folderLayout, setFolderLayout] = useState("cards");
  const [searchText, setSearchText] = useState(""),
    [query, setQuery] = useState(""),
    [folderLimit, setFolderLimit] = useState(50),
    [foldersOpen, setFoldersOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim());
      setPage(1);
      setFolderLimit(50);
      if (!picker) setSelectionState([]);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    revision: number;
    subproductHref?: string;
    sourceNotice?: string | null;
  } | null>(null);
  const permitted = useCanEdit(),
    canEdit = permitted && !picker;
  const [hierarchy, setHierarchy] = useState<HierarchyValue>(() =>
      picker ? { ...emptyHierarchy } : hierarchyFromLocation(),
    ),
    [folder, setFolder] = useState(() =>
      picker || typeof window === "undefined"
        ? ""
        : (new URLSearchParams(location.search).get("folder") ??
          hierarchyFolder(hierarchyFromLocation())),
    );
  const [data, setData] = useState<Data | null>(null),
    [selectionState, setSelectionState] = useState<string[]>([]),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState("25"),
    [size, setSize] = useState(picker ? "small" : "medium"),
    [format, setFormat] = useState<"png" | "jpg">("png"),
    [review, setReview] = useState("all"),
    [sort, setSort] = useState("newest"),
    [kind, setKind] = useState("all"),
    [recursive, setRecursive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [refreshing, setRefreshing] = useState(true);
  const selected = picker?.selected ?? selectionState;
  const setSelected = (value: string[] | ((old: string[]) => string[])) => {
    const ids = (typeof value === "function" ? value(selected) : value).slice(
      0,
      picker ? 30 : 200,
    );
    if (picker) {
      const names: Record<string, string> = {};
      for (const node of data?.tree ?? []) names["n:" + node.id] = node.name;
      for (const image of data?.items ?? [])
        names[image.selectionId] = image.subproduct?.name ?? "Imagen";
      for (const d of data?.documents ?? []) names["d:" + d.id] = d.name;
      picker.onChange(ids, names);
    } else setSelectionState(ids);
  };
  const [clipboard, setClipboard] = useState<{
    operation: "move" | "copy";
    selection: string[];
  } | null>(null);
  const dragging = useRef<string[]>([]);
  const [dropTarget, setDropTarget] = useState("");
  const [move, setMove] = useState(false),
    [target, setTarget] = useState("__unselected"),
    [targetQuery, setTargetQuery] = useState(""),
    [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
      null,
    );
  const loadingRequest = useRef<AbortController | null>(null);
  const revision = useRef(0),
    latest = useRef<Data | null>(null);
  latest.current = data;
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of data?.tree ?? [])
      if (node.parentId)
        counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
    return counts;
  }, [data?.tree]);
  const params = new URLSearchParams({
    ...hierarchy,
    folder,
    q: query,
    resultsOnly: "true",
    page: String(page),
    limit,
    review,
    order: sort,
    kind,
    recursive: String(recursive),
  }).toString();
  const refresh = useCallback(async () => {
    const seq = ++revision.current;
    loadingRequest.current?.abort();
    const controller = new AbortController();
    loadingRequest.current = controller;
    setRefreshing(true);
    try {
      const result = await api(
        "explorer?" + params,
        "GET",
        undefined,
        controller.signal,
      );
      if (seq === revision.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (seq === revision.current)
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      if (seq === revision.current) setRefreshing(false);
    }
  }, [params]);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
      loadingRequest.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    const load = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(() => {
      if (
        (latest.current?.orders ?? []).some(
          (o) =>
            ["QUEUED", "STARTING", "ACTIVE"].includes(o.status) ||
            o.running > 0,
        ) ||
        (latest.current?.counts.RUNNING ?? 0) > 0
      )
        load();
    }, 5000);
    window.addEventListener("focus", load);
    const channel = new BroadcastChannel("studio-updates");
    channel.onmessage = load;
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
      channel.close();
    };
  }, [refresh]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document
      .querySelector<HTMLButtonElement>(
        ".explorer-context-menu button:not(:disabled)",
      )
      ?.focus();
    window.addEventListener("click", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const open = (key: string) => {
    setSearchText("");
    setQuery("");
    setFolderLimit(50);
    setFoldersOpen(false);
    const h = folderScope(data?.tree ?? [], key, hierarchy);
    setHierarchy(h);
    setFolder(key);
    setPage(1);
    if (!picker) setSelected([]);
    const p = new URLSearchParams({
      view: "library",
      tab: "images",
      ...h,
      ...(key ? { folder: key } : {}),
    });
    if (!picker) history.replaceState(null, "", "?" + p);
  };
  const action = async (fn: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const outcome = await fn();
      if (!picker) setSelected([]);
      await refresh();
      setMessage(typeof outcome === "string" ? outcome : text);
      const c = new BroadcastChannel("studio-updates");
      c.postMessage("library");
      c.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const toggle = (id: string, checked: boolean) =>
    setSelected((old) =>
      checked
        ? [...new Set([...old, id])].slice(0, 200)
        : old.filter((x) => x !== id),
    );
  const context = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (picker) return;
    if (id && !selected.includes(id)) setSelected([id]);
    setMenu({
      x: Math.min(e.clientX, Math.max(0, innerWidth - 220)),
      y: Math.min(e.clientY, Math.max(0, innerHeight - 390)),
      id,
    });
  };
  const matchingFolders = useMemo(() => {
    const nodes = data?.tree ?? [],
      byId = new Map(nodes.map((n) => [n.id, n])),
      words = query.toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
    return nodes.filter((n) => {
      if (!query) return n.parentId === (folder || null);
      let p = n.parentId,
        inside = !folder;
      const seen = new Set<string>([n.id]);
      while (p && !seen.has(p)) {
        if (p === folder) inside = true;
        seen.add(p);
        p = byId.get(p)?.parentId ?? null;
      }
      return (
        inside &&
        n.id !== folder &&
        words.every((w) => n.name.toLocaleLowerCase("es").includes(w))
      );
    });
  }, [data?.tree, folder, query]);
  const folders = matchingFolders.slice(0, folderLimit);
  const chooseAll = () =>
    setSelected(
      [
        ...folders.filter((f) => f.kind !== "loose").map((f) => "n:" + f.id),
        ...(data?.items ?? []).map((i) => i.selectionId),
        ...(data?.documents ?? []).map((d) => "d:" + d.id),
      ].slice(0, 200),
    );
  const selectionScope = useRef(params);
  selectionScope.current = params;
  const selectAll = async (onlyImages = false) => {
    const scope = params;
    setBusy(true); setError("");
    try {
      const all: string[] = onlyImages ? [] : matchingFolders.filter(f => f.kind !== "loose").map(f => "n:" + f.id);
      for (let batchPage = 1; batchPage <= 2; batchPage++) {
        const p = new URLSearchParams(scope);
        p.set("limit", "100"); p.set("page", String(batchPage));
        if (onlyImages) p.set("kind", "images");
        const batch: Data = await api("explorer?" + p);
        if (selectionScope.current !== scope) return;
        all.push(...batch.items.map(v => v.selectionId), ...(onlyImages ? [] : batch.documents.map(d => "d:" + d.id)));
        if (batchPage >= batch.pages) break;
      }
      if (selectionScope.current === scope) {
        const limit = picker ? 30 : 200;
        const ids = [...new Set(all)];
        setSelected(ids.slice(0, limit));
        setMessage(ids.length >= limit ? "Selección por lote: hasta " + limit + " elementos." : ids.length + " elementos seleccionados.");
      }
    } catch (e) {
      if (selectionScope.current === scope) setError(e instanceof Error ? e.message : "No se pudo seleccionar.");
    } finally { setBusy(false); }
  };
  const projectFolderWarning =
    "Evita modificar o mover las carpetas de proyectos. Utiliza preferentemente carpetas personales para organizar tus archivos.";
  const selectedProjectFolder = selected.some(
    (id) =>
      id.startsWith("n:") &&
      data?.tree.some(
        (n) =>
          n.id === id.slice(2) && n.kind !== "folder" && n.kind !== "loose",
      ),
  );
  const transfer = (
    operation: "move" | "copy",
    selection: string[],
    destination: string,
    clearClipboard = false,
  ) =>
    void action(
      async () => {
        await api("selection-actions", "POST", {
          operation,
          selection,
          destination: destination || "loose:root",
        });
        if (clearClipboard) setClipboard(null);
        setMove(false);
        setDropTarget("");
      },
      operation === "copy"
        ? "Copias añadidas a la carpeta. Conservan el mismo original y sus permisos."
        : "Selección movida.",
    );
  const removeSelection = () => {
    if (
      !selected.length ||
      !confirm(
        "¿Quitar esta selección de la Biblioteca? Las carpetas y sus subcarpetas se retiran de tu vista; sus archivos pasan a Archivos sin carpeta. Los proyectos y originales de las imágenes se conservan.",
      )
    )
      return;
    void action(
      () =>
        api("selection-actions", "POST", {
          operation: "delete",
          selection: selected,
        }),
      "Selección retirada de tu Biblioteca. El origen se conserva.",
    );
  };
  const moveSelection = () => transfer("move", selected, target);
  const paste = (destination = folder) => {
    if (clipboard && !busy)
      transfer(
        clipboard.operation,
        clipboard.selection,
        destination,
        clipboard.operation === "move",
      );
  };
  const prepare = (operation: "move" | "copy") => {
    setClipboard({ operation, selection: [...selected] });
    setMenu(null);
    setMessage(
      operation === "move"
        ? "Selección cortada. Abre el destino y pulsa Pegar."
        : "Selección copiada. Abre el destino y pulsa Pegar.",
    );
  };
  const dragStart = (e: React.DragEvent, id: string) => {
    if (!canEdit || busy) return;
    e.stopPropagation();
    const ids = selected.includes(id) ? selected : [id];
    setSelected(ids);
    if (
      ids.some(
        (id) =>
          id.startsWith("n:") &&
          data?.tree.some((n) => n.id === id.slice(2) && n.kind !== "folder"),
      )
    )
      setMessage(projectFolderWarning);
    dragging.current = ids;
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("application/x-studio-library", JSON.stringify(ids));
  };
  const dragOver = (e: React.DragEvent, key: string) => {
    if (!canEdit || busy || !dragging.current.length) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? "copy" : "move";
    setDropTarget(key);
  };
  const drop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const ids = dragging.current;
    dragging.current = [];
    setDropTarget("");
    if (canEdit && !busy && ids.length)
      transfer(e.ctrlKey || e.metaKey ? "copy" : "move", ids, key);
  };
  const shortcuts = (e: React.KeyboardEvent) => {
    if (
      !canEdit ||
      busy ||
      (e.target instanceof HTMLElement &&
        e.target.closest("input,textarea,select,[contenteditable=true]"))
    )
      return;
    if (
      (e.ctrlKey || e.metaKey) &&
      ["c", "x", "v"].includes(e.key.toLowerCase())
    ) {
      if (e.key.toLowerCase() === "v") {
        if (!clipboard) return;
        e.preventDefault();
        paste();
      } else if (selected.length) {
        e.preventDefault();
        prepare(e.key.toLowerCase() === "x" ? "move" : "copy");
      }
    } else if (e.key === "Delete" && selected.length) {
      e.preventDefault();
      removeSelection();
    }
  };
  const upload = async (file: File) => {
    if (file.size > 3000000) {
      const status = await fetch("/api/storage/tree", {
        cache: "no-store",
      }).then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        return b;
      });
      const saved = await uploadResource(file, {
        folderId: folder.startsWith("folder:") ? folder.slice(7) : "",
        purpose: file.type.startsWith("image/")
          ? "Referencia visual"
          : "Material de contexto",
        userId: status.userId,
        paused: () => false,
        onProgress: (bytes, total) =>
          setMessage(
            `Subiendo ${file.name}: ${(bytes / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB`,
          ),
      });
      if (folder && !folder.startsWith("folder:") && folder !== "loose:root")
        await api("selection-actions", "POST", {
          operation: "move",
          selection: ["d:" + saved.id],
          destination: folder,
        });
      return;
    }

    const form = new FormData();
    form.set("file", file);
    if (folder.startsWith("folder:")) form.set("folderId", folder.slice(7));
    form.set("destination", folder || "loose:root");
    const r = await fetch("/api/library/documents", {
      method: "POST",
      body: form,
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
  };
  const editingItem = data?.items.find((item) => item.id === editing);
  const editingSubproduct = editingItem?.subproduct;
  const previewItem = data?.items.find((item) => item.id === preview?.id);
  const previewNotice = previewItem
    ? previewItem.sourceNotice
    : preview?.sourceNotice;
  const anchors = new Map<string, OrderProgress>();
  for (const order of data?.orders ?? []) {
    if (!orderNeedsControls(order)) continue;
    const image =
      data?.items.find((i) => i.job.id === order.sampleJobId) ??
      data?.items.find((i) => order.jobs?.some((j) => j.id === i.job.id));
    const slot = data?.inflight?.find((i) => i.orderId === order.id);
    if (image || slot) anchors.set(image?.id ?? slot!.id, order);
  }
  const renderImage = (i: Item) => {
    const anchorOrder = anchors.get(i.id);
    if (picker)
      return (
        <article
          key={i.entryId}
          className="card gallery library-picker-image"
          data-library-selection={i.selectionId}
        >
          <label className="row">
            <input
              type="checkbox"
              checked={selected.includes(i.selectionId)}
              onChange={(e) => toggle(i.selectionId, e.target.checked)}
            />
            Seleccionar
          </label>
          {i.mediaType === "VIDEO" ? (
            <video
              controls
              preload="none"
              style={{ width: "100%", maxHeight: 240 }}
              src={"/api/variations/" + i.id}
              aria-label={i.originalName ?? "Video propio"}
            />
          ) : (
            <button
              type="button"
              className="image-preview-trigger"
              onClick={() =>
                setPreview({
                  id: i.id,
                  name: i.subproduct?.name ?? "Imagen",
                  revision: i.revision,
                })
              }
            >
              <img
                loading="lazy"
                src={`/api/variations/${i.id}?thumbnail=true&v=${i.revision}`}
                alt={i.subproduct?.name ?? "Imagen"}
              />
            </button>
          )}
          <strong>{i.subproduct?.name ?? "Imagen"}</strong>
          <small>
            {i.reviewStatus === "APPROVED" ? "Aprobada" : "Por aprobar"}
          </small>
        </article>
      );

    return (
      <article
        key={i.entryId}
        data-library-selection={i.selectionId}
        className={
          "card gallery " +
          (i.reviewStatus !== "APPROVED"
            ? "image-awaiting-approval"
            : "image-approved") +
          (clipboard?.operation === "move" &&
          clipboard.selection.includes(i.selectionId)
            ? " library-cut"
            : "")
        }
        onContextMenu={(e) => context(e, i.selectionId)}
        draggable={canEdit}
        onDragStart={(e) => dragStart(e, i.selectionId)}
        onDragEnd={() => {
          dragging.current = [];
          setDropTarget("");
        }}
      >
        <label className="row">
          <input
            type="checkbox"
            checked={selected.includes(i.selectionId)}
            onChange={(e) => toggle(i.selectionId, e.target.checked)}
          />
          Seleccionar
        </label>
        <span
          className={
            "badge " +
            (i.reviewStatus === "APPROVED"
              ? "status-completed"
              : "approval-required")
          }
        >
          {i.reviewStatus === "APPROVED"
            ? "Aprobada"
            : "Pendiente de aprobación"}
        </span>
        {i.mediaType === "VIDEO" ? (
          <video
            controls
            preload="none"
            style={{ width: "100%", maxHeight: 240 }}
            src={"/api/variations/" + i.id}
            aria-label={i.originalName ?? "Video propio"}
          />
        ) : (
          <button
            type="button"
            className="image-preview-trigger"
            aria-label={`Ampliar imagen · ${i.subproduct?.name ?? "Prueba de IA"}`}
            onClick={() =>
              setPreview({
                id: i.id,
                name: i.subproduct?.name ?? "Prueba de IA",
                revision: i.revision,
                sourceNotice: i.sourceNotice,
                subproductHref:
                  i.subproduct && !i.sourceNotice
                    ? "?" +
                      new URLSearchParams({
                        view: "projects",
                        category: i.subproduct.category.id,
                        subproduct: i.subproduct.id,
                      })
                    : undefined,
              })
            }
          >
            <img
              loading="lazy"
              src={
                "/api/variations/" + i.id + "?thumbnail=true&v=" + i.revision
              }
              alt={i.subproduct?.name ?? "Prueba de IA"}
            />
          </button>
        )}
        <strong>{i.subproduct?.name ?? "Prueba de IA"}</strong>
        {i.copied && (
          <small title="Comparte el archivo, versiones y permisos del original">
            Copia de Biblioteca · mismo original
          </small>
        )}
        {i.sourceNotice ? (
          <span className="source-deleted-notice">{i.sourceNotice}</span>
        ) : (
          i.subproduct && (
            <a
              className="button"
              href={
                "?" +
                new URLSearchParams({
                  view: "projects",
                  category: i.subproduct.category.id,
                  subproduct: i.subproduct.id,
                })
              }
            >
              {i.canEdit ? "Editar subproducto" : "Ir al subproducto"} ↗
            </a>
          )
        )}
        {i.canApprove && i.reviewStatus !== "APPROVED" && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const order = data?.orders?.find(
                  (o) => o.canManage && o.sampleJobId === i.job.id,
                );
                if (order) {
                  const updated = await orderRequest(`/${order.id}/approve`, {
                    jobId: i.job.id,
                  });
                  if (order.mode === "immediate" && updated.status === "ACTIVE")
                    void driveOrder(order.id, refresh).catch((e) =>
                      setError(e.message),
                    );
                  if (
                    ["NEEDS_REVIEW", "DISPATCH_UNCERTAIN"].includes(
                      updated.status,
                    )
                  )
                    return "Imagen aprobada y conservada. La continuación necesita atención; revisa el motivo y la acción disponible en esta imagen.";
                } else {
                  const response = await fetch(
                    `/api/jobs/${i.job.id}/approve`,
                    { method: "POST" },
                  );
                  const result = await response.json();
                  if (!response.ok) throw Error(result.error);
                }
              }, "Imagen aprobada. La orden continúa según el modo que elegiste al enviarla.")
            }
          >
            {data?.orders.some(
              (o) => o.canManage && o.sampleJobId === i.job.id && o.pending > 0,
            )
              ? "Aprobar y continuar"
              : "Aprobar imagen"}
          </button>
        )}
        {i.canEdit && !i.ownResource && (
          <button type="button" onClick={() => setEditing(i.id)}>
            Editar imagen
          </button>
        )}
        <details className="library-file-details">
          <summary>Detalles del archivo</summary>
          <p className="hint">
            {i.subproduct
              ? [
                  i.subproduct.category.project.name,
                  i.subproduct.category.name,
                  i.subproduct.name,
                ].join(" / ")
              : "Pruebas"}
            <br />
            {new Date(i.createdAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
            })}
          </p>
          {i.actualMicros !== undefined && (
            <p className="hint">
              Coste informado:{" "}
              {i.actualMicros === null
                ? "No informado"
                : "USD " + usdMicros(i.actualMicros)}
              <br />
              <a
                href={costLink({
                  project: i.subproduct?.category.project.id ?? "none",
                  product: i.subproduct?.category.id ?? "",
                  subproduct: i.subproduct?.id ?? "",
                  from: hierarchy.from,
                  to: hierarchy.to,
                })}
              >
                Ver costos de esta carpeta →
              </a>
            </p>
          )}
        </details>
        <a href={"/api/variations/" + i.id + "?download"}>
          Descargar {i.mediaType === "VIDEO" ? "video" : "imagen"}
        </a>
        {anchorOrder && (
          <OrderProgressCard
            inline
            approvalInImage
            order={anchorOrder}
            refresh={refresh}
          />
        )}
      </article>
    );
  };
  return (
    <section
      className={"stack library-explorer" + (picker ? " library-picker" : "")}
      tabIndex={-1}
      onKeyDown={shortcuts}
      onPaste={(e) => {
        if (!canEdit || busy || !e.clipboardData.files.length) return;
        const files = Array.from(e.clipboardData.files);
        e.preventDefault();
        void action(async () => {
          for (const file of files) await upload(file);
        }, "Archivos pegados en la carpeta.");
      }}
    >
      {preview && (
        <ImagePreviewModal
          id={preview.id}
          name={preview.name}
          revision={preview.revision}
          sourceNotice={previewNotice}
          subproductHref={previewNotice ? undefined : preview.subproductHref}
          onClose={() => setPreview(null)}
        />
      )}
      {editing && (
        <ImageEditorModal
          id={editing}
          sourceNotice={editingItem?.sourceNotice}
          subproductHref={
            editingSubproduct && !editingItem?.sourceNotice
              ? "?" +
                new URLSearchParams({
                  view: "projects",
                  category: editingSubproduct.category.id,
                  subproduct: editingSubproduct.id,
                })
              : undefined
          }
          onClose={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}
      <div className={"explorer-layout" + (foldersOpen ? " folders-open" : "")}>
        <FolderTree
          nodes={data?.tree ?? []}
          current={folder}
          onOpen={open}
          grouped
          dropTarget={dropTarget}
          onContext={context}
          onDragStart={
            canEdit ? (e, key) => dragStart(e, "n:" + key) : undefined
          }
          onDragOver={dragOver}
          onDrop={drop}
          onDragEnd={() => {
            dragging.current = [];
            setDropTarget("");
          }}
        />
        <div
          className="explorer-content stack"
          onContextMenu={(e) => {
            if (
              !(e.target instanceof HTMLElement) ||
              !e.target.closest("article,button,a,input,select,textarea")
            )
              context(e, "");
          }}
          onDragOver={(e) => {
            if (e.target === e.currentTarget)
              dragOver(e, folder || "loose:root");
          }}
          onDrop={(e) => {
            if (e.target === e.currentTarget) drop(e, folder || "loose:root");
          }}
        >
          <div className="library-address-bar">
            <button
              type="button"
              className="library-folders-toggle"
              aria-expanded={foldersOpen}
              onClick={() => setFoldersOpen((v) => !v)}
            >
              ☰ Carpetas
            </button>
            {!picker &&
              data?.tree.find(
                (n) =>
                  n.id === folder && n.canManageSharing && !n.sourceDeleted,
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    setShareFolder(data!.tree.find((n) => n.id === folder)!)
                  }
                >
                  Compartir carpeta
                </button>
              )}
            <FolderBreadcrumbs
              root="Todas las carpetas"
              nodes={data?.tree ?? []}
              current={folder}
              onOpen={open}
            />
            <form
              className="library-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(searchText.trim());
                setPage(1);
                setFolderLimit(50);
                if (!picker) setSelectionState([]);
              }}
            >
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                aria-label="Buscar carpetas e imágenes"
                placeholder="Buscar carpetas, imágenes o archivos…"
                maxLength={200}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              {searchText && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => {
                    setSearchText("");
                    setQuery("");
                    setPage(1);
                  }}
                >
                  ×
                </button>
              )}
            </form>
          </div>
          <div className="explorer-tools stack">
            <div className="library-location-summary">
              <DateRange
                from={hierarchy.from}
                to={hierarchy.to}
                onChange={(from, to) => {
                  setHierarchy((h) => ({ ...h, from, to }));
                  setPage(1);
                  if (!picker) setSelected([]);
                }}
              />
              <span role="status" aria-busy={refreshing}>
                {refreshing
                  ? "Actualizando…"
                  : query
                    ? `${matchingFolders.length} carpetas · ${data?.total ?? 0} imágenes · ${data?.documents.length ?? 0} archivos en esta página`
                    : `${(data?.counts.COMPLETED ?? 0).toLocaleString("es-PE")} imágenes generadas · ${data?.counts.PENDING ?? 0} pendientes · ${data?.counts.RUNNING ?? 0} generando`}
              </span>
            </div>
            <div className="explorer-toolbar">
              <details className="other-filters">
                <summary>Otros filtros</summary>
                <div className="toolbar-popover stack">
                  <label>
                    Estado
                    <select
                      value={review}
                      onChange={(e) => {
                        setReview(e.target.value);
                        setPage(1);
                        if (!picker) setSelected([]);
                      }}
                    >
                      <option value="all">Todos</option>
                      <option value="approved">Aprobadas</option>
                      <option value="pending">Por aprobar</option>
                    </select>
                  </label>
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={recursive}
                      onChange={(e) => {
                        setRecursive(e.target.checked);
                        setPage(1);
                        if (!picker) setSelected([]);
                      }}
                    />
                    Incluir imágenes de subcarpetas
                  </label>
                  <label>
                    Ordenar
                    <select
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="newest">Más recientes primero</option>
                      <option value="oldest">Más antiguas primero</option>
                    </select>
                  </label>
                  <label>
                    Mostrar
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setPage(1);
                        if (!picker) setSelected([]);
                      }}
                    >
                      <option value="all">Imágenes y archivos</option>
                      <option value="images">Solo imágenes</option>
                      <option value="documents">Solo archivos</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => void refresh()}>
                    Actualizar
                  </button>
                </div>
              </details>
              <details>
                <summary>Seleccionar · {selected.length} seleccionados</summary>
                <div className="toolbar-popover stack">
                  <button type="button" disabled={busy} onClick={chooseAll}>
                    Seleccionar esta página
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void selectAll()}
                  >
                    Seleccionar todo · hasta {picker ? 30 : 200}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void selectAll(true)}>Seleccionar todas las imágenes y videos · hasta {picker ? 30 : 200}</button>
                  <button type="button" disabled={busy} onClick={() => setSelected(matchingFolders.filter(f=>f.kind!=="loose").map(f=>"n:"+f.id))}>Seleccionar todas las carpetas · hasta {picker ? 30 : 200}</button>
                  <button type="button" disabled={busy} onClick={() => setSelected([])}>
                    Limpiar selección
                  </button>
                </div>
              </details>
              {canEdit && (
                <button
                  type="button"
                  disabled={!selected.length || busy}
                  onClick={() => {
                    setTarget("__unselected");
                    setTargetQuery("");
                    setMove(true);
                  }}
                >
                  Mover ({selected.length})
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  disabled={!clipboard || busy}
                  onClick={() => paste()}
                >
                  Pegar{clipboard ? ` (${clipboard.selection.length})` : ""}
                </button>
              )}
              <label>
                Ver
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(e.target.value);
                    setPage(1);
                  }}
                >
                  {["25", "50", "100"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              {!picker && (
                <div
                  className="library-folder-view"
                  aria-label="Vista de carpetas"
                >
                  <button
                    type="button"
                    aria-pressed={folderLayout === "cards"}
                    onClick={() => setFolderLayout("cards")}
                  >
                    ▦ Tarjetas
                  </button>
                  <button
                    type="button"
                    aria-pressed={folderLayout === "list"}
                    onClick={() => setFolderLayout("list")}
                  >
                    ☷ Tabla
                  </button>
                </div>
              )}
              <label>
                Tamaño
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="small">Pequeñas</option>
                  <option value="medium">Medianas</option>
                  <option value="large">Grandes</option>
                </select>
              </label>
              <label>
                Formato
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "png" | "jpg")}
                >
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                </select>
              </label>
              {!picker && (
                <button
                  type="button"
                  disabled={!selected.some(id => /^(v:|c:|n:)/.test(id)) || busy}
                  onClick={() =>
                    void action(
                      () => downloadArchive({ selection: selected, format }, "recursos.zip", "/api/library/export"),
                      "Descarga preparada.",
                    )
                  }
                >
                  Descargar selección
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="danger"
                  disabled={!selected.length || busy}
                  onClick={removeSelection}
                >
                  Eliminar
                </button>
              )}
            </div>
          </div>

          <div className="row library-folder-tools">
            {" "}
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const name = prompt("Nombre de la nueva carpeta");
                  if (name)
                    void action(
                      () =>
                        api("folder-actions", "POST", {
                          action: "create",
                          name,
                          destination: folder || null,
                        }),
                      "Carpeta creada.",
                    );
                }}
              >
                ＋ Nueva carpeta
              </button>
            )}
            {canEdit && (
              <label className="button upload-document">
                Añadir archivo
                <input
                  type="file"
                  accept=".pdf,.txt,.csv,.docx,.png,.jpg,.jpeg,.webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void action(() => upload(f), "Archivo guardado.");
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {error && (
            <ErrorNotice message={error} onDismiss={() => setError("")} />
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          {move && (
            <section className="panel stack" aria-label="Mover selección">
              <h3>Mover {selected.length} elementos</h3>
              {selectedProjectFolder && (
                <p className="library-project-warning" role="note">
                  ⚠ {projectFolderWarning}
                </p>
              )}
              <SearchSelect
                label="Carpeta de destino"
                value={targetQuery}
                onChange={(v) => {
                  setTargetQuery(v);
                  setTarget("__unselected");
                }}
                onSelect={(o) => {
                  setTarget(o.id);
                  setTargetQuery(o.label);
                }}
                browseOnToggle
                options={[
                  { id: "", label: "Raíz de la biblioteca" },
                  ...(data?.tree ?? [])
                    .filter((n) => !selected.includes("n:" + n.id))
                    .map((n) => ({
                      id: n.id,
                      label: n.name,
                      detail:
                        data?.tree.find((p) => p.id === n.parentId)?.name ??
                        "Biblioteca",
                    })),
                ]}
              />
              <p className="hint">
                Mueve carpetas e imágenes sin modificar sus proyectos ni
                permisos de origen. También puedes arrastrarlas al árbol o a una
                carpeta; mantén Ctrl para copiar.
              </p>
              <div className="row">
                <button
                  type="button"
                  disabled={busy || target === "__unselected"}
                  onClick={moveSelection}
                >
                  Mover aquí
                </button>
                <button type="button" onClick={() => setMove(false)}>
                  Cancelar
                </button>
              </div>
            </section>
          )}
          {shareFolder && (
            <section
              className="panel stack"
              aria-label={"Compartir " + shareFolder.name}
            >
              <div className="row">
                <strong>Compartir · {shareFolder.name}</strong>
                <button type="button" onClick={() => setShareFolder(null)}>
                  Cerrar
                </button>
              </div>
              <ProjectSharing
                projectId={shareFolder.id.slice(
                  shareFolder.id.indexOf(":") + 1,
                )}
                scope={
                  shareFolder.kind === "product"
                    ? "category"
                    : (shareFolder.kind as "project" | "subproduct" | "folder")
                }
              />
            </section>
          )}
          {[
            { name: "Carpetas de proyectos", personal: false },
            { name: "Carpetas personales", personal: true },
          ].map((group) => {
            const list = folders.filter(
              (f) => (f.kind === "folder") === group.personal,
            );
            if (!list.length) return null;
            return (
              <section
                key={group.name}
                className="library-folder-group"
                aria-label={group.name}
              >
                <h3>{group.name}</h3>
                <div
                  className={
                    "folder-cards size-" + size + " layout-" + folderLayout
                  }
                >
                  {list.map((f) => (
                    <article
                      key={f.id}
                      data-folder-key={f.id}
                      className={
                        "folder-card" +
                        (dropTarget === f.id ? " library-drop-target" : "") +
                        (clipboard?.operation === "move" &&
                        clipboard.selection.includes("n:" + f.id)
                          ? " library-cut"
                          : "")
                      }
                      onContextMenu={(e) => {
                        e.stopPropagation();
                        context(e, f.kind === "loose" ? "" : "n:" + f.id);
                      }}
                      draggable={canEdit && f.kind !== "loose" && !busy}
                      onDragStart={(e) => dragStart(e, "n:" + f.id)}
                      onDragEnd={() => {
                        dragging.current = [];
                        setDropTarget("");
                      }}
                      onDragOver={(e) => dragOver(e, f.id)}
                      onDrop={(e) => drop(e, f.id)}
                    >
                      {(picker || f.kind !== "loose") && (
                        <label className="row">
                          <input
                            type="checkbox"
                            aria-label={"Seleccionar carpeta " + f.name}
                            checked={selected.includes("n:" + f.id)}
                            onChange={(e) =>
                              toggle("n:" + f.id, e.target.checked)
                            }
                          />
                          Seleccionar
                        </label>
                      )}
                      <button
                        type="button"
                        className="folder-open"
                        onClick={() => open(f.id)}
                      >
                        <span aria-hidden="true">📁</span>
                        <strong>{f.name}</strong>
                      </button>
                      <small>
                        {f.kind === "folder"
                          ? "Carpeta personal"
                          : f.sourceDeleted
                            ? "Carpeta conservada · origen eliminado"
                            : "Carpeta de proyecto"}
                      </small>
                      {query && (
                        <small className="library-result-path">
                          {data?.tree.find((n) => n.id === f.parentId)?.name ??
                            "Todas las carpetas"}
                        </small>
                      )}
                      <small className="library-folder-count">
                        {childCounts.get(f.id) ?? 0}{" "}
                        {f.kind === "project"
                          ? "productos"
                          : f.kind === "product"
                            ? "subproductos"
                            : "carpetas"}
                      </small>
                      {!picker && f.canManageSharing && !f.sourceDeleted && (
                        <button type="button" onClick={() => setShareFolder(f)}>
                          Compartir
                        </button>
                      )}
                      {!picker && (
                        <button
                          type="button"
                          className="folder-actions-trigger"
                          aria-label={"Acciones de " + f.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            context(e, f.kind === "loose" ? "" : "n:" + f.id);
                          }}
                        >
                          ⋯ Acciones
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
          {matchingFolders.length > folders.length && (
            <button
              className="library-more-folders"
              type="button"
              onClick={() => setFolderLimit((n) => n + 50)}
            >
              Mostrar más carpetas ({folders.length} de {matchingFolders.length}
              )
            </button>
          )}
          <div className={"grid jobs-grid size-" + size}>
            {(
              data?.entries ??
              data?.items.map((i) => ({ kind: "image", id: i.id })) ??
              []
            ).map((entry) => {
              if ((data?.query ?? "") !== query) return null;
              if (entry.kind === "image") {
                const item = data?.items.find((i) => i.entryId === entry.id);
                return item ? renderImage(item) : null;
              }
              const slot = data?.inflight?.find((i) => i.id === entry.id);
              if (!slot || picker) return null;
              const order = data?.orders.find((o) => o.id === slot.orderId);
              return (
                <GenerationImageCard
                  key={slot.id}
                  slot={slot}
                  order={order}
                  controls={anchors.has(slot.id)}
                  refresh={refresh}
                  onPreview={() => {
                    if (order?.sample)
                      setPreview({
                        id: order.sample.id,
                        revision: order.sample.revision ?? 1,
                        name: order.name ?? "Muestra",
                        sourceNotice: slot.sourceNotice,
                      });
                  }}
                />
              );
            })}
          </div>
          <div className="folder-cards">
            {((data?.query ?? "") === query ? data?.documents : [])?.map(
              (d) => (
                <article
                  key={d.id}
                  className="card"
                  data-library-selection={"d:" + d.id}
                  draggable={canEdit && !busy}
                  onDragStart={(e) => dragStart(e, "d:" + d.id)}
                  onDragEnd={() => {
                    dragging.current = [];
                    setDropTarget("");
                  }}
                  onContextMenu={(e) => context(e, "d:" + d.id)}
                >
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={selected.includes("d:" + d.id)}
                      onChange={(e) => toggle("d:" + d.id, e.target.checked)}
                    />
                    Seleccionar
                  </label>
                  {picker &&
                    d.mime.startsWith("image/") &&
                    (!d.large || d.hasPreview) && (
                      <img
                        className="library-picker-document"
                        loading="lazy"
                        src={`/api/library/documents/${d.id}?preview=1`}
                        alt={d.name}
                      />
                    )}
                  <strong>📄 {d.name}</strong>
                  <p className="hint">{Math.ceil(d.size / 1024)} KB</p>
                  <a href={"/api/library/documents/" + d.id}>
                    Descargar archivo
                  </a>
                </article>
              ),
            )}
          </div>
          {!data && <p>Cargando biblioteca…</p>}
          {data &&
            !refreshing &&
            (data.query ?? "") === query &&
            !folders.length &&
            !data.items.length &&
            !data.inflight?.length &&
            !data.documents.length && (
              <p className="empty">
                {query
                  ? `No encontramos resultados para «${query}». Prueba otra palabra o busca desde Todas las carpetas.`
                  : "Esta carpeta está vacía. Puedes crear una carpeta o añadir archivos."}
              </p>
            )}
          {data && (
            <div className="row">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                {data.total} imágenes
                {data.inflightTotal > 0
                  ? ` · ${data.inflightTotal} por generar o revisar`
                  : ""}{" "}
                · Página {data.page} de {data.pages}
              </span>
              <button
                type="button"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>
      {menu && (
        <div
          className="explorer-context-menu stack"
          role="menu"
          aria-label="Acciones de Biblioteca"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setMenu(null);
              return;
            }
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              const i = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              buttons[
                (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          {selectedProjectFolder && (
            <p className="library-project-warning" role="note">
              ⚠ {projectFolderWarning}
            </p>
          )}
          {menu.id.startsWith("n:") && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                open(menu.id.slice(2));
                setMenu(null);
              }}
            >
              Abrir carpeta
            </button>
          )}
          {menu.id.startsWith("n:") &&
            (() => {
              const node = data?.tree.find((n) => n.id === menu.id.slice(2));
              return node?.canManageSharing && !node.sourceDeleted ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShareFolder(node);
                    setMenu(null);
                  }}
                >
                  Compartir carpeta
                </button>
              ) : null;
            })()}
          {(() => {
            const item = data?.items.find((i) => i.selectionId === menu.id);
            return item ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPreview({
                      id: item.id,
                      name: item.subproduct?.name ?? "Imagen",
                      revision: item.revision,
                      sourceNotice: item.sourceNotice,
                    });
                    setMenu(null);
                  }}
                >
                  Ampliar imagen
                </button>
                {item.canEdit && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setEditing(item.id);
                      setMenu(null);
                    }}
                  >
                    Editar imagen
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void action(
                      () => downloadArchive({ ids: [item.id], format }),
                      "Descarga preparada.",
                    );
                    setMenu(null);
                  }}
                >
                  Descargar imagen
                </button>
              </>
            ) : null;
          })()}
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit || busy || !selected.length}
            onClick={() => prepare("move")}
          >
            Cortar <kbd>Ctrl+X</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit || busy || !selected.length}
            onClick={() => prepare("copy")}
          >
            Copiar <kbd>Ctrl+C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit || busy || !clipboard}
            onClick={() => {
              paste(menu.id.startsWith("n:") ? menu.id.slice(2) : folder);
              setMenu(null);
            }}
          >
            Pegar aquí <kbd>Ctrl+V</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit || busy || !selected.length}
            onClick={() => {
              setTarget("__unselected");
              setTargetQuery("");
              setMove(true);
              setMenu(null);
            }}
          >
            Mover selección…
          </button>
          {menu.id.startsWith("n:folder:") && (
            <button
              type="button"
              role="menuitem"
              disabled={!canEdit || busy}
              onClick={() => {
                const name = prompt("Nuevo nombre");
                if (name)
                  void action(
                    () =>
                      api("selection-actions", "POST", {
                        operation: "rename",
                        selection: [menu.id],
                        name,
                      }),
                    "Carpeta renombrada.",
                  );
                setMenu(null);
              }}
            >
              Renombrar carpeta
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!canEdit || busy || !selected.length}
            onClick={() => {
              removeSelection();
              setMenu(null);
            }}
          >
            Eliminar selección
          </button>
          {!menu.id && (
            <button
              type="button"
              role="menuitem"
              disabled={!canEdit || busy}
              onClick={() => {
                void action(
                  () =>
                    api("selection-actions", "POST", {
                      operation: "restore",
                      selection: [],
                    }),
                  "Carpetas de proyectos restauradas.",
                );
                setMenu(null);
              }}
            >
              Restaurar carpetas de proyectos retiradas
            </button>
          )}
        </div>
      )}
    </section>
  );
}
