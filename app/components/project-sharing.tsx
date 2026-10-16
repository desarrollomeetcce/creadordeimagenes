"use client";
import { useEffect, useState } from "react";

type Member = {
  userId: string;
  permission: string;
  user: { name: string; email: string; status: string; role: string };
};
const permissions = [
  ["VIEW", "Ver y descargar"],
  ["GENERATE", "Ver, descargar y generar"],
  ["EDIT", "Ver, generar y editar"],
  ["MANAGE", "Administrar contenido"],
];
export function ProjectSharing({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function request(path = "", method = "GET", data?: unknown) {
    const r = await fetch(`/api/projects/${projectId}/members${path}`, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const b = await r.json();
    if (!r.ok)
      throw new Error(b.error ?? "No se pudieron administrar los accesos.");
    return b;
  }
  async function refresh() {
    setMembers((await request()).members);
    setReady(true);
  }
  useEffect(() => {
    let active = true;
    setReady(false);
    request()
      .then((b) => {
        if (active) {
          setMembers(b.members);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function change(path: string, method: string, data?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await request(path, method, data);
      await refresh();
      setMessage("Accesos actualizados.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack" aria-label="Accesos del proyecto">
      <h3>Accesos del proyecto</h3>
      <p className="hint">
        El creador y el OWNER administran los accesos. Los permisos se extienden
        a las categorías, subproductos y afiches. El OWNER conserva el acceso
        global. Un ADMIN también puede consultar los proyectos de cuentas USER
        por su rol; retirar su colaboración elimina los permisos adicionales
        concedidos aquí.
      </p>
      {ready && (
        <>
          <form
            className="fields"
            onSubmit={(e) => {
              e.preventDefault();
              const data = Object.fromEntries(new FormData(e.currentTarget));
              void change("", "POST", data);
            }}
          >
            <label>
              Correo del usuario aprobado
              <input name="email" type="email" required disabled={busy} />
            </label>
            <label>
              Permiso
              <select name="permission" disabled={busy}>
                {permissions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Conceder acceso</button>
          </form>
          {!members.length && <p>No hay colaboradores adicionales.</p>}
          {members.map((m) => (
            <div key={m.userId} className="card stack">
              <strong>{m.user.name}</strong>
              <span>
                {m.user.email} ·{" "}
                {m.user.status === "APPROVED"
                  ? "Cuenta aprobada"
                  : "Cuenta sin acceso activo"}
              </span>
              {m.user.role === "OWNER" && (
                <p className="hint">
                  Esta cuenta también tiene acceso global por su rol OWNER.
                  Retirar la colaboración no elimina ese acceso.
                </p>
              )}
              <label>
                Permiso de {m.user.email}
                <select
                  value={m.permission}
                  disabled={busy || m.user.status !== "APPROVED"}
                  onChange={(e) =>
                    void change("/" + m.userId, "PATCH", {
                      permission: e.target.value,
                    })
                  }
                >
                  {permissions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `¿Revocar la colaboración de ${m.user.email}? Sus archivos y trabajos se conservarán; se volverán a comprobar sus permisos antes de generar.`,
                    )
                  )
                    void change("/" + m.userId, "DELETE");
                }}
              >
                Revocar acceso de {m.user.name}
              </button>
            </div>
          ))}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
