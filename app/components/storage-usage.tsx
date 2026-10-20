"use client";
import { MaintenancePanel } from "./maintenance-panel";
import { useEffect, useState } from "react";
type Status = {
  usedBytes: number | null;
  limitBytes: number | null;
  maxUploadBytes: number;
};
export function StorageUsage() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState("");
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
              aria-label="Espacio utilizado"
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
          Originales de hasta 1 GB por archivo, según espacio disponible. Para generar se usa una copia optimizada o un extracto.
        </p>
      )}
      <MaintenancePanel
        onCleaned={async () => {
          const response = await fetch("/api/system/storage", {
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "La limpieza terminó, pero no se pudo actualizar el espacio disponible.",
            );
          setStatus(await response.json());
        }}
      />
      {error && (
        <p role="status" className="notice error">
          {error}
        </p>
      )}
    </section>
  );
}
