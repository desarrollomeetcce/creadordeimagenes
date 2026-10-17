"use client";
import { PasswordInput } from "./password-input";
import { useEffect, useState } from "react";
type Connection = {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  maskedKey: string | null;
  status: string;
  modelCount: number;
  error: string | null;
};
export function ProviderConnections({
  providers,
  changed,
}: {
  providers: { id: string; name: string }[];
  changed: () => Promise<void>;
}) {
  const [rows, setRows] = useState<Connection[]>([]),
    [provider, setProvider] = useState("google"),
    [key, setKey] = useState(""),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = async (signal?: AbortSignal) => {
    const response = await fetch("/api/ai/connections", {
      cache: "no-store",
      signal,
    });
    const body = await response.json();
    if (!response.ok)
      throw Error(body.error ?? "No se pudieron consultar las conexiones.");
    return body as Connection[];
  };
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void load(controller.signal)
      .then((data) => {
        if (active) setRows(data);
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
  const selected = rows.find((row) => row.provider === provider);
  const keyLinks: Record<string, string> = {
    openai: "https://platform.openai.com/api-keys",
    google: "https://ai.google.dev/gemini-api/docs/api-key",
    fal: "https://fal.ai/dashboard/keys",
    replicate: "https://replicate.com/account/api-tokens",
  };
  const labels: Record<string, string> = {
    NOT_CONFIGURED: "Sin clave",
    UNVERIFIED: "Clave guardada; falta consultar modelos",
    VERIFIED: "Catálogo consultado",
    EXPIRED: "Consulta caducada",
    ERROR: "Consulta fallida",
  };
  const action = async (kind: "save" | "verify" | "delete") => {
    if (busy) return;
    if (
      kind === "delete" &&
      !confirm(
        "¿Eliminar la clave de este proveedor? Si se usa para imágenes o dirección creativa, se bloquearán nuevas generaciones.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        kind === "save"
          ? "/api/ai/connections"
          : `/api/ai/connections/${provider}` +
              (kind === "verify" ? "/verify" : ""),
        {
          method:
            kind === "save" ? "PUT" : kind === "verify" ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body:
            kind === "save"
              ? JSON.stringify({ provider, apiKey: key })
              : kind === "verify"
                ? JSON.stringify({ query })
                : undefined,
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error ?? "No se pudo completar la conexión.");
      if (kind === "save") setKey("");
      setRows(await load());
      await changed();
      setMessage(
        kind === "verify"
          ? `Catálogo consultado: ${Array.isArray(data.models) ? data.models.length : 0} modelos compatibles. Esto no confirma saldo ni generación.`
          : kind === "save"
            ? "Clave cifrada guardada. Consulta sus modelos antes de utilizarla."
            : "Clave eliminada. Las demás conexiones se conservan.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo actualizar la conexión.",
      );
      try {
        setRows(await load());
        await changed();
      } catch {}
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="panel stack">
      <summary>Conexiones de IA · OpenAI, Google, fal.ai y Replicate</summary>
      <p>
        Conecta cada cuenta por separado. Luego elige abajo el proveedor de
        imágenes y el de dirección creativa. Google Gemini y Google AI Studio
        utilizan la misma conexión.
      </p>
      <p className="hint">
        No se garantiza gratuidad. Una suscripción de chat no equivale a saldo
        de API. La consulta de modelos no genera imágenes; las pruebas de
        generación requieren autorización aparte.
      </p>
      {loading ? (
        <p>Consultando conexiones guardadas…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Estado</th>
                <th>Clave guardada</th>
                <th>Modelos</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const row = rows.find((r) => r.provider === p.id);
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>
                      {row
                        ? (labels[row.status] ?? row.status)
                        : "Sin información"}
                    </td>
                    <td>{row?.maskedKey ?? "Sin clave"}</td>
                    <td>{row?.modelCount ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="fields">
        <label>
          Cuenta del proveedor
          <select
            value={provider}
            disabled={busy}
            onChange={(e) => {
              setProvider(e.target.value);
              setKey("");
              setQuery("");
              setMessage("");
              setError("");
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {selected?.configured
            ? "Reemplazar clave de esta cuenta"
            : "Clave API de esta cuenta"}
          <PasswordInput
            name="connectionApiKey"
            autoComplete="new-password"
            spellCheck={false}
            value={key}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
      </div>
      <p className="hint">
        <a href={keyLinks[provider]} target="_blank" rel="noreferrer">
          Crear o administrar la clave en{" "}
          {providers.find((p) => p.id === provider)?.name} ↗
        </a>
      </p>
      {provider === "google" && (
        <p className="hint">
          Gemini1.5 Flash e Imagen3 fueron retirados por Google. La consulta
          utiliza los nombres vigentes devueltos por su API, incluidos los
          modelos Nano Banana compatibles.
        </p>
      )}
      {(provider === "fal" || provider === "replicate") && (
        <label>
          Buscar modelos en el proveedor · opcional
          <input
            name="providerModelQuery"
            value={query}
            maxLength={100}
            disabled={busy}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FLUX, Nano Banana o identificador completo"
          />
          <span className="hint">
            Vacío consulta el catálogo de imágenes integrado. En Replicate se
            usa su colección de texto a imagen; una búsqueda devuelve hasta50
            resultados. Puedes consultar un identificador exacto. Solo se
            muestran entradas compatibles, sin inventar modelos. Una búsqueda
            reemplaza el catálogo anterior de esta conexión.
          </span>
        </label>
      )}
      <div className="actions">
        <button
          type="button"
          disabled={busy || key.trim().length < 10}
          onClick={() => void action("save")}
        >
          Guardar clave de la cuenta
        </button>
        <button
          type="button"
          disabled={busy || !!key || !selected?.configured}
          onClick={() => void action("verify")}
        >
          Consultar modelos de esta cuenta
        </button>
        {selected?.configured && (
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => void action("delete")}
          >
            Eliminar clave de esta cuenta
          </button>
        )}
      </div>
      <p className="hint">
        Solo OWNER administra estas claves. Se guardan cifradas con la clave
        maestra del servidor y nunca se recuperan en texto. Modificar la
        conexión activa exige revisar sus modelos antes de generar.
      </p>
      {selected?.error && <p className="error">{selected.error}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
