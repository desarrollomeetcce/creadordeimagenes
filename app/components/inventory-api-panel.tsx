"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
type List = { id: string; name: string; archivedAt?: string | null };
type Key = {
  id: string;
  name: string;
  mask: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lists: { list: List }[];
};
export function InventoryApiPanel({
  listId,
  onClose,
}: {
  listId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [keys, setKeys] = useState<Key[]>([]),
    [lists, setLists] = useState<List[]>([]),
    [chosen, setChosen] = useState<string[]>([listId]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [issued, setIssued] = useState<{ id: string; token: string } | null>(null),
    [show, setShow] = useState(false),
    [origin, setOrigin] = useState("");
  async function reload() {
    const r = await api("diploma-api/keys");
    setKeys(r.keys);
    setLists(r.lists);
  }
  useEffect(() => {
    dialog.current?.showModal();
    setOrigin(window.location.origin);
    let alive = true;
    void api("diploma-api/keys")
      .then((r) => {
        if (alive) {
          setKeys(r.keys);
          setLists(r.lists);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const endpoint =
    origin +
    "/api/v1/diplomados?" +
    new URLSearchParams({
      listId: chosen[0] ?? listId,
      page: "1",
      limit: "50",
    });
  const instructions = [
    "API privada de consulta de diplomados. Solo lectura.",
    "Guarda la clave como DIPLOMADOS_API_KEY en las variables secretas del servidor de la otra plataforma. No usar NEXT_PUBLIC ni incluirla en el navegador.",
    "GET " + origin + "/api/v1/inventarios devuelve las listas autorizadas.",
    "GET " + endpoint,
    "Cabecera: Authorization: Bearer <DIPLOMADOS_API_KEY>",
    "Parámetros: listId, q (búsqueda sin tildes/case), category (categoría exacta), id, page, limit (1–100).",
    "Respuesta: { data: [{ id, name, list: { id, name }, categories: { primary: [], secondary: [] } }], pagination: { page, limit, total, pages, hasMore } }.",
    "Recorre páginas mientras hasMore sea true. No interpretar un error como una lista vacía.",
    "401: clave inválida/vencida/revocada. 404: lista no autorizada. 429: espera Retry-After; máximo 600 solicitudes por 15 minutos por clave.",
    "No es una API de Meta ni ejecuta generación IA.",
  ].join("\n");
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copiado.");
    } catch {
      setError(
        "No se pudo copiar automáticamente. Selecciona el texto y cópialo.",
      );
    }
  }
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-api-panel"
      aria-label="API de diplomados"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2>API de diplomados</h2>
          <small>Solo lectura · conexión con tu otra plataforma</small>
        </div>
        <button
          type="button"
          className="ui-close-button"
          aria-label="Cerrar API de diplomados"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p>
        Autoriza las listas que podrá consultar tu servidor. Las claves no dan
        acceso a ventas, gastos ni campañas.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || issued) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await api("diploma-api/keys", "POST", {
              name: f.get("name"),
              listIds: chosen,
              expiresInDays: Number(f.get("expiresInDays")),
            });
            setIssued({ id: r.key.id, token: r.token });
            setShow(false);
            await reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="inventory-api-fields">
          <label>
            Nombre de la conexión
            <input
              name="name"
              placeholder="Mi otra plataforma"
              required
              maxLength={80}
              disabled={busy || !!issued}
            />
          </label>
          <label>
            Vencimiento
            <select
              name="expiresInDays"
              defaultValue="0"
              disabled={busy || !!issued}
            >
              <option value="0">Sin vencimiento · hasta revocar</option>
              <option value="30">30 días</option>
              <option value="90">90 días</option>
              <option value="365">Un año</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Listas autorizadas</legend>
          <div className="inventory-api-lists">
            {lists.map((list) => (
              <label key={list.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(list.id)}
                  disabled={busy || !!issued}
                  onChange={(e) =>
                    setChosen((ids) =>
                      e.target.checked
                        ? [...ids, list.id]
                        : ids.filter((id) => id !== list.id),
                    )
                  }
                />
                {list.name}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          className="primary"
          disabled={busy || !!issued || !chosen.length || chosen.length > 20}
        >
          Crear clave de consulta
        </button>
      </form>
      {issued && (
        <section className="inventory-api-issued" aria-label="Nueva clave API">
          <strong>Copia tu clave ahora: solo se muestra una vez.</strong>
          <input
            aria-label="Clave API recién creada"
            type={show ? "text" : "password"}
            readOnly
            value={issued.token}
            autoComplete="off"
          />
          <div className="row">
            <button type="button" onClick={() => void copy(issued.token)}>
              Copiar clave
            </button>
            <button type="button" onClick={() => setShow((v) => !v)}>
              {show ? "Ocultar" : "Mostrar"}
            </button>
            <button type="button" onClick={() => setIssued(null)}>
              Ya guardé la clave
            </button>
          </div>
        </section>
      )}
      <details>
        <summary>Conectar desde mi otra plataforma</summary>
        <p>
          Usa la clave en el servidor de destino. No hace falta cambiar permisos
          CORS ni exponerla a tus visitantes.
        </p>
        <pre>{endpoint}</pre>
        <button type="button" onClick={() => void copy(instructions)}>
          Copiar instrucciones para Codex
        </button>
        <pre>
          {'const response = await fetch("' +
            endpoint +
            '", {\n  headers: { Authorization: "Bearer " + process.env.DIPLOMADOS_API_KEY },\n  cache: "no-store"\n});\nif (!response.ok) throw new Error("No se pudo consultar el catálogo");\nconst result = await response.json();'}
        </pre>
      </details>
      <h3>Mis claves</h3>
      {keys.length === 0 ? (
        <p>Aún no has creado claves.</p>
      ) : (
        <div className="inventory-api-keys">
          {keys.map((key) => {
            const expired =
                !!key.expiresAt && new Date(key.expiresAt) <= new Date(),
              inactive = !!key.revokedAt || expired;
            return (
              <article key={key.id}>
                <div>
                  <strong>{key.name}</strong>
                  <small>
                    {key.mask} ·{" "}
                    {key.revokedAt
                      ? "Revocada"
                      : expired
                        ? "Vencida"
                        : "Activa"}
                  </small>
                  <small>
                    {key.lists
                      .map(
                        (x) =>
                          x.list.name +
                          (x.list.archivedAt ? " (archivada)" : ""),
                      )
                      .join(" · ")}
                  </small>
                  <small>
                    Última consulta:{" "}
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                        })
                      : "Sin uso"}
                  </small>
                </div>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || inactive}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api("diploma-api/keys/" + key.id, "DELETE");
                      if (issued?.id === key.id) setIssued(null);
                      await reload();
                      setNotice("Clave revocada.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revocar
                </button>
              </article>
            );
          })}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </dialog>
  );
}
