"use client";
import { useState } from "react";
import {
  MetaMarketingOAuth,
  type MarketingConnection,
  type MarketingOAuthInfo,
} from "./meta-marketing-oauth";
import { PasswordInput } from "./password-input";
import { engineRequest as api } from "./generation-engine";

export function MetaConnectionAccess({
  connection,
  info,
  onUpdated,
}: {
  connection: MarketingConnection;
  info: MarketingOAuthInfo | null;
  onUpdated: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<"manual" | "oauth" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const oauth = connection.authMethod === "OAUTH";
  return (
    <section
      className="stack meta-connection-access"
      aria-label={`Acceso de ${connection.name}`}
    >
      <p>
        Esta conexión usa una sola credencial. Guarda un token manual o completa
        la autorización con Facebook para cambiarla.
      </p>
      {connection.tokenMask && (
        <p className="meta-saved-token" aria-label="Token guardado">
          Token guardado: <span aria-hidden="true">****************</span>
        </p>
      )}
      <div
        className="row"
        role="group"
        aria-label={`Elegir método de ${connection.name}`}
      >
        <button
          type="button"
          aria-expanded={editor === "manual"}
          disabled={busy}
          className={editor === "manual" ? "primary" : ""}
          onClick={() => {
            setEditor(editor === "manual" ? null : "manual");
            setMessage("");
          }}
        >
          {!!connection.tokenMask && !oauth
            ? "Actualizar solo token"
            : "Manual (token)"}
        </button>
        <button
          type="button"
          aria-expanded={editor === "oauth"}
          disabled={busy}
          className={editor === "oauth" ? "primary" : ""}
          onClick={() => {
            setEditor(editor === "oauth" ? null : "oauth");
            setMessage("");
          }}
        >
          OAuth (Facebook){!!connection.tokenMask && oauth && " · En uso"}
        </button>
      </div>
      {editor === "manual" && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              token = String(new FormData(form).get("token"));
            setBusy(true);
            setMessage("");
            void (async () => {
              await api(`meta-ads/connections/${connection.id}`, "PATCH", {
                token,
              });
              form.reset();
              await onUpdated();
              setMessage(
                "Token actualizado. La configuración, las cuentas, el histórico y el avance se conservan. Verifica la conexión para continuar desde el avance guardado.",
              );
            })()
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          {oauth && (
            <p className="notice">
              Guardar este token sustituirá la credencial OAuth de esta
              conexión.
            </p>
          )}
          <label>
            Token manual de Meta
            <PasswordInput
              name="token"
              placeholder={
                connection.tokenMask
                  ? "****************"
                  : "Pega el token de Meta"
              }
              autoComplete="off"
              required
              disabled={busy}
              secretLabel="token manual de Meta"
            />
          </label>
          <small>
            {connection.tokenMask &&
              "El token está guardado y oculto. Escribe uno nuevo solo para reemplazarlo. "}
            Actualiza únicamente la credencial. Conserva la versión de API, la
            configuración de la app, las cuentas y los datos guardados.
          </small>
          <small>
            Se guarda cifrado. La caducidad solo se muestra si está informada;
            un token manual no se considera permanente automáticamente.
          </small>
          <div>
            <button type="submit" disabled={busy}>
              {busy
                ? "Guardando…"
                : connection.tokenMask
                  ? "Guardar nuevo token"
                  : "Guardar token manual"}
            </button>
          </div>
        </form>
      )}
      {editor === "oauth" && (
        <>
          {!oauth && !!connection.tokenMask && (
            <p className="notice">
              Tu token manual seguirá en uso hasta que completes la autorización
              con Facebook.
            </p>
          )}
          <MetaMarketingOAuth
            connection={connection}
            info={info}
            onUpdated={() => {
              void onUpdated().catch((e) => setMessage(e.message));
            }}
          />
        </>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
