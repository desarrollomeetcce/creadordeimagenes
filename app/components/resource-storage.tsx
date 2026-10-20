"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { uploadResource, UploadPaused } from "./resource-upload";
import { maxResourceFileBytes } from "../../lib/large-upload-limits";
import { engineRequest as api } from "./generation-engine";
type Folder = { id: string; name: string; parentId: string | null };
type ResourceFile = {
  large?: boolean;
  hasPreview?: boolean;
  generationReady?: boolean;
  id: string;
  name: string;
  mime: string;
  size: number;
  purpose: string;
  description: string;
};
const purposes = [
  "Fotografía principal",
  "Referencia visual",
  "Fondo",
  "Logo",
  "Material de contexto",
];
const accept = ".png,.jpg,.jpeg,.webp,.svg,.pdf,.txt,.csv,.docx";
function folderLabel(f: Folder, all: Folder[]) {
  const parts = [f.name],
    seen = new Set([f.id]);
  let parent = all.find((p) => p.id === f.parentId);
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    parts.unshift(parent.name);
    parent = all.find((p) => p.id === parent?.parentId);
  }
  return parts.join(" / ");
}
export function StorageFolderPicker({
  scope,
  id,
  onChanged,
}: {
  scope: string;
  id: string;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [folders, setFolders] = useState<Folder[]>([]),
    [bindings, setBindings] = useState<
      { folderId: string; folder: { name: string }; userId: string }[]
    >([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const [tree, rows] = await Promise.all([
      api("storage/tree"),
      api(`storage-bindings/${scope}/${id}`),
    ]);
    setFolders(tree.folders);
    setBindings(rows);
    setSelected(
      rows
        .filter((b: { folderId: string }) =>
          tree.folders.some((f: Folder) => f.id === b.folderId),
        )
        .map((b: { folderId: string }) => b.folderId),
    );
  }, [scope, id]);
  useEffect(() => {
    if (!["project", "category", "subproduct"].includes(scope)) return;
    let active = true;
    api(`storage-bindings/${scope}/${id}`)
      .then((rows) => {
        if (active) setBindings(rows);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [scope, id]);
  if (!["project", "category", "subproduct"].includes(scope)) return null;
  return (
    <section className="storage-binding stack">
      <strong>Carpetas de recursos vinculadas</strong>
      {bindings.length > 0 ? (
        <ul>
          {bindings.map((b) => (
            <li key={b.folderId}>{b.folder.name}</li>
          ))}
        </ul>
      ) : (
        <p className="hint">Sin carpetas vinculadas en este nivel.</p>
      )}

      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await refresh();
              setOpen(!open);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          ＋ Añadir carpeta de Almacenamiento
        </button>
        <a href="?view=storage" target="_blank" rel="noopener">
          Abrir Almacenamiento ↗
        </a>
      </div>
      <p className="hint">
        Se incluyen los archivos subidos de sus subcarpetas. Las casillas de
        herencia controlan los recursos del proyecto y producto. Se seleccionan
        hasta nueve imágenes relevantes por afiche; no se envía toda tu
        colección a la IA.
      </p>
      {open && (
        <div className="panel stack">
          <p>
            Vincula carpetas propias. Sus archivos subidos estarán disponibles
            para las generaciones de este recurso y sus niveles que los hereden.
          </p>
          {folders.length ? (
            folders.map((f) => (
              <label className="row" key={f.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(f.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, f.id]
                        : selected.filter((id) => id !== f.id),
                    )
                  }
                />
                {folderLabel(f, folders)}
              </label>
            ))
          ) : (
            <p>Crea una carpeta en Almacenamiento y sube tus recursos.</p>
          )}
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`storage-bindings/${scope}/${id}`, "PUT", {
                    folderIds: selected,
                  });
                  await refresh();
                  setOpen(false);
                  setMessage(
                    "Carpetas vinculadas y guardadas. Se aplicarán a nuevas generaciones.",
                  );
                  onChanged?.();
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Guardar carpetas vinculadas
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
export function StorageWorkspace() {
  const [folders, setFolders] = useState<Folder[]>([]),
    [folder, setFolder] = useState(""),
    [files, setFiles] = useState<ResourceFile[]>([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [capacity, setCapacity] = useState<{
      bytes: number;
      userId: string;
      uploads: {
        id: string;
        name: string;
        size: number;
        receivedBytes: number;
        expiresAt: string;
      }[];
      usedBytes: number | null;
      limitBytes: number | null;
      maxFileBytes: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [progress, setProgress] = useState<{
      done: number;
      total: number;
      failed: number;
    } | null>(null),
    [editing, setEditing] = useState<ResourceFile | null>(null),
    [uploadPurpose, setUploadPurpose] = useState("Referencia visual");
  const editDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (editing && !editDialog.current?.open) editDialog.current?.showModal();
  }, [editing?.id]);
  const [fileProgress, setFileProgress] = useState<{
    name: string;
    bytes: number;
    total: number;
  } | null>(null);
  const cancel = useRef(false),
    upload = useRef<HTMLInputElement>(null),
    uploadFolder = useRef<HTMLInputElement>(null);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSequence.current;
    const [tree, list] = await Promise.all([
      api("storage/tree"),
      api(
        "storage/files?" + new URLSearchParams({ folder, page: String(page) }),
      ),
    ]);
    if (seq !== refreshSequence.current) return;
    setFolders(tree.folders);
    setCapacity(tree);
    setFiles(list.files);
    setPages(list.pages);
  }, [folder, page]);
  useEffect(() => {
    let active = true;
    void refresh().catch((e) => {
      if (active) setMessage(e.message);
    });
    return () => {
      active = false;
      refreshSequence.current++;
    };
  }, [refresh]);
  const task = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = async (name: string, parent = folder) =>
    api("library/folder-actions", "POST", {
      action: "create",
      name,
      destination: parent ? "folder:" + parent : null,
    });
  const receive = async (input: File[]) => {
    if (!input.length) return;
    setBusy(true);
    cancel.current = false;
    setMessage("");
    setProgress({ done: 0, total: input.length, failed: 0 });
    setFileProgress(null);
    let done = 0,
      failed = 0;
    const errors: string[] = [],
      known = new Map<string, string>();
    const base = [...folders];
    try {
      for (const file of input) {
        if (cancel.current) break;
        try {
          if (file.size > (capacity?.maxFileBytes ?? maxResourceFileBytes))
            throw Error("supera 1 GB (1024 MB)");
          let parent = folder;
          const path = (file.webkitRelativePath || "").split("/").slice(0, -1);
          let key = "";
          for (const segment of path) {
            if (
              !segment ||
              segment === "." ||
              segment === ".." ||
              segment.length > 100
            )
              throw Error("nombre de carpeta no válido");
            key += "/" + segment;
            const cached = known.get(key),
              existing = base.find(
                (f) => f.name === segment && f.parentId === (parent || null),
              );
            if (cached) parent = cached;
            else if (existing) {
              parent = existing.id;
              known.set(key, parent);
            } else {
              const added = await create(segment, parent);
              base.push(added);
              parent = added.id;
              known.set(key, parent);
            }
          }
          await uploadResource(file, {
            folderId: parent,
            purpose: file.type.startsWith("image/")
              ? uploadPurpose
              : "Material de contexto",
            userId: capacity?.userId ?? "",
            paused: () => cancel.current,
            onProgress: (bytes, total) =>
              setFileProgress({ name: file.name, bytes, total }),
          });
          done++;
        } catch (e) {
          if (e instanceof UploadPaused) {
            cancel.current = true;
            break;
          }
          failed++;
          if (errors.length < 5)
            errors.push(file.name + ": " + (e as Error).message);
        }
        setProgress({ done, total: input.length, failed });
      }
      setMessage(
        `${done} archivos guardados; ${failed} no guardados.${cancel.current ? " Subida pausada. Selecciona el mismo archivo y carpeta para continuar; se conservan las partes y archivos ya guardados." : ""}${errors.length ? " " + errors.join(" · ") : ""}`,
      );
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const current = folders.find((f) => f.id === folder),
    children = folders.filter((f) =>
      folder
        ? f.parentId === folder
        : !f.parentId || !folders.some((parent) => parent.id === f.parentId),
    );
  const folderAction = (action: "rename" | "delete", f: Folder) => {
    const name =
      action === "rename" ? prompt("Nombre de la carpeta", f.name) : undefined;
    if (action === "rename" && !name) return;
    if (
      action === "delete" &&
      !confirm(
        "¿Eliminar esta carpeta? Sus archivos se conservarán en Archivos sin carpeta. Se retirarán sus vínculos de generación.",
      )
    )
      return;
    void task(async () => {
      await api("library/folder-actions", "POST", {
        action,
        ids: [f.id],
        ...(name ? { name } : {}),
      });
      if (folder === f.id) setFolder("");
    });
  };
  return (
    <div className="stack storage-workspace">
      <div className="heading">
        <div>
          <h1>Almacenamiento</h1>
          <p>
            Tu colección de fotos, logos, fondos y referencias para PropioX e
            IA.
          </p>
        </div>
      </div>
      <div className="notice">
        No hay un límite por cantidad de archivos. Cada archivo admite hasta 1
        GB (1024 MB) y se sube por partes. La capacidad total depende del
        almacenamiento configurado. Los archivos no entrenan un modelo; se
        utilizan como recursos de composición o referencias. Para PropioX, usa
        fotografías sin texto y logos separados; un afiche completo no se
        convierte automáticamente en capas ni enseña su estilo al sistema.
      </div>
      {capacity && (
        <p className="hint">
          Tus archivos: {(capacity.bytes / 1048576).toFixed(1)} MB.
          {capacity.limitBytes !== null
            ? ` Espacio ocupado o reservado: ${((capacity.usedBytes ?? 0) / 1048576).toFixed(1)} de ${(capacity.limitBytes / 1048576).toFixed(0)} MB.`
            : " Capacidad según el disco del servidor."}
        </p>
      )}
      {!!capacity?.uploads?.length && !busy && (
        <details className="panel stack">
          <summary>Subidas sin terminar ({capacity.uploads.length})</summary>
          <p className="hint">
            Selecciona el mismo archivo y carpeta en esta pestaña para
            continuar. Puedes descartar las partes guardadas para liberar
            espacio; caducan tras 48 horas sin actividad.
          </p>
          {capacity.uploads.map((u) => (
            <div className="row" key={u.id}>
              <span>
                {u.name} · {(u.receivedBytes / 1048576).toFixed(1)} /{" "}
                {(u.size / 1048576).toFixed(1)} MB
              </span>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  void task(async () => {
                    await api("storage/uploads/" + u.id, "DELETE");
                  })
                }
              >
                Descartar subida
              </button>
            </div>
          ))}
        </details>
      )}
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setFolder("");
            setPage(1);
            setSelected([]);
          }}
        >
          Almacenamiento
        </button>
        {current && (
          <>
            <span>/ {folderLabel(current, folders)}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setFolder(current.parentId ?? "");
                setPage(1);
              }}
            >
              ↑ Subir nivel
            </button>
          </>
        )}
      </div>
      <div className="row">
        <button
          disabled={busy}
          onClick={() => {
            const name = prompt("Nombre de la carpeta");
            if (name)
              void task(async () => {
                await create(name);
              });
          }}
        >
          ＋ Nueva carpeta
        </button>
        <label>
          Uso de las imágenes que subirás
          <select
            disabled={busy}
            value={uploadPurpose}
            onChange={(e) => setUploadPurpose(e.target.value)}
          >
            {purposes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => upload.current?.click()}>
          Subir imágenes o documentos
        </button>
        <button disabled={busy} onClick={() => uploadFolder.current?.click()}>
          Subir carpeta
        </button>
        <input
          ref={upload}
          type="file"
          hidden
          multiple
          accept={accept}
          onChange={(e) => {
            void receive(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={uploadFolder}
          type="file"
          hidden
          multiple
          {...({
            webkitdirectory: "",
            directory: "",
          } as InputHTMLAttributes<HTMLInputElement>)}
          onChange={(e) => {
            void receive(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {busy && progress && (
          <button
            onClick={() => {
              cancel.current = true;
            }}
          >
            Detener subida
          </button>
        )}
      </div>
      {fileProgress && (
        <div className="stack" role="status">
          <span>
            {fileProgress.name} · {(fileProgress.bytes / 1048576).toFixed(1)} /{" "}
            {(fileProgress.total / 1048576).toFixed(1)} MB
          </span>
          <progress
            aria-label="Progreso del archivo"
            max={fileProgress.total}
            value={fileProgress.bytes}
          />
          <small className="hint">
            Mantén abierta la pestaña. Puedes pausar y seleccionar el mismo
            archivo para continuar. Para generar se usa una copia optimizada o
            un extracto; el original se conserva completo.
          </small>
        </div>
      )}
      {progress && (
        <p role="status">
          {progress.done + progress.failed} de {progress.total} procesados ·{" "}
          {progress.done} guardados · {progress.failed} no guardados
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="storage-folders">
        {children.map((f) => (
          <article className="panel stack" key={f.id}>
            <button
              disabled={busy}
              onClick={() => {
                setFolder(f.id);
                setPage(1);
                setSelected([]);
              }}
            >
              📁 {f.name}
            </button>
            <div className="row">
              <button disabled={busy} onClick={() => folderAction("rename", f)}>
                Renombrar
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => folderAction("delete", f)}
              >
                Eliminar carpeta
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="row">
        <label className="row">
          <input
            type="checkbox"
            checked={files.length > 0 && selected.length === files.length}
            onChange={(e) =>
              setSelected(e.target.checked ? files.map((f) => f.id) : [])
            }
          />
          Seleccionar esta página
        </label>
        <button
          className="danger"
          disabled={busy || !selected.length}
          onClick={() => {
            if (confirm(`¿Eliminar ${selected.length} archivos seleccionados?`))
              void task(async () => {
                await api("library/selection-actions", "POST", {
                  operation: "delete",
                  selection: selected.map((id) => "d:" + id),
                });
                setSelected([]);
              });
          }}
        >
          Eliminar ({selected.length})
        </button>
      </div>
      <div className="storage-files">
        {files.map((f) => (
          <article className="panel stack" key={f.id}>
            <label className="row">
              <input
                type="checkbox"
                checked={selected.includes(f.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, f.id]
                      : selected.filter((id) => id !== f.id),
                  )
                }
              />
              Seleccionar
            </label>
            {f.mime.startsWith("image/") && (!f.large || f.hasPreview) && (
              <img
                src={"/api/library/documents/" + f.id + "?preview=1"}
                alt={f.name}
                loading="lazy"
              />
            )}
            <strong>{f.name}</strong>
            {f.large && (
              <small className="hint">
                Original grande guardado.{" "}
                {f.hasPreview
                  ? "Referencia optimizada disponible."
                  : f.generationReady
                    ? "Se utiliza el extracto inicial para generación."
                    : "Para generar, añade una imagen optimizada o un extracto del documento."}
              </small>
            )}
            <span>
              {f.purpose} · {(f.size / 1024).toFixed(0)} KB
            </span>
            {f.description && <p className="hint">{f.description}</p>}
            <button disabled={busy} onClick={() => setEditing({ ...f })}>
              Describir y clasificar
            </button>
            <a href={"/api/library/documents/" + f.id} download>
              Descargar
            </a>
          </article>
        ))}
      </div>
      {!busy && !files.length && !children.length && (
        <p>
          Esta carpeta está vacía. Sube recursos y vincúlala desde un proyecto,
          producto o subproducto.
        </p>
      )}
      <div className="row">
        <button
          disabled={page <= 1 || busy}
          onClick={() => {
            setPage(page - 1);
            setSelected([]);
          }}
        >
          Anterior
        </button>
        <span>
          Página {page} de {pages}
        </span>
        <button
          disabled={page >= pages || busy}
          onClick={() => {
            setPage(page + 1);
            setSelected([]);
          }}
        >
          Siguiente
        </button>
      </div>
      {editing && (
        <dialog
          ref={editDialog}
          className="storage-resource-dialog"
          aria-label="Describir recurso"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setEditing(null);
          }}
        >
          <section className="panel stack" aria-label="Describir recurso">
            <h2>Describir recurso</h2>
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            <label>
              Nombre
              <input
                value={editing.name}
                maxLength={200}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Uso
              <select
                value={editing.purpose}
                onChange={(e) =>
                  setEditing({ ...editing, purpose: e.target.value })
                }
              >
                {purposes.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Descripción y tema
              <textarea
                value={editing.description}
                maxLength={1000}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <p className="hint">
              Ejemplo: «Psicología forense, evaluación profesional». El nombre y
              la descripción ayudan a seleccionar recursos del tema.
            </p>
            <div className="row">
              <button
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await api("storage/files/" + editing.id, "PATCH", {
                      name: editing.name,
                      purpose: editing.purpose,
                      description: editing.description,
                    });
                    setEditing(null);
                  })
                }
              >
                Guardar
              </button>
              <button disabled={busy} onClick={() => setEditing(null)}>
                Cerrar
              </button>
            </div>
          </section>
        </dialog>
      )}
    </div>
  );
}
