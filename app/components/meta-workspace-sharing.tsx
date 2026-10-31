"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { matchesSearchWords } from "../../lib/search";
type Permission = "VIEW" | "EDIT";
type Person = { id: string; name: string; email: string; role: string };
type Grant = { userId: string; permission: Permission };
type Data = {
  revision: number;
  users: Person[];
  grants: Grant[];
  name?: string;
  inherited?: Grant[];
};
export function MetaWorkspaceSharing({
  pinnedAccountIds = [],
  scope,
  targetUserId,
  targetName,
  onClose,
}: {
  pinnedAccountIds?: string[];
  scope?: string;
  targetUserId?: string;
  targetName?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<Data | null>(null),
    [grants, setGrants] = useState<Grant[]>([]),
    [query, setQuery] = useState(targetName ?? ""),
    [permission, setPermission] = useState<Permission>("VIEW"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    void api(
      scope
        ? "meta-ads/effectiveness-sharing?scope=" + encodeURIComponent(scope)
        : "meta-ads/sharing",
    )
      .then((result: Data) => {
        if (live) {
          setData(result);
          setGrants(result.grants);
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [scope]);
  const eligible = data?.users.filter((u) => u.role !== "OWNER") ?? [],
    matches = eligible.filter(
      (u) =>
        (!targetUserId || u.id === targetUserId) &&
        !grants.some((g) => g.userId === u.id) &&
        matchesSearchWords(u.name + " " + u.email, query),
    );
  return (
    <dialog
      ref={ref}
      className="meta-workspace-sharing panel"
      aria-label={scope ? "Compartir Efectividad" : "Compartir Meta Ads"}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <div>
          <h2>
            Compartir {scope ? (data?.name ?? "Efectividad") : "Meta Ads"}
          </h2>
          <p>
            Decide quién puede consultar el rendimiento y quién puede
            administrar Meta Ads.
          </p>
        </div>
        <button
          type="button"
          className="ui-close-button"
          aria-label={
            scope ? "Cerrar compartir Efectividad" : "Cerrar compartir Meta Ads"
          }
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {!data ? (
        <p role="status">{message || "Cargando personas y accesos…"}</p>
      ) : (
        <>
          {targetUserId && (
            <p>
              <strong>{targetName}</strong> ·{" "}
              {scope ? "Todas las hojas de Efectividad" : "Meta Ads"}
              <br />
              <small>
                Los demás accesos se conservan. Quitar el acceso global de
                Efectividad no retira permisos individuales por hoja.
              </small>
            </p>
          )}
          {targetUserId && (
            <label>
              Permiso inicial
              <select
                aria-label="Permiso inicial"
                value={permission}
                disabled={busy}
                onChange={(e) => setPermission(e.target.value as Permission)}
              >
                <option value="VIEW">Puede ver</option>
                <option value="EDIT">Puede editar</option>
              </select>
            </label>
          )}
          {!targetUserId && (
            <div className="meta-share-bulk">
              <div>
                <strong>Compartir con todos los usuarios</strong>
                <small>
                  Incluye las {eligible.length} cuentas habilitadas actuales.
                  Los OWNER ya tienen acceso.
                </small>
              </div>
              <select
                aria-label="Permiso para todos los usuarios"
                value={permission}
                disabled={busy}
                onChange={(e) => setPermission(e.target.value as Permission)}
              >
                <option value="VIEW">Puede ver</option>
                <option value="EDIT">Puede editar</option>
              </select>
              <button
                type="button"
                disabled={busy || !eligible.length}
                onClick={() => {
                  setGrants(
                    eligible.map((u) => ({ userId: u.id, permission })),
                  );
                  setMessage(
                    "Selección preparada para todos. Guarda para aplicar los permisos.",
                  );
                }}
              >
                Compartir con todos
              </button>
            </div>
          )}
          <label>
            Buscar por nombre o correo
            <input
              type="search"
              value={query}
              disabled={busy}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe para añadir una persona…"
            />
          </label>
          {query.trim() && (
            <div
              className="meta-share-suggestions"
              aria-label="Personas disponibles"
            >
              {matches.length ? (
                matches.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setGrants((old) => [
                        ...old,
                        { userId: u.id, permission },
                      ]);
                      setQuery("");
                    }}
                  >
                    <strong>{u.name}</strong>
                    <span>{u.email}</span>
                    <small>
                      Añadir ·{" "}
                      {permission === "EDIT" ? "Puede editar" : "Puede ver"}
                    </small>
                  </button>
                ))
              ) : (
                <p>
                  No hay personas disponibles que coincidan. Usa una cuenta
                  habilitada de la plataforma.
                </p>
              )}
            </div>
          )}
          <section
            className="meta-share-people"
            aria-label="Personas con acceso"
          >
            {data.users
              .filter((u) => !targetUserId && u.role === "OWNER")
              .map((u) => (
                <div className="meta-share-person" key={u.id}>
                  <div>
                    <strong>{u.name}</strong>
                    <small>{u.email}</small>
                  </div>
                  <span>OWNER · acceso completo</span>
                </div>
              ))}
            {grants
              .filter((g) => !targetUserId || g.userId === targetUserId)
              .map((g) => {
                const u = data.users.find((u) => u.id === g.userId);
                return (
                  <div className="meta-share-person" key={g.userId}>
                    <div>
                      <strong>{u?.name ?? "Cuenta no habilitada"}</strong>
                      <small>
                        {u?.email ?? "Retira este acceso antes de guardar."}
                      </small>
                    </div>
                    <select
                      aria-label={`Permiso de ${u?.name ?? g.userId}`}
                      value={g.permission}
                      disabled={busy}
                      onChange={(e) =>
                        setGrants((old) =>
                          old.map((x) =>
                            x.userId === g.userId
                              ? {
                                  ...x,
                                  permission: e.target.value as Permission,
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <option value="VIEW">Puede ver</option>
                      <option value="EDIT">Puede editar</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Quitar acceso compartido de ${u?.name ?? g.userId}`}
                      disabled={busy}
                      onClick={() =>
                        setGrants((old) =>
                          old.filter((x) => x.userId !== g.userId),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            {!grants.length && (
              <p>
                Solo los OWNER tienen acceso completo. Añade personas o comparte
                con todos.
              </p>
            )}
          </section>
          {!!data.inherited?.length && (
            <aside className="notice">
              <strong>Acceso desde toda Efectividad</strong>
              {data.inherited.map((g) => (
                <p key={g.userId}>
                  {data.users.find((u) => u.id === g.userId)?.name ?? "Usuario"}{" "}
                  · {g.permission === "EDIT" ? "Puede editar" : "Puede ver"}{" "}
                  (heredado)
                </p>
              ))}
              <small>
                Para retirar un acceso heredado, abre Compartir junto al título
                Efectividad.
              </small>
            </aside>
          )}
          {scope ? (
            <div className="meta-share-help">
              <p>
                <strong>Puede ver:</strong> consultar la información y usar
                filtros, sin guardar cambios.
              </p>
              <p>
                <strong>Puede editar:</strong> modificar los datos de{" "}
                {scope === "ALL"
                  ? "todas las pestañas y hojas de Efectividad"
                  : "esta hoja"}
                .
              </p>
              <small>
                {scope === "ALL"
                  ? "Incluye todas las pestañas y hojas de Efectividad."
                  : "Compartir esta hoja no concede acceso a las demás."}{" "}
                El rol general no cambia y no se envían correos automáticamente.
              </small>
            </div>
          ) : (
            <div className="meta-share-help">
              <p>
                <strong>Puede ver:</strong> Rendimiento y cuentas fijadas, sin
                conexiones, sincronización, alertas ni edición.
              </p>
              <p>
                <strong>Puede editar:</strong> también conexiones, cuentas
                publicitarias, sincronización, alertas y acciones de activar o
                pausar anuncios.
              </p>
              <small>
                Las cuentas fijadas y principales se comparten y se actualizan
                para todos los usuarios con acceso. El rol general de la persona
                no cambia. No se envían correos automáticamente. Los permisos
                que ya existan por cuenta se conservan.
              </small>
            </div>
          )}
          {message && (
            <p role="status" className="notice">
              {message}
            </p>
          )}
          <footer className="row">
            <span>
              {grants.length} persona{grants.length === 1 ? "" : "s"} con acceso
              compartido
            </span>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage("");
                void api(
                  scope ? "meta-ads/effectiveness-sharing" : "meta-ads/sharing",
                  "PUT",
                  {
                    revision: data.revision,
                    grants,
                    ...(scope ? { scope } : { pinnedAccountIds,...(targetUserId?{preservePins:true}:{}) }),
                  },
                )
                  .then(onClose)
                  .catch((e) => setMessage(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Guardando…" : "Guardar accesos"}
            </button>
          </footer>
        </>
      )}
    </dialog>
  );
}
