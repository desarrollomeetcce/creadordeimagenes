"use client";
import { useEffect, useState } from "react";
type Status = {
  usedBytes: number | null;
  limitBytes: number | null;
  maxUploadBytes: number;
};
export function StorageUsage() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/system/storage")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok)
          throw new Error(b.error || "No se pudo consultar el espacio.");
        if (active) setStatus(b);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel stack">
      <h2>Espacio para archivos</h2>
      {status &&
        (status.limitBytes !== null && status.usedBytes !== null ? (
          <>
            <p>
              {(status.usedBytes / 1048576).toFixed(1)} MB utilizados de{" "}
              {Math.floor(status.limitBytes / 1048576)} MB.
            </p>
            <progress
              aria-label="Almacenamiento utilizado"
              max={status.limitBytes}
              value={status.usedBytes}
              style={{ width: "100%" }}
            />
            <p className="muted">
              Los adjuntos, las versiones guardadas y las miniaturas de
              auditoría ocupan espacio. Los afiches temporales y las miniaturas
              caducadas se eliminan al ejecutar la limpieza, cada uno según su
              plazo.
            </p>
          </>
        ) : (
          <p>Los archivos se conservan en el almacenamiento del servidor.</p>
        ))}
      {status && (
        <p className="muted">
          Adjuntos de hasta {status.maxUploadBytes / 1000000} MB por archivo.
        </p>
      )}
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          setMessage("");
          void (async () => {
            const r = await fetch("/api/system/cleanup", { method: "POST" });
            const b = await r.json();
            if (!r.ok)
              throw new Error(
                b.error || "No se pudo limpiar el almacenamiento.",
              );
            const info = await fetch("/api/system/storage");
            if (!info.ok)
              throw new Error(
                "La limpieza terminó, pero no se pudo actualizar el espacio disponible.",
              );
            setStatus(await info.json());
            setMessage(
              `${b.expired} afiches temporales caducados procesados. ${b.interrupted} trabajos interrumpidos enviados a revisión.`,
            );
          })()
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Limpiar temporales caducados
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="status" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
