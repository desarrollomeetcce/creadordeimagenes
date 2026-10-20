"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FolderTree, type FolderNode } from "./folder-navigation";
import { engineRequest as api } from "./generation-engine";
type Selection = {
  selection: string;
  purpose: string;
  name: string;
  available?: boolean;
};
type Image = {
  id: string;
  selectionId: string;
  revision: number;
  subproduct?: { name: string } | null;
};
type Document = {
  id: string;
  name: string;
  mime: string;
  generationReady?: boolean;
  large?: boolean;
  hasPreview?: boolean;
};
type Page = {
  tree: FolderNode[];
  items: Image[];
  documents: Document[];
  page: number;
  pages: number;
};
const purposes = [
  "Referencia visual",
  "Fotografía principal",
  "Fondo",
  "Logo",
  "Material de contexto",
];
export function SystemResourcePicker({
  scope,
  id,
  onChanged,
}: {
  scope: string;
  id: string;
  onChanged?: () => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    requestVersion = useRef(0);
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState<Selection[]>([]),
    [selected, setSelected] = useState<Selection[]>([]),
    [data, setData] = useState<Page | null>(null),
    [folder, setFolder] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const valid = ["project", "category", "subproduct"].includes(scope),
    path = `system-resources/${scope}/${id}`;
  const refresh = useCallback(async () => {
    const rows = await api(path);
    setSaved(rows);
    return rows as Selection[];
  }, [path]);
  useEffect(() => {
    if (!valid) return;
    let live = true;
    api(path)
      .then((rows) => {
        if (live) setSaved(rows);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [path, valid]);
  useEffect(() => {
    if (!open) return;
    const version = ++requestVersion.current;
    setLoading(true);
    api(
      "library/explorer?" +
        new URLSearchParams({ folder, page: String(page), limit: "25" }),
    )
      .then((value) => {
        if (version === requestVersion.current) setData(value);
      })
      .catch((e) => {
        if (version === requestVersion.current) setMessage(e.message);
      })
      .finally(() => {
        if (version === requestVersion.current) setLoading(false);
      });
    return () => {
      requestVersion.current++;
    };
  }, [open, folder, page]);
  if (!valid) return null;
  const navigate = (key: string) => {
    setFolder(key);
    setPage(1);
    setSearch("");
  };
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const toggle = (entry: Selection) =>
    setSelected((old) =>
      old.some((s) => s.selection === entry.selection)
        ? old.filter((s) => s.selection !== entry.selection)
        : old.length < 30
          ? [...old, entry]
          : old,
    );
  const matches = (s: string) =>
    s.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"));
  const tree = data?.tree ?? [],
    current = tree.find((n) => n.id === folder),
    children = tree.filter(
      (n) => (n.parentId ?? "") === folder && matches(n.name),
    );
  const crumbs: FolderNode[] = [];
  let ancestor = current;
  const seen = new Set<string>();
  while (ancestor && !seen.has(ancestor.id)) {
    seen.add(ancestor.id);
    crumbs.unshift(ancestor);
    ancestor = tree.find((n) => n.id === ancestor?.parentId);
  }
  const check = (selection: string, name: string) => (
    <label className="row">
      <input
        type="checkbox"
        checked={selected.some((s) => s.selection === selection)}
        disabled={
          busy ||
          (!selected.some((s) => s.selection === selection) &&
            selected.length >= 30)
        }
        onChange={() =>
          toggle({ selection, name, purpose: "Referencia visual" })
        }
      />
      <span>Seleccionar {name}</span>
    </label>
  );
  const folderCards = (rows: FolderNode[]) =>
    rows.map((n) => (
      <article key={n.id} className="system-resource-card">
        {check("n:" + n.id, n.name)}
        <button
          type="button"
          onClick={() => navigate(n.id)}
          className="system-folder-open"
        >
          <span aria-hidden="true">📁</span>
          <strong>{n.name}</strong>
          <small>Abrir carpeta</small>
        </button>
      </article>
    ));
  return (
    <section className="storage-binding stack">
      <strong>Adjuntos del sistema</strong>
      <p className="hint">
        Usa carpetas de proyectos, carpetas personales o imágenes existentes. No
        se mueven los originales ni se consume IA al adjuntar.
      </p>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              setSelected(await refresh());
              navigate("");
              setData(null);
              setLoading(true);
              setOpen(true);
              dialog.current?.showModal();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          ＋ Adjuntar desde el sistema
        </button>
        <a href="?view=storage" target="_blank" rel="noopener">
          Abrir Almacenamiento ↗
        </a>
      </div>
      {saved.length > 0 && (
        <ul>
          {saved.map((s) => (
            <li key={s.selection}>
              {s.name} · {s.purpose}
              {s.available === false ? " · Revisa este vínculo" : ""}
            </li>
          ))}
        </ul>
      )}
      <dialog
        ref={dialog}
        className="system-resource-dialog"
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
      >
        <div className="stack">
          <div className="row between">
            <h3 id={titleId}>Adjuntar desde el sistema</h3>
            <button type="button" disabled={busy} onClick={close}>
              Cerrar
            </button>
          </div>
          <p className="hint">
            Carpetas: se incluyen sus subcarpetas y se eligen recursos
            relevantes por tema. Imágenes: se usa solo la selección. Máximo 30
            vínculos; hasta nueve imágenes por afiche. La herencia controla los
            recursos de cada nivel.
          </p>
          <div className="system-picker-layout">
            <aside>
              <FolderTree
                nodes={tree}
                current={folder}
                grouped
                onOpen={navigate}
              />
            </aside>
            <div className="stack system-picker-content">
              <nav className="row" aria-label="Ruta de adjuntos">
                <button type="button" onClick={() => navigate("")}>
                  Todas las carpetas
                </button>
                {crumbs.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => navigate(n.id)}
                  >
                    {n.name}
                  </button>
                ))}
              </nav>
              <div className="row">
                <button
                  type="button"
                  disabled={!folder}
                  onClick={() => navigate(current?.parentId ?? "")}
                >
                  ↑ Subir
                </button>
                <label>
                  Buscar en esta página
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {current && check("n:" + current.id, "esta carpeta")}
              </div>
              {loading ? (
                <p role="status">Cargando recursos…</p>
              ) : (
                <>
                  {children.some((n) => n.kind !== "folder") && (
                    <section>
                      <h4>Carpetas de proyectos</h4>
                      <div className="system-resource-grid">
                        {folderCards(
                          children.filter((n) => n.kind !== "folder"),
                        )}
                      </div>
                    </section>
                  )}
                  {children.some((n) => n.kind === "folder") && (
                    <section>
                      <h4>Carpetas personales</h4>
                      <div className="system-resource-grid">
                        {folderCards(
                          children.filter((n) => n.kind === "folder"),
                        )}
                      </div>
                    </section>
                  )}
                  {folder && (
                    <div className="system-resource-grid">
                      {data?.items
                        .filter((i) => matches(i.subproduct?.name ?? "Imagen"))
                        .map((i) => (
                          <article
                            key={i.selectionId}
                            className="system-resource-card"
                          >
                            {check(
                              i.selectionId,
                              i.subproduct?.name ?? "Imagen",
                            )}
                            <img
                              loading="lazy"
                              src={`/api/variations/${i.id}?thumbnail=true&v=${i.revision}`}
                              alt={i.subproduct?.name ?? "Imagen"}
                            />
                          </article>
                        ))}
                      {data?.documents
                        .filter((d) => matches(d.name))
                        .map((d) => (
                          <article key={d.id} className="system-resource-card">
                            {check("d:" + d.id, d.name)}
                            {d.mime.startsWith("image/") &&
                            (!d.large || d.hasPreview) ? (
                              <img
                                loading="lazy"
                                src={`/api/library/documents/${d.id}?preview=1`}
                                alt={d.name}
                              />
                            ) : (
                              <span aria-hidden="true">📄</span>
                            )}
                            <strong>{d.name}</strong>
                            {d.generationReady === false && (
                              <small>
                                Original conservado; necesita copia optimizada
                                para generar.
                              </small>
                            )}
                          </article>
                        ))}
                    </div>
                  )}
                  {!children.length &&
                    !data?.items.length &&
                    !data?.documents.length && (
                      <p>Esta carpeta no contiene recursos disponibles.</p>
                    )}
                  {folder && (
                    <div className="row">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        Anterior
                      </button>
                      <span>
                        Página {page} de {data?.pages ?? 1}
                      </span>
                      <button
                        type="button"
                        disabled={page >= (data?.pages ?? 1)}
                        onClick={() => setPage(page + 1)}
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <details open={selected.length > 0}>
            <summary>Selección · {selected.length}/30</summary>
            <div className="stack">
              {selected.map((s) => (
                <div className="row" key={s.selection}>
                  <span>{s.name}</span>
                  <label>
                    Uso
                    <select
                      value={s.purpose}
                      disabled={busy || s.selection.startsWith("n:")}
                      onChange={(e) =>
                        setSelected((old) =>
                          old.map((row) =>
                            row.selection === s.selection
                              ? { ...row, purpose: e.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      {purposes.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(s)}
                  >
                    Quitar vínculo
                  </button>
                </div>
              ))}
            </div>
          </details>
          <p className="hint">
            Las carpetas conservan el uso definido para sus archivos; las
            imágenes generadas se toman como referencia visual. Un vínculo
            retirado o sin permiso deberá actualizarse antes de generar.
          </p>
          <div className="row system-picker-footer">
            <button
              type="button"
              className="primary"
              disabled={busy || loading}
              onClick={async () => {
                setBusy(true);
                setMessage("");
                try {
                  await api(path, "PUT", {
                    selections: selected.map(({ selection, purpose }) => ({
                      selection,
                      purpose,
                    })),
                  });
                  await refresh();
                  onChanged?.();
                  close();
                  setMessage("Recursos del sistema guardados.");
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Guardando…" : "Guardar adjuntos"}
            </button>
            <button type="button" disabled={busy} onClick={close}>
              Cancelar
            </button>
          </div>
          {message && <p role="status">{message}</p>}
        </div>
      </dialog>
      {message && !open && <p role="status">{message}</p>}
    </section>
  );
}
