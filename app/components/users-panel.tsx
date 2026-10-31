"use client";
import { RecoveryIssuer } from "./account-security";
import dynamic from "next/dynamic";
const PlanSettings = dynamic(() =>
  import("./membership-plans").then((m) => m.PlanSettings),
);
import { PasswordInput } from "./password-input";
import { useCallback, useEffect, useRef, useState } from "react";
import { planLabel } from "../../lib/plan-label";
import { roleLabels, roleDescriptions, roleAbilities } from "../../lib/roles";
import { MetaWorkspaceSharing } from "./meta-workspace-sharing";
type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  aiAccessEnabled?: boolean;
  archivedAt?: string | null;
  planId?: string | null;
  plan?: {
    name: string;
    customUserId: string | null;
    archivedAt: string | null;
  } | null;
  planValidUntil?: string | null;
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "No se pudo guardar.");
  return b;
}
export function UsersPanel({ isOwner }: { isOwner: boolean }) {
  const [section, setSection] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "plans"
      ? "plans"
      : "users",
  );
  const [users, setUsers] = useState<Account[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [plans, setPlans] = useState<
      { id: string; name: string; customUserId?: string | null }[]
    >([]),
    [guideRole, setGuideRole] = useState("SUPERVISOR"),
    [createRole, setCreateRole] = useState("USER"),
    [archived, setArchived] = useState(false),
    [actions, setActions] = useState<string | null>(null),
    [removing, setRemoving] = useState<Account | null>(null),
    [sharing, setSharing] = useState<{
      userId: string;
      name: string;
      scope?: string;
    } | null>(null);
  const originals = useRef(new Map<string, Account>()),
    pending = useRef(false);
  const refresh = useCallback(async () => {
    const rows = await api("users" + (archived ? "?archived=true" : ""));
    originals.current = new Map(rows.map((u: Account) => [u.id, u]));
    setUsers(rows);
  }, [archived]);
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, [refresh]);
  useEffect(() => {
    if (isOwner)
      void api("plans")
        .then(setPlans)
        .catch((e) => setMessage(e.message));
  }, [isOwner]);
  const roles = isOwner
    ? ["USER", "OBSERVER", "ADVISOR", "SUPERVISOR", "ADMIN", "OWNER"]
    : ["USER", "OBSERVER"];
  const change = (id: string, data: Partial<Account>) =>
    setUsers((old) => old.map((u) => (u.id === id ? { ...u, ...data } : u)));
  async function run(fn: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage("Cambios guardados.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save(u: Account) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    const old = originals.current.get(u.id)!;
    try {
      const result = await api("users/" + u.id, "PATCH", {
        role: u.role,
        status: u.status,
        ...(isOwner
          ? {
              planId: u.planId ?? null,
              validUntil: u.planValidUntil
                ? new Date(u.planValidUntil).toISOString()
                : null,
              aiAccessEnabled: u.aiAccessEnabled !== false,
            }
          : {}),
        expected: {
          role: old.role,
          status: old.status,
          planId: old.planId ?? null,
          validUntil: old.planValidUntil
            ? new Date(old.planValidUntil).toISOString()
            : null,
          aiAccessEnabled: old.aiAccessEnabled !== false,
        },
      });
      originals.current.set(u.id, result.account);
      change(u.id, result.account);
      setMessage("Cuenta y plan guardados.");
      if (result.closesOwnSession || result.reloadOwn) window.location.reload();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const active = users.find((u) => u.id === actions);
  return (
    <>
      <div className="users-heading">
        <div>
          <h1>Usuarios y accesos</h1>
          <p className="hint">
            Una fila por persona. Guarda rol, estado y plan con un solo botón.
          </p>
        </div>
        {isOwner && (
          <a className="users-plans-link" href="?view=users&tab=plans">
            ◈ Planes de IA
          </a>
        )}
      </div>
      {isOwner && (
        <nav
          className="users-section-tabs"
          aria-label="Administración de usuarios y planes"
        >
          <button
            type="button"
            aria-pressed={section === "users"}
            onClick={() => {
              if (section !== "users") {
                setSection("users");
                void refresh();
                void api("plans")
                  .then(setPlans)
                  .catch((e) => setMessage(e.message));
              }
            }}
          >
            ♙ Usuarios y accesos
          </button>
          <button
            type="button"
            aria-pressed={section === "plans"}
            onClick={() => setSection("plans")}
          >
            ◈ Planes de IA
          </button>
        </nav>
      )}
      {section === "plans" && isOwner ? (
        <PlanSettings />
      ) : (
        <>
          <details className="panel roles-guide">
            <summary>Qué permite cada rol</summary>
            <div className="inside stack">
              <p className="hint">
                Son roles predefinidos. Puedes cambiar el rol de cada persona en
                su ficha y aplicarlo con «Guardar».
              </p>
              <div
                className="roles-guide-choices"
                role="group"
                aria-label="Roles disponibles"
              >
                {[
                  "USER",
                  "OBSERVER",
                  "ADVISOR",
                  "SUPERVISOR",
                  "ADMIN",
                  "OWNER",
                ].map((role) => (
                  <button
                    type="button"
                    key={role}
                    aria-pressed={guideRole === role}
                    onClick={() => setGuideRole(role)}
                  >
                    {roleLabels[role]}
                  </button>
                ))}
              </div>
              <section className="roles-guide-description" aria-live="polite">
                <h3>{roleLabels[guideRole]}</h3>
                <p>{roleDescriptions[guideRole]}</p>
                <ul>
                  {roleAbilities[guideRole].map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>
              <dl className="roles-guide-concepts">
                <div>
                  <dt>Rol</dt>
                  <dd>Define las funciones generales de la cuenta.</dd>
                </div>
                <div>
                  <dt>Compartir</dt>
                  <dd>
                    Concede acceso a Meta Ads o Efectividad y decide si puede
                    ver o editar. Compartir una hoja no abre las demás.
                  </dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>
                    Define cuotas y condiciones de uso; no sustituye los
                    permisos.
                  </dd>
                </div>
              </dl>
              <p className="hint">
                La etiqueta comercial «Supervisora» dentro de Asesores no cambia
                el rol de la cuenta. Los accesos de Meta Ads y Efectividad se
                administran desde Compartir.
              </p>
            </div>
          </details>
          <details className="panel">
            <summary>Crear usuario o administrador</summary>
            <form
              className="inside stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = Object.fromEntries(new FormData(form));
                void run(async () => {
                  await api("users", "POST", data);
                  form.reset();
                  setCreateRole("USER");
                });
              }}
            >
              <label>
                Nombre
                <input name="name" required maxLength={100} />
              </label>
              <label>
                Correo electrónico
                <input name="email" type="email" required autoComplete="off" />
              </label>
              <label>
                Contraseña inicial · mínimo 12 caracteres
                <PasswordInput
                  name="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Rol
                <select
                  name="role"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
                <small className="user-role-description">
                  {roleDescriptions[createRole]}
                </small>
              </label>
              <p className="hint">
                La cuenta quedará aprobada. Entrega sus datos de acceso por un
                canal privado; la contraseña no se mostrará después de
                guardarse.
              </p>
              <button disabled={busy}>Crear cuenta</button>
            </form>
          </details>

          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <section className="panel users-table-panel">
            <div className="users-table-toolbar">
              <strong>
                {archived ? "Cuentas retiradas" : "Equipo"} · {users.length}
              </strong>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void refresh().catch((e) => setMessage(e.message))
                }
              >
                ↻ Actualizar
              </button>
              {isOwner && (
                <label>
                  <input
                    type="checkbox"
                    checked={archived}
                    disabled={busy}
                    onChange={(e) => setArchived(e.target.checked)}
                  />{" "}
                  Mostrar retirados
                </label>
              )}
            </div>
            <div className="users-table-scroll">
              <table className="users-table">
                <colgroup>
                  <col className="user-person" />
                  <col className="user-role" />
                  <col className="user-status" />
                  {isOwner && (
                    <>
                      <col className="user-plan" />
                      <col className="user-expiry" />
                    </>
                  )}
                  <col className="user-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    {isOwner && (
                      <>
                        <th>Plan de IA</th>
                        <th>Vigencia IA</th>
                      </>
                    )}
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} data-user-row={u.id}>
                      <th scope="row">
                        <strong>{u.name}</strong>
                        <small title={u.email}>{u.email}</small>
                      </th>
                      <td>
                        <select
                          data-user-role={u.role}
                          aria-label={"Rol de " + u.name}
                          title={roleDescriptions[u.role]}
                          value={u.role}
                          disabled={busy || archived}
                          onChange={(e) =>
                            change(u.id, { role: e.target.value })
                          }
                        >
                          {roles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          data-user-status={u.status}
                          aria-label={"Estado de " + u.name}
                          value={u.status}
                          disabled={busy || archived}
                          onChange={(e) =>
                            change(u.id, { status: e.target.value })
                          }
                        >
                          {[
                            ["PENDING", "Pendiente"],
                            ["APPROVED", "Aprobado"],
                            ["REJECTED", "Rechazado"],
                            ["SUSPENDED", "Suspendido"],
                          ].map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      {isOwner && (
                        <>
                          <td>
                            <select
                              aria-label={"Plan de IA de " + u.name}
                              value={
                                u.aiAccessEnabled === false
                                  ? "NO_AI"
                                  : (u.planId ?? "")
                              }
                              disabled={busy || archived}
                              onChange={(e) =>
                                change(u.id, {
                                  aiAccessEnabled: e.target.value !== "NO_AI",
                                  planId:
                                    e.target.value === "NO_AI"
                                      ? null
                                      : e.target.value || null,
                                  ...(e.target.value === "NO_AI" ||
                                  !e.target.value
                                    ? { planValidUntil: null }
                                    : {}),
                                })
                              }
                            >
                              <option value="NO_AI">Sin IA</option>
                              <option value="">Sin plan · acceso previo</option>
                              {u.planId &&
                                !plans.some((p) => p.id === u.planId) && (
                                  <option value={u.planId}>
                                    {u.plan ? planLabel(u.plan) : u.planId} ·
                                    retirado
                                  </option>
                                )}
                              {plans
                                .filter(
                                  (p) =>
                                    !p.customUserId || p.customUserId === u.id,
                                )
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {planLabel(p)}
                                    {p.id === "ILIMITADO"
                                      ? " · solo interno"
                                      : ""}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="date"
                              aria-label={"Vigencia IA de " + u.name}
                              title="Solo afecta al plan de IA; no al acceso de Meta o Efectividad."
                              disabled={
                                busy || archived || u.aiAccessEnabled === false
                              }
                              value={
                                u.planValidUntil
                                  ? new Intl.DateTimeFormat("en-CA", {
                                      timeZone: "America/Lima",
                                      year: "numeric",
                                      month: "2-digit",
                                      day: "2-digit",
                                    }).format(new Date(u.planValidUntil))
                                  : ""
                              }
                              onChange={(e) =>
                                change(u.id, {
                                  planValidUntil: e.target.value
                                    ? e.target.value + "T23:59:59.000-05:00"
                                    : null,
                                })
                              }
                            />
                          </td>
                        </>
                      )}
                      <td>
                        <div className="users-row-actions">
                          {archived ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(() =>
                                  api("users/" + u.id + "/restore", "POST", {}),
                                )
                              }
                            >
                              Restaurar ficha
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="primary"
                                disabled={busy}
                                aria-label={"Guardar " + u.name}
                                onClick={() => void save(u)}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                aria-label={"Más acciones de " + u.name}
                                disabled={busy}
                                onClick={() => setActions(u.id)}
                              >
                                ⋯
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small className="hint">
              «Sin IA» bloquea los módulos de imágenes. «Acceso previo» conserva
              la compatibilidad de cuentas antiguas. Meta Ads y Efectividad se
              conceden desde Compartir.
            </small>
          </section>
          {active && (
            <UserActions
              account={active}
              busy={busy}
              isOwner={isOwner}
              run={run}
              onClose={() => setActions(null)}
              onRemove={() => {
                setActions(null);
                setRemoving(active);
              }}
              onShare={(scope) => {
                setActions(null);
                setSharing({ userId: active.id, name: active.name, scope });
              }}
            />
          )}
          {removing && (
            <RemoveAccount
              account={removing}
              busy={busy}
              onClose={() => setRemoving(null)}
              onConfirm={() =>
                void run(async () => {
                  const r = await api("users/" + removing.id, "DELETE");
                  setRemoving(null);
                  if (r.closesOwnSession) window.location.reload();
                })
              }
            />
          )}
          {sharing && (
            <MetaWorkspaceSharing
              targetUserId={sharing.userId}
              targetName={sharing.name}
              scope={sharing.scope}
              onClose={() => setSharing(null)}
            />
          )}
        </>
      )}
    </>
  );
}
function UserActions({
  account: u,
  busy,
  isOwner,
  run,
  onClose,
  onRemove,
  onShare,
}: {
  account: Account;
  busy: boolean;
  isOwner: boolean;
  run: (f: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onRemove: () => void;
  onShare: (scope?: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [link, setLink] = useState(""),
    [info, setInfo] = useState(""),
    [working, setWorking] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const recovery = async (email: boolean) => {
    setWorking(true);
    setInfo("");
    try {
      const r = await api(
        "users/" + u.id + (email ? "/recovery-email" : "/recovery"),
        "POST",
        {},
      );
      if (email) setInfo(r.message);
      else {
        setLink(location.origin + "/#recuperar=" + encodeURIComponent(r.token));
        setInfo("Enlace de un solo uso · válido durante 30 minutos.");
      }
    } catch (e) {
      setInfo((e as Error).message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className="user-actions-dialog"
      aria-label={"Acciones de " + u.name}
      onCancel={(e) => {
        if (busy || working) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <div>
          <h2>{u.name}</h2>
          <small>{u.email}</small>
        </div>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy || working}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      {isOwner && u.role !== "OWNER" && (
        <section>
          <h3>Accesos compartidos</h3>
          <div className="row">
            <button
              type="button"
              disabled={busy || working}
              onClick={() => onShare()}
            >
              ▥ Meta Ads
            </button>
            <button
              type="button"
              disabled={busy || working}
              onClick={() => onShare("ALL")}
            >
              ▤ Efectividad
            </button>
          </div>
          <small>Comparte aquí sin cambiar el rol ni el plan de IA.</small>
        </section>
      )}
      <section>
        <AccountEmailEditor
          account={u}
          busy={busy}
          run={run}
          skipProof={isOwner}
        />
      </section>
      {isOwner && (
        <section>
          <h3>🔑 Cambiar contraseña</h3>
          <small>
            La contraseña anterior no se puede recuperar. Escribe una nueva;
            puedes verla mientras la introduces.
          </small>
          <form
            className="row user-password-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void run(async () => {
                const r = await api("users/" + u.id + "/password", "POST", {
                  newPassword: new FormData(form).get("newPassword"),
                });
                form.reset();
                if (r.closesOwnSession) window.location.reload();
              });
            }}
          >
            <PasswordInput
              name="newPassword"
              aria-label={"Nueva contraseña de " + u.name}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
            <button type="submit" disabled={busy || working}>
              Establecer nueva contraseña
            </button>
          </form>
        </section>
      )}
      {isOwner && (
        <section>
          <h3>Recuperación</h3>
          <div className="row">
            <button
              type="button"
              disabled={busy || working}
              onClick={() => void recovery(false)}
            >
              ↗ Generar enlace
            </button>
            <button
              type="button"
              disabled={busy || working}
              onClick={() => void recovery(true)}
            >
              ✉ Enviar por correo
            </button>
          </div>
          {link && (
            <label>
              Enlace privado
              <input
                aria-label="Enlace de recuperación"
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => setInfo("Enlace copiado."))
                    .catch(() => setInfo("Selecciona y copia el enlace."))
                }
              >
                Copiar enlace
              </button>
            </label>
          )}
          {info && <p role="status">{info}</p>}
        </section>
      )}
      {!isOwner && (
        <section>
          <RecoveryIssuer userId={u.id} name={u.name} />
        </section>
      )}
      {isOwner && (
        <footer>
          <button
            type="button"
            className="danger"
            disabled={busy || working}
            onClick={onRemove}
          >
            🗑 Eliminar usuario…
          </button>
        </footer>
      )}
    </dialog>
  );
}
function RemoveAccount({
  account,
  busy,
  onClose,
  onConfirm,
}: {
  account: Account;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="user-remove-dialog"
      aria-label="Confirmar eliminación de usuario"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <h2>¿Eliminar esta cuenta?</h2>
      <p>
        <strong>{account.name}</strong>
        <br />
        {account.email}
      </p>
      <p>
        Se retirará de la lista y se cerrarán sus sesiones. Su historial se
        conserva y la ficha podrá restaurarse.
      </p>
      {account.role === "OWNER" && (
        <p className="notice">
          Esta cuenta es OWNER. El último OWNER activo no se puede eliminar.
        </p>
      )}
      <footer>
        <button type="button" autoFocus disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={onConfirm}
        >
          Eliminar cuenta
        </button>
      </footer>
    </dialog>
  );
}
function AccountEmailEditor({
  account,
  busy,
  run,
  skipProof = false,
}: {
  skipProof?: boolean;
  account: Account;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [expectedEmail, setExpectedEmail] = useState(account.email);
  return (
    <div>
      <div className="account-email-heading">
        <span>{account.email}</span>
        <button
          type="button"
          disabled={busy}
          aria-expanded={editing}
          aria-label={`Editar correo de ${account.name}`}
          onClick={() => {
            setExpectedEmail(account.email);
            setEditing(!editing);
          }}
        >
          ✎ Editar correo
        </button>
      </div>
      {editing && (
        <form
          className="inside stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              data = new FormData(form);
            void run(async () => {
              const result = await api(`users/${account.id}/email`, "PATCH", {
                email: data.get("email"),
                expectedEmail,
                ...(!skipProof
                  ? { currentPassword: data.get("currentPassword") }
                  : {}),
              });
              form.reset();
              setEditing(false);
              if (result.closesOwnSession) window.location.reload();
            });
          }}
        >
          <label>
            Nuevo correo de {account.name}
            <input
              name="email"
              type="email"
              defaultValue={expectedEmail}
              required
              maxLength={200}
              disabled={busy}
              autoComplete="off"
            />
          </label>
          {!skipProof && (
            <label>
              Tu contraseña actual
              <PasswordInput
                name="currentPassword"
                required
                minLength={12}
                maxLength={128}
                disabled={busy}
                autoComplete="current-password"
              />
            </label>
          )}
          <small>
            Usarás el nuevo correo para iniciar sesión. Al cambiar el de tu
            propia cuenta, volverás a ingresar.
          </small>
          <div className="account-email-actions">
            <button type="submit" disabled={busy}>
              Guardar correo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
