"use client";
import { useEffect, useState } from "react";
import { roleLabels } from "../../lib/roles";
type Member = {
  userId: string;
  user: { name: string; email: string; status: string; role: string };
};
export function ProjectSharing({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function request(path = "", method = "GET", data?: unknown) {
    const r = await fetch(`/api/projects/${projectId}/members${path}`, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const b = await r.json();
    if (!r.ok)
      throw new Error(b.error || "No se pudieron administrar los accesos.");
    return b;
  }
  useEffect(() => {
    let active = true;
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
      setMembers((await request()).members);
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
      <p>
        Comparte por correo. El rol definido en Usuarios determina
        automáticamente las acciones: Usuario y Administrador pueden editar y
        generar al ser asignados; Observador solo ve y descarga. OWNER conserva
        acceso completo y Administrador puede consultar todos los proyectos.
      </p>
      {ready && (
        <>
          <form
            className="fields"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void change("", "POST", Object.fromEntries(new FormData(form)));
            }}
          >
            <label>
              Correo del usuario aprobado
              <input name="email" type="email" required disabled={busy} />
            </label>
            <button disabled={busy}>Conceder acceso</button>
          </form>
          {!members.length && <p>No hay colaboradores adicionales.</p>}
          {members.map((m) => (
            <div key={m.userId} className="card stack">
              <strong>{m.user.name}</strong>
              <span>
                {m.user.email} · {roleLabels[m.user.role]}
              </span>
              <span>
                {m.user.role === "OBSERVER"
                  ? "Ver y descargar"
                  : "Permisos según su rol en Usuarios"}{" "}
                ·{" "}
                {m.user.status === "APPROVED"
                  ? "Cuenta aprobada"
                  : "Cuenta sin acceso activo"}
              </span>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `¿Retirar la asignación de ${m.user.email}? Los accesos globales de OWNER y Administrador se conservan.`,
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
