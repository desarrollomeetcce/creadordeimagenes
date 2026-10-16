"use client";
import { useEffect, useState } from "react";
type Status = { configured: boolean; maskedKey: string | null };
export function BillingKeyForm({
  changed,
  disabled = false,
  busyChanged,
}: {
  changed: () => void;
  disabled?: boolean;
  busyChanged: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [key, setKey] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch("/api/ai/billing-key?provider=openai", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error ?? "No se pudo consultar la credencial.");
        if (active) setStatus(body);
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  const update = async (remove: boolean) => {
    if (
      remove &&
      !confirm(
        "¿Eliminar la credencial de consulta de gastos? La clave de generación se conserva.",
      )
    )
      return;
    if (busy || disabled) return;
    setBusy(true);
    busyChanged(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/ai/billing-key?provider=openai", {
        method: remove ? "DELETE" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: remove
          ? undefined
          : JSON.stringify({ provider: "openai", apiKey: key }),
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error ?? "No se pudo guardar la credencial.");
      setStatus(remove ? { configured: false, maskedKey: null } : body);
      setKey("");
      changed();
      setMessage(
        remove
          ? "Credencial de gastos eliminada. Tu clave de generación se conserva."
          : "Credencial cifrada guardada. Consulta el gasto para comprobar sus permisos.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo actualizar la credencial.",
      );
    } finally {
      setBusy(false);
      busyChanged(false);
    }
  };
  return (
    <details className="stack">
      <summary>Credencial para consultar gastos · opcional</summary>
      <p>
        Introduce aquí una clave administrativa de OpenAI con permiso para
        consultar gastos. Se guarda cifrada, solo el OWNER puede administrarla y
        es independiente de la clave que genera imágenes.
      </p>
      <p>
        <a
          href="https://platform.openai.com/settings/organization/admin-keys"
          target="_blank"
          rel="noreferrer"
        >
          Administrar claves de la organización en OpenAI ↗
        </a>
      </p>
      <p>
        {loading
          ? "Consultando credencial…"
          : !status
            ? "No se pudo confirmar el estado de la credencial."
            : status.configured
              ? `Clave de gastos guardada: ${status.maskedKey}`
              : "No hay una credencial de gastos guardada."}
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void update(false);
        }}
      >
        <label>
          {status?.configured
            ? "Reemplazar clave de gastos"
            : "Clave de gastos de OpenAI"}
          <input
            type="password"
            name="billingApiKey"
            value={key}
            autoComplete="new-password"
            spellCheck={false}
            minLength={12}
            maxLength={1000}
            required
            disabled={loading || busy || disabled}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <div className="actions">
          <button
            type="submit"
            disabled={loading || busy || disabled || key.trim().length < 12}
          >
            {busy ? "Guardando…" : "Guardar clave de gastos"}
          </button>
          {status?.configured && (
            <button
              type="button"
              className="danger"
              disabled={busy || disabled}
              onClick={() => void update(true)}
            >
              Eliminar clave de gastos
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
