"use client";
import { useEffect, useState,useRef } from "react";
import { roleLabels } from "../../lib/roles";
import { SearchSelect } from "./search-select";
type Member = {
  subproductCount?:number;
  userId: string;
  user: { name: string; email: string; status: string; role: string };
};
export function ProjectSharing({
  projectId,
  scope = "project", subproductIds,
}: {
  projectId: string;
  subproductIds?:string[];
  scope?: "project" | "category" | "subproduct";
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [email, setEmail] = useState(""),
    [users, setUsers] = useState<
      { id: string; name: string; email: string; role: string }[]
    >([]),
    [searching, setSearching] = useState(true),
    [hasMore, setHasMore] = useState(false);
  const [allAdmins, setAllAdmins] = useState(false),
    [canSetAdmins, setCanSetAdmins] = useState(false);
  const title =
    scope === "project"
      ? "proyecto"
      : scope === "category"
        ? "producto"
        : "subproducto";
  const batch=!!subproductIds?.length;
  const selectionQuery=batch?"ids="+encodeURIComponent(subproductIds!.join(",")):"";
  const root = batch?`/api/categories/${projectId}/subproduct-members`:`/api/${scope === "project" ? "projects" : scope === "category" ? "categories" : "subproducts"}/${projectId}/members`;
  async function request(path = "", method = "GET", data?: unknown) {
    const r = await fetch(root + path+(selectionQuery?"?"+selectionQuery:""), {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const b = await r.json();
    if (!r.ok)
      throw Error(b.error || "No se pudieron administrar los accesos.");
    return b;
  }
  function loaded(b: any) {
    setMembers(b.members);
    setAllAdmins(b.allAdministrators);
    setCanSetAdmins(b.canSetAdministrators);
    setReady(true);
  }
  const generation=useRef(0);
  useEffect(() => {
    generation.current++;setReady(false);setMessage("");
    let active = true;
    void request()
      .then((b) => {
        if (active) loaded(b);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [root,selectionQuery]);
  useEffect(() => {
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void fetch(root + "/directory?"+(selectionQuery?selectionQuery+"&":"")+"q=" + encodeURIComponent(email), {
        signal: controller.signal,
      })
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw Error(b.error || "No se pudieron buscar cuentas.");
          if (!controller.signal.aborted) {
            setUsers(b.users);
            setHasMore(b.hasMore);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [root, email,selectionQuery]);
  async function change(path: string, method: string, data?: unknown) {
    const version=generation.current;
    setBusy(true);
    setMessage("");
    try {
      await request(path, method, data);
      const next=await request();
      if(version===generation.current){loaded(next);setMessage("Accesos actualizados.");}
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack" aria-label={"Accesos del " + title}>
      <h3>{batch?`Accesos de ${subproductIds!.length} subproductos seleccionados`:`Accesos del ${title}`}</h3>
      <p>
        Selecciona una cuenta o escribe su correo. Su rol determina las
        acciones: Usuario y Administrador pueden ver, descargar, editar y
        generar; Observador solo ve y descarga. El acceso a este {title} se
        extiende a su contenido. Los permisos heredados de un nivel superior se
        retiran en ese nivel. OWNER conserva acceso completo.
      </p>
      {ready && (
        <>
          {scope === "project" && canSetAdmins && (
            <label className="row">
              <input
                type="checkbox"
                checked={allAdmins}
                disabled={busy}
                onChange={(e) =>
                  void change("", "PATCH", {
                    allAdministrators: e.target.checked,
                  })
                }
              />
              Acceso a todos los administradores · ver, descargar, editar y
              generar
            </label>
          )}
          {scope === "project" && (
            <p className="hint">
              {allAdmins
                ? "El OWNER ha habilitado el acceso de todos los administradores."
                : "El acceso grupal de administradores está desactivado. Solo acceden por propiedad o asignación explícita."}{" "}
              Desactivar este grupo conserva la propiedad y las asignaciones
              individuales.
            </p>
          )}
          <form
            className="fields"
            onSubmit={(e) => {
              e.preventDefault();
              void change("", "POST", { email: email.trim() });
            }}
          >
            <SearchSelect
              label="Cuenta o correo electrónico"
              name="email"
              value={email}
              onChange={setEmail}
              onSelect={(option) => setEmail(option.id)}
              required
              disabled={busy}
              loading={searching}
              hasMore={hasMore}
              options={["OWNER", "ADMIN", "USER", "OBSERVER"].flatMap((role) =>
                users
                  .filter((u) => u.role === role)
                  .map((u) => ({
                    id: u.email,
                    label: u.name,
                    detail: u.email,
                    search: u.email,
                    group: roleLabels[role],
                  })),
              )}
            />
            <button disabled={busy || !email.trim()}>Conceder acceso</button>
          </form>
          {!members.length && <p>No hay colaboradores adicionales.</p>}
          {members.map((m) => (
            <div key={m.userId} className="card stack">
              <strong>{m.user.name}</strong>
              {batch&&<span>Acceso directo en {m.subproductCount} de {subproductIds!.length} seleccionados.</span>}
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
                      `¿Retirar la asignación directa de ${m.user.email}? Los accesos heredados o por propiedad se conservan.`,
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
