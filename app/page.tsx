"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { CurrentRole, RoleGuide, useCanEdit } from "./components/role-guide";
import { roleLabels, managesUsers } from "../lib/roles";
import { HierarchyBreadcrumbs } from "./components/breadcrumbs";
import { UsersPanel } from "./components/users-panel";
import { VariationEditor } from "./components/variation-editor";
import { ProjectSharing } from "./components/project-sharing";
import { BackgroundBatches } from "./components/background-batches";
import { BrandKit } from "./components/brand-kit";
import { StorageUsage } from "./components/storage-usage";
import { StatisticsPanel } from "./components/statistics-panel";
import {
  CollectionGallery,
  downloadArchive,
} from "./components/collection-gallery";
import {
  AccountSecurity,
  RecoveryIssuer,
  ResetPasswordForm,
} from "./components/account-security";
import {
  Library,
  Presets,
  PresetTools,
  BudgetSettings,
} from "./components/productivity";
import type { FormEvent } from "react";
type User = { id: string; name: string; email: string; role: string };
type Settings = {
  count: number;
  textCount: number;
  imageTextCount: number;
  imageCount: number;
  format: string;
  style: string;
  editable: boolean;
};
type Item = {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  settings?: Partial<Settings>;
  applyPromptToAll?: boolean;
  applySettingsToAll?: boolean;
  inheritedSettings?: Partial<Settings>;
  forceOwn?: boolean;
  canEdit?: boolean;
  canManageAccess?: boolean;
  fullAccess?: boolean;
  _count?: { categories?: number; subproducts?: number; variations?: number };
  owner?: { name: string };
};
type Project = Item & {
  categories: Item[];
  ownerId: string;
  members: { userId: string }[];
};
type Category = Item & {
  subproducts: Item[];
  project: { id: string; name: string };
};
type Job = {
  id: string;
  status: string;
  error: string | null;
  subproductId: string | null;
  projectId: string;
  reservedMicros: string;
  createdAt: string;
  variation: { id: string; expired: boolean } | null;
};
const base: Settings = {
  count: 1,
  textCount: 0,
  imageTextCount: 1,
  imageCount: 0,
  format: "1:1",
  style: "Profesional",
  editable: true,
};
async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch("/api/" + path, {
    method,
    headers:
      data instanceof FormData
        ? {}
        : data
          ? { "Content-Type": "application/json" }
          : {},
    body:
      data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
function useTask() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, success = "Cambios guardados") => {
      setBusy(true);
      setMessage("");
      try {
        await fn();
        setError(false);
        if (success) setMessage(success);
      } catch (e) {
        setError(true);
        setMessage(e instanceof Error ? e.message : "Ocurrió un error.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  return {
    busy,
    run,
    notice: message ? (
      <div
        role="status"
        className={"notice toast " + (error ? "error" : "success")}
        onClick={() => setMessage("")}
      >
        {message} <small>×</small>
      </div>
    ) : null,
  };
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState(false);
  const [installationError, setInstallationError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [view, setView] = useState("projects");
  const [location, setLocation] = useState("");
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [collection, setCollection] = useState<{
    scope: "project" | "category";
    id: string;
  } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [gallery, setGallery] = useState<Item | null>(null);
  const reloadUser = useCallback(async () => {
    try {
      setUser(await api("auth/me"));
    } catch {
      setUser(null);
      try {
        const s = await api<{ needsSetup: boolean }>("auth/status");
        setSetup(s.needsSetup);
        setInstallationError("");
      } catch (e) {
        setSetup(false);
        setInstallationError(
          e instanceof Error
            ? e.message
            : "La instalación aún no está lista. Inténtalo nuevamente más tarde.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (window.location.hash.startsWith("#recuperar=")) {
      setResetToken(window.location.hash.slice("#recuperar=".length));
      window.history.replaceState(null, "", window.location.pathname);
    }
    setLocation(window.location.search);
    const pop = () => setLocation(window.location.search);
    window.addEventListener("popstate", pop);
    void reloadUser();
    return () => window.removeEventListener("popstate", pop);
  }, [reloadUser]);
  const changeAddress = (values: Record<string, string>) => {
    const search = "?" + new URLSearchParams(values).toString();
    if (window.location.search !== search)
      window.history.pushState(null, "", window.location.pathname + search);
    setLocation(search);
  };
  useEffect(() => {
    if (!user) return;
    let active = true;
    const restore = async () => {
      setRouteBusy(true);
      setRouteError("");
      setProject(null);
      setCategory(null);
      setGallery(null);
      setCollection(null);
      try {
        const params = new URLSearchParams(location);
        const requested = params.get("view") ?? "projects";
        const allowed = [
          "projects",
          "library",
          "presets",
          "history",
          "usage",
          "trash",
          "jobs",
          "account",
          "collection",
          ...(managesUsers(user.role) ? ["users"] : []),
          ...(user.role === "OWNER" ? ["ai", "statistics"] : []),
        ];
        const nextView =
          allowed.includes(requested) &&
          (user.role !== "OBSERVER" ||
            ["projects", "presets", "account", "collection"].includes(
              requested,
            ))
            ? requested
            : "projects";
        if (active) setView(nextView);
        if (nextView === "collection") {
          const scope = params.get("scope"),
            id = params.get("id");
          if (!id || !["project", "category"].includes(scope ?? ""))
            throw new Error("El enlace de galería no es válido.");
          if (active)
            setCollection({ scope: scope as "project" | "category", id });
        } else if (nextView === "projects") {
          const galleryId = params.get("gallery"),
            categoryId = params.get("category"),
            projectId = params.get("project");
          if (galleryId) {
            const sub = await api(
              "subproducts/" + encodeURIComponent(galleryId),
            );
            const [c, p] = await Promise.all([
              api("categories/" + sub.categoryId),
              api("projects/" + sub.category.projectId),
            ]);
            if (active) {
              setProject(p);
              setCategory(c);
              setGallery(sub);
            }
          } else if (categoryId) {
            const c = await api("categories/" + encodeURIComponent(categoryId));
            const p = await api("projects/" + c.projectId);
            if (active) {
              setProject(p);
              setCategory(c);
            }
          } else if (projectId) {
            const p = await api("projects/" + encodeURIComponent(projectId));
            if (active) setProject(p);
          }
        }
      } catch (e) {
        if (active)
          setRouteError(
            e instanceof Error ? e.message : "No se pudo abrir el enlace.",
          );
      } finally {
        if (active) setRouteBusy(false);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [location, user?.id, user?.role]);
  const openProject = async (id: string) =>
    changeAddress({ view: "projects", project: id });
  const openCategory = async (id: string) =>
    changeAddress({ view: "projects", category: id });
  const openGallery = (sub: Item) =>
    changeAddress({ view: "projects", gallery: sub.id });
  const openCollection = (scope: "project" | "category", id: string) =>
    changeAddress({ view: "collection", scope, id });
  if (loading)
    return <div className="login-form">Cargando tu espacio de trabajo…</div>;
  if (resetToken)
    return (
      <ResetPasswordForm
        token={resetToken}
        onDone={async () => {
          setResetToken("");
          await reloadUser();
        }}
        onCancel={() => {
          setResetToken("");
          void reloadUser();
        }}
      />
    );
  if (!user && installationError)
    return (
      <div className="login">
        <section className="login-aside">
          <div className="eyebrow" style={{ color: "#94bdac" }}>
            ESTUDIO / PRODUCCIÓN CREATIVA
          </div>
          <h1>Tu espacio está en preparación.</h1>
          <p>
            Estamos conectando los datos para que puedas empezar con tus
            proyectos.
          </p>
        </section>
        <section className="login-form">
          <div className="brand">✳ estudio AI</div>
          <h1>Instalación pendiente</h1>
          <p role="status" className="notice">
            {installationError}
          </p>
          <p className="muted">
            Todavía no necesitas ingresar un usuario o contraseña. Tu cuenta se
            creará durante la instalación segura.
          </p>
          <button
            className="primary"
            onClick={() => {
              setLoading(true);
              void reloadUser();
            }}
          >
            Volver a comprobar
          </button>
        </section>
      </div>
    );
  if (!user) return <Login setup={setup} onLogin={reloadUser} />;
  const titles: Record<string, string> = {
    projects: "Proyectos",
    library: "Biblioteca",
    presets: "Configuraciones guardadas",
    ai: "Configuración → Inteligencia Artificial",
    history: "Historial",
    users: "Usuarios",
    usage: "Consumo de IA",
    statistics: "Estadísticas",
    trash: "Papelera",
    jobs: "Generaciones",
    account: "Mi cuenta",
    collection: "Galería de afiches",
  };
  const navigate = (v: string) => changeAddress({ view: v });
  return (
    <CurrentRole.Provider value={user.role}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span>✳</span>estudio
            <span
              style={{
                background: "none",
                color: "#8b9b94",
                fontSize: 12,
                width: 20,
                margin: 0,
              }}
            >
              AI
            </span>
          </div>
          <div className="eyebrow">Espacio de trabajo</div>
          <nav>
            {[
              ["projects", "▦", "Proyectos"],
              ["jobs", "◉", "Generaciones"],
              ["library", "▧", "Biblioteca"],
              ["presets", "≡", "Configuraciones guardadas"],
              ["history", "◷", "Historial"],
              ["trash", "⌫", "Papelera"],
              ["usage", "↗", "Consumo de IA"],
              ["account", "♙", "Mi cuenta"],
              ...(managesUsers(user.role) ? [["users", "♙", "Usuarios"]] : []),
              ...(user.role === "OWNER"
                ? [
                    ["statistics", "▥", "Estadísticas"],
                    ["ai", "⚙", "Configuración de IA"],
                  ]
                : []),
            ]
              .filter(
                ([v]) =>
                  user.role !== "OBSERVER" ||
                  ["projects", "presets", "account"].includes(v),
              )
              .map(([v, icon, label]) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  onClick={() => navigate(v)}
                >
                  {icon}　{label}
                </button>
              ))}
          </nav>
          <footer>
            <div className="row">
              <span className="avatar">{user.name[0].toUpperCase()}</span>
              <div>
                <strong>{user.name}</strong>
                <div className="eyebrow">{roleLabels[user.role]}</div>
              </div>
            </div>
            <button
              style={{ marginTop: 16, width: "100%" }}
              onClick={() => void api("auth/logout", "POST").then(reloadUser)}
            >
              Cerrar sesión
            </button>
          </footer>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="muted">{titles[view]}</span>
            <span className="badge">Producción publicitaria</span>
          </header>
          <main>
            <RoleGuide name={user.name} role={user.role} />
            {project && view === "projects" && (
              <HierarchyBreadcrumbs
                project={project}
                category={category}
                subproduct={gallery}
                navigate={changeAddress}
              />
            )}
            {routeBusy ? (
              <p role="status">Abriendo tu espacio…</p>
            ) : routeError ? (
              <section className="panel stack">
                <p className="notice error" role="alert">
                  {routeError}
                </p>
                <button onClick={() => navigate("projects")}>
                  Volver a proyectos
                </button>
              </section>
            ) : collection ? (
              <CollectionGallery
                key={`${collection.scope}:${collection.id}`}
                scope={collection.scope}
                id={collection.id}
                back={() =>
                  void (collection.scope === "project"
                    ? openProject(collection.id)
                    : openCategory(collection.id))
                }
                openSubproduct={(id) =>
                  openGallery({ id, name: "Afiches", prompt: "" })
                }
              />
            ) : view === "account" ? (
              <>
                <AccountSecurity onChanged={reloadUser} />
                {user.role === "OWNER" && <StorageUsage />}
              </>
            ) : view === "library" ? (
              <Library />
            ) : view === "presets" ? (
              <Presets />
            ) : view === "ai" ? (
              <AISettings />
            ) : view === "users" ? (
              <UsersPanel isOwner={user.role === "OWNER"} />
            ) : view === "history" ? (
              <History />
            ) : view === "usage" ? (
              <Usage />
            ) : view === "statistics" && user.role === "OWNER" ? (
              <StatisticsPanel />
            ) : view === "jobs" ? (
              <Jobs />
            ) : view === "trash" ? (
              <Projects trash open={openProject} />
            ) : gallery ? (
              <Gallery
                key={gallery.id}
                sub={gallery}
                back={() => void openCategory(category!.id)}
              />
            ) : category &&
              !category.canEdit &&
              !category.subproducts.some((sub) => sub.canEdit) ? (
              <section className="stack">
                <h1>{category.name}</h1>
                <p>{category.prompt}</p>
                <button onClick={() => openCollection("category", category.id)}>
                  Ver afiches del producto
                </button>
                {category.subproducts.map((sub) => (
                  <article className="card" key={sub.id}>
                    <h3>{sub.name}</h3>
                    <button onClick={() => openGallery(sub)}>
                      Ver variaciones
                    </button>
                  </article>
                ))}
              </section>
            ) : category ? (
              <CategoryEditor
                key={category.id}
                category={category}
                refresh={async () => {
                  const next = await api("categories/" + category.id);
                  if (window.location.search === location) setCategory(next);
                }}
                back={() => void openProject(category.project.id)}
                openGallery={openGallery}
                openCollection={() => openCollection("category", category.id)}
              />
            ) : project && !project.canEdit ? (
              <section className="stack">
                <h1>{project.name}</h1>
                <p>{project.description}</p>
                <button onClick={() => openCollection("project", project.id)}>
                  Ver afiches del proyecto
                </button>
                {project.categories.map((c) => (
                  <article className="card" key={c.id}>
                    <h3>{c.name}</h3>
                    <button onClick={() => void openCategory(c.id)}>
                      Abrir producto
                    </button>
                  </article>
                ))}
              </section>
            ) : project ? (
              <ProjectEditor
                project={project}
                refresh={async () => {
                  const next = await api("projects/" + project.id);
                  if (window.location.search === location) setProject(next);
                }}
                back={() => navigate("projects")}
                openCategory={openCategory}
                openCollection={() => openCollection("project", project.id)}
              />
            ) : (
              <Projects open={openProject} />
            )}
          </main>
        </div>
      </div>
    </CurrentRole.Provider>
  );
}
function Login({
  setup,
  onLogin,
}: {
  setup: boolean;
  onLogin: () => Promise<void>;
}) {
  const [mode, setMode] = useState(setup ? "setup" : "login");
  const t = useTask();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void t.run(
      async () => {
        const r = await api("auth/" + mode, "POST", data);
        if (mode === "register") {
          setMode("login");
          return;
        }
        await onLogin();
        return r;
      },
      mode === "register" ? "Solicitud enviada. Espera la aprobación." : "",
    );
  };
  return (
    <div className="login">
      <section className="login-aside">
        <div className="eyebrow" style={{ color: "#94bdac" }}>
          ESTUDIO / PRODUCCIÓN CREATIVA
        </div>
        <h1>De una idea a toda una campaña.</h1>
        <p>
          Tus instrucciones. Tu identidad.
          <br />
          Un espacio para crear publicidad a escala.
        </p>
        <div style={{ marginTop: 35, color: "#8eb5a5" }}>
          Proyectos　→　Ideas　→　Afiches
        </div>
      </section>
      <section className="login-form">
        <div className="brand" style={{ marginBottom: 35 }}>
          ✳ estudio AI
        </div>
        <h1>
          {mode === "setup"
            ? "Configura tu espacio"
            : mode === "register"
              ? "Solicita una cuenta"
              : "Bienvenido de nuevo"}
        </h1>
        <p className="muted">
          {mode === "setup"
            ? "Crea la cuenta OWNER inicial con el token de instalación del servidor."
            : "Ingresa para continuar con tus proyectos."}
        </p>
        <form onSubmit={submit} className="stack">
          {mode !== "login" && (
            <label>
              Nombre
              <input name="name" required autoComplete="name" maxLength={100} />
            </label>
          )}
          <label>
            Correo electrónico
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label>
            Contraseña · mínimo 12 caracteres
            <input
              type="password"
              name="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {mode === "setup" && (
            <label>
              Token de instalación
              <input name="token" type="password" required autoComplete="off" />
            </label>
          )}
          <button className="primary" disabled={t.busy}>
            {mode === "setup"
              ? "Crear OWNER e iniciar"
              : mode === "register"
                ? "Solicitar aprobación"
                : "Ingresar"}
          </button>
        </form>
        {!setup && (
          <button
            style={{ marginTop: 20 }}
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Solicitar una cuenta" : "Volver al ingreso"}
          </button>
        )}
        {!setup && mode === "login" && (
          <p className="muted">
            ¿Olvidaste tu contraseña? Solicita al OWNER o a un Administrador
            autorizado un enlace temporal de recuperación y ábrelo para elegir
            una nueva contraseña.
          </p>
        )}
        {t.notice}
      </section>
    </div>
  );
}
function Uploads({ scope, id }: { scope: string; id: string }) {
  const [files, setFiles] = useState<
    { id: string; name: string; size: number }[]
  >([]);
  const [purpose, setPurpose] = useState("Material de contexto");
  const [uploadLimit, setUploadLimit] = useState(3000000);
  const t = useTask();
  const refresh = useCallback(async () => {
    const [files, caps] = await Promise.all([
      api(`attachments?scope=${scope}&id=${id}`),
      api("capabilities"),
    ]);
    setFiles(files);
    setUploadLimit(caps.maxUploadBytes);
  }, [scope, id]);
  useEffect(() => {
    void t.run(refresh, "");
  }, [refresh]);
  const upload = (file?: File) => {
    if (!file) return;
    void t.run(async () => {
      if (file.size > uploadLimit)
        throw new Error(`El archivo supera ${uploadLimit / 1000000} MB.`);
      const form = new FormData();
      form.set("file", file);
      form.set("scope", scope);
      form.set("resourceId", id);
      form.set("purpose", purpose);
      await api("attachments", "POST", form);
      await refresh();
    }, "Archivo guardado.");
  };
  return (
    <div
      className="upload"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        upload(e.dataTransfer.files[0]);
      }}
    >
      <div className="fields">
        <label>
          Adjuntos · arrastra un archivo
          <input
            aria-label="Adjuntar archivo"
            type="file"
            accept=".txt,.csv,.pdf,.docx,.jpg,.jpeg,.png,.webp,.svg"
            disabled={t.busy}
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label>
          Uso del archivo
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {[
              "Material de contexto",
              "Logo institucional",
              "Referencia visual",
              "Fotografía obligatoria",
              "Información comercial",
              "Manual de marca",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="upload-list">
        {files.map((f) => (
          <span key={f.id}>
            {f.name} · {Math.ceil(f.size / 1024)} KB{" "}
            <button
              aria-label={"Eliminar " + f.name}
              onClick={() =>
                void t.run(async () => {
                  await api("attachments/" + f.id, "DELETE");
                  await refresh();
                })
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <p className="hint">
        Hasta {uploadLimit / 1000000} MB. Extraemos texto de TXT, CSV, PDF y
        DOCX sin consumir IA. Las imágenes se envían como referencias visuales;
        revisa su uso antes de generar.
      </p>
      {t.notice}
    </div>
  );
}
function Projects({
  open,
  trash = false,
}: {
  open: (id: string) => Promise<void>;
  trash?: boolean;
}) {
  const canEdit = useCanEdit();
  const [items, setItems] = useState<Item[]>([]);
  const [create, setCreate] = useState(false);
  const [query, setQuery] = useState("");
  const t = useTask();
  const refresh = useCallback(
    async () => setItems(await api("projects" + (trash ? "?trash=true" : ""))),
    [trash],
  );
  useEffect(() => {
    void t.run(refresh, "");
  }, [refresh]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    void t.run(async () => {
      const p = await api("projects", "POST", data);
      setCreate(false);
      await open(p.id);
    }, "Proyecto creado");
  };
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Tu espacio creativo</div>
          <h1>{trash ? "Papelera" : "Mis proyectos"}</h1>
          <p className="muted">
            {trash
              ? "Restaura tus proyectos. El historial administrativo se conserva."
              : "Organiza tus campañas y convierte tus ideas en publicidad."}
          </p>
        </div>
        {!trash && canEdit && (
          <button className="primary" onClick={() => setCreate(!create)}>
            ＋ Nuevo proyecto
          </button>
        )}
      </div>
      {!trash && (
        <div className="intro">
          <div>
            <strong>Una configuración. Muchas posibilidades.</strong>
            <p className="muted">
              Define las instrucciones del proyecto y reutilízalas en cada
              producto y subproducto.
            </p>
          </div>
          <span className="badge" style={{ alignSelf: "center" }}>
            Proyecto → Producto → Subproducto → Variaciones
          </span>
        </div>
      )}
      {create && (
        <form className="panel stack" onSubmit={submit}>
          <h2>Nuevo proyecto</h2>
          <label>
            Nombre
            <input name="name" required maxLength={200} />
          </label>
          <label>
            Descripción
            <input name="description" maxLength={2000} />
          </label>
          <label>
            Instrucciones generales
            <textarea
              name="prompt"
              maxLength={30000}
              placeholder="Describe qué quieres crear. Los detalles comerciales son opcionales."
            />
          </label>
          <button disabled={t.busy} className="primary">
            Crear proyecto
          </button>
        </form>
      )}
      <div className="row spread" style={{ marginBottom: 20 }}>
        <strong>{items.length} proyectos</strong>
        <input
          aria-label="Buscar proyectos"
          style={{ maxWidth: 280 }}
          placeholder="Buscar proyecto…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="grid">
        {items
          .filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
          .map((p) => (
            <article className="card" key={p.id}>
              <div className="row spread">
                <div className="tile">▦</div>
                <span className="badge">
                  {trash ? "En papelera" : "Activo"}
                </span>
              </div>
              <h3>{p.name}</h3>
              <p className="muted">
                {p.description || "Un espacio para tus próximas campañas."}
              </p>
              <div className="bottom">
                <small>
                  {p._count?.categories ?? 0} productos · {p.owner?.name}
                </small>
                <button
                  onClick={() =>
                    void t.run(
                      trash
                        ? async () => {
                            await api("projects/" + p.id + "/restore", "POST");
                            await refresh();
                          }
                        : () => open(p.id),
                      "",
                    )
                  }
                >
                  {trash ? "Restaurar" : "Abrir →"}
                </button>
              </div>
            </article>
          ))}
      </div>
      {!items.length && (
        <div className="empty">
          {trash
            ? "No hay proyectos en papelera."
            : "Crea tu primer proyecto para comenzar."}
        </div>
      )}
      {t.notice}
    </>
  );
}
function PromptForm({
  item,
  save,
  children,
  configuration,
}: {
  item: Item;
  save: (data: any) => Promise<void>;
  children?: React.ReactNode;
  configuration?: {
    settings: unknown;
    applyPromptToAll: boolean;
    applySettingsToAll: boolean;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTask();
  return (
    <form
      ref={formRef}
      aria-label={"Instrucciones de " + item.name}
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void t.run(() =>
          save(Object.fromEntries(new FormData(e.currentTarget))),
        );
      }}
    >
      <label>
        Nombre
        <input name="name" defaultValue={item.name} required maxLength={200} />
      </label>
      {item.description !== undefined && (
        <label>
          Descripción
          <input
            name="description"
            defaultValue={item.description}
            maxLength={2000}
          />
        </label>
      )}
      <label>
        {configuration
          ? "Instrucciones generales del producto"
          : "Instrucciones del proyecto"}
        <textarea
          name="prompt"
          defaultValue={item.prompt}
          maxLength={30000}
          placeholder="Escribe instrucciones en lenguaje natural…"
        />
      </label>
      {children}
      <button disabled={t.busy} className="primary">
        Guardar instrucciones
      </button>
      {configuration && (
        <PresetTools
          category={item}
          saveCurrent={async () => {
            const current = {
              ...item,
              ...Object.fromEntries(new FormData(formRef.current!)),
              ...configuration,
            };
            await save(current);
            return current;
          }}
        />
      )}
      {t.notice}
    </form>
  );
}
function ProjectEditor({
  project: p,
  refresh,
  back,
  openCategory,
  openCollection,
}: {
  project: Project;
  refresh: () => Promise<void>;
  back: () => void;
  openCategory: (id: string) => Promise<void>;
  openCollection: () => void;
}) {
  const [create, setCreate] = useState(false);
  const [share, setShare] = useState(false);
  const t = useTask();
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Proyecto</div>
          <h1>{p.name}</h1>
          <p className="muted">{p.description}</p>
        </div>
        <button className="primary" onClick={() => setCreate(!create)}>
          ＋ Nuevo producto
        </button>
      </div>
      <details>
        <summary>Instrucciones del proyecto y adjuntos</summary>
        <div className="inside stack">
          <PromptForm
            key={p.id}
            item={p}
            save={async (b) => {
              await api("projects/" + p.id, "PATCH", b);
              await refresh();
            }}
          />
          <Uploads scope="project" id={p.id} />
        </div>
      </details>
      <BrandKit key={p.id} projectId={p.id} />
      <div className="row" style={{ margin: "18px 0" }}>
        <button onClick={openCollection}>Ver afiches del proyecto</button>
        {p.canManageAccess && (
          <button onClick={() => setShare(!share)}>Compartir proyecto</button>
        )}
        <button
          className="danger"
          hidden={!p.canManageAccess}
          onClick={() => {
            if (
              confirm(
                "¿Enviar este proyecto a la papelera? Su auditoría se conservará.",
              )
            )
              void t.run(async () => {
                await api("projects/" + p.id, "DELETE");
                back();
              });
          }}
        >
          Enviar a papelera
        </button>
      </div>
      {share && p.canManageAccess && (
        <ProjectSharing key={p.id} projectId={p.id} />
      )}
      {create && (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void t.run(async () => {
              const c = await api(
                "projects/" + p.id + "/categories",
                "POST",
                data,
              );
              setCreate(false);
              await refresh();
              await openCategory(c.id);
            }, "Producto creado");
          }}
        >
          <label>
            Nombre de producto
            <input name="name" required maxLength={200} />
          </label>
          <label>
            Instrucciones opcionales
            <textarea name="prompt" />
          </label>
          <button className="primary" disabled={t.busy}>
            Crear producto
          </button>
        </form>
      )}
      <h2 style={{ marginTop: 28 }}>
        Productos <span className="muted">· {p.categories.length}</span>
      </h2>
      <div className="grid">
        {p.categories.map((c) => (
          <article className="card" key={c.id}>
            <div className="tile">≡</div>
            <h3>{c.name}</h3>
            <p className="muted">
              {c.prompt.slice(0, 120) ||
                "Utiliza las instrucciones del proyecto."}
            </p>
            <div className="bottom">
              <small>{c._count?.subproducts ?? 0} subproductos</small>
              <button onClick={() => void t.run(() => openCategory(c.id), "")}>
                Abrir →
              </button>
            </div>
          </article>
        ))}
      </div>
      {!p.categories.length && (
        <div className="empty">
          Los productos agrupan productos con instrucciones comunes. Crea una
          para comenzar.
        </div>
      )}
      {t.notice}
    </>
  );
}
function SettingsFields({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (s: Settings) => void;
}) {
  const change = (key: keyof Settings, value: string) =>
    onChange({
      ...s,
      [key]: ["format", "style"].includes(key) ? value : Number(value),
    });
  const s = value;
  return (
    <>
      <div className="fields">
        {[
          ["count", "Variaciones", 1, 12],
          ["textCount", "Texto", 0, 12],
          ["imageTextCount", "Imagen + Texto", 0, 12],
          ["imageCount", "Imagen", 0, 12],
        ].map(([k, l, min, max]) => (
          <label key={k}>
            {l}
            <input
              type="number"
              min={min}
              max={max}
              value={String(s[k as keyof Settings])}
              onChange={(e) => change(k as keyof Settings, e.target.value)}
              required
            />
          </label>
        ))}
        <label>
          Formato
          <select
            value={s.format}
            onChange={(e) => change("format", e.target.value)}
          >
            {["1:1", "4:3", "3:4", "4:5", "5:4", "16:9", "9:16"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Estilo · busca o escribe
          <input
            list="styles"
            value={s.style}
            onChange={(e) => change("style", e.target.value)}
          />
          <datalist id="styles">
            {[
              "Institucional",
              "Ministerial",
              "Universitario",
              "Corporativo",
              "Ejecutivo",
              "Minimalista",
              "Premium",
              "Elegante",
              "Moderno",
              "Tecnológico",
              "Industrial",
              "Ecológico",
              "Infantil",
              "Educativo",
              "Publicitario",
              "Comercial",
              "Creativo",
              "Formal",
              "Muy formal",
              "Profesional",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </datalist>
        </label>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={s.editable}
          onChange={(e) => onChange({ ...s, editable: e.target.checked })}
        />
        Conservar títulos, textos y logos como elementos editables
      </label>
      <small>
        {s.textCount + s.imageTextCount + s.imageCount} de {s.count}{" "}
        configuradas. La suma debe coincidir.
      </small>
    </>
  );
}
function CategoryEditor({
  category: c,
  refresh,
  back,
  openGallery,
  openCollection,
}: {
  category: Category;
  refresh: () => Promise<void>;
  back: () => void;
  openGallery: (s: Item) => void;
  openCollection: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [promptAll, setPromptAll] = useState(c.applyPromptToAll ?? true);
  const [settingsAll, setSettingsAll] = useState(c.applySettingsToAll ?? true);
  const [s, setS] = useState<Settings>({ ...base, ...c.settings });
  const [bulk, setBulk] = useState(false);
  const [names, setNames] = useState<string[]>([""]);
  const [count, setCount] = useState(12);
  const [lines, setLines] = useState("");
  const t = useTask();
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Producto</div>
          <h1>{c.name}</h1>
          <p className="muted">
            Instrucciones compartidas, resultados individuales.
          </p>
        </div>
        {c.canEdit && (
          <button className="primary" onClick={() => setBulk(!bulk)}>
            + Agregar subproductos
          </button>
        )}
      </div>
      <button onClick={openCollection} style={{ marginBottom: 18 }}>
        Ver afiches del producto
      </button>
      {c.canManageAccess && (
        <>
          <button type="button" onClick={() => setSharing(!sharing)}>
            Compartir producto
          </button>
          {sharing && <ProjectSharing projectId={c.id} scope="category" />}
        </>
      )}
      <details hidden={!c.canEdit}>
        <summary>Instrucciones y configuración de producto</summary>
        <div className="inside stack">
          <PromptForm
            item={c}
            configuration={{
              settings: s,
              applyPromptToAll: promptAll,
              applySettingsToAll: settingsAll,
            }}
            save={async (b) => {
              await api("categories/" + c.id, "PATCH", {
                ...b,
                settings: s,
                applyPromptToAll: promptAll,
                applySettingsToAll: settingsAll,
              });
              await refresh();
            }}
          >
            <label className="row">
              <input
                type="checkbox"
                checked={promptAll}
                onChange={(e) => setPromptAll(e.target.checked)}
              />
              Aplicar las instrucciones generales a todos los subproductos
            </label>
            <p className="hint">
              Las instrucciones particulares se suman a este prompt y al del
              proyecto. Un prompt vacío no añade indicaciones. Cada subproducto
              conserva su tema obligatorio.
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={settingsAll}
                onChange={(e) => setSettingsAll(e.target.checked)}
              />
              Aplicar cantidad, distribución, formato y estilo a todos los
              anuncios
            </label>
            {settingsAll ? (
              <SettingsFields value={s} onChange={setS} />
            ) : (
              <p className="notice">
                Define esos parámetros en cada subproducto. Los valores comunes
                quedan guardados, pero no se aplicarán.
              </p>
            )}
          </PromptForm>
          <Uploads scope="category" id={c.id} />
        </div>
      </details>
      {bulk && (
        <section className="panel stack">
          <h2>Agregar subproductos</h2>
          <p>
            Los nuevos espacios se sumarán a los {c.subproducts.length}{" "}
            existentes; no los reemplazan.
          </p>
          <div className="row">
            <label>
              Cantidad de espacios
              <input
                type="number"
                min={1}
                max={20}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            <button
              onClick={() => {
                if (count >= 1 && count <= 20)
                  setNames(
                    Array.from({ length: count }, (_, i) => names[i] ?? ""),
                  );
              }}
            >
              Crear espacios
            </button>
          </div>
          <details>
            <summary>Pegar nombres o importar CSV</summary>
            <div className="inside stack">
              <textarea
                value={lines}
                onChange={(e) => setLines(e.target.value)}
                placeholder="Un nombre por línea"
              />
              <input
                type="file"
                accept=".csv,.txt"
                aria-label="Importar nombres"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void f.text().then(setLines);
                }}
              />
              <button
                onClick={() => {
                  const list = lines
                    .split(/\r?\n/)
                    .map((x) => x.trim())
                    .filter(Boolean);
                  if (list.length > 20) {
                    alert("Importa como máximo 20 nombres por operación.");
                    return;
                  }
                  setNames(list);
                }}
              >
                Aplicar nombres
              </button>
            </div>
          </details>
          <div className="fields">
            {names.map((n, i) => (
              <label key={i}>
                Subproducto {i + 1}
                <input
                  value={n}
                  maxLength={200}
                  onChange={(e) =>
                    setNames(
                      names.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="primary"
            disabled={t.busy}
            onClick={() =>
              void t.run(async () => {
                await api("categories/" + c.id + "/subproducts", "POST", {
                  names: names.filter((n) => n.trim()),
                });
                setBulk(false);
                setNames([""]);
                await refresh();
              }, "Subproductos creados")
            }
          >
            Agregar {names.filter((n) => n.trim()).length} subproductos
          </button>
        </section>
      )}
      <div className="row spread" style={{ margin: "28px 0 18px" }}>
        <h2 style={{ margin: 0 }}>Subproductos · {c.subproducts.length}</h2>
        {c.canEdit && (
          <BatchGeneration categoryId={c.id} count={c.subproducts.length} />
        )}
        <span className="badge">Herencia automática</span>
      </div>
      <div className="row">
        <label className="row">
          <input
            type="checkbox"
            checked={
              !!c.subproducts.length &&
              selectedSubs.length === c.subproducts.length
            }
            onChange={(e) =>
              setSelectedSubs(
                e.target.checked ? c.subproducts.map((sub) => sub.id) : [],
              )
            }
          />
          Seleccionar todos los subproductos
        </label>
        <button
          type="button"
          className="danger"
          disabled={!selectedSubs.length || t.busy}
          onClick={() => {
            if (
              confirm(
                `¿Eliminar ${selectedSubs.length} subproductos? Se retirarán de los lotes nuevos y se cancelarán sus trabajos pendientes. El historial se conserva.`,
              )
            )
              void t.run(async () => {
                await api("subproducts/bulk-delete", "POST", {
                  ids: selectedSubs,
                });
                setSelectedSubs([]);
                await refresh();
              }, "Subproductos eliminados");
          }}
        >
          Eliminar seleccionados ({selectedSubs.length})
        </button>
      </div>
      {c.subproducts.map((sub, i) => (
        <div key={sub.id} className="stack subproduct-space">
          <label className="row">
            <input
              type="checkbox"
              checked={selectedSubs.includes(sub.id)}
              onChange={(e) =>
                setSelectedSubs((ids) =>
                  e.target.checked
                    ? [...ids, sub.id]
                    : ids.filter((id) => id !== sub.id),
                )
              }
            />
            Seleccionar {sub.name}
          </label>
          <SubproductRow
            key={sub.id}
            sub={sub}
            index={i}
            inherited={{
              ...base,
              ...(sub.inheritedSettings ??
                (c.applySettingsToAll !== false ? c.settings : {})),
            }}
            forceOwn={sub.forceOwn ?? c.applySettingsToAll === false}
            openGallery={() => openGallery(sub)}
            removed={async () => {
              setSelectedSubs((ids) => ids.filter((id) => id !== sub.id));
              await refresh();
            }}
          />
        </div>
      ))}
      {!c.subproducts.length && (
        <div className="empty">
          Agrega de 1 a 20 temas por operación. Todos heredarán las
          instrucciones de este producto.
        </div>
      )}
      {t.notice}
    </>
  );
}
function BatchGeneration({
  categoryId,
  count,
}: {
  categoryId: string;
  count: number;
}) {
  const [preview, setPreview] = useState<any[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const t = useTask();
  return (
    <div>
      <button
        disabled={!count || t.busy}
        onClick={() =>
          void t.run(async () => {
            const result = await api("categories/" + categoryId + "/preview");
            setPreview(result);
            setSelected(result.map((p: any) => p.id));
            setConsent(false);
          }, "")
        }
      >
        Revisar y seleccionar subproductos
      </button>
      {preview && (
        <div className="panel" style={{ marginTop: 15 }}>
          <h3>
            {preview
              .filter((p) => selected.includes(p.id))
              .reduce((n, p) => n + p.settings.count, 0)}{" "}
            afiches en este lote
          </h3>
          <div className="row">
            <button
              onClick={() => {
                setSelected(preview.map((p) => p.id));
                setConsent(false);
              }}
            >
              Seleccionar todos
            </button>
            <button
              onClick={() => {
                setSelected([]);
                setConsent(false);
              }}
            >
              Quitar selección
            </button>
          </div>
          {preview.map((p) => (
            <div key={p.id} className="stack" style={{ margin: "16px 0" }}>
              <label className="row">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, p.id]
                        : selected.filter((id) => id !== p.id),
                    );
                    setConsent(false);
                  }}
                />
                Incluir {p.name}
              </label>
              <details>
                <summary>
                  {p.name} · {p.settings.count} variaciones
                </summary>
                <pre>{p.text}</pre>
                {p.warnings.map((w: string, i: number) => (
                  <div className="notice" key={i}>
                    {w}
                  </div>
                ))}
              </details>
            </div>
          ))}
          <label className="row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            He revisado las instrucciones de los subproductos seleccionados y
            autorizo el cargo de API de este lote.
          </label>
          <button
            className="primary"
            disabled={
              !consent ||
              !selected.length ||
              t.busy ||
              preview.some((p) => selected.includes(p.id) && p.warnings.length)
            }
            onClick={() =>
              void t.run(async () => {
                await api("categories/" + categoryId + "/generate", "POST", {
                  confirmCharge: true,
                  reviewedInstructions: true,
                  requestId: crypto.randomUUID(),
                  selected,
                });
                setPreview(null);
              }, "Lote encolado. Sigue el progreso en Generaciones.")
            }
          >
            Generar selección
          </button>
          <button onClick={() => setPreview(null)}>Cerrar</button>
        </div>
      )}
      {t.notice}
    </div>
  );
}
function SubproductRow({
  sub,
  index,
  inherited,
  forceOwn,
  openGallery,
  removed,
}: {
  sub: Item;
  index: number;
  inherited: Settings;
  forceOwn: boolean;
  openGallery: () => void;
  removed: () => Promise<void>;
}) {
  const [sharing, setSharing] = useState(false);
  const [name, setName] = useState(sub.name);
  const [prompt, setPrompt] = useState(sub.prompt);
  const [custom, setCustom] = useState(
    forceOwn || Object.keys(sub.settings ?? {}).length > 0,
  );
  const [s, setS] = useState<Settings>({ ...inherited, ...sub.settings });
  useEffect(() => {
    if (forceOwn && Object.keys(sub.settings ?? {}).length === 0) {
      setCustom(true);
      setS({ ...base });
    }
  }, [forceOwn, sub.id]);
  const [preview, setPreview] = useState<any>(null);
  const [review, setReview] = useState(false);
  const [charge, setCharge] = useState(false);
  const t = useTask();
  const save = async () => {
    await api("subproducts/" + sub.id, "PATCH", {
      name,
      prompt,
      settings: custom || forceOwn ? s : {},
    });
  };
  return (
    <details aria-label={"Subproducto " + sub.id}>
      <summary>
        <span className="sub-num">{String(index + 1).padStart(2, "0")}</span>
        <strong>{name}</strong>
        <small>
          {(custom || forceOwn ? s : inherited).count} variaciones ·{" "}
          {custom || forceOwn || prompt
            ? "Personalizada"
            : "Configuración heredada"}
        </small>
      </summary>
      <div className="inside stack">
        <p className="notice">
          Eje temático: <strong>{name || sub.name}</strong>. Todas las
          variaciones tratarán de este tema y deben mencionar su nombre. Las
          instrucciones particulares añaden detalles a las instrucciones
          generales activas.
        </p>
        <label style={{ marginTop: 18 }}>
          Tema / nombre del subproducto
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
        <label>
          Instrucciones particulares · opcional
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setReview(false);
            }}
            placeholder="Escribe solo las excepciones o indicaciones adicionales."
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={custom || forceOwn}
            disabled={forceOwn}
            onChange={(e) => {
              setCustom(e.target.checked);
              setReview(false);
            }}
          />
          Personalizar cantidad, distribución y estilo
        </label>
        {(custom || forceOwn) && (
          <SettingsFields
            value={s}
            onChange={(x) => {
              setS(x);
              setReview(false);
            }}
          />
        )}
        <button disabled={t.busy} onClick={() => void t.run(save)}>
          Guardar cambios del subproducto
        </button>
        <div className="row">
          {sub.canManageAccess && (
            <button type="button" onClick={() => setSharing(!sharing)}>
              Compartir subproducto
            </button>
          )}
          <button
            type="button"
            className="danger"
            disabled={t.busy}
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar el espacio ${name}? Se cancelarán sus trabajos pendientes. El historial se conserva.`,
                )
              )
                void t.run(async () => {
                  await api("subproducts/" + sub.id, "DELETE");
                  await removed();
                }, "Subproducto eliminado");
            }}
          >
            Eliminar subproducto
          </button>
        </div>
        {sharing && sub.canManageAccess && (
          <ProjectSharing projectId={sub.id} scope="subproduct" />
        )}
        <PresetTools
          category={{
            ...sub,
            name,
            prompt,
            settings: custom || forceOwn ? s : inherited,
          }}
          scope="subproduct"
          saveCurrent={async () => {
            await save();
            return {
              ...sub,
              name,
              prompt,
              settings: custom || forceOwn ? s : inherited,
            };
          }}
        />
        <Uploads scope="subproduct" id={sub.id} />
        <div className="row">
          <button
            onClick={() =>
              void t.run(async () => {
                await save();
                setPreview(
                  await api("subproducts/" + sub.id + "/instructions"),
                );
                setReview(false);
              }, "")
            }
          >
            Ver instrucciones finales
          </button>
          <button onClick={openGallery}>
            Ver variaciones ({sub._count?.variations ?? 0}) →
          </button>
        </div>
        {preview && (
          <div className="panel">
            <h3>Revisa antes de generar</h3>
            <pre>{preview.text}</pre>
            {preview.overrides.map((w: string, i: number) => (
              <p key={i} className="hint">
                {w}
              </p>
            ))}
            {preview.warnings.map((w: string, i: number) => (
              <div className="notice" key={i}>
                {w}
              </div>
            ))}
            <p className="hint">
              El análisis convencional detecta conflictos básicos; confirma el
              contenido comercial antes de enviarlo.
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
              />
              He revisado y autorizado las instrucciones finales.
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={charge}
                onChange={(e) => setCharge(e.target.checked)}
              />
              Autorizo las llamadas de IA y su posible cargo de API.
            </label>
            <button
              className="primary"
              style={{ marginTop: 15 }}
              disabled={
                t.busy || !review || !charge || preview.warnings.length > 0
              }
              onClick={() =>
                void t.run(async () => {
                  await save();
                  await api("subproducts/" + sub.id + "/generate", "POST", {
                    confirmCharge: true,
                    reviewedInstructions: true,
                    requestId: crypto.randomUUID(),
                  });
                }, "Generación encolada. Consulta Generaciones para seguir el progreso.")
              }
            >
              Generar {(custom ? s : inherited).count} variaciones
            </button>
          </div>
        )}
        {t.notice}
      </div>
    </details>
  );
}
function AISettings() {
  const [c, setC] = useState<any>(null);
  const [key, setKey] = useState("");
  const [available, setAvailable] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [charge, setCharge] = useState(false);
  const t = useTask();
  const refresh = useCallback(async () => {
    const r = await api("ai/config");
    setC(r.configuration);
    setAvailable(r.providers);
  }, []);
  useEffect(() => {
    void t.run(refresh, "");
  }, [refresh]);
  if (!c) return <p>Cargando configuración segura…{t.notice}</p>;
  const update = (k: string, v: unknown) => setC({ ...c, [k]: v });
  const image = c.models.find((m: any) => m.id === c.imageModel);
  const save = async () => {
    await api("ai/config", "PUT", {
      provider: c.provider,
      ...(key ? { apiKey: key } : {}),
      imageModel: c.imageModel ?? null,
      creativeModel: c.creativeModel ?? null,
      alternatives: c.alternatives ?? [],
      quality: c.quality,
      resolution: c.resolution,
      monthlyLimitMicros: c.monthlyLimitMicros,
      dailyLimitMicros: c.dailyLimitMicros,
      operationLimitMicros: c.operationLimitMicros,
      imageReserveMicros: c.imageReserveMicros,
      maxGenerations: Number(c.maxGenerations),
    });
    setKey("");
    await refresh();
  };
  const state: Record<string, string> = {
    NOT_CONFIGURED: "Sin configurar",
    UNVERIFIED: "Sin verificar",
    VERIFIED: "Conexión verificada",
    ERROR: "Error de conexión",
    EXPIRED: "Verificación caducada",
  };
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Configuración / Exclusivo del OWNER</div>
          <h1>Inteligencia Artificial</h1>
          <p className="muted">
            Conecta tu proveedor y establece las reglas de generación de tu
            equipo.
          </p>
        </div>
        <span className={"badge " + (c.status === "VERIFIED" ? "" : "warning")}>
          {state[c.status] ?? c.status}
        </span>
      </div>
      <div className="notice">
        La generación requiere una conexión verificada, modelos compatibles y
        presupuesto configurado. Una suscripción a ChatGPT no cubre el consumo
        de API.
      </div>
      <section className="panel stack">
        <h2>01　Proveedor y credenciales</h2>
        <div className="fields">
          <label>
            Proveedor
            <select
              value={c.provider}
              onChange={(e) => update("provider", e.target.value)}
            >
              {available.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {c.maskedKey ? "Reemplazar clave API" : "Clave API"}
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={c.maskedKey ?? "Introduce tu clave API"}
              autoComplete="off"
              spellCheck={false}
              maxLength={1000}
            />
          </label>
        </div>
        <p className="hint">
          La clave se cifra en el servidor con una clave maestra externa a la
          base de datos. Después de guardarla solo se muestra su versión
          enmascarada.
        </p>
        {c.maskedKey && (
          <p>
            Clave guardada: <strong>{c.maskedKey}</strong>
          </p>
        )}
        <div className="row">
          <button
            className="primary"
            disabled={t.busy}
            onClick={() =>
              void t.run(
                save,
                "Configuración guardada. Verifica de nuevo la conexión para habilitarla.",
              )
            }
          >
            Guardar configuración
          </button>
          <button
            disabled={t.busy || !!key || !c.maskedKey}
            onClick={() =>
              void t.run(async () => {
                await api("ai/verify", "POST");
                await refresh();
              }, "OpenAI respondió a la consulta de modelos. La generación todavía requiere su propia prueba.")
            }
          >
            Verificar conexión y consultar modelos
          </button>
          {c.maskedKey && (
            <button
              className="danger"
              disabled={t.busy}
              onClick={() => {
                if (
                  confirm(
                    "¿Eliminar la clave? La generación quedará deshabilitada.",
                  )
                )
                  void t.run(async () => {
                    await api("ai/config", "DELETE");
                    setKey("");
                    await refresh();
                  }, "Credencial eliminada");
              }}
            >
              Eliminar clave
            </button>
          )}
        </div>
        {c.verifiedAt && (
          <p className="hint">
            Última comprobación real:{" "}
            {new Date(c.verifiedAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
            })}
            . Debe renovarse cada 24 horas. Verifica acceso a modelos; no
            garantiza saldo ni generación.
          </p>
        )}
        {c.error && <div className="notice error">{c.error}</div>}
      </section>
      <section className="panel stack">
        <h2>02　Modelos y parámetros</h2>
        {!c.models.length ? (
          <p className="muted">
            Verifica la conexión para consultar los modelos disponibles y
            compatibles. No se muestra ningún modelo supuesto.
          </p>
        ) : (
          <>
            <div className="fields">
              <label>
                Modelo de imágenes
                <input
                  list="image-models"
                  value={c.imageModel ?? ""}
                  onChange={(e) => update("imageModel", e.target.value)}
                  placeholder="Busca en modelos verificados"
                />
                <datalist id="image-models">
                  {c.models
                    .filter((m: any) => m.kind === "image")
                    .map((m: any) => (
                      <option key={m.id}>{m.id}</option>
                    ))}
                </datalist>
              </label>
              <label>
                Modelo de dirección creativa
                <input
                  list="creative-models"
                  value={c.creativeModel ?? ""}
                  onChange={(e) => update("creativeModel", e.target.value)}
                />
                <datalist id="creative-models">
                  {c.models
                    .filter((m: any) => m.kind === "creative")
                    .map((m: any) => (
                      <option key={m.id}>{m.id}</option>
                    ))}
                </datalist>
              </label>
              <label>
                Calidad
                <select
                  value={c.quality}
                  onChange={(e) => update("quality", e.target.value)}
                >
                  {(image?.qualities ?? ["low"]).map((x: string) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Resolución
                <select
                  value={c.resolution}
                  onChange={(e) => update("resolution", e.target.value)}
                >
                  {(image?.resolutions ?? ["1024x1024"]).map((x: string) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>Modelos alternativos · selecciona los autorizados</label>
            <div className="row">
              {c.models
                .filter((m: any) => m.kind === "image" && m.id !== c.imageModel)
                .map((m: any) => (
                  <label className="row" key={m.id}>
                    <input
                      type="checkbox"
                      checked={c.alternatives.includes(m.id)}
                      onChange={(e) =>
                        update(
                          "alternatives",
                          e.target.checked
                            ? [...c.alternatives, m.id]
                            : c.alternatives.filter((x: string) => x !== m.id),
                        )
                      }
                    />
                    {m.id}
                  </label>
                ))}
            </div>
            <p className="hint">
              Las alternativas se guardan para selección del OWNER. No se
              reintentan llamadas con posible cargo automáticamente. Los
              proyectos utilizan esta configuración global.
            </p>
          </>
        )}
      </section>
      <section className="panel stack">
        <h2>03　Presupuesto y límites</h2>
        <p className="hint">
          Importes en USD. Son límites de reservas locales, no tarifas del
          proveedor ni un tope garantizado de su factura. Configura también
          límites en la cuenta de OpenAI. El importe real queda como desconocido
          hasta conciliación.
        </p>
        <div className="fields">
          {[
            ["monthlyLimitMicros", "Presupuesto mensual"],
            ["dailyLimitMicros", "Presupuesto diario"],
            ["operationLimitMicros", "Máximo por operación"],
            [
              "imageReserveMicros",
              "Reserva por afiche (incluye dirección creativa)",
            ],
          ].map(([k, label]) => (
            <label key={k}>
              {label} · USD
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.000001"
                value={Number(c[k]) / 1000000}
                onChange={(e) =>
                  update(
                    k,
                    String(Math.round(Number(e.target.value) * 1000000)),
                  )
                }
              />
            </label>
          ))}
          <label>
            Máximo de afiches por operación
            <input
              type="number"
              min={1}
              max={1000}
              value={c.maxGenerations}
              onChange={(e) => update("maxGenerations", Number(e.target.value))}
            />
          </label>
        </div>
        <button
          className="primary"
          disabled={t.busy}
          onClick={() => void t.run(save)}
        >
          Guardar modelos y límites
        </button>
      </section>
      <BudgetSettings />
      <section className="panel stack">
        <h2>04　Prueba real de generación · opcional</h2>
        <p>
          La prueba crea un afiche e invoca dirección creativa e imágenes.{" "}
          <strong>Puede producir cargos de API.</strong> Se aplican los
          presupuestos y el registro de consumo.
        </p>
        <label className="row">
          <input
            type="checkbox"
            checked={charge}
            onChange={(e) => setCharge(e.target.checked)}
          />
          Entiendo el posible cargo y autorizo una generación de prueba.
        </label>
        <button
          disabled={!charge || t.busy || c.status !== "VERIFIED"}
          onClick={() =>
            void t.run(async () => {
              await api("ai/test", "POST", {
                confirmCharge: true,
                requestId: crypto.randomUUID(),
              });
              setCharge(false);
            }, "Prueba encolada. Revisa su resultado en Generaciones.")
          }
        >
          Generar prueba con posible cargo
        </button>
      </section>
      {t.notice}
    </>
  );
}
function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const t = useTask();
  const pause = useRef(false);
  const [processing, setProcessing] = useState(false);
  const refreshJobs = async () => setJobs(await api<Job[]>("jobs"));
  useEffect(
    () => () => {
      pause.current = true;
    },
    [],
  );
  const processPending = () => {
    pause.current = false;
    setProcessing(true);
    void t.run(async () => {
      try {
        const pending = (await api<Job[]>("jobs")).filter(
          (j) => j.status === "PENDING",
        );
        for (const job of pending) {
          if (pause.current) break;
          const result = await api(`jobs/${job.id}/process`, "POST");
          if (!pause.current) await refreshJobs();
          if (result.status !== "COMPLETED")
            throw new Error(
              result.error ||
                "El trabajo necesita revisión antes de continuar.",
            );
        }
      } finally {
        setProcessing(false);
        if (!pause.current) await refreshJobs();
      }
    }, "Procesamiento finalizado. Los trabajos sin iniciar permanecen en cola.");
  };
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const r = await api<Job[]>("jobs");
        if (!stopped) setJobs(r);
      } catch {}
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  const done = jobs.filter((j) => j.status === "COMPLETED").length;
  return (
    <>
      <div className="heading">
        <div>
          <div className="eyebrow">Producción en servidor</div>
          <h1>Generaciones</h1>
          <p className="muted">
            Procesa trabajos ya autorizados en segundo plano o utiliza el modo
            interactivo manteniendo esta pantalla abierta.
          </p>
        </div>
      </div>
      <BackgroundBatches
        pending={jobs.filter((j) => j.status === "PENDING").map((j) => j.id)}
        refreshJobs={refreshJobs}
      />
      <div className="row" style={{ marginBottom: 20 }}>
        <button
          className="primary"
          disabled={t.busy || !jobs.some((j) => j.status === "PENDING")}
          onClick={processPending}
        >
          Procesar pendientes en esta pantalla
        </button>
        {processing && (
          <button
            onClick={() => {
              pause.current = true;
            }}
          >
            Pausar después del actual
          </button>
        )}
        <button disabled={t.busy} onClick={() => void t.run(refreshJobs, "")}>
          Actualizar estado
        </button>
      </div>
      <div className="metrics">
        <div>
          <strong>{jobs.length}</strong>
          <span>Trabajos recientes</span>
        </div>
        <div>
          <strong>{done}</strong>
          <span>Completados</span>
        </div>
        <div>
          <strong>
            {
              jobs.filter(
                (j) => j.status === "PENDING" || j.status === "RUNNING",
              ).length
            }
          </strong>
          <span>En proceso</span>
        </div>
      </div>
      <div className="grid">
        {jobs.map((j) => (
          <article className="card gallery" key={j.id}>
            {j.variation && !j.variation.expired ? (
              <img
                src={"/api/variations/" + j.variation.id}
                alt="Afiche generado"
              />
            ) : (
              <div className="empty">
                {j.status === "PENDING"
                  ? "En cola · pendiente de procesar"
                  : j.status === "RUNNING"
                    ? "Generando…"
                    : j.status === "COMPLETED"
                      ? "Archivo caducado"
                      : "Sin resultado disponible"}
              </div>
            )}
            <div className="row spread" style={{ marginTop: 12 }}>
              <span className="badge">{statusLabel(j.status)}</span>
              <small>
                {new Date(j.createdAt).toLocaleString("es-PE", {
                  timeZone: "America/Lima",
                })}
              </small>
            </div>
            {j.status === "PENDING" && (
              <button
                disabled={t.busy}
                onClick={() =>
                  void t.run(
                    () => api("jobs/" + j.id + "/cancel", "POST"),
                    "Trabajo cancelado y reserva liberada.",
                  )
                }
              >
                Cancelar pendiente
              </button>
            )}
            {["FAILED", "UNCERTAIN", "CANCELLED"].includes(j.status) && (
              <button
                disabled={t.busy}
                onClick={() => {
                  if (
                    confirm(
                      j.status === "UNCERTAIN"
                        ? "La solicitud anterior pudo producir un cargo. ¿Autorizas otro intento con posible cargo adicional?"
                        : "¿Autorizas un nuevo intento con posible cargo de API?",
                    )
                  )
                    void t.run(
                      () =>
                        api("jobs/" + j.id + "/retry", "POST", {
                          requestId: crypto.randomUUID(),
                          confirmCharge: true,
                          confirmUncertain: j.status === "UNCERTAIN",
                        }),
                      "Nuevo intento encolado.",
                    );
                }}
              >
                Reintentar con autorización
              </button>
            )}
            {j.error && <p className="notice error">{j.error}</p>}
            {j.variation && !j.variation.expired && (
              <a href={"/api/variations/" + j.variation.id + "?download"}>
                Descargar PNG →
              </a>
            )}
          </article>
        ))}
      </div>
      {!jobs.length && (
        <div className="empty">
          Todavía no hay trabajos. Puedes iniciar una prueba desde la
          configuración de IA.
        </div>
      )}
      {t.notice}
    </>
  );
}
const statusLabel = (s: string) =>
  ({
    PENDING: "Pendiente",
    RUNNING: "Procesando",
    COMPLETED: "Completada",
    FAILED: "Fallida",
    UNCERTAIN: "Resultado incierto",
    CANCELLED: "Cancelada",
  })[s] ?? s;
function Gallery({ sub, back }: { sub: Item; back: () => void }) {
  const roleCanEdit = useCanEdit();
  const canEdit = roleCanEdit && sub.canEdit !== false;
  const [selected, setSelected] = useState<string[]>([]);
  const [downloadFormat, setDownloadFormat] = useState("png");
  const [editing, setEditing] = useState<string | null>(null);
  const [variations, setVariations] = useState<any[]>([]);
  const t = useTask();
  const refresh = useCallback(async () => {
    const r = await api("subproducts/" + sub.id);
    setVariations(
      r.variations.map((v: any) => ({
        ...v,
        expired:
          v.expired ||
          (!v.permanent && new Date(v.expiresAt).getTime() <= Date.now()),
      })),
    );
  }, [sub.id]);
  useEffect(() => {
    void t.run(refresh, "");
  }, [refresh]);
  return (
    <>
      <h1>{sub.name}</h1>
      <p className="muted">
        Variaciones independientes · originales temporales durante 48 horas.
      </p>
      <div className="notice">
        {canEdit
          ? "Abre Ajustar para mover textos y logos cuando existan capas independientes. La edición con IA y la regeneración requieren autorización de cargo y conservan el original."
          : "Este espacio tiene acceso de consulta. Puedes ver y descargar sus afiches; la edición y la generación no están habilitadas para tu acceso actual."}
      </div>
      {editing && (
        <VariationEditor
          key={editing}
          id={editing}
          onClose={() => {
            setEditing(null);
            void t.run(refresh, "");
          }}
        />
      )}
      <div className="row" style={{ marginBottom: 20 }}>
        <label>
          Formato del ZIP
          <select
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value)}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <button
          disabled={t.busy || !variations.some((v) => !v.expired)}
          onClick={() =>
            void t.run(
              () =>
                downloadArchive({
                  scope: "subproduct",
                  id: sub.id,
                  format: downloadFormat,
                }),
              "Descarga preparada",
            )
          }
        >
          Descargar todo el subproducto
        </button>
        <button
          onClick={() =>
            setSelected(variations.filter((v) => !v.expired).map((v) => v.id))
          }
        >
          Seleccionar todas
        </button>
        <button
          disabled={!selected.length || t.busy}
          onClick={() =>
            void t.run(async () => {
              await downloadArchive({ ids: selected, format: downloadFormat });
            }, "Descarga preparada")
          }
        >
          Descargar ZIP ({selected.length})
        </button>
        <button
          hidden={!canEdit}
          disabled={!selected.length || t.busy}
          onClick={() => {
            const instruction = prompt(
              "Instrucciones para las alternativas (opcional)",
            );
            if (instruction === null) return;
            if (
              confirm(
                `¿Autorizas regenerar ${selected.length} afiches con posible cargo de API? Se conservarán los originales.`,
              )
            )
              void t.run(
                () =>
                  api("variations/bulk-regenerate", "POST", {
                    ids: selected,
                    prompt: instruction,
                    requestId: crypto.randomUUID(),
                    confirmCharge: true,
                    reviewedInstructions: true,
                  }),
                "Alternativas encoladas. Consulta Generaciones.",
              );
          }}
        >
          Regenerar seleccionadas
        </button>
        <button
          hidden={!canEdit}
          disabled={!selected.length || t.busy}
          onClick={() =>
            void t.run(async () => {
              for (const id of selected)
                await api("library/items/" + id, "POST", { permanent: true });
              await refresh();
            }, "Afiches guardados en tu biblioteca.")
          }
        >
          Guardar seleccionadas
        </button>
        <button
          hidden={!canEdit}
          disabled={!selected.length || t.busy}
          onClick={() => {
            if (confirm("¿Enviar los afiches seleccionados a la papelera?"))
              void t.run(async () => {
                for (const id of selected)
                  await api("variations/" + id, "DELETE");
                setSelected([]);
                await refresh();
              });
          }}
        >
          Eliminar seleccionadas
        </button>
      </div>
      <div className="grid">
        {variations.map((v, i) => (
          <article className="card gallery" key={v.id}>
            {v.expired ? (
              <div className="empty">Archivo caducado</div>
            ) : (
              <img
                src={"/api/variations/" + v.id}
                alt={`${sub.name}, variación ${i + 1}`}
              />
            )}
            <label className="row" style={{ marginTop: 15 }}>
              <input
                type="checkbox"
                disabled={v.expired}
                checked={selected.includes(v.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, v.id]
                      : selected.filter((x) => x !== v.id),
                  )
                }
              />
              Variación {i + 1}
            </label>
            <small>
              {v.model} · {v.permanent ? "En biblioteca" : "Temporal"}
            </small>
            {!v.expired && (
              <div className="row" style={{ marginTop: 15 }}>
                <button hidden={!canEdit} onClick={() => setEditing(v.id)}>
                  Ajustar / Editar con IA
                </button>
                <details hidden={!canEdit}>
                  <summary>Adjuntos para editar esta variación</summary>
                  <Uploads scope="variation" id={v.id} />
                </details>
                <label hidden={!canEdit}>
                  Revisión
                  <select
                    value={v.reviewStatus ?? "PENDING"}
                    onChange={(e) =>
                      void t.run(async () => {
                        await api("variations/" + v.id, "PATCH", {
                          reviewStatus: e.target.value,
                        });
                        await refresh();
                      })
                    }
                  >
                    <option value="PENDING">Sin revisar</option>
                    <option value="APPROVED">Aprobado</option>
                    <option value="REJECTED">Rechazado</option>
                  </select>
                </label>
                <button
                  onClick={() =>
                    void t.run(async () => {
                      await api("variations/" + v.id + "/duplicate", "POST");
                      await refresh();
                    }, "Copia creada sin IA.")
                  }
                >
                  Duplicar
                </button>
                <button
                  hidden={!canEdit}
                  className="danger"
                  onClick={() => {
                    if (confirm("¿Enviar este afiche a la papelera?"))
                      void t.run(async () => {
                        await api("variations/" + v.id, "DELETE");
                        await refresh();
                      });
                  }}
                >
                  Eliminar
                </button>
                <a href={"/api/variations/" + v.id + "?download"}>
                  Descargar PNG
                </a>
                <a href={"/api/variations/" + v.id + "?download&format=jpg"}>
                  JPG
                </a>
                <button
                  hidden={!canEdit}
                  onClick={() =>
                    void t.run(async () => {
                      await api("library/items/" + v.id, "POST", {
                        permanent: !v.permanent,
                      });
                      await refresh();
                    })
                  }
                >
                  {v.permanent ? "Volver a temporal" : "Conservar"}
                </button>
                <button
                  hidden={!canEdit}
                  onClick={() =>
                    void t.run(async () => {
                      await api("variations/" + v.id, "PATCH", {
                        favorite: !v.favorite,
                      });
                      await refresh();
                    })
                  }
                >
                  {v.favorite ? "★" : "☆"}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!variations.length && (
        <div className="empty">
          {canEdit
            ? "Este subproducto todavía no tiene afiches. Revisa las instrucciones e inicia una generación."
            : "Este subproducto todavía no tiene afiches disponibles para consultar o descargar."}
        </div>
      )}
      {t.notice}
    </>
  );
}

function History() {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const t = useTask();
  useEffect(() => {
    void t.run(async () => setRows(await api("audit")), "");
  }, []);
  return (
    <>
      <h1>Historial</h1>
      <p className="muted">
        Registro persistente de operaciones. Las claves API nunca se incluyen.
      </p>
      <input
        aria-label="Filtrar historial"
        placeholder="Buscar operación o recurso…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ maxWidth: 400, marginBottom: 20 }}
      />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha · Lima</th>
              <th>Operación</th>
              <th>Recurso</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) =>
                JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
              )
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Date(r.createdAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}
                  </td>
                  <td>{r.action.replaceAll("_", " ")}</td>
                  <td>{r.resourceId ?? "—"}</td>
                  <td>{r.actorId}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {t.notice}
    </>
  );
}
function Usage() {
  const [rows, setRows] = useState<any[]>([]);
  const t = useTask();
  useEffect(() => {
    void t.run(async () => setRows(await api("usage")), "");
  }, []);
  const reserve = rows
    .filter((r) => r.status !== "RELEASED")
    .reduce((a, b) => a + Number(b.reservedMicros) / 1000000, 0);
  return (
    <>
      <h1>Consumo de IA</h1>
      <p className="muted">
        Reservas locales y datos de uso recibidos. Los importes reales no
        informados permanecen desconocidos.
      </p>
      <div className="metrics">
        <div>
          <strong>USD {reserve.toFixed(4)}</strong>
          <span>Reservas de las últimas {rows.length} operaciones</span>
        </div>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Modelo</th>
              <th>Estado</th>
              <th>Reserva USD</th>
              <th>Costo real USD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {new Date(r.createdAt).toLocaleDateString("es-PE", {
                    timeZone: "America/Lima",
                  })}
                </td>
                <td>{r.model}</td>
                <td>{r.status}</td>
                <td>{(Number(r.reservedMicros) / 1000000).toFixed(4)}</td>
                <td>
                  {r.actualMicros === null
                    ? "No informado"
                    : (Number(r.actualMicros) / 1000000).toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.notice}
    </>
  );
}
