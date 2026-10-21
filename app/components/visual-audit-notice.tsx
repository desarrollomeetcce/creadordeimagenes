"use client";
import { useEffect, useState } from "react";
async function request(path: string, method = "GET", data?: unknown) {
  const response = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.error ?? "No se pudo completar la operación de auditoría visual.",
    );
  return result;
}
export function VisualAuditNotice() {
  const [notice, setNotice] = useState<{
      enabled: boolean;
      retentionDays: number;
    } | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void request("privacy/visual-audit")
        .then((data) => {
          if (active) {
            setNotice(data);
            setError(false);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    };
    refresh();
    window.addEventListener("visual-audit-policy", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    return () => {
      active = false;
      window.removeEventListener("visual-audit-policy", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  return (
    <aside
      className="notice visual-audit-notice"
      aria-label="Conservación de miniaturas de auditoría"
    >
      {notice ? (
        notice.enabled ? (
          <>
            Privacidad: las nuevas versiones guardadas conservan una miniatura
            comprimida durante <strong>{notice.retentionDays} días</strong>,
            visible solo para el OWNER. Borrar proyectos o afiches no elimina
            esa miniatura. Los originales y la biblioteca tienen su propia
            conservación.
          </>
        ) : (
          <>
            Privacidad: la conservación de miniaturas de nuevas versiones está
            desactivada. Las anteriores pueden seguir disponibles para el OWNER
            hasta su caducidad.
          </>
        )
      ) : error ? (
        "No se pudo consultar la política de miniaturas. Consulta al OWNER antes de generar contenido sensible."
      ) : (
        "Consultando la política de conservación de miniaturas…"
      )}
    </aside>
  );
}
