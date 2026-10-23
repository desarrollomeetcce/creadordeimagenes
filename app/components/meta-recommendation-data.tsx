"use client";
import { useEffect, useRef, useState } from "react";
type Progress = {
  phase?: number;
  label: string;
  pages?: number;
  records?: number;
  ads?: number;
  adsets?: number;
  since?: string;
  until?: string;
  done: boolean;
  waiting?: boolean;
  error?: string | null;
  retryAt?: string | null;
};
export function MetaRecommendationData({
  campaignId,
  canSync,
  onReceived,
}: {
  campaignId: string;
  canSync: boolean;
  onReceived: () => void;
}) {
  const [progress, setProgress] = useState<Progress | null>(null),
    [reading, setReading] = useState(false),
    [message, setMessage] = useState("");
  const live = useRef(true),
    stop = useRef(false);
  useEffect(() => {
    live.current = true;
    const c = new AbortController();
    fetch(`/api/meta-ads/recommendations/${campaignId}/data`, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (r.ok && live.current) setProgress(d);
      })
      .catch(() => {});
    return () => {
      live.current = false;
      stop.current = true;
      c.abort();
    };
  }, [campaignId]);
  const read = async (firstAction = "start") => {
    setReading(true);
    setMessage("");
    stop.current = false;
    let action = firstAction,
      received = false;
    try {
      for (let page = 0; page < 4100 && !stop.current && live.current; page++) {
        if (document.hidden) {
          setMessage(
            "Lectura pausada mientras la pestaña está oculta. Puedes continuar desde el avance guardado.",
          );
          break;
        }
        const r = await fetch(
          `/api/meta-ads/recommendations/${campaignId}/data`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        const d = await r.json();
        if (!r.ok)
          throw Error(d.error ?? "No se pudo recibir esta página de Meta.");
        if (!live.current) return;
        setProgress(d);
        received = received || (d.phase ?? 0) >= 4;
        if (d.done) {
          setMessage(
            "Datos recibidos de Meta. Recalculando con las cifras reales…",
          );
          break;
        }
        if (d.retryAt) {
          const delay = Date.parse(d.retryAt) - Date.now();
          if (delay > 10000) {
            setMessage(
              "Meta requiere una espera. El avance se conserva; puedes continuar después de la hora indicada.",
            );
            break;
          }
          if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        action = d.phase === undefined ? "start" : "continue";
      }
    } catch (e) {
      if (live.current) setMessage((e as Error).message);
    } finally {
      if (live.current) {
        setReading(false);
        if (received) onReceived();
      }
    }
  };
  return (
    <div className="meta-source-fetch" aria-busy={reading}>
      <strong>Datos de Meta de esta campaña</strong>
      <p>
        Lectura directa: conjuntos, anuncios y miniaturas, estadísticas diarias
        de 30 días y acumulados disponibles. Conserva los datos anteriores y
        continúa por páginas; no vuelve a recorrer otras campañas.
      </p>
      {progress && (
        <p role="status">
          {progress.label} · {progress.pages ?? 0} páginas ·{" "}
          {progress.records ?? 0} filas recibidas · {progress.ads ?? 0} anuncios
          · {progress.since} → {progress.until}
          {progress.retryAt
            ? ` · Espera hasta ${new Date(progress.retryAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} (Perú)`
            : ""}
        </p>
      )}
      {progress?.error && <p className="notice">{progress.error}</p>}
      {canSync ? (
        <div className="row">
          <button type="button" disabled={reading} onClick={() => void read()}>
            {reading
              ? "Recibiendo datos reales…"
              : progress && !progress.done
                ? "Continuar lectura de Meta"
                : "Traer datos de Meta y analizar"}
          </button>
          {!reading && progress?.error && (
            <button type="button" onClick={() => void read("restart")}>
              Reiniciar lectura de esta campaña
            </button>
          )}
          {reading && (
            <button
              type="button"
              onClick={() => {
                stop.current = true;
                setMessage(
                  "Se detendrá después de guardar la página en curso. Puedes continuar más tarde.",
                );
              }}
            >
              Detener después de esta página
            </button>
          )}
        </div>
      ) : (
        <p>
          Solicita al propietario o administrador con permiso de sincronización
          que actualice los datos.
        </p>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
