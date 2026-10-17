"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { ProviderConnections } from "./components/provider-connections";
import { SearchSelect } from "./components/search-select";
import { CurrentRole, RoleGuide, useCanEdit } from "./components/role-guide";
import { roleLabels, managesUsers } from "../lib/roles";
import { HierarchyBreadcrumbs } from "./components/breadcrumbs";
import { Attachments } from "./components/attachments";
import { UsersPanel } from "./components/users-panel";
import { HistoryPanel } from "./components/history";
import { MailSettings } from "./components/mail-settings";
import { VisualAuditPanel, VisualAuditNotice } from "./components/visual-audit";
import { VariationEditor } from "./components/variation-editor";
import { ProjectSharing } from "./components/project-sharing";
import { UsagePanel } from "./components/usage-panel";
import { JobsPanel } from "./components/jobs-panel";
import { BrandKit } from "./components/brand-kit";
import {
  OwnerEmergencyKit,
  EmergencyOwnerForm,
} from "./components/owner-emergency";
import { clearGallerySession } from "./components/gallery-session";
import { SubproductTrash } from "./components/subproduct-trash";
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
          ...(user.role === "OWNER"
            ? ["ai", "mail", "statistics", "visual-audit"]
            : []),
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
    mail: "Configuración → Correo",
    "visual-audit": "Auditoría visual y conservación",
    history: "Historial",
    users: "Usuarios",
    usage: "Costos de IA",
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
              ["usage", "↗", "Costos de IA"],
              ["account", "♙", "Mi cuenta"],
              ...(managesUsers(user.role) ? [["users", "♙", "Usuarios"]] : []),
              ...(user.role === "OWNER"
                ? [
                    ["statistics", "▥", "Estadísticas"],
                    ["ai", "⚙", "Configuración de IA"],
                    ["mail", "✉", "Configuración de correo"],
                    ["visual-audit", "▧", "Auditoría visual"],
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
              onClick={() =>
                void api("auth/logout", "POST").then(() => {
                  clearGallerySession();
                  return reloadUser();
                })
              }
            >
              Cerrar sesión
            </button>
          </footer>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="muted">{titles[view]}</span>
            <span className="badge">Producción publicitaria</span>
            <button
              type="button"
              className="mobile-signout"
              onClick={() =>
                void api("auth/logout", "POST").then(() => {
                  clearGallerySession();
                  return reloadUser();
                })
              }
            >
              Cerrar sesión
            </button>
          </header>
          <main>
            <RoleGuide name={user.name} role={user.role} />
            <VisualAuditNotice key={user.id} />
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
                key={`${user.id}:${collection.scope}:${collection.id}`}
                userId={user.id}
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
                {user.role === "OWNER" && (
                  <>
                    <OwnerEmergencyKit email={user.email} />
                    <StorageUsage />
                  </>
                )}
              </>
            ) : view === "library" ? (
              <Library />
            ) : view === "presets" ? (
              <Presets />
            ) : view === "ai" ? (
              <AISettings />
            ) : view === "mail" && user.role === "OWNER" ? (
              <MailSettings />
            ) : view === "visual-audit" && user.role === "OWNER" ? (
              <VisualAuditPanel />
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
  const [emergency, setEmergency] = useState(false);
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
        {emergency ? (
          <EmergencyOwnerForm onBack={() => setEmergency(false)} />
        ) : (
          <>
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
                  <input
                    name="name"
                    required
                    autoComplete="name"
                    maxLength={100}
                  />
                </label>
              )}
              <label>
                Correo electrónico
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                />
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
                  <input
                    name="token"
                    type="password"
                    required
                    autoComplete="off"
                  />
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
                {mode === "login"
                  ? "Solicitar una cuenta"
                  : "Volver al ingreso"}
              </button>
            )}
            {!setup && mode === "login" && (
              <p className="muted">
                ¿Olvidaste tu contraseña? Solicita al OWNER o a un Administrador
                autorizado un enlace temporal de recuperación y ábrelo para
                elegir una nueva contraseña.
              </p>
            )}
            {!setup && mode === "login" && (
              <button type="button" onClick={() => setEmergency(true)}>
                Recuperar OWNER con código de emergencia
              </button>
            )}
            {t.notice}
          </>
        )}
      </section>
    </div>
  );
}
function Uploads({ scope, id }: { scope: string; id: string }) {
  return <Attachments scope={scope} id={id} />;
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
      {c.canEdit && <SubproductTrash categoryId={c.id} onRestored={refresh} />}
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
            costScope={{
              project: c.project.id,
              product: c.id,
              subproduct: sub.id,
            }}
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
  costScope,
  index,
  inherited,
  forceOwn,
  openGallery,
  removed,
}: {
  sub: Item;
  costScope: { project: string; product: string; subproduct: string };
  index: number;
  inherited: Settings;
  forceOwn: boolean;
  openGallery: () => void;
  removed: () => Promise<void>;
}) {
  const canSeeCosts = useCanEdit();
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
          {canSeeCosts && (
            <a
              className="button"
              href={"?" + new URLSearchParams({ view: "usage", ...costScope })}
            >
              Ver costos de este subproducto →
            </a>
          )}
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
  const [latestTest, setLatestTest] = useState<any>(null);
  const [testBudget, setTestBudget] = useState<any>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [liveError, setLiveError] = useState("");
  const [now, setNow] = useState(Date.now());
  const editing = useRef(false);
  const providerSequence = useRef(0),
    creativeSequence = useRef(0);
  const [key, setKey] = useState("");
  const [alternativeQuery, setAlternativeQuery] = useState("");
  const configurationRef = useRef<any>(null);
  configurationRef.current = c;
  const [available, setAvailable] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [charge, setCharge] = useState(false);
  const [dirty, setDirty] = useState(false);
  const t = useTask();
  const refresh = useCallback(async () => {
    const r = await api("ai/config");
    setC(r.configuration);
    setLatestTest(r.latestTest);
    setTestBudget(r.testBudget);
    setCheckedAt(new Date().toISOString());
    setLiveError("");
    editing.current = false;
    setDirty(false);
    setCharge(false);
    setAvailable(r.providers);
  }, []);
  useEffect(() => {
    void t.run(refresh, "");
  }, [refresh]);
  useEffect(() => {
    let active = true,
      fetching = false;
    const poll = async () => {
      if (fetching || document.visibilityState !== "visible") return;
      fetching = true;
      try {
        const r = await api("ai/config?meta=1");
        const previous = configurationRef.current;
        const catalogChanged =
          !previous ||
          ["provider", "revision", "verifiedAt", "creativeVerifiedAt"].some(
            (field) => previous[field] !== r.configuration[field],
          );
        if (!editing.current && catalogChanged)
          r.configuration = (await api("ai/config")).configuration;
        if (active) {
          setLatestTest(r.latestTest);
          setTestBudget(r.testBudget);
          setCheckedAt(new Date().toISOString());
          setLiveError("");
          if (!editing.current)
            setC((old: any) => ({ ...old, ...r.configuration }));
        }
      } catch {
        if (active)
          setLiveError(
            "No se pudo actualizar el estado. La información mostrada puede estar desactualizada.",
          );
      } finally {
        fetching = false;
      }
    };
    const timer = setInterval(() => void poll(), 10000);
    const clock = setInterval(() => setNow(Date.now()), 10000);
    const focus = () => void poll();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", focus);
    };
  }, []);
  if (!c) return <p>Cargando configuración segura…{t.notice}</p>;
  const update = (k: string, v: unknown) => {
    setC({ ...c, [k]: v });
    editing.current = true;
    setDirty(true);
    setCharge(false);
  };
  const changeImageProvider = async (provider: string) => {
    const sequence = ++providerSequence.current;
    editing.current = true;
    setDirty(true);
    setCharge(false);
    setKey("");
    setC((old: any) => ({
      ...old,
      provider,
      models: [],
      imageModel: null,
      alternatives: [],
      maskedKey: null,
      status: "UNVERIFIED",
      quality: "default",
      resolution: "default",
      creativeProvider: old.creativeProvider ?? old.provider,
    }));
    try {
      const profile = await api(
        "ai/connections?provider=" + encodeURIComponent(provider),
      );
      if (sequence === providerSequence.current)
        setC((old: any) =>
          old.provider === provider
            ? { ...old, models: profile.models, maskedKey: profile.maskedKey }
            : old,
        );
    } catch (e) {
      if (sequence === providerSequence.current)
        setLiveError(
          e instanceof Error ? e.message : "No se pudo consultar la conexión.",
        );
    }
  };
  const changeCreativeProvider = async (provider: string) => {
    const sequence = ++creativeSequence.current;
    editing.current = true;
    setDirty(true);
    setCharge(false);
    setC((old: any) => ({
      ...old,
      creativeProvider: provider,
      creativeModel: null,
      creativeModels: [],
      creativeStatus: "NOT_CONFIGURED",
    }));
    try {
      const profile = await api(
        "ai/connections?provider=" + encodeURIComponent(provider),
      );
      if (sequence === creativeSequence.current)
        setC((old: any) =>
          old.creativeProvider === provider
            ? {
                ...old,
                creativeModels: profile.models.filter(
                  (m: any) => m.kind === "creative",
                ),
                creativeStatus: profile.status,
              }
            : old,
        );
    } catch (e) {
      if (sequence === creativeSequence.current)
        setLiveError(
          e instanceof Error
            ? e.message
            : "No se pudo consultar la conexión creativa.",
        );
    }
  };
  const selectImage = (id: string) => {
    const model = c.models.find((m: any) => m.kind === "image" && m.id === id);
    setC({
      ...c,
      imageModel: id,
      ...(model
        ? {
            quality: model.qualities.includes(c.quality)
              ? c.quality
              : model.qualities[0],
            resolution: model.resolutions.includes(c.resolution)
              ? c.resolution
              : model.resolutions[0],
          }
        : {}),
    });
    editing.current = true;
    setDirty(true);
    setCharge(false);
  };
  const creativeModels =
    c.creativeModels ?? c.models.filter((m: any) => m.kind === "creative");
  const modelOptions = (models: any[]) =>
    models.map((m: any) => ({
      id: m.id,
      label: m.label ?? m.id,
      detail: m.id,
      group: /flux/i.test(m.id)
        ? "FLUX"
        : /image|nano-banana/i.test(m.id) && /gemini|banana/i.test(m.id)
          ? "Nano Banana"
          : /imagen/i.test(m.id)
            ? "Imagen"
            : "Otros modelos",
      search: m.id,
    }));
  const image = c.models.find(
    (m: any) => m.id === c.imageModel && m.kind === "image",
  );

  const verified =
    c.status === "VERIFIED" &&
    c.verifiedRevision === c.revision &&
    c.verifiedAt &&
    now - new Date(c.verifiedAt).getTime() < 86400000;
  const reserve = Number(c.imageReserveMicros);
  const checks = [
    { label: "Clave guardada en el servidor", ok: !!c.maskedKey },
    { label: "Cambios guardados", ok: !dirty && !key },
    {
      label: "Consulta de modelos verificada durante las últimas 24 horas",
      ok: !!verified,
    },
    {
      label: "Modelos de imagen y dirección creativa compatibles seleccionados",
      ok:
        !!image &&
        image.kind === "image" &&
        creativeModels.some((m: any) => m.id === c.creativeModel) &&
        (c.creativeStatus === "VERIFIED" || (!c.creativeProvider && verified)),
    },
    {
      label: "Calidad y resolución compatibles",
      ok:
        !!image?.qualities.includes(c.quality) &&
        !!image?.resolutions.includes(c.resolution),
    },
    {
      label: "Reserva por afiche mayor que cero y límites suficientes",
      ok:
        reserve > 0 &&
        [
          c.monthlyLimitMicros,
          c.dailyLimitMicros,
          c.operationLimitMicros,
        ].every((v: string) => Number(v) >= reserve),
    },
  ];
  checks.push({
    label:
      "Presupuesto disponible para una prueba, incluidos tus límites particulares y reservas anteriores",
    ok:
      !!testBudget?.allowed &&
      testBudget.revision === c.revision &&
      !dirty &&
      !key,
  });
  const ready = checks.every((check) => check.ok) && !liveError;
  const save = async () => {
    await api("ai/config", "PUT", {
      provider: c.provider,
      ...(key ? { apiKey: key } : {}),
      imageModel: c.imageModel ?? null,
      creativeModel: c.creativeModel ?? null,
      creativeProvider: c.creativeProvider ?? c.provider,
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
    VERIFIED: "Consulta de modelos verificada",
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
      <section className="panel stack" aria-label="Estado de preparación de IA">
        <h2>Antes de generar</h2>
        <p className="hint">
          Este resumen comprueba la configuración guardada. El estado se
          actualiza cada 10 segundos y al volver a la ventana; no consulta saldo
          ni genera imágenes automáticamente. Una consulta de modelos exitosa no
          acredita que la cuenta pueda generar.
        </p>
        {checkedAt && (
          <p className="hint">
            Estado consultado:{" "}
            {new Date(checkedAt).toLocaleString("es-PE", {
              timeZone: "America/Lima",
            })}{" "}
            · Lima.
          </p>
        )}
        {testBudget && !testBudget.allowed && (
          <p className="notice error">
            {testBudget.error} Esta comprobación no crea reservas ni consulta
            saldo del proveedor. Los cargos inciertos siguen ocupando su reserva
            local.
          </p>
        )}
        {liveError && (
          <p className="notice error" role="alert">
            {liveError}
          </p>
        )}
        <div className="notice">
          <strong>Última prueba real: </strong>
          {!latestTest
            ? "Todavía no realizada."
            : ((
                {
                  PENDING: "Pendiente de procesar.",
                  RUNNING: "En proceso.",
                  COMPLETED: "Imagen generada y guardada.",
                  FAILED: "No completada.",
                  CANCELLED: "Cancelada.",
                  UNCERTAIN:
                    "Resultado incierto; no hay una imagen confirmada para esta prueba.",
                } as Record<string, string>
              )[latestTest.status] ?? "Sin resultado confirmado.")}
          {latestTest?.error && <p>{latestTest.error}</p>}
          {latestTest && (
            <p className="hint">
              Proveedor: {latestTest.provider}
              {latestTest.model ? ` · Modelo: ${latestTest.model}` : ""}. Una
              prueba anterior no verifica cambios de proveedor o configuración.
              Prueba creada:{" "}
              {new Date(latestTest.createdAt).toLocaleString("es-PE", {
                timeZone: "America/Lima",
              })}
              . El consumo registrado se consulta en Consumo de IA.
            </p>
          )}
        </div>

        <ul>
          {checks.map((check) => (
            <li key={check.label}>
              <strong>{check.ok ? "Completo" : "Pendiente"}:</strong>{" "}
              {check.label}
            </li>
          ))}
        </ul>
        <p className="hint">
          {ready
            ? "Configuración preparada para solicitar una prueba. Todavía no demuestra que una imagen se genere correctamente ni confirma saldo."
            : "Completa los pasos pendientes. Después de guardar modelos o límites, vuelve a verificar la conexión."}
        </p>
        {(dirty || key) && (
          <div className="notice">
            Hay cambios sin guardar. Guarda la configuración y después verifica
            la conexión. La prueba usará únicamente los valores guardados.
          </div>
        )}
      </section>
      <ProviderConnections
        providers={available}
        changed={async () => {
          if (!editing.current) await refresh();
          else
            setLiveError(
              "Cambió una conexión. Se conservaron tus campos sin guardar; revisa, guarda y verifica la configuración antes de generar.",
            );
        }}
      />
      <section className="panel stack">
        <h2>01　Proveedor de imágenes y credenciales</h2>
        <div className="fields">
          <label>
            Proveedor
            <select
              value={c.provider}
              onChange={(e) => void changeImageProvider(e.target.value)}
            >
              {available.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Selecciona la empresa que emitió tu clave de API. Una suscripción
              de chat no sustituye la facturación de su API.
            </span>
          </label>
          <label>
            {c.maskedKey ? "Reemplazar clave API" : "Clave API"}
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setCharge(false);
              }}
              placeholder={c.maskedKey ?? "Introduce tu clave API"}
              autoComplete="off"
              spellCheck={false}
              maxLength={1000}
            />
            <span className="hint">
              Pega la clave secreta creada en la cuenta del proveedor. Déjalo
              vacío para conservar la clave guardada. Nunca la compartas por
              chat.
            </span>
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
            disabled={t.busy || dirty || !!key || !c.maskedKey}
            onClick={() =>
              void t.run(async () => {
                try {
                  await api("ai/verify", "POST");
                } finally {
                  await refresh();
                }
              }, "El proveedor respondió a la consulta de modelos. La generación todavía requiere su propia prueba.")
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
            <p className="hint">
              Estos modelos proceden de la última consulta al proveedor y del
              filtro de compatibilidad de la aplicación.{" "}
              {verified
                ? "La consulta está vigente."
                : "La configuración necesita una nueva verificación antes de generar."}{" "}
              Consultar modelos no confirma saldo ni generación.
            </p>
            <div className="fields">
              <div>
                <SearchSelect
                  browseOnToggle
                  label="Modelo de imágenes"
                  value={c.imageModel ?? ""}
                  onChange={(id) => selectImage(id)}
                  onSelect={(option) => selectImage(option.id)}
                  options={modelOptions(
                    c.models.filter((m: any) => m.kind === "image"),
                  )}
                />
                <p className="hint">
                  Busca por nombre, Nano Banana, FLUX o identificador. Solo
                  modelos consultados y compatibles.
                </p>
              </div>
              <label>
                Proveedor de dirección creativa
                <select
                  value={c.creativeProvider ?? c.provider}
                  onChange={(e) => void changeCreativeProvider(e.target.value)}
                >
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Google u OpenAI pueden preparar las instrucciones aunque las
                  imágenes se generen en fal.ai o Replicate. Conecta y verifica
                  esa cuenta primero.
                </span>
              </label>
              <div>
                <SearchSelect
                  browseOnToggle
                  label="Modelo de dirección creativa"
                  value={c.creativeModel ?? ""}
                  onChange={(id) => update("creativeModel", id)}
                  onSelect={(option) => update("creativeModel", option.id)}
                  options={modelOptions(creativeModels)}
                />
                <p className="hint">
                  Es un modelo de texto y también puede consumir API. Estado:{" "}
                  {state[c.creativeStatus] ??
                    c.creativeStatus ??
                    "Sin verificar"}
                  .
                </p>
              </div>
              <label>
                Calidad
                <select
                  value={c.quality}
                  onChange={(e) => update("quality", e.target.value)}
                >
                  {(image?.qualities ?? ["low"]).map((x: string) => (
                    <option key={x} value={x}>
                      {x === "default" ? "Automática del proveedor" : x}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Opciones admitidas por el modelo consultado. Automática usa
                  los valores nativos del proveedor; cambiar la calidad puede
                  cambiar el costo.
                </span>
              </label>
              <label>
                Resolución
                <select
                  value={c.resolution}
                  onChange={(e) => update("resolution", e.target.value)}
                >
                  {(image?.resolutions ?? ["1024x1024"]).map((x: string) => (
                    <option key={x} value={x}>
                      {x === "default" ? "Automática del proveedor" : x}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Tamaño o formato nativo admitido por la API (píxeles, relación
                  de aspecto o escala). Después se adapta al afiche.
                </span>
              </label>
            </div>
            <details className="stack">
              <summary>
                Modelos alternativos · {c.alternatives.length} de 5
              </summary>
              <SearchSelect
                browseOnToggle
                label="Agregar modelo alternativo"
                value={alternativeQuery}
                onChange={setAlternativeQuery}
                disabled={c.alternatives.length >= 5}
                options={modelOptions(
                  c.models.filter(
                    (m: any) =>
                      m.kind === "image" &&
                      m.id !== c.imageModel &&
                      !c.alternatives.includes(m.id),
                  ),
                )}
                onSelect={(option) => {
                  if (c.alternatives.length < 5)
                    update("alternatives", [...c.alternatives, option.id]);
                  setAlternativeQuery("");
                }}
              />
              {c.alternatives.map((id: string) => (
                <div className="row" key={id}>
                  <span>
                    {c.models.find((m: any) => m.id === id)?.label ?? id}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        "alternatives",
                        c.alternatives.filter((model: string) => model !== id),
                      )
                    }
                  >
                    Quitar alternativa
                  </button>
                </div>
              ))}
              <p className="hint">
                Hasta cinco modelos consultados. Seleccionarlos no genera
                imágenes ni autoriza reintentos automáticos.
              </p>
            </details>
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
              <span className="hint">
                {
                  (
                    {
                      monthlyLimitMicros:
                        "Máximo de reservas de todos los usuarios en el mes, en USD. Cero bloquea nuevas generaciones.",
                      dailyLimitMicros:
                        "Máximo de reservas de todos los usuarios en el día, en USD. Cero bloquea.",
                      operationLimitMicros:
                        "Máximo para un lote o solicitud: cantidad de afiches × reserva por afiche. Debe permitir al menos un afiche.",
                      imageReserveMicros:
                        "Importe que apartará la aplicación por cada afiche, incluida dirección creativa. Lo defines tú: no es una tarifa confirmada de OpenAI ni añade saldo.",
                    } as Record<string, string>
                  )[k]
                }
              </span>
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
            <span className="hint">
              Tope de cantidad por solicitud. También se aplican los
              presupuestos; para probar basta con un afiche.
            </span>
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
          presupuestos y el registro de consumo. El botón inicia una sola prueba
          aquí; mantén esta pantalla abierta hasta conocer el resultado. Si se
          interrumpe, consulta Generaciones antes de volver a autorizar otra. No
          se reintenta automáticamente.
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
          disabled={!charge || t.busy || !ready}
          onClick={() =>
            void t.run(async () => {
              try {
                const queued = await api("ai/test", "POST", {
                  confirmCharge: true,
                  requestId: crypto.randomUUID(),
                });
                const result = await api(
                  `jobs/${queued.jobs[0]}/process`,
                  "POST",
                );
                if (result.status !== "COMPLETED")
                  throw new Error(
                    result.error ??
                      "La prueba no terminó. Consulta Generaciones antes de autorizar otra.",
                  );
              } finally {
                setCharge(false);
                await refresh();
              }
            }, "Prueba generada y guardada. Puedes descargarla desde Generaciones.")
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
  return <JobsPanel />;
}
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
  return <HistoryPanel />;
}

function Usage() {
  return <UsagePanel />;
}
