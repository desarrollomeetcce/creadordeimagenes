"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HierarchyFilters,
  hierarchyFromLocation,
  type HierarchyValue,
} from "./hierarchy-filters";
import {
  FolderTree,
  FolderBreadcrumbs,
  folderScope,
  hierarchyFolder,
  type FolderNode,
} from "./folder-navigation";
import { SearchSelect } from "./search-select";
import { useCanEdit } from "./role-guide";
import { VariationEditor } from "./variation-editor";
import { downloadArchive } from "./collection-gallery";
type Item = {
  canEdit: boolean;
  id: string;
  createdAt: string;
  reviewStatus: string;
  model: string;
  subproduct: {
    name: string;
    category: { name: string; project: { name: string } };
  } | null;
};
type Doc = { id: string; name: string; size: number; mime: string };
type Data = {
  tree: FolderNode[];
  items: Item[];
  documents: Doc[];
  counts: Record<string, number>;
  total: number;
  page: number;
  pages: number;
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/library/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
export function Library() {
  const [editing, setEditing] = useState<string | null>(null);
  const canEdit = useCanEdit(),
    [hierarchy, setHierarchy] = useState<HierarchyValue>(hierarchyFromLocation),
    [folder, setFolder] = useState(() =>
      typeof window === "undefined"
        ? ""
        : (new URLSearchParams(location.search).get("folder") ??
          hierarchyFolder(hierarchyFromLocation())),
    );
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState("25"),
    [size, setSize] = useState("medium"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [move, setMove] = useState(false),
    [target, setTarget] = useState("__unselected"),
    [targetQuery, setTargetQuery] = useState(""),
    [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
      null,
    );
  const revision = useRef(0),
    latest = useRef<Data | null>(null);
  latest.current = data;
  const params = new URLSearchParams({
    ...hierarchy,
    folder,
    page: String(page),
    limit,
  }).toString();
  const refresh = useCallback(async () => {
    const seq = ++revision.current;
    try {
      const result = await api("explorer?" + params);
      if (seq === revision.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (seq === revision.current)
        setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [params]);
  useEffect(() => {
    void refresh();
    return () => {
      revision.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const load = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(() => {
      if (
        (latest.current?.counts.PENDING ?? 0) +
          (latest.current?.counts.RUNNING ?? 0) >
        0
      )
        load();
    }, 10000);
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
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [menu]);
  const open = (key: string) => {
    const h = folderScope(data?.tree ?? [], key, hierarchy);
    setHierarchy(h);
    setFolder(key);
    setPage(1);
    setSelected([]);
    const p = new URLSearchParams({
      view: "library",
      ...h,
      ...(key ? { folder: key } : {}),
    });
    history.replaceState(null, "", "?" + p);
  };
  const action = async (fn: () => Promise<unknown>, text: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setSelected([]);
      await refresh();
      setMessage(text);
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
    if (!selected.includes(id)) setSelected([id]);
    setMenu({
      x: Math.min(e.clientX, Math.max(0, innerWidth - 220)),
      y: Math.min(e.clientY, Math.max(0, innerHeight - 160)),
      id,
    });
  };
  const folders = (data?.tree ?? []).filter(
    (n) => n.parentId === (folder || null),
  );
  const chooseAll = () =>
    setSelected(
      [
        ...folders
          .filter((f) => f.kind === "folder")
          .map((f) => "f:" + f.id.slice(7)),
        ...(data?.items ?? []).map((i) => "v:" + i.id),
        ...(data?.documents ?? []).map((d) => "d:" + d.id),
      ].slice(0, 200),
    );
  const chosenFolders = selected
      .filter((x) => x.startsWith("f:"))
      .map((x) => x.slice(2)),
    chosenImages = selected
      .filter((x) => x.startsWith("v:"))
      .map((x) => x.slice(2)),
    chosenDocs = selected
      .filter((x) => x.startsWith("d:"))
      .map((x) => x.slice(2));
  const removeSelection = () => {
    if (
      !confirm(
        "¿Eliminar las carpetas seleccionadas y retirar las imágenes de tu biblioteca? El contenido de las carpetas pasa a la raíz. Los originales de los afiches se conservan; los documentos seleccionados se eliminan.",
      )
    )
      return;
    void action(async () => {
      if (chosenFolders.length)
        await api("folder-actions", "POST", {
          action: "delete",
          ids: chosenFolders,
        });
      if (chosenImages.length)
        await api("item-actions", "POST", {
          action: "remove",
          ids: chosenImages,
        });
      for (const id of chosenDocs) await api("documents/" + id, "DELETE");
    }, "Selección retirada. Los originales de los afiches se conservan.");
  };
  const moveSelection = () =>
    void action(async () => {
      if (chosenFolders.length)
        await api("folder-actions", "POST", {
          action: "move",
          ids: chosenFolders,
          destination: target || null,
        });
      if (chosenImages.length)
        await api("item-actions", "POST", {
          action: "move",
          ids: chosenImages,
          folderId: target.startsWith("folder:") ? target.slice(7) : null,
        });
      for (const id of chosenDocs)
        await api("documents/" + id, "PATCH", {
          folderId: target.startsWith("folder:") ? target.slice(7) : null,
        });
      setMove(false);
    }, "Selección movida sin copiar imágenes.");
  const upload = async (file: File) => {
    const form = new FormData();
    form.set("file", file);
    if (folder.startsWith("folder:")) form.set("folderId", folder.slice(7));
    const r = await fetch("/api/library/documents", {
      method: "POST",
      body: form,
    });
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
  };
  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0),
    completed = data?.counts.COMPLETED ?? 0;
  if (editing)
    return (
      <section className="stack">
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            void refresh();
          }}
        >
          ← Volver a Biblioteca
        </button>
        <VariationEditor
          key={editing}
          id={editing}
          onClose={() => {
            setEditing(null);
            void refresh();
          }}
        />
      </section>
    );
  return (
    <section className="stack library-explorer">
      <div className="heading">
        <div>
          <h1>Biblioteca</h1>
          <p className="muted">
            Afiches aprobados y archivos que conservas. Las carpetas organizan
            referencias, sin duplicar imágenes.
          </p>
        </div>
        <a
          className="button"
          href={"?" + new URLSearchParams({ view: "jobs", ...hierarchy })}
        >
          Ver producción y revisión
        </a>
      </div>
      <div className="explorer-layout">
        <FolderTree nodes={data?.tree ?? []} current={folder} onOpen={open} />
        <div className="explorer-content stack">
          <FolderBreadcrumbs
            nodes={data?.tree ?? []}
            current={folder}
            onOpen={open}
          />
          <div className="explorer-tools stack">
            <HierarchyFilters
              value={hierarchy}
              onChange={(h) => {
                setHierarchy(h);
                setFolder(hierarchyFolder(h));
                setPage(1);
                setSelected([]);
              }}
            />
            <div className="explorer-toolbar">
              <details>
                <summary>
                  Filtro de acciones · {selected.length} seleccionados
                </summary>
                <div className="toolbar-popover stack">
                  <button type="button" onClick={chooseAll}>
                    Seleccionar esta página
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    Limpiar selección
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={!selected.length || busy}
                        onClick={() => setMove(true)}
                      >
                        Mover seleccionados
                      </button>
                      <button
                        type="button"
                        disabled={!selected.length || busy}
                        onClick={removeSelection}
                      >
                        Eliminar seleccionados
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!chosenImages.length || busy}
                    onClick={() =>
                      void action(
                        () =>
                          downloadArchive({ ids: chosenImages, format: "png" }),
                        "Descarga preparada.",
                      )
                    }
                  >
                    Descargar seleccionados PNG
                  </button>
                  <button
                    type="button"
                    disabled={!chosenImages.length || busy}
                    onClick={() =>
                      void action(
                        () =>
                          downloadArchive({ ids: chosenImages, format: "jpg" }),
                        "Descarga preparada.",
                      )
                    }
                  >
                    Descargar seleccionados JPG
                  </button>
                </div>
              </details>
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
              {canEdit && (!folder || folder.startsWith("folder:")) && (
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
              <label>
                Por página
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
              <label>
                Miniaturas
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="small">Pequeñas</option>
                  <option value="medium">Medianas</option>
                  <option value="large">Grandes</option>
                </select>
              </label>
            </div>
          </div>
          {!!total && (
            <p className="production-progress" role="status">
              Producción de este ámbito:{" "}
              <strong>
                {completed} de {total} completadas
              </strong>{" "}
              · {data?.counts.RUNNING ?? 0} generándose ·{" "}
              {data?.counts.PENDING ?? 0} pendientes. Se actualiza con los
              mismos trabajos de Generaciones.
            </p>
          )}
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          {move && (
            <section className="panel stack" aria-label="Mover selección">
              <h3>Mover {selected.length} elementos</h3>
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
                    .filter(
                      (n) =>
                        n.kind === "folder" ||
                        (!chosenImages.length && !chosenDocs.length),
                    )
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
                Las carpetas automáticas conservan la jerarquía del proyecto.
                Puedes mover carpetas personales dentro de ellas. Las imágenes
                conservan su proyecto original.
              </p>
              <div className="row">
                <button
                  disabled={busy || target === "__unselected"}
                  onClick={moveSelection}
                >
                  Mover aquí
                </button>
                <button onClick={() => setMove(false)}>Cancelar</button>
              </div>
            </section>
          )}
          <div className={"folder-cards size-" + size}>
            {folders.map((f) => (
              <article
                className="folder-card"
                key={f.id}
                onContextMenu={(e) =>
                  f.kind === "folder" && context(e, "f:" + f.id.slice(7))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (f.kind === "folder") {
                    setTarget(f.id);
                    setTargetQuery(f.name);
                    setMove(true);
                  }
                }}
              >
                {f.kind === "folder" && (
                  <label className="row">
                    <input
                      type="checkbox"
                      aria-label={"Seleccionar carpeta " + f.name}
                      checked={selected.includes("f:" + f.id.slice(7))}
                      onChange={(e) =>
                        toggle("f:" + f.id.slice(7), e.target.checked)
                      }
                    />
                    Seleccionar
                  </label>
                )}
                <button className="folder-open" onClick={() => open(f.id)}>
                  <span aria-hidden="true">📁</span>
                  <strong>{f.name}</strong>
                </button>
                <small>
                  {f.kind === "folder"
                    ? "Carpeta personal"
                    : "Carpeta automática"}
                </small>
                {canEdit && f.kind === "folder" && (
                  <button
                    draggable
                    onDragStart={(e) => {
                      if (!selected.includes("f:" + f.id.slice(7)))
                        setSelected(["f:" + f.id.slice(7)]);
                      e.dataTransfer.setData("text/plain", f.id);
                    }}
                    onClick={() => {
                      setSelected(["f:" + f.id.slice(7)]);
                      setTarget("__unselected");
                      setTargetQuery("");
                      setMove(true);
                    }}
                  >
                    Mover / acciones
                  </button>
                )}
              </article>
            ))}
          </div>
          <div className={"grid jobs-grid size-" + size}>
            {(data?.items ?? []).map((i) => (
              <article
                key={i.id}
                className="card gallery"
                onContextMenu={(e) => context(e, "v:" + i.id)}
                draggable={canEdit}
                onDragStart={(e) => {
                  if (!selected.includes("v:" + i.id))
                    setSelected(["v:" + i.id]);
                  e.dataTransfer.setData("text/plain", i.id);
                }}
              >
                <label className="row">
                  <input
                    type="checkbox"
                    checked={selected.includes("v:" + i.id)}
                    onChange={(e) => toggle("v:" + i.id, e.target.checked)}
                  />
                  Seleccionar
                </label>
                <img
                  loading="lazy"
                  src={"/api/variations/" + i.id + "?thumbnail=true"}
                  alt={i.subproduct?.name ?? "Prueba de IA"}
                />
                <strong>{i.subproduct?.name ?? "Prueba de IA"}</strong>
                {i.canEdit && (
                  <button type="button" onClick={() => setEditing(i.id)}>
                    Editar afiche
                  </button>
                )}
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
                <span className="badge status-completed">
                  {i.reviewStatus === "APPROVED" ? "Aprobado" : "Conservado"}
                </span>
                <a href={"/api/variations/" + i.id + "?download"}>
                  Descargar PNG
                </a>
              </article>
            ))}
          </div>
          <div className="folder-cards">
            {data?.documents.map((d) => (
              <article
                key={d.id}
                className="card"
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
                <strong>📄 {d.name}</strong>
                <p className="hint">{Math.ceil(d.size / 1024)} KB</p>
                <a href={"/api/library/documents/" + d.id}>Descargar archivo</a>
              </article>
            ))}
          </div>
          {!data && <p>Cargando biblioteca…</p>}
          {data &&
            !folders.length &&
            !data.items.length &&
            !data.documents.length && (
              <p className="empty">
                Esta carpeta está vacía. Aprueba afiches en Generaciones o crea
                una carpeta personal para añadir archivos.
              </p>
            )}
          {data && (
            <div className="row">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                {data.total} imágenes · Página {data.page} de {data.pages}
              </span>
              <button
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
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            role="menuitem"
            disabled={!canEdit}
            onClick={() => setMove(true)}
          >
            Mover selección
          </button>
          {menu.id.startsWith("f:") && (
            <button
              role="menuitem"
              disabled={!canEdit}
              onClick={() => {
                const name = prompt("Nuevo nombre");
                if (name)
                  void action(
                    () =>
                      api("folder-actions", "POST", {
                        action: "rename",
                        ids: [menu.id.slice(2)],
                        name,
                      }),
                    "Carpeta renombrada.",
                  );
              }}
            >
              Renombrar carpeta
            </button>
          )}
          <button role="menuitem" disabled={!canEdit} onClick={removeSelection}>
            Eliminar selección
          </button>
        </div>
      )}
    </section>
  );
}
