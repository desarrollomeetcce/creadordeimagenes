"use client";
import "./course-library.css";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  courseGroup,
  audienceLabels,
  type CourseGroupId,
} from "@/lib/courses/teaching";
import {
  defaultCategories,
  categoryColors,
  moveCategory,
  type LibraryCategory,
  type LibraryHandle,
  type CategoryPage,
  type CourseSummary,
} from "@/lib/courses/library-shared";
type Props = {
  api: (
    path: string,
    body?: unknown,
    method?: string,
    signal?: AbortSignal,
  ) => Promise<any>;
  selected: string;
  mode: "home" | "editor" | "full";
  fullGroup: CourseGroupId | "";
  disabled: boolean;
  groupsChanged: (groups: LibraryCategory[]) => void;
  select: (id: string) => void;
  create: (id: CourseGroupId) => void;
  full: (id: CourseGroupId | "") => void;
  back: () => void;
};
export const CourseLibrary = forwardRef<LibraryHandle, Props>(
  function CourseLibrary(
    {
      api,
      selected,
      mode,
      fullGroup,
      disabled,
      groupsChanged,
      select,
      create,
      full,
      back,
    },
    ref,
  ) {
    const [groups, setGroups] = useState<LibraryCategory[]>(defaultCategories),
      [revision, setRevision] = useState(0),
      [counts, setCounts] = useState<Record<string, number>>({}),
      [pages, setPages] = useState<Record<string, CategoryPage>>({}),
      [expanded, setExpanded] = useState<Set<CourseGroupId>>(new Set()),
      [menu, setMenu] = useState<CourseGroupId | "">(""),
      [loading, setLoading] = useState(true),
      [busy, setBusy] = useState(false),
      [error, setError] = useState(""),
      [adding, setAdding] = useState(false),
      [color, setColor] = useState(categoryColors[4]),
      [moving, setMoving] = useState<CourseGroupId | "">(""),
      [over, setOver] = useState<CourseGroupId | "">("");
    const requests = useRef(new Map<string, AbortController>()),
      known = useRef(new Map<string, CourseGroupId>()),
      alive = useRef(true),
      mutation = useRef(false),
      drag = useRef<{
        id: CourseGroupId;
        x: number;
        y: number;
        target: CourseGroupId;
        active: boolean;
      } | null>(null),
      statusRef = useRef({
        pages,
        groups,
        revision,
        counts,
        menu,
        expanded,
        mode,
        fullGroup,
      });
    statusRef.current = {
      pages,
      groups,
      revision,
      counts,
      menu,
      expanded,
      mode,
      fullGroup,
    };
    const loadPage = useCallback(
      async (id: CourseGroupId, page = 1) => {
        requests.current.get(id)?.abort();
        const ac = new AbortController();
        requests.current.set(id, ac);
        try {
          const data: CategoryPage = await api(
            "/library?group=" + encodeURIComponent(id) + "&page=" + page,
            undefined,
            undefined,
            ac.signal,
          );
          if (!ac.signal.aborted && alive.current) {
            for (const c of data.courses) known.current.set(c.id, id);
            setPages((p) => ({ ...p, [id]: data }));
            setCounts((p) => ({ ...p, [id]: data.total }));
          }
          return data;
        } catch (e) {
          if (!ac.signal.aborted && alive.current)
            setError(
              e instanceof Error ? e.message : "No se pudo abrir la categoría.",
            );
          throw e;
        } finally {
          if (requests.current.get(id) === ac) requests.current.delete(id);
        }
      },
      [api],
    );
    const loadConfig = useCallback(
      async (initial = false) => {
        const ac = new AbortController();
        requests.current.get("config")?.abort();
        requests.current.set("config", ac);
        try {
          const d = await api("/library", undefined, undefined, ac.signal);
          if (ac.signal.aborted || !alive.current) return;
          setGroups(d.groups);
          groupsChanged(d.groups);
          setRevision(d.revision);
          setCounts(d.counts);
          setError("");
          if (initial) {
            const first: LibraryCategory | undefined = d.groups.find(
              (g: LibraryCategory) => d.counts[g.id] > 0,
            );
            if (first) {
              setExpanded(new Set([first.id]));
              await loadPage(first.id);
            }
          }
        } finally {
          if (requests.current.get("config") === ac)
            requests.current.delete("config");
        }
      },
      [api, groupsChanged, loadPage],
    );
    useEffect(() => {
      alive.current = true;
      void loadConfig(true)
        .catch((e) => {
          if (alive.current && e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        });
      return () => {
        alive.current = false;
        for (const ac of requests.current.values()) ac.abort();
      };
    }, [loadConfig]);
    useEffect(() => {
      if (
        mode === "full" &&
        fullGroup &&
        !statusRef.current.pages[fullGroup] &&
        !requests.current.has(fullGroup)
      )
        void loadPage(fullGroup).catch(() => {});
    }, [mode, fullGroup, loadPage]);
    useImperativeHandle(
      ref,
      () => ({
        refresh: async (id?: string) => {
          if (!id) {
            await loadConfig();
            const s = statusRef.current,
              ids =
                s.mode === "editor"
                  ? s.menu
                    ? [s.menu]
                    : []
                  : s.fullGroup
                    ? [s.fullGroup]
                    : [...s.expanded];
            await Promise.all(
              ids.map((id) => loadPage(id, s.pages[id]?.page ?? 1)),
            );
            return;
          }
          const d = await api("/library?courseId=" + encodeURIComponent(id)),
            c = d.course as CourseSummary | null,
            old = known.current.get(id),
            next = c ? courseGroup(c.settings) : null;
          if (old !== next) {
            setCounts((p) => ({
              ...p,
              ...(old ? { [old]: Math.max(0, (p[old] ?? 0) - 1) } : {}),
              ...(next ? { [next]: (p[next] ?? 0) + 1 } : {}),
            }));
          }
          setPages((p) =>
            Object.fromEntries(
              Object.entries(p).map(([group, page]) => [
                group,
                {
                  ...page,
                  courses: page.courses.flatMap((item) =>
                    item.id === id ? (c && group === next ? [c] : []) : [item],
                  ),
                },
              ]),
            ),
          );
          if (c && next) {
            known.current.set(id, next);
            const target = statusRef.current.pages[next];
            if (old !== next && (target || requests.current.has(next)))
              await loadPage(next, target?.page ?? 1);
          } else known.current.delete(id);
          if (old && old !== next && statusRef.current.pages[old])
            await loadPage(old, statusRef.current.pages[old].page);
        },
      }),
      [api, loadConfig, loadPage],
    );
    function toggle(id: CourseGroupId) {
      setAdding(false);
      if (mode === "editor") {
        setMenu((p) => (p === id ? "" : id));
      } else if (mode === "full") {
        full(fullGroup === id ? "" : id);
        return;
      } else
        setExpanded((p) => {
          const next = new Set(p);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      if (!statusRef.current.pages[id] && !requests.current.has(id))
        void loadPage(id).catch(() => {});
    }
    async function persist(ids: CourseGroupId[]) {
      if (mutation.current || disabled) return;
      mutation.current = true;
      setBusy(true);
      setError("");
      try {
        const d = await api("/library", {
          action: "reorder",
          revision: statusRef.current.revision,
          ids,
        });
        if (alive.current) {
          setGroups(d.groups);
          groupsChanged(d.groups);
          setRevision(d.revision);
        }
      } catch (e) {
        if (alive.current)
          setError(
            e instanceof Error ? e.message : "No se pudo guardar el orden.",
          );
      } finally {
        mutation.current = false;
        if (alive.current) setBusy(false);
      }
    }
    function finishDrag() {
      const d = drag.current;
      drag.current = null;
      setMoving("");
      setOver("");
      if (d?.active && d.id !== d.target)
        void persist(
          moveCategory(
            statusRef.current.groups.map((g) => g.id),
            d.id,
            d.target,
          ),
        );
    }
    function courseTile(c: CourseSummary) {
      return (
        <button
          key={c.id}
          className={
            "library-course-tile" + (selected === c.id ? " selected" : "")
          }
          type="button"
          aria-pressed={selected === c.id}
          onClick={() => select(c.id)}
        >
          <strong>{c.title}</strong>
          <span>
            {(
              {
                course: "Curso",
                diploma: "Diplomado",
                program: "Programa",
                workshop: "Taller",
                seminar: "Seminario",
              } as Record<string, string>
            )[c.kind] ?? c.kind}{" "}
            · {c._count.modules} módulos
          </span>
          <small>
            {c.settings.audience === "other"
              ? c.settings.audienceDetail || "Otro público"
              : audienceLabels[c.settings.audience]}
          </small>
          {mode !== "editor" && c.description && <p>{c.description}</p>}
        </button>
      );
    }
    function panel(g: LibraryCategory, compact = false) {
      const page = pages[g.id],
        current = page?.page ?? 1,
        total = counts[g.id] ?? 0;
      return (
        <section
          key={g.id}
          className={"library-course-section" + (compact ? " compact" : "")}
          style={{ "--category-color": g.color } as CSSProperties}
          aria-label={g.title}
        >
          <header>
            <div>
              <h2>{g.title}</h2>
              <small>{total} programas</small>
            </div>
            <div className="course-toolbar">
              {compact && (
                <button type="button" onClick={() => full(g.id)}>
                  Vista completa
                </button>
              )}
              <button
                type="button"
                aria-label={"Cerrar " + g.title}
                onClick={() => {
                  if (compact) setMenu("");
                  else if (mode === "full") full("");
                  else
                    setExpanded((p) => {
                      const n = new Set(p);
                      n.delete(g.id);
                      return n;
                    });
                }}
              >
                Cerrar ×
              </button>
            </div>
          </header>
          <div className="library-course-grid">
            <button
              type="button"
              className="library-new-course"
              disabled={disabled || busy || loading}
              onClick={() => create(g.id)}
            >
              <span aria-hidden="true">＋</span>
              <strong>Crear curso</strong>
              <small>Curso, diplomado o programa</small>
            </button>
            {page?.courses.map(courseTile)}
          </div>
          {!page && <p role="status">Cargando programas…</p>}
          {page && total === 0 && (
            <p className="muted">
              Empieza creando tu primer programa en esta categoría.
            </p>
          )}
          {total > 50 && (
            <nav
              className="library-pagination"
              aria-label={"Páginas de " + g.title}
            >
              <button
                type="button"
                disabled={current === 1 || busy}
                onClick={() => void loadPage(g.id, current - 1).catch(() => {})}
              >
                ← Anterior
              </button>
              <span>
                Página {current} de {Math.ceil(total / 50)} · hasta 50 programas
                por página
              </span>
              <button
                type="button"
                disabled={current >= Math.ceil(total / 50) || busy}
                onClick={() => void loadPage(g.id, current + 1).catch(() => {})}
              >
                Siguiente →
              </button>
            </nav>
          )}
        </section>
      );
    }
    const visible =
      mode === "editor"
        ? groups.filter((g) => g.id === menu)
        : mode === "full"
          ? groups.filter((g) => g.id === fullGroup)
          : groups.filter((g) => expanded.has(g.id));
    return (
      <div
        className={"course-library mode-" + mode}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setMenu("");
            setAdding(false);
          }
        }}
      >
        <div className="library-toolbar">
          <span>
            {mode === "editor" ? "Cambiar de programa" : "Biblioteca de cursos"}
          </span>
          <div className="course-toolbar">
            {mode === "full" && (
              <button type="button" onClick={() => full("")}>
                Todas las categorías
              </button>
            )}
            {mode !== "editor" && selected && (
              <button type="button" onClick={back}>
                Volver al curso abierto
              </button>
            )}
            <button
              type="button"
              aria-label="Actualizar biblioteca"
              disabled={busy || loading}
              onClick={() =>
                void loadConfig()
                  .then(() => {
                    const s = statusRef.current,
                      ids =
                        s.mode === "editor"
                          ? s.menu
                            ? [s.menu]
                            : []
                          : s.fullGroup
                            ? [s.fullGroup]
                            : [...s.expanded];
                    return Promise.all(
                      ids.map((id) => loadPage(id, s.pages[id]?.page ?? 1)),
                    );
                  })
                  .catch((e) => setError(e.message))
              }
            >
              ↻
            </button>
          </div>
        </div>
        <div className="library-category-grid">
          {groups.map((g) => (
            <article
              key={g.id}
              data-category-id={g.id}
              className={
                "library-category" +
                (moving === g.id ? " moving" : "") +
                (over === g.id && moving !== g.id ? " drop-target" : "")
              }
              style={{ "--category-color": g.color } as CSSProperties}
            >
              <button
                type="button"
                className="library-category-toggle"
                aria-expanded={
                  mode === "editor"
                    ? menu === g.id
                    : mode === "full"
                      ? fullGroup === g.id
                      : expanded.has(g.id)
                }
                onClick={() => toggle(g.id)}
                disabled={loading}
              >
                <span aria-hidden="true">{g.icon}</span>
                <strong>{g.title}</strong>
                <span className="library-count">{counts[g.id] ?? 0}</span>
              </button>
              <div className="library-category-actions">
                <button
                  type="button"
                  onClick={() => full(g.id)}
                  disabled={loading}
                >
                  Vista completa
                </button>
                <button
                  type="button"
                  className="library-drag-handle"
                  aria-label={"Mover " + g.title}
                  title="Arrastra para ordenar; también puedes usar las flechas del teclado"
                  disabled={busy || loading || disabled}
                  onKeyDown={(e) => {
                    const i = groups.findIndex((x) => x.id === g.id),
                      delta = ["ArrowLeft", "ArrowUp"].includes(e.key)
                        ? -1
                        : ["ArrowRight", "ArrowDown"].includes(e.key)
                          ? 1
                          : 0;
                    if (delta && groups[i + delta]) {
                      e.preventDefault();
                      void persist(
                        moveCategory(
                          groups.map((g) => g.id),
                          g.id,
                          groups[i + delta].id,
                        ),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: g.id,
                      x: e.clientX,
                      y: e.clientY,
                      target: g.id,
                      active: false,
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    if (
                      !d.active &&
                      Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6
                    )
                      return;
                    d.active = true;
                    setMoving(d.id);
                    const el = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-category-id]");
                    if (el?.dataset.categoryId) {
                      d.target = el.dataset.categoryId as CourseGroupId;
                      setOver(d.target);
                    }
                  }}
                  onPointerUp={finishDrag}
                  onPointerCancel={() => {
                    drag.current = null;
                    setMoving("");
                    setOver("");
                  }}
                >
                  ⠿
                </button>
              </div>
            </article>
          ))}
          <button
            type="button"
            className="library-add-category"
            disabled={busy || loading || disabled}
            aria-expanded={adding}
            onClick={() => {
              setAdding((p) => !p);
              setMenu("");
            }}
          >
            <span aria-hidden="true">＋</span>
            <strong>Nueva categoría</strong>
          </button>
        </div>
        {adding && (
          <form
            className="library-category-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (mutation.current) return;
              const name = String(new FormData(e.currentTarget).get("name"));
              mutation.current = true;
              setBusy(true);
              setError("");
              void api("/library", { action: "create", revision, name, color })
                .then((d) => {
                  if (!alive.current) return;
                  setGroups(d.groups);
                  groupsChanged(d.groups);
                  setRevision(d.revision);
                  setCounts((p) => ({ ...p, [d.createdId]: 0 }));
                  setAdding(false);
                  full(d.createdId);
                })
                .catch((e) => {
                  if (alive.current) setError(e.message);
                })
                .finally(() => {
                  mutation.current = false;
                  if (alive.current) setBusy(false);
                });
            }}
          >
            <label>
              Nombre de la categoría
              <input
                required
                autoFocus
                name="name"
                maxLength={80}
                placeholder="Ej. Cursos para técnicos"
                disabled={busy}
              />
            </label>
            <label>
              Color
              <select
                aria-label="Color de la categoría"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={busy}
              >
                {categoryColors.map((c, i) => (
                  <option key={c} value={c}>
                    {
                      [
                        "Violeta",
                        "Turquesa",
                        "Naranja",
                        "Azul",
                        "Rosa",
                        "Verde",
                      ][i]
                    }
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="course-primary"
              disabled={busy || disabled}
            >
              {busy ? "Guardando…" : "Crear categoría"}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              Cancelar
            </button>
          </form>
        )}
        {error && (
          <p className="course-error" role="alert">
            {error}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void loadConfig().catch((e) => setError(e.message))
              }
            >
              Actualizar biblioteca
            </button>
          </p>
        )}
        {loading && <p role="status">Cargando biblioteca…</p>}
        {visible.map((g) => panel(g, mode === "editor"))}
        {!loading && !visible.length && mode !== "editor" && (
          <p className="library-empty">
            Elige una categoría para ver sus programas o pulsa Nueva categoría.
            Dentro encontrarás ＋ Crear curso.
          </p>
        )}
      </div>
    );
  },
);
