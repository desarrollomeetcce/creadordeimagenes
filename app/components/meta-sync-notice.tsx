"use client";
import { useEffect, useState } from "react";
import type { SyncProgress } from "../../lib/meta-ads/sync-progress";

/** Acknowledging an attempt never clears the server's diagnostic or marks it successful. */
export function MetaSyncNotice({
  userId,
  account,
}: {
  userId: string;
  account: {
    id: string;
    name: string;
    syncError: string | null;
    progress?: SyncProgress;
  };
}) {
  const key = `meta-sync-notice:v1:${userId}:${account.id}`;
  const signature = JSON.stringify([
    account.id,
    account.syncError,
    account.progress?.attemptAt,
    account.progress?.lastActivityAt,
  ]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window === "undefined"
        ? ""
        : (sessionStorage.getItem(key) ?? "");
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(key) ?? "");
    } catch {
      setDismissed("");
    }
  }, [key]);
  if (
    !account.syncError ||
    !["error", "waiting"].includes(account.progress?.status ?? "") ||
    dismissed === signature
  )
    return null;
  const waiting = account.progress?.status === "waiting";
  return (
    <aside
      className="notice meta-sync-notice"
      aria-label={`Aviso de ${account.name}`}
    >
      <div className="meta-sync-notice-heading">
        <strong>
          {waiting ? "En espera de Meta" : "El último intento no se completó"}
        </strong>
        <button
          type="button"
          aria-label={`Cerrar aviso de ${account.name}`}
          title="Cerrar este aviso"
          onClick={() => {
            setDismissed(signature);
            try {
              sessionStorage.setItem(key, signature);
            } catch {
              /* Acknowledgement still works in this view. */
            }
          }}
        >
          ×
        </button>
      </div>
      <p>
        {waiting
          ? "La cuenta espera su turno de consulta. El avance guardado se conserva."
          : "Los datos recibidos se conservan. Puedes actualizar esta cuenta para continuar."}
      </p>
      <details>
        <summary>Detalle del aviso</summary>
        <p>{account.syncError}</p>
      </details>
    </aside>
  );
}
