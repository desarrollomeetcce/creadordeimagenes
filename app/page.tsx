"use client";
import dynamic from "next/dynamic";
const ProductsCatalog=dynamic(()=>import("./components/products-catalog").then(m=>m.ProductsCatalog),{loading:()=> <p role="status">Cargando listado de bienes…</p>});
const MetaAds=dynamic(()=>import("./components/meta-ads").then(m=>m.MetaAds),{loading:()=> <p role="status">Cargando Meta Ads…</p>});
import { reasoningLevel } from "../lib/creative-level";
import {useGenerationChoices} from "./components/generation-choices";
import { CreativeFinish } from "./components/creative-finish";
import { PasswordInput } from "./components/password-input";
import { useCallback, useEffect, useState, useRef } from "react";
import {useSubproductStatuses,SubproductStatus,SubproductCounters} from "./components/subproduct-status";
import {DateRange} from "./components/date-range";
import type {SubproductStatistics} from "../lib/subproduct-statistics-types";
import type {OrderProgress} from "./components/order-progress";
import { ReviewInstructions, type ReviewInstructionsHandle } from "./components/review-instructions";
import { ProductTrash } from "./components/product-trash";
import { InstructionPolicyControls } from "./components/instruction-policy-controls";
import { useReusableConfiguration } from "./components/reusable-configuration";
import type { InstructionPolicy } from "../lib/instruction-policy";
import { SidebarAccount } from "./components/sidebar-account";
const SiteEditor = dynamic(() => import("./components/site-editor").then(m => m.SiteEditor), { loading: () => <p role="status">Cargando…</p> });
const PaymentSettings = dynamic(() => import("./components/payment-settings").then(m => m.PaymentSettings), { loading: () => <p role="status">Cargando…</p> });
const PlanSettings = dynamic(() => import("./components/membership-plans").then(m => m.PlanSettings), { loading: () => <p role="status">Cargando…</p> });
const MyPlan = dynamic(() => import("./components/membership-plans").then(m => m.MyPlan), { loading: () => <p role="status">Cargando…</p> });
const ProviderConnections = dynamic(() => import("./components/provider-connections").then(m => m.ProviderConnections), { loading: () => <p role="status">Cargando…</p> });
import { folderScope } from "./components/folder-navigation";
import { emptyHierarchy } from "./components/hierarchy-filters";
import { InstructionEditor } from "./components/instruction-editor";
import { SearchSelect } from "./components/search-select";
import { CurrentRole, CurrentUserId, RoleGuide, useCanEdit } from "./components/role-guide";
import { roleLabels, managesUsers } from "../lib/roles";
import { HierarchyBreadcrumbs } from "./components/breadcrumbs";
import { Attachments, type AttachmentsHandle } from "./components/attachments";
const UsersPanel = dynamic(() => import("./components/users-panel").then(m => m.UsersPanel), { loading: () => <p role="status">Cargando…</p> });
const HistoryPanel = dynamic(() => import("./components/history").then(m => m.HistoryPanel), { loading: () => <p role="status">Cargando…</p> });
const MailSettings = dynamic(() => import("./components/mail-settings").then(m => m.MailSettings), { loading: () => <p role="status">Cargando…</p> });
import { VisualAuditNotice } from "./components/visual-audit-notice";
const VisualAuditPanel = dynamic(() => import("./components/visual-audit").then(m => m.VisualAuditPanel));
const VariationEditor = dynamic(() => import("./components/variation-editor").then(m => m.VariationEditor), { loading: () => <p role="status">Cargando…</p> });
import { ProjectSharing } from "./components/project-sharing";
const UsagePanel = dynamic(() => import("./components/usage-panel").then(m => m.UsagePanel), { loading: () => <p role="status">Cargando…</p> });
const LibraryWorkspace = dynamic(() => import("./components/library-workspace").then(m => m.LibraryWorkspace), { loading: () => <p role="status">Cargando…</p> });
import {
  ExecutionChoice,
  ProductionControls,
  useProductionController,
  type ExecutionMode,
} from "./components/production-controls";
import { QuickStart } from "./components/quick-start";
import { BrandKit } from "./components/brand-kit";
import {
  OwnerEmergencyKit,
  EmergencyOwnerForm,
} from "./components/owner-emergency";
import { clearGallerySession } from "./components/gallery-session";
import { SubproductTrash } from "./components/subproduct-trash";


const StorageUsage = dynamic(() => import("./components/storage-usage").then(m => m.StorageUsage), { loading: () => <p role="status">Cargando…</p> });
const StatisticsPanel = dynamic(() => import("./components/statistics-panel").then(m => m.StatisticsPanel), { loading: () => <p role="status">Cargando…</p> });
import { downloadArchive } from "./components/download-archive";
const CollectionGallery = dynamic(() => import("./components/collection-gallery").then(m => m.CollectionGallery));
import {
  AccountSecurity,
  RecoveryIssuer,
  ResetPasswordForm,
} from "./components/account-security";
const Library = LibraryWorkspace;
const Presets = dynamic(() => import("./components/productivity").then(m => m.Presets));
const PresetTools = dynamic(() => import("./components/productivity").then(m => m.PresetTools));
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
  designMode?:"professional"|"editable";
  reasoningLevel?:"low"|"medium"|"high";
};
type Item = {
  id: string;
  name: string;
  prompt: string;
  instructionPolicy?: InstructionPolicy;
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
  editable: false,
  designMode:"professional",
  reasoningLevel:"medium",
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
          "metaads",
          "presets",
          "history",
          "usage",
          "trash",
          "jobs",
          "account",
          "plans",
          "collection",
          ...(managesUsers(user.role) ? ["users"] : []),
          ...(user.role === "OWNER"
            ? [
                "products",
                "ai",
                "mail",
                "payments",
                "website",
                "statistics",
                "visual-audit",
              ]
            : []),
        ];
        const nextView =
          allowed.includes(requested) &&
          (user.role !== "OBSERVER" ||
            [
              "projects",
              "library",
              "metaads",
              "presets",
              "account",
              "plans",
              "collection",
            ].includes(requested))
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
  const openLibraryFolder = async (key: string) => {
    // Open synchronously from the click so browsers do not block an awaited popup.
    const tab = window.open("about:blank", "_blank");
    if (!tab) throw Error("Permite abrir otra pestaña para ver los afiches.");
    tab.opener = null;
    try {
      const nodes = await api("library/tree");
      tab.location.replace(
        new URL(
          "?" +
            new URLSearchParams({
              view: "library",
              tab: "images",
              ...folderScope(nodes, key, emptyHierarchy),
              folder: key,
            }),
          window.location.href,
        ).href,
      );
    } catch (error) {
      tab.close();
      throw error;
    }
  };
  const openGallery = (sub: Item) => {
    void openLibraryFolder("subproduct:" + sub.id).catch((e) =>
      setRouteError(e.message),
    );
  };
  const openCollection = (scope: "project" | "category", id: string) => {
    void openLibraryFolder(
      (scope === "category" ? "product:" : "project:") + id,
    ).catch((e) => setRouteError(e.message));
  };
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
    metaads: "Meta Ads",
    products: "Listado de bienes",
    presets: "Configuraciones guardadas",
    ai: "Ajustes de IA",
    mail: "Ajustes de correo",
    "visual-audit": "Auditoría visual y conservación",
    history: "Historial",
    users: "Usuarios",
    usage: "Costos de IA",
    statistics: "Estadísticas",
    trash: "Papelera",
    jobs: "Biblioteca",
    account: "Mi cuenta",
    plans: "Mi plan",
    payments: "Ajustes de pago",
    website: "Página web",
    collection: "Galería de afiches",
  };
  const navigate = (v: string) => changeAddress({ view: v });
  return (
    <CurrentUserId.Provider value={user.id}><CurrentRole.Provider value={user.role}>
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
          <nav aria-label="Menú principal">
            {[
              ["projects", "▦", "Proyectos"],
              ["library", "▧", "Biblioteca"],
              ["metaads", "▥", "Meta Ads"],
              ["presets", "≡", "Configuraciones guardadas"],
              ["history", "◷", "Historial"],
              ["trash", "⌫", "Papelera"],
              ...(user.role === "OWNER"
                ? [
                    ["products", "▤", "Listado de bienes"],
                    ["statistics", "▥", "Estadísticas"],
                    ["website", "◈", "Página web"],
                    ["visual-audit", "▧", "Auditoría visual"],
                  ]
                : []),
            ]
              .filter(
                ([v]) =>
                  user.role !== "OBSERVER" ||
                  ["projects", "library", "presets", "account"].includes(v),
              )
              .map(([v, icon, label]) => (
                <button
                  key={v}
                  className={
                    view === v || (v === "library" && view === "jobs")
                      ? "active"
                      : ""
                  }
                  onClick={() => navigate(v)}
                >
                  {icon}　{label}
                </button>
              ))}
          </nav>
          <SidebarAccount user={user} view={view} navigate={navigate} logout={() => {
            void api("auth/logout", "POST").then(() => { clearGallerySession(); return reloadUser(); });
          }} />
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span className="muted">{view === "metaads" ? "Análisis y control de Meta" : titles[view]}</span>
            {view === "metaads" && <span className="meta-topbar-role">Rol: <strong>{user.role}</strong></span>}
            <span className="badge">Producción publicitaria</span>

          </header>
          <main>
            {view !== "metaads" && <><RoleGuide name={user.name} role={user.role} /><VisualAuditNotice key={user.id} /></>}
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
            ) : view === "products" && user.role === "OWNER" ? (
              <ProductsCatalog />
            ) : view === "metaads" ? (
              <MetaAds role={user.role} userId={user.id} />
            ) : view === "library" ? (
              <Library key={location} />

            ) : view === "presets" ? (
              <Presets />
            ) : view === "website" && user.role === "OWNER" ? (
              <SiteEditor />
            ) : view === "payments" && user.role === "OWNER" ? (
              <PaymentSettings />
            ) : view === "plans" ? (
              <MyPlan canPurchase={user.role !== "OBSERVER"} />
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
    </CurrentRole.Provider></CurrentUserId.Provider>
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
                <PasswordInput
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
                  <PasswordInput
                    name="token"
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
  const [quick,setQuick]=useState(false);
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
          <h1>{trash ? "Papelera" : "Inicia"}</h1>
          <p className="muted">
            {trash
              ? "Restaura tus proyectos. El historial administrativo se conserva."
              : "Organiza tus campañas y convierte tus ideas en publicidad."}
          </p>
        </div>
        {!trash && canEdit && (
          <div className="row start-actions"><button className="primary" type="button" aria-expanded={quick} onClick={()=>{setQuick(!quick);setCreate(false);}}>Inicia rápido</button><button type="button" aria-expanded={create} onClick={() => {setCreate(!create);setQuick(false);}}>＋ Añadir proyecto</button></div>
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
      {!trash&&quick&&<QuickStart />}
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
          <InstructionEditor
            label="Instrucciones generales"
            name="prompt"
            placeholder="Describe qué quieres crear. Los detalles comerciales son opcionales."
          />
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
      {trash&&canEdit&&<ProductTrash />}
      {t.notice}
    </>
  );
}
function PromptForm({
  item,
  save,
  children,
  configuration,
  attachments,
  policyOverride,
  onPolicyChange,
  onApplied,
}: {
  item: Item;
  policyOverride?:InstructionPolicy;
  onPolicyChange?:(policy:InstructionPolicy)=>void;
  onApplied?:(item:any)=>void|Promise<void>;
  save: (data: any) => Promise<void>;
  children?: React.ReactNode;
  attachments?: { scope: string; id: string };
  configuration?: {
    settings: unknown;
    applyPromptToAll: boolean;
    applySettingsToAll: boolean;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentRef = useRef<AttachmentsHandle>(null);
  const [currentItem,setCurrentItem]=useState(item),[formVersion,setFormVersion]=useState(0),[ownPolicy,setOwnPolicy]=useState<InstructionPolicy>(item.instructionPolicy??{});
  useEffect(()=>{setCurrentItem(item);setOwnPolicy(item.instructionPolicy??{});setFormVersion(v=>v+1);},[item.id,item.prompt,JSON.stringify(item.instructionPolicy??{})]);
  const policy=policyOverride??ownPolicy;
  const changePolicy=(value:InstructionPolicy)=>{setOwnPolicy(value);onPolicyChange?.(value);};
  const scope=configuration?"category":"project";
  const endpoint=scope==="category"?"categories/":"projects/";
  const getCurrent=async()=>{const current={...currentItem,...Object.fromEntries(new FormData(formRef.current!)),...configuration,instructionPolicy:policy};await attachmentRef.current?.flush();await save(current);return current;};
  const templates=useReusableConfiguration({scope,current:{...currentItem,instructionPolicy:policy},saveCurrent:getCurrent,onApplied:async()=>{const loaded=await api(endpoint+item.id);setCurrentItem(loaded);changePolicy(loaded.instructionPolicy??{});await onApplied?.(loaded);setFormVersion(v=>v+1);}});
  const t = useTask();
  return (
    <form
      key={formVersion}
      ref={formRef}
      aria-label={"Instrucciones de " + currentItem.name}
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const data = {...Object.fromEntries(new FormData(e.currentTarget)),instructionPolicy:policy};
        void t.run(async () => {
          const uploaded = await attachmentRef.current?.flush();
          try { await save(data); }
          catch (error) { throw Error((error instanceof Error ? error.message : "No se guardaron las instrucciones.") + (uploaded?.length ? " Los documentos ya subidos se conservan; revisa y vuelve a guardar las instrucciones." : "")); }
        }, "Instrucciones y documentos guardados");
      }}
    >
      {templates.picker}
      <InstructionPolicyControls scope={scope} value={policy} onChange={changePolicy} />
      <label>
        Nombre
        <input name="name" defaultValue={currentItem.name} required maxLength={200} />
      </label>
      {item.description !== undefined && (
        <label>
          Descripción
          <input
            name="description"
            defaultValue={currentItem.description}
            maxLength={2000}
          />
        </label>
      )}
      <InstructionEditor
        label={
          configuration
            ? "Instrucciones generales del producto"
            : "Instrucciones del proyecto"
        }
        name="prompt"
        defaultValue={currentItem.prompt}
        placeholder="Escribe instrucciones en lenguaje natural…"
      />
      {children}
      {attachments && <Attachments key={attachments.id} ref={attachmentRef} {...attachments} deferred />}
      <button disabled={t.busy} className="primary">
        Guardar instrucciones
      </button>
      {templates.saver}
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
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandHost,setBrandHost]=useState<HTMLDivElement|null>(null);
  const [projectPolicy,setProjectPolicy]=useState<InstructionPolicy>(p.instructionPolicy??{});
  const projectInstructions=useRef<HTMLDetailsElement>(null);
  const t = useTask();
  return (
    <>
      <div className="heading project-heading">
        <div><div className="eyebrow">Proyecto</div><h1>{p.name}</h1><p className="muted">{p.description}</p></div>
      </div>
      <div className="project-action-bar" aria-label="Acciones del proyecto">
        {p.canEdit !== false && <button type="button" className="primary" aria-expanded={create} onClick={() => setCreate(!create)}>＋ Añadir producto</button>}
        <div className="brand-selector-host" ref={setBrandHost} />
        <button type="button" onClick={openCollection}>Ver afiches del proyecto</button>
        {p.canManageAccess && <button type="button" aria-expanded={share} onClick={() => setShare(!share)}>Compartir proyecto</button>}
        {p.canManageAccess && <button type="button" className="danger" onClick={() => {
          if (confirm("¿Enviar este proyecto a la papelera? Su auditoría se conservará.")) void t.run(async () => { await api("projects/" + p.id, "DELETE"); back(); });
        }}>Eliminar proyecto</button>}
      </div>
      <div id="project-brand" hidden={!brandOpen}><button type="button" className="brand-collapse" onClick={()=>setBrandOpen(false)}>Reducir identidad de marca</button><BrandKit key={p.id} projectId={p.id} selectorHost={brandHost} onOpen={()=>setBrandOpen(true)} /></div>
      <details ref={projectInstructions} className="project-instruction-section">
        <summary><span>Instrucciones del proyecto y adjuntos</span><label className="row" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={projectPolicy.includeSelf===false} onChange={e=>{setProjectPolicy({...projectPolicy,includeSelf:!e.target.checked});if(projectInstructions.current)projectInstructions.current.open=true;}} />No incluir instrucciones</label></summary>
        <div className="inside stack">
          <PromptForm key={p.id} item={p} policyOverride={projectPolicy} onPolicyChange={setProjectPolicy} attachments={p.canEdit !== false ? { scope:"project", id:p.id } : undefined}
            save={async b => { await api("projects/" + p.id, "PATCH", b); await refresh(); }} />
        </div>
      </details>
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
          <InstructionEditor label="Instrucciones opcionales" name="prompt" />
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
          ["textCount", "Texto · sin fotografía", 0, 12],
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
      <CreativeFinish designMode={s.designMode} reasoning={s.reasoningLevel} onChange={(designMode,reasoningLevel)=>onChange({...s,designMode,reasoningLevel,editable:designMode==="editable"})} />
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
  const [statisticsDates,setStatisticsDates]=useState({from:"",to:""});
  const {orders:statusBySubproduct,counts:imageCounts,statistics,statisticsError}=useSubproductStatuses(c.project.id,c.id,statisticsDates.from,statisticsDates.to);
  const [sharing, setSharing] = useState(false);
  const [selectionSharing,setSelectionSharing]=useState(false);
  const canSeeCosts=useCanEdit();
  const [trashOpen,setTrashOpen]=useState(false);
  const [selectedSubs, setSelectedSubs] = useState<string[]>([]);
  const [promptAll, setPromptAll] = useState(c.applyPromptToAll ?? true);
  const [settingsAll, setSettingsAll] = useState(c.applySettingsToAll ?? true);
  const [s, setS] = useState<Settings>({ ...base, ...c.settings });
  const [bulk, setBulk] = useState(false);
  const [productTrashOpen,setProductTrashOpen]=useState(false);
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
      </div>
      <div className="project-action-bar" aria-label="Acciones del producto">
       <button type="button" onClick={openCollection}>Ver afiches del producto</button>
       {c.canManageAccess&&<button type="button" aria-expanded={sharing} onClick={()=>setSharing(!sharing)}>Compartir producto</button>}
       {c.canManageAccess&&<button type="button" className="danger" onClick={()=>{if(confirm("¿Enviar este producto a la papelera? Sus subproductos e historial se conservarán; solo se cancelan trabajos pendientes."))void t.run(async()=>{await api("categories/"+c.id,"DELETE");back();},"Producto enviado a papelera");}}>Eliminar producto</button>}
       {c.canManageAccess&&<button type="button" aria-expanded={productTrashOpen} onClick={()=>setProductTrashOpen(!productTrashOpen)}>Buscar productos eliminados</button>}
      </div>
      {sharing&&c.canManageAccess&&<ProjectSharing projectId={c.id} scope="category" />}
      {productTrashOpen&&<ProductTrash projectId={c.project.id} onRestored={refresh} />}
      <details hidden={!c.canEdit}>
        <summary>Instrucciones y configuración de producto</summary>
        <div className="inside stack">
          <PromptForm
            item={c}
            onApplied={async loaded=>{setS({...base,...loaded.settings});setPromptAll(loaded.applyPromptToAll??true);setSettingsAll(loaded.applySettingsToAll??true);await refresh();}}
            attachments={{ scope:"category", id:c.id }}
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
        </div>
      </details>
      <section className="subproducts-section" aria-label="Subproductos">
      <div className="subproducts-toolbar">
        <h2>Subproductos · {c.subproducts.length}</h2>
        {c.canEdit&&<button type="button" className="primary" aria-expanded={bulk} onClick={()=>setBulk(!bulk)}>＋ Añadir subproducto / Inicio rápido</button>}
        {c.canEdit&&<BatchGeneration categoryId={c.id} projectId={c.project.id} count={c.subproducts.length} selectedIds={selectedSubs} />}
        {canSeeCosts&&<a className="button selected-costs" target="_blank" rel="noopener" href={"?"+new URLSearchParams({view:"usage",project:c.project.id,product:c.id,days:"all",from:statisticsDates.from,to:statisticsDates.to,...(selectedSubs.length&&selectedSubs.length!==c.subproducts.length?{subproducts:selectedSubs.join(",")}:{} )})}>Costos IA{selectedSubs.length?` (${selectedSubs.length})`:" · todos"} ↗</a>}
        {c.canManageAccess&&<button type="button" disabled={!selectedSubs.length} aria-expanded={selectionSharing&&!!selectedSubs.length} onClick={()=>setSelectionSharing(!selectionSharing)}>Compartir subproducto{selectedSubs.length?` (${selectedSubs.length})`:""}</button>}
        {c.canEdit&&<button type="button" className="danger" disabled={!selectedSubs.length||t.busy} onClick={()=>{if(confirm(`¿Eliminar ${selectedSubs.length} subproductos? Se cancelarán sus trabajos pendientes. Las carpetas, imágenes e historial se conservan.`))void t.run(async()=>{await api("subproducts/bulk-delete","POST",{ids:selectedSubs});setSelectedSubs([]);setSelectionSharing(false);await refresh();},"Subproductos eliminados");}}>Eliminar ({selectedSubs.length})</button>}
        {c.canEdit&&<button type="button" aria-expanded={trashOpen} onClick={()=>setTrashOpen(!trashOpen)}>Buscar subproductos eliminados</button>}

      </div>
      {selectionSharing&&selectedSubs.length>0&&c.canManageAccess&&<ProjectSharing projectId={c.id} scope="subproduct" subproductIds={selectedSubs}/> }
      <p className="quick-start-guide">Genera de manera rápida las variaciones de las imágenes que quieras. Añade un tema, elige las herencias y revisa antes de generar.</p>
      <div className="row subproducts-selection">
        <label className="row"><input type="checkbox" checked={!!c.subproducts.length&&selectedSubs.length===c.subproducts.length} onChange={e=>setSelectedSubs(e.target.checked?c.subproducts.map(sub=>sub.id):[])} />Seleccionar todos</label>
        <span className="hint">{selectedSubs.length} seleccionados</span>
        <div className="subproduct-period"><span className="hint">Contadores · fecha de solicitud</span><DateRange from={statisticsDates.from} to={statisticsDates.to} onChange={(from,to)=>setStatisticsDates({from,to})}/></div>
      </div>
      {statisticsError&&<p role="alert" className="notice">{statisticsError}</p>}
      {selectedSubs.length>0&&<p className="hint selected-inheritance">Herencias de {selectedSubs.length} seleccionados · Proyecto: <strong>{c.project.name}</strong> · Producto: <strong>{c.name}</strong>. Cada subproducto aplica sus casillas de herencia.</p>}
      {trashOpen&&c.canEdit&&<SubproductTrash categoryId={c.id} onRestored={refresh} initialOpen />}
      {bulk && (
        <section className="panel stack">
          <h3>Añadir subproductos</h3>
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
      {c.subproducts.map((sub, i) => (
        <div key={sub.id} className="stack subproduct-space">
          <SubproductRow
            key={sub.id}
            sub={sub}
            orderStatus={statusBySubproduct[sub.id]}
            imageCount={imageCounts[sub.id]??sub._count?.variations??0}
            statistics={statistics[sub.id]}
            selected={selectedSubs.includes(sub.id)}
            onSelected={checked=>setSelectedSubs(ids=>checked?[...new Set([...ids,sub.id])]:ids.filter(id=>id!==sub.id))}
            ancestry={{project:c.project.name,product:c.name}}
            initiallyOpen={typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("subproduct")===sub.id}
            onReviewSaved={refresh}
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
      </section>
    </>
  );
}
function BatchGeneration({
  projectId,
  categoryId,
  count,
  selectedIds=[],
}: {
  selectedIds?:string[];
  categoryId: string;
  projectId: string;
  count: number;
}) {
  const [preview, setPreview] = useState<any[] | null>(null);
  const {charge:consent,setCharge:setConsent,previewFirst,setPreviewFirst}=useGenerationChoices("product",categoryId);
  const [queued, setQueued] = useState(false);
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("background");
  const production = useProductionController(undefined, {
    project: projectId,
    product: categoryId,
  },!!preview||queued);
  const [selected, setSelected] = useState<string[]>([]);
  const t = useTask();
  return (
    <div className="batch-generation">
      <div className="row batch-generation-buttons"><button
        disabled={!count || t.busy}
        onClick={() =>
          void t.run(async () => {
            const result = await api("categories/" + categoryId + "/preview");
            setPreview(result);
            setSelected(result.map((p: any) => p.id));
            
          }, "")
        }
      >
        Revisar y generar todos
      </button>
      <button type="button" disabled={!selectedIds.length||t.busy} onClick={()=>void t.run(async()=>{const result=await api("categories/"+categoryId+"/preview");setPreview(result.filter((p:any)=>selectedIds.includes(p.id)));setSelected(selectedIds);},"")}>Revisar y generar seleccionados</button></div>
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
                
              }}
            >
              Seleccionar todos
            </button>
            <button
              onClick={() => {
                setSelected([]);
                
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
              checked={previewFirst}
              onChange={(e) => setPreviewFirst(e.target.checked)}
            />
            Generar primero una muestra por subproducto y esperar aprobación
            antes del resto.
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {"He revisado las instrucciones y autorizo el posible cargo de API de este lote."}
          </label>
          <ExecutionChoice
            value={executionMode}
            onChange={setExecutionMode}
            disabled={t.busy || production.dispatching}
          />
          <button
            className="primary"
            disabled={
              production.uncertainDispatch ||
              production.dispatching ||
              !consent ||
              !selected.length ||
              t.busy ||
              preview.some((p) => selected.includes(p.id) && p.warnings.length)
            }
            onClick={() =>
              void t.run(async () => {
                const result = await api(
                  "categories/" + categoryId + "/generate",
                  "POST",
                  {
                    confirmCharge: true,
                    engine:"ai",
                    reviewedInstructions: true,
                    requestId: crypto.randomUUID(),
                    selected,
                    previewFirst,
                  },
                );
                setQueued(true);
                await production.start(
                  result.runnable,
                  executionMode,
                  result.jobs,
                );
                const ch = new BroadcastChannel("studio-updates");
                ch.postMessage("queued");
                ch.close();
                setPreview(null);
              }, "Lote registrado. Revisa la muestra en Biblioteca.")
            }
          >
            Generar selección
          </button>
          <button onClick={() => setPreview(null)}>Cerrar</button>
        </div>
      )}
      <ProductionControls controller={production} />
      {queued && (
        <a
          className="button"
          target="_blank"
          rel="noopener"
          href={
            "?" +
            new URLSearchParams({
              view: "jobs",
              project: projectId,
              product: categoryId,
            })
          }
        >
          Abrir producción en Biblioteca ↗
        </a>
      )}
      {t.notice}
    </div>
  );
}
function SubproductRow({
  sub, selected, onSelected, ancestry, initiallyOpen=false,orderStatus,imageCount,statistics,
  costScope,
  index,
  inherited,
  forceOwn,
  openGallery,
  removed,
  onReviewSaved,
}: {
  sub: Item;
  selected:boolean;
  orderStatus?:OrderProgress;
  imageCount:number;
  statistics?:SubproductStatistics;
  onSelected:(checked:boolean)=>void;
  ancestry:{project:string;product:string};
  initiallyOpen?:boolean;
  costScope: { project: string; product: string; subproduct: string };
  index: number;
  inherited: Settings;
  forceOwn: boolean;
  openGallery: () => void;
  removed: () => Promise<void>;
  onReviewSaved?:()=>Promise<void>;
}) {
  const [policy,setPolicy]=useState<InstructionPolicy>(sub.instructionPolicy??{});
  const [reviewOpen,setReviewOpen]=useState(false),[reviewDirty,setReviewDirty]=useState(false),[sourceDirty,setSourceDirty]=useState(false),[reviewVersion,setReviewVersion]=useState(0);
  const [configOpen,setConfigOpen]=useState(initiallyOpen);
  const uploadRef=useRef<AttachmentsHandle>(null);
  const reviewRef=useRef<ReviewInstructionsHandle>(null);
  const [expanded, setExpanded] = useState(initiallyOpen);
  const detailsRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{if(initiallyOpen){detailsRef.current?.scrollIntoView({block:"start"});detailsRef.current?.querySelector<HTMLInputElement>("input[data-subproduct-name]")?.focus();}},[initiallyOpen]);
  const {charge,setCharge,previewFirst,setPreviewFirst}=useGenerationChoices("subproduct",sub.id);
  const [queued, setQueued] = useState(false);
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>("background");
  const production = useProductionController(
    undefined,
    expanded ? costScope : undefined,
    expanded,
  );
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
  const t = useTask();
  const save = async (reviewed?:{prompt:string;policy:InstructionPolicy}) => {
    await uploadRef.current?.flush();
    await api("subproducts/" + sub.id, "PATCH", {
      name,
      prompt:reviewed?.prompt??prompt,
      instructionPolicy:reviewed?.policy??policy,
      settings: custom || forceOwn ? s : {},
    });
  };
  const configuration=()=>({...sub,name,prompt,instructionPolicy:policy,settings:custom||forceOwn?s:inherited});
  const templates=useReusableConfiguration({scope:"subproduct",current:configuration(),enabled:expanded,saveCurrent:async()=>{await save();return configuration();},onApplied:async()=>{const loaded=await api("subproducts/"+sub.id);setName(loaded.name);setPrompt(loaded.prompt);setPolicy(loaded.instructionPolicy??{});setS({...inherited,...loaded.settings});setCustom(true);setPreview(null);setReviewOpen(false);setReview(false);setSourceDirty(false);}});
  const latestOrder=[orderStatus,...production.orders].filter((order):order is OrderProgress=>!!order).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const generate=async(quick=false)=>{
    if(!charge)throw Error("Activa la autorización de generación.");
    const savedReview=quick?await reviewRef.current?.flush():null;
    const own=savedReview?.layers.find(layer=>layer.scope==="subproduct");
    await save(own?.prompt!==null&&own?{prompt:own.prompt,policy:own.policy}:undefined);
    const result=await api("subproducts/"+sub.id+"/generate","POST",{confirmCharge:true,engine:"ai",...(quick?{quickGeneration:true}:{reviewedInstructions:true}),previewFirst,requestId:crypto.randomUUID()});
    setQueued(true);setReview(false);setSourceDirty(false);setReviewDirty(false);
    await production.start(result.runnable,executionMode,result.jobs);
    const channel=new BroadcastChannel("studio-updates");channel.postMessage("queued");channel.close();
  };
  const loadReview=()=>void t.run(async()=>{await save();setPreview(await api("subproducts/"+sub.id+"/instructions"));setReview(false);setReviewDirty(false);setSourceDirty(false);setReviewVersion(v=>v+1);},"");
  return (
    <>
    <details ref={detailsRef}
      aria-label={"Subproducto " + sub.id}
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="subproduct-header">
        <label className="subproduct-check" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={"Seleccionar "+name} checked={selected} onChange={e=>onSelected(e.target.checked)} /></label>
        <span aria-hidden="true">{expanded?"▾":"▸"}</span><span className="subproduct-title"><span className="sub-num">{String(index+1).padStart(2,"0")}</span><strong title={name}>{name}</strong></span>
        <SubproductStatus order={latestOrder} />
        <SubproductCounters statistics={statistics} />
        <span className="row subproduct-header-actions" onClick={e=>e.stopPropagation()}>
          <button type="button" title="Imágenes disponibles actualmente en la carpeta, sin filtro de fecha." onClick={openGallery}>Ver variaciones ({imageCount}) ↗</button>

        </span>
      </summary>
      <div className="inside stack">
        <details className="subproduct-configuration" open={configOpen} onToggle={event=>setConfigOpen(event.currentTarget.open)}><summary>Configuración</summary><div className="inside stack">
        {templates.picker}
        <InstructionPolicyControls scope="subproduct" value={policy} onChange={value=>{setPolicy(value);setReview(false);setSourceDirty(true);setPreview(null);setReviewOpen(false);}} />
        <p className="hint subproduct-inheritance">Herencias: {policy.includeProject!==false?<>Proyecto: <strong>{ancestry.project}</strong></>:"Proyecto: no incluida"} · {policy.includeProduct!==false?<>Producto: <strong>{ancestry.product}</strong></>:"Producto: no incluida"}. Las exclusiones del origen también se respetan.</p>
        <p className="notice">
          Eje temático: <strong>{name || sub.name}</strong>. Todas las
          variaciones tratarán de este tema y deben mencionar su nombre. Las
          instrucciones particulares añaden detalles a las instrucciones
          generales activas.
        </p>
        <label style={{ marginTop: 18 }}>
          Tema / nombre del subproducto
          <input
            data-subproduct-name
            value={name}
            onChange={(e) => {setName(e.target.value);setSourceDirty(true);setReview(false);}}
            maxLength={200}
          />
        </label>
        {policy.includeSelf!==false&&<InstructionEditor
          label="Instrucciones particulares · opcional"
          value={prompt}
          onValueChange={(value) => {
            setPrompt(value);
            setReview(false);setSourceDirty(true);
          }}
          placeholder="Escribe solo las excepciones o indicaciones adicionales."
        />}
        <div id={"sub-settings-"+sub.id} className={preview?.needsSettings?"field-invalid":""}>
        <label className="row">
          <input
            type="checkbox"
            checked={custom || forceOwn}
            disabled={forceOwn}
            onChange={(e) => {
              setCustom(e.target.checked);
              setReview(false);setSourceDirty(true);
            }}
          />
          Personalizar cantidad, distribución y estilo
        </label>
        {(custom || forceOwn) && (
          <SettingsFields
            value={s}
            onChange={(x) => {
              setS(x);
              setReview(false);setSourceDirty(true);
            }}
          />
        )}
        </div>
        <div onChangeCapture={()=>{setSourceDirty(true);setReview(false);}}><Attachments ref={uploadRef} scope="subproduct" id={sub.id} deferred onUploaded={()=>{setSourceDirty(true);setReview(false);setPreview(null);}} /></div>
        {templates.saver}
        <div className="row compact-review-actions"><button type="button" className="primary" disabled={t.busy} onClick={()=>void t.run(async()=>{await save();setSourceDirty(true);setReview(false);},"Cambios y documentos guardados. Actualiza la revisión antes de generar.")}>Guardar cambios y documentos del subproducto</button><button type="button" onClick={()=>setConfigOpen(false)}>Minimizar</button></div>
        </div></details>
        <details className="subproduct-review" open={reviewOpen} onToggle={event=>{const open=event.currentTarget.open;setReviewOpen(open);if(open&&!preview&&!t.busy)loadReview();}}>
          <summary>Revisar y generar</summary>
          {!preview&&<p role="status">Preparando la revisión…</p>}
          {preview && <div className="inside panel">
            <h3>Revisa antes de generar · {name}</h3>
            <p className="quick-start-guide">{preview.settings?.designMode==="editable"?"Canva: fondo visual y textos por separado.":`Acabado profesional · ${{low:"Bajo",medium:"Medio",high:"Alto"}[reasoningLevel(preview.settings?.reasoningLevel)]}: la composición sigue tu prompt y conserva los textos explícitos como capas nítidas.`}</p>
            {sourceDirty&&<p className="notice">Hay cambios en el formulario. <button type="button" disabled={t.busy} onClick={loadReview}>Actualizar revisión</button></p>}
            <ReviewInstructions ref={reviewRef} key={reviewVersion} id={sub.id} beforeReload={save} onDirty={()=>{setReviewDirty(true);setReview(false);}} onSaved={async data=>{const own=data.layers.find(layer=>layer.scope==="subproduct");if(own?.prompt!==null&&own){setPrompt(own.prompt);setPolicy(own.policy);}setPreview(await api("subproducts/"+sub.id+"/instructions"));setReviewDirty(false);setSourceDirty(false);setReview(false);await onReviewSaved?.();}} />
            <pre>{preview.text}</pre>
            <details className="review-references"><summary>Documentos y referencias utilizados ({preview.attachments?.length??0})</summary><div className="inside"><p className="hint">El texto extraído de documentos se incorpora al contexto del prompt. Las imágenes se usan como referencias para la IA. Solo se usan las herencias activas; las referencias privadas autorizadas se procesan en servidor sin revelar su contenido aquí.</p>{preview.attachments?.length?<ul>{preview.attachments.map((file:any)=><li key={file.id}><strong>{file.name}</strong> · {file.purpose} · {file.mime.startsWith("image/")?"Referencia visual":"Texto extraído"}</li>)}</ul>:<p className="muted">No hay adjuntos visibles en esta revisión.</p>}</div></details>
            {preview.overrides.map((w: string, i: number) => (
              <p key={i} className="hint">
                {w}
              </p>
            ))}
            {(preview.advisories??[]).map((text:string,index:number)=><p className="hint" key={"advice-"+index}>{text}</p>)}
            {preview.warnings.map((w: string, i: number) => (
              <div className="notice" key={i}>
                {w}
                <button type="button" onClick={()=>{const settings=/(?:cantidad|distribución|variaciones)/i.test(w);const scope=/^Proyecto/.test(w)?"project":/^Producto/.test(w)?"category":"subproduct";const element=document.getElementById(settings?"sub-settings-"+sub.id:"review-"+sub.id+"-"+scope) as HTMLDetailsElement|null;if(element){if(element.tagName==="DETAILS")element.open=true;element.scrollIntoView({block:"center",behavior:"smooth"});element.querySelector<HTMLInputElement|HTMLTextAreaElement>(settings?"input":"textarea")?.focus();}}}>Ir a las instrucciones de este nivel</button>
              </div>
            ))}
            <p className="hint">
              El análisis convencional detecta conflictos básicos; confirma el
              contenido comercial antes de enviarlo.
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={previewFirst}
                onChange={(e) => setPreviewFirst(e.target.checked)}
              />
              Revisar y aprobar la primera muestra antes de generar las demás.
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={charge}
                onChange={(e) => setCharge(e.target.checked)}
              />
              {"Autorizo las llamadas de IA y su posible cargo de API."}
            </label>
            <ExecutionChoice
              value={executionMode}
              onChange={setExecutionMode}
              disabled={t.busy || production.dispatching}
            />
            <div className="row compact-review-actions"><button type="button" className={review?"primary approved-review":"primary"} aria-pressed={review} disabled={t.busy||reviewDirty||sourceDirty||preview.warnings.length>0} onClick={()=>setReview(!review)}>{review?"Ya aprobado":"¿Lo apruebas?"}</button><button type="button" onClick={()=>setReviewOpen(false)}>Minimizar</button></div>

          </div>}
        </details>
      </div>
    </details>
    <div className="row subproduct-generation-actions">
            <button
              className="primary"
              type="button"
              disabled={
                t.busy ||
                production.uncertainDispatch ||
                production.dispatching ||
                !review ||
                reviewDirty || sourceDirty ||
                !charge ||
                !preview || preview.warnings.length > 0
              }
              onClick={()=>void t.run(()=>generate(),"Lote registrado. Revisa la muestra en Biblioteca.")}
            >
              Generar variaciones · {(custom||forceOwn?s:inherited).count}{latestOrder&&latestOrder.pending>0?` · ${latestOrder.completed}/${latestOrder.target}`:""}
            </button>
      <button type="button" className="primary quick-generation" disabled={t.busy||production.uncertainDispatch||production.dispatching||!charge} onClick={()=>void t.run(()=>generate(true),"Generación rápida registrada. Revisa su avance y la muestra en Biblioteca.")}>Generación rápida ({(custom||forceOwn?s:inherited).count})</button>
      <button type="button" onClick={openGallery}>Ver variaciones ↗</button>
      <small className="hint">Generación rápida guarda los cambios y utiliza el motor elegido sin abrir la revisión. Respeta la primera muestra y el modo de ejecución.</small>
      {!charge&&<label className="row"><input type="checkbox" checked={charge} onChange={e=>setCharge(e.target.checked)} />{"Autorizo las llamadas de IA y su posible cargo de API."}</label>}
    </div>
    <ProductionControls controller={{...production,orders:latestOrder?[latestOrder]:production.orders}} />
    {t.notice}
    </>
  );
}
function AISettings() {
  const [testMode, setTestMode] = useState<ExecutionMode>("background");
  const testProduction = useProductionController(undefined, {
    project: "none",
  });
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
  const checks = [
    {
      label: "Clave guardada en el servidor",
      target: "ai-connection",
      ok: !!c.maskedKey,
    },
    {
      label: "Cambios guardados",
      target: key ? "ai-connection" : "ai-models",
      ok: !dirty && !key,
    },
    {
      label: "Consulta de modelos verificada durante las últimas 24 horas",
      target: "ai-connection",
      ok: !!verified,
    },
    {
      label: "Modelos de imagen y dirección creativa compatibles seleccionados",
      target: "ai-models",
      ok:
        !!image &&
        image.kind === "image" &&
        creativeModels.some((m: any) => m.id === c.creativeModel) &&
        (c.creativeStatus === "VERIFIED" || (!c.creativeProvider && verified)),
    },
    {
      label: "Calidad y resolución compatibles",
      target: "ai-models",
      ok:
        !!image?.qualities.includes(c.quality) &&
        !!image?.resolutions.includes(c.resolution),
    },
  ];
  checks.push({
    target: "ai-plans",
    label: "Cuota del plan disponible (OWNER sin límite de plan)",
    ok:
      !!testBudget?.allowed &&
      testBudget.revision === c.revision &&
      !dirty &&
      !key,
  });
  const ready = checks.every((check) => check.ok) && !liveError;
  const save = async () => {
    await api("ai/models", "PUT", {
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
          <div className="eyebrow">Ajustes / Exclusivo del OWNER</div>
          <h1>Ajustes de generación</h1>
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
        La generación con IA requiere conexión verificada y puede tener costo. Se aplican las cuotas de imágenes del plan (OWNER exento). Una suscripción a ChatGPT no cubre su API.
      </div>
      <section  className="panel stack" aria-label="Estado de preparación de IA">
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

        <ul className="ai-checks">
          {checks.map((check) => (
            <li
              key={check.label}
              className={check.ok ? "check-complete" : "check-pending"}
            >
              <button
                type="button"
                onClick={() => {
                  const section = document.getElementById(check.target);
                  section?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                  const field = section?.querySelector<HTMLElement>(
                    ".field-invalid input,.field-invalid select,input,select,button",
                  );
                  field?.focus({ preventScroll: true });
                }}
              >
                <strong>{check.ok ? "✓ Completo" : "! Pendiente"}:</strong>{" "}
                {check.label}
                {!check.ok && " → Revisar"}
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">
          {ready
            ? "Configuración preparada para solicitar una prueba. Todavía no demuestra que una imagen se genere correctamente ni confirma saldo."
            : "Completa los pasos pendientes. Después de cambiar modelos o credenciales, guarda y verifica la conexión."}
        </p>
        {(dirty || key) && (
          <div className="notice">
            Hay cambios sin guardar. Guarda la configuración y después verifica
            la conexión. La prueba usará únicamente los valores guardados.
          </div>
        )}
      </section>
      <div ><ProviderConnections
        providers={available}
        changed={async () => {
          if (!editing.current) await refresh();
          else
            setLiveError(
              "Cambió una conexión. Se conservaron tus campos sin guardar; revisa, guarda y verifica la configuración antes de generar.",
            );
        }}
      />
      </div>
      <section
        id="ai-connection"
        className={
          "panel stack ai-section" +
          ((!c.maskedKey || !verified || key) ? " needs-attention" : "")
        }
      >
        <h2>01　Proveedor de imágenes y credenciales</h2>
        <div className="fields">
          <label>
            Proveedor
            <select
              value={c.provider}
              disabled={t.busy}
              onChange={(e) => {if(c.provider!==e.target.value)void changeImageProvider(e.target.value);}}
            >
              {available.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="hint">
              Selecciona la empresa que emitió tu clave de API. Una suscripción de chat no sustituye la facturación de su API.
            </span>
          </label>
          <label >
            {c.maskedKey ? "Reemplazar clave API" : "Clave API"}
            <PasswordInput
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
                "Configuración guardada. Revisa la conexión antes de utilizar IA.",
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
      <section
        
        id="ai-models"
        className={
          "panel stack ai-section" +
          (checks.some((x) => x.target === "ai-models" && !x.ok)
            ? " needs-attention"
            : "")
        }
      >
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
              <div className={!image ? "field-invalid" : ""}>
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
              <div
                className={
                  !creativeModels.some((m: any) => m.id === c.creativeModel)
                    ? "field-invalid"
                    : ""
                }
              >
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
              <label
                className={
                  !image?.qualities.includes(c.quality) ? "field-invalid" : ""
                }
              >
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
              <label
                className={
                  !image?.resolutions.includes(c.resolution)
                    ? "field-invalid"
                    : ""
                }
              >
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
        <button
          type="button"
          className="primary"
          disabled={t.busy}
          onClick={() =>
            void t.run(
              save,
              "Modelos guardados. Verifica la conexión para generar.",
            )
          }
        >
          Guardar modelos y parámetros
        </button>
      </section>
      <section id="ai-plans" className="stack ai-section">
        <p className="hint">
          La generación se controla con el plan asignado a cada usuario. OWNER
          no tiene límite de plan. La reserva se calcula a partir del
          presupuesto y las imágenes del plan; no representa el precio real del
          proveedor. Los límites globales y particulares anteriores ya no
          bloquean la generación.
        </p>
        <PlanSettings />
      </section>
      <section  className="panel stack">
        <h2>03　Prueba real de generación · opcional</h2>
        <a
          className="button"
          target="_blank"
          rel="noopener"
          href="?view=jobs&project=none"
        >
          Abrir carpeta Pruebas ↗
        </a>
        <p>
          La prueba crea un afiche e invoca dirección creativa e imágenes.{" "}
          <strong>Puede producir cargos de API.</strong> Se aplican las cuotas
          del plan y el registro de consumo. Elige el modo de ejecución y envía
          una orden de una imagen. El avance corresponde a esa prueba; los
          intentos anteriores no se suman. Revisa su estado en la carpeta
          Pruebas antes de autorizar otra. No se reintenta automáticamente.
        </p>
        <label className="row">
          <input
            type="checkbox"
            checked={charge}
            onChange={(e) => setCharge(e.target.checked)}
          />
          Entiendo el posible cargo y autorizo una generación de prueba.
        </label>
        <ExecutionChoice
          value={testMode}
          onChange={setTestMode}
          disabled={t.busy || testProduction.dispatching}
        />
        <button
          className="primary"
          disabled={
            !charge ||
            t.busy ||
            !ready ||
            testProduction.dispatching ||
            testProduction.uncertainDispatch
          }
          onClick={() =>
            void t.run(async () => {
              try {
                const queued = await api("ai/test", "POST", {
                  confirmCharge: true,
                  requestId: crypto.randomUUID(),
                });
                await testProduction.start(queued.jobs, testMode);
              } finally {
                setCharge(false);
                await refresh();
              }
            }, "Orden de prueba enviada. Revisa y aprueba el resultado en la carpeta Pruebas de Biblioteca.")
          }
        >
          Generar prueba con posible cargo
        </button>
        <ProductionControls controller={testProduction} />
      </section>
      {t.notice}
    </>
  );
}
function Jobs() {
  return <LibraryWorkspace production />;
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
                "Alternativas encoladas. Consulta Biblioteca.",
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
