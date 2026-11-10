"use client";
import { useCallback, useEffect, useState } from "react";
type Render = {
  durationSeconds: number | null;
  sizeBytes: number | null;
  id: string;
  revision: number;
  resolution: string;
  status: string;
  progress: number;
  error: string | null;
  assetId: string | null;
};
type Upload = {
  id: string;
  renderId: string;
  status: string;
  remoteUri: string | null;
  uploadedBytes: number;
  totalBytes: number;
  error: string | null;
};
type Connection = {
  generation: string;
  revision: number;
  maskedToken: string;
  accountName: string;
};
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/courses-ai/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? "No se pudo completar la acción.");
  return data;
}
export function CourseDelivery({
  courseId,
  moduleId,
  revision,
  title,
  narrated,
  resolution,
}: {
  courseId: string;
  moduleId: string;
  revision: number;
  title: string;
  narrated: boolean;
  resolution: "720p" | "1080p";
}) {
  const path = courseId + "/modules/" + moduleId,
    [renders, setRenders] = useState<Render[]>([]),
    [uploads, setUploads] = useState<Upload[]>([]),
    [connection, setConnection] = useState<Connection | null>(null),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = useCallback(
    async (signal?: AbortSignal, includeConnection = false) => {
      const [r, v, c] = await Promise.all([
        api(path + "/renders", "GET", undefined, signal),
        api(path + "/vimeo", "GET", undefined, signal),
        includeConnection
          ? api("vimeo", "GET", undefined, signal)
          : Promise.resolve(null),
      ]);
      if (!signal?.aborted) {
        setRenders(r.renders);
        setAvailable(r.available);
        setUploads(v.uploads);
        if (c) setConnection(c.connection);
      }
    },
    [path],
  );
  useEffect(() => {
    const a = new AbortController();
    void refresh(a.signal, true).catch((e) => {
      if (!a.signal.aborted) setError(e.message);
    });
    return () => a.abort();
  }, [refresh, revision]);
  const pending =
    renders.some((r) => ["PENDING", "RUNNING"].includes(r.status)) ||
    uploads.some((r) =>
      ["PENDING", "CREATING", "UPLOADING"].includes(r.status),
    );
  useEffect(() => {
    if (!pending) return;
    const a = new AbortController();
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        if (document.visibilityState === "visible") await refresh(a.signal);
      } catch (e) {
        if (!a.signal.aborted) setError((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(tick, 4000);
      }
    };
    timer = setTimeout(tick, 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      a.abort();
    };
  }, [pending, refresh]);
  const current = renders.find(
      (r) => r.revision === revision && r.resolution === resolution,
    ),
    ready = current?.status === "COMPLETED" && current.assetId,
    upload = uploads.find((u) => u.renderId === current?.id);
  async function act(work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setMessage(success);
      await refresh(undefined, true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="classroom-delivery" aria-label="Video y Vimeo">
      <div className="course-toolbar">
        <strong>Tu videoclase</strong>
        <span className="classroom-badge">
          MP4 · {resolution} · 16:9 · servidor
        </span>
      </div>
      <p>
        La exportación continúa aunque cierres esta vista. Reutiliza la voz y
        los dibujos; no vuelve a llamar a la IA.
      </p>
      <div className="course-toolbar">
        <button
          type="button"
          className="course-primary"
          disabled={
            busy ||
            !narrated ||
            !available ||
            (!!current &&
              ["PENDING", "RUNNING", "COMPLETED"].includes(current.status))
          }
          onClick={() =>
            void act(
              () =>
                api(path + "/renders", "POST", {
                  requestId: crypto.randomUUID(),
                  revision,
                  resolution,
                }),
              "Exportación en cola del servidor.",
            )
          }
        >
          Preparar MP4 en servidor
        </button>
        {ready && (
          <a
            className="button"
            href={"/api/courses-ai/assets/" + current.assetId + "?download=1"}
            download={title + ".mp4"}
          >
            ↓ Descargar MP4
          </a>
        )}
        {ready && connection && (
          <button
            type="button"
            disabled={
              busy ||
              (!!upload &&
                [
                  "PENDING",
                  "CREATING",
                  "UPLOADING",
                  "COMPLETED",
                  "PAUSED",
                  "NEEDS_REVIEW",
                ].includes(upload.status))
            }
            onClick={() =>
              void act(
                () =>
                  api(path + "/vimeo", "POST", {
                    requestId: crypto.randomUUID(),
                    renderId: current.id,
                    connectionRevision: connection.revision,
                    connectionGeneration: connection.generation,
                  }),
                "Envío a Vimeo en cola.",
              )
            }
          >
            Enviar a Vimeo
          </button>
        )}
      </div>
      {!narrated && <small>Genera primero la voz de todas las escenas.</small>}
      {!available && (
        <small>
          Esta instalación necesita un worker con FFmpeg para exportar en
          servidor.
        </small>
      )}
      {current && (
        <div role="status">
          <b>
            {{
              PENDING: "En cola",
              RUNNING: "Preparando video",
              COMPLETED: "MP4 listo",
              FAILED: "Revisar exportación",
              CANCELLED: "Exportación detenida",
            }[current.status] ?? current.status}
          </b>
          {["RUNNING", "PENDING"].includes(current.status) && (
            <>
              <progress value={current.progress} max={100} />
              <span>{current.progress}%</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => api(path + "/renders/" + current.id, "DELETE"),
                    "Exportación detenida.",
                  )
                }
              >
                Detener
              </button>
            </>
          )}
          {current.durationSeconds != null && (
            <p>
              Duración real: {Math.floor(current.durationSeconds / 60)} min{" "}
              {Math.round(current.durationSeconds % 60)} s ·{" "}
              {((current.sizeBytes ?? 0) / 1048576).toFixed(1)} MB
            </p>
          )}
          {current.error && <p>{current.error}</p>}
        </div>
      )}
      {upload && (
        <div role="status">
          <b>
            {{
              PENDING: "Envío en cola",
              CREATING: "Preparando recepción en Vimeo",
              UPLOADING: "Subiendo a Vimeo",
              COMPLETED: "Transferido a Vimeo · puede seguir procesándose",
              PAUSED: "Envío pausado",
              NEEDS_REVIEW: "Revisar en Vimeo antes de repetir",
            }[upload.status] ?? upload.status}
          </b>
          {upload.totalBytes > 0 && (
            <progress value={upload.uploadedBytes} max={upload.totalBytes} />
          )}
          <p>{upload.error}</p>
          {[
            "PENDING",
            "CREATING",
            "UPLOADING",
            "PAUSED",
            "NEEDS_REVIEW",
          ].includes(upload.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  upload.status === "NEEDS_REVIEW" &&
                  !confirm(
                    "Revisa tu cuenta Vimeo antes de cerrar este intento: podría haberse creado un video. Cerrar el intento no lo elimina de Vimeo. ¿Ya lo revisaste?",
                  )
                )
                  return;
                void act(
                  () => api(path + "/vimeo/" + upload.id, "DELETE"),
                  "Envío detenido; no se borró ningún video en Vimeo.",
                );
              }}
            >
              Detener envío
            </button>
          )}
          {upload.status === "PAUSED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  () => api(path + "/vimeo/" + upload.id + "/resume", "POST"),
                  "Continuando el mismo video.",
                )
              }
            >
              Reintentar envío
            </button>
          )}
          {upload.remoteUri && /^\/videos\/\d+$/.test(upload.remoteUri) && (
            <a
              href={"https://vimeo.com/" + upload.remoteUri.split("/").pop()}
              target="_blank"
              rel="noreferrer"
            >
              Abrir en Vimeo ↗
            </a>
          )}
        </div>
      )}
      <details>
        <summary>
          {connection ? "Vimeo · " + connection.accountName : "Conectar Vimeo"}
        </summary>
        <p>
          Usa un token de tu cuenta Vimeo con permisos de lectura, subida y
          acceso a videos privados. La recepción depende de tu plan y
          autorización de API. Se envía como privado.
        </p>
        {connection && <p>Token guardado: {connection.maskedToken}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              token = String(new FormData(form).get("token") ?? "");
            void act(async () => {
              await api("vimeo", "POST", {
                token,
                revision: connection?.revision ?? 0,
              });
              form.reset();
            }, "Cuenta Vimeo verificada.");
          }}
        >
          <label>
            Token de Vimeo
            <input
              name="token"
              type="password"
              autoComplete="new-password"
              required
              minLength={20}
            />
          </label>
          <button disabled={busy}>Verificar y guardar</button>
        </form>
        {connection && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(() => api("vimeo", "DELETE"), "Vimeo desconectado.")
            }
          >
            Desconectar
          </button>
        )}
      </details>
      <p role="status">{message}</p>
      {error && (
        <p role="alert" className="course-error">
          {error}
        </p>
      )}
    </section>
  );
}
