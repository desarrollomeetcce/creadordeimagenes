"use client";
import { useCallback, useEffect, useState } from "react";
import { RecoveryIssuer } from "./account-security";
import { planLabel } from "../../lib/plan-label";
import { roleLabels } from "../../lib/roles";
type Account = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
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
  if (!r.ok) throw new Error(b.error || "No se pudo guardar.");
  return b;
}
export function UsersPanel({ isOwner }: { isOwner: boolean }) {
  const [users, setUsers] = useState<Account[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [plans, setPlans] = useState<
    { id: string; name: string; customUserId?: string | null }[]
  >([]);
  useEffect(() => {
    if (isOwner)
      void api("plans")
        .then(setPlans)
        .catch((e) => setMessage(e.message));
  }, [isOwner]);
  const refresh = useCallback(async () => setUsers(await api("users")), []);
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, [refresh]);
  const roles = isOwner
    ? ["USER", "OBSERVER", "ADMIN", "OWNER"]
    : ["USER", "OBSERVER"];
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage("Cambios guardados.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Usuarios</h1>
      <p>
        Los permisos se definen por el rol y se aplican automáticamente a los
        proyectos compartidos. Solo el OWNER administra cuentas OWNER y
        Administrador.
      </p>
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
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            Rol
            <select name="role">
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            La cuenta quedará aprobada. Entrega sus datos de acceso por un canal
            privado; la contraseña no se mostrará después de guardarse.
          </p>
          <button disabled={busy}>Crear cuenta</button>
        </form>
      </details>
      {users.map((u) => (
        <article key={u.id} className="panel stack">
          <h3>{u.name}</h3>
          <span>{u.email}</span>
          <div className="fields">
            <label>
              Rol de {u.name}
              <select
                value={u.role}
                disabled={busy}
                onChange={(e) =>
                  setUsers((current) =>
                    current.map((x) =>
                      x.id === u.id ? { ...x, role: e.target.value } : x,
                    ),
                  )
                }
              >
                {roles.map((role) => (
                  <option value={role} key={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado de {u.name}
              <select
                value={u.status}
                disabled={busy}
                onChange={(e) =>
                  setUsers((current) =>
                    current.map((x) =>
                      x.id === u.id ? { ...x, status: e.target.value } : x,
                    ),
                  )
                }
              >
                {[
                  ["PENDING", "Pendiente"],
                  ["APPROVED", "Aprobado"],
                  ["REJECTED", "Rechazado"],
                  ["SUSPENDED", "Suspendido"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {isOwner && (
            <div className="fields">
              <label>
                Plan de {u.name}
                <select
                  value={u.planId ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setUsers((current) =>
                      current.map((x) =>
                        x.id === u.id
                          ? { ...x, planId: e.target.value || null }
                          : x,
                      ),
                    )
                  }
                >
                  <option value="">Sin plan asignado · acceso previo</option>
                  {u.planId && !plans.some((p) => p.id === u.planId) && (
                    <option value={u.planId}>
                      {u.plan ? planLabel(u.plan) : u.planId} · retirado
                    </option>
                  )}
                  {plans
                    .filter((p) => !p.customUserId || p.customUserId === u.id)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {planLabel(p)}
                        {p.id === "ILIMITADO" ? " · solo interno" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Válido hasta · opcional
                <input
                  type="date"
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
                    setUsers((current) =>
                      current.map((x) =>
                        x.id === u.id
                          ? {
                              ...x,
                              planValidUntil: e.target.value
                                ? e.target.value + "T23:59:59.000-05:00"
                                : null,
                            }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    api("users/" + u.id + "/plan", "PUT", {
                      planId: u.planId ?? null,
                      validUntil: u.planValidUntil
                        ? new Date(u.planValidUntil).toISOString()
                        : null,
                    }),
                  )
                }
              >
                Guardar plan
              </button>
            </div>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(() =>
                api("users/" + u.id, "PATCH", {
                  role: u.role,
                  status: u.status,
                }),
              )
            }
          >
            Guardar rol y estado
          </button>
          <RecoveryIssuer userId={u.id} name={u.name} />
          {isOwner && (
            <details>
              <summary>Cambiar contraseña de {u.name}</summary>
              <form
                className="inside stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = Object.fromEntries(new FormData(form));
                  void run(async () => {
                    const result = await api(
                      `users/${u.id}/password`,
                      "POST",
                      data,
                    );
                    form.reset();
                    if (result.closesOwnSession) window.location.reload();
                  });
                }}
              >
                <label>
                  Tu contraseña actual de OWNER
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={12}
                  />
                </label>
                <label>
                  Nueva contraseña para {u.name}
                  <input
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <p className="hint">
                  Se cerrarán las sesiones de esta cuenta y se invalidarán sus
                  enlaces de recuperación anteriores.
                </p>
                <button disabled={busy}>Establecer nueva contraseña</button>
              </form>
            </details>
          )}
        </article>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </>
  );
}
