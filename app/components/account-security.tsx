"use client";
import { useState } from "react";
async function post(path: string, data: unknown) {
  const r = await fetch("/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error ?? "No se pudo completar la operación.");
  return result;
}
export function AccountSecurity({
  onChanged,
}: {
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="panel stack">
      <h1>Mi cuenta</h1>
      <h2>Cambiar contraseña</h2>
      <p className="muted">
        Al cambiarla se cerrarán todas tus sesiones y se invalidarán los enlaces
        de recuperación anteriores.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            b = new FormData(form);
          if (b.get("newPassword") !== b.get("confirmPassword")) {
            setMessage("Las contraseñas nuevas no coinciden.");
            return;
          }
          setBusy(true);
          setMessage("");
          void post("auth/change-password", {
            currentPassword: b.get("currentPassword"),
            newPassword: b.get("newPassword"),
          })
            .then(async () => {
              form.reset();
              await onChanged();
            })
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Contraseña actual
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Nueva contraseña · mínimo 12 caracteres
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <label>
          Repite la nueva contraseña
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        <button className="primary" disabled={busy}>
          Cambiar contraseña y cerrar sesiones
        </button>
      </form>
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
    </section>
  );
}
export function RecoveryIssuer({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false),
    [link, setLink] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div className="stack">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setLink("");
          setMessage("");
        }}
      >
        Recuperar acceso
      </button>
      {open && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              currentPassword = new FormData(form).get("currentPassword");
            setBusy(true);
            setMessage("");
            setLink("");
            void post(`users/${userId}/recovery`, { currentPassword })
              .then((result) => {
                setLink(
                  `${window.location.origin}/#recuperar=${encodeURIComponent(result.token)}`,
                );
                setMessage(
                  `Válido hasta ${new Date(result.expiresAt).toLocaleTimeString()}. El enlace anterior ya no funciona. No se envió ningún correo.`,
                );
                form.reset();
              })
              .catch((error: Error) => setMessage(error.message))
              .finally(() => setBusy(false));
          }}
        >
          <p>
            Genera un enlace de un solo uso para {name}. Caduca en 30 minutos.
            Entrégalo de forma privada a la persona titular.
          </p>
          <label>
            Tu contraseña actual de OWNER
            <input
              type="password"
              name="currentPassword"
              required
              minLength={12}
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>Generar enlace temporal</button>
        </form>
      )}
      {link && (
        <label>
          Enlace de recuperación · visible solo ahora
          <textarea
            readOnly
            value={link}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
    </div>
  );
}
export function ResetPasswordForm({
  token,
  onDone,
  onCancel,
}: {
  token: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  return (
    <div className="login-form">
      <div className="brand">✳ estudio AI</div>
      <h1>Recuperar tu cuenta</h1>
      {done ? (
        <>
          <p role="status">
            Contraseña actualizada. Se cerraron todas las sesiones anteriores.
          </p>
          <button className="primary" onClick={() => void onDone()}>
            Ir al ingreso
          </button>
        </>
      ) : (
        <>
          <p>El enlace es válido una sola vez durante 30 minutos.</p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                b = new FormData(form);
              if (b.get("newPassword") !== b.get("confirmPassword")) {
                setMessage("Las contraseñas no coinciden.");
                return;
              }
              setBusy(true);
              setMessage("");
              void post("auth/reset-password", {
                token,
                newPassword: b.get("newPassword"),
              })
                .then(() => {
                  form.reset();
                  setDone(true);
                })
                .catch((error: Error) => setMessage(error.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Nueva contraseña · mínimo 12 caracteres
              <input
                type="password"
                name="newPassword"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <label>
              Repite la contraseña
              <input
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <button className="primary" disabled={busy}>
              Guardar nueva contraseña
            </button>
          </form>
          <button onClick={onCancel} disabled={busy}>
            Volver al ingreso
          </button>
          {message && (
            <div role="status" className="notice">
              {message}
            </div>
          )}
        </>
      )}
    </div>
  );
}
