"use client";
import { useEffect, useState } from "react";

type Status = {
  configured: boolean;
  verified: boolean;
  host?: string;
  port?: number;
  username?: string;
  senderName?: string;
  passwordMask?: string;
  verifiedAt?: string;
  lastError?: string;
};
async function request(path = "mail", method = "GET", data?: unknown) {
  const res = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(
      result.error ?? "No se pudo completar la operación de correo.",
    );
  return result;
}
export function MailSettings() {
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void request()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel stack">
      <h1>Ajustes de correo</h1>
      <p>
        Solo OWNER administra estas credenciales. El correo se utiliza para
        enviar enlaces de recuperación solicitados desde Usuarios.
      </p>
      <p className="muted">
        Hostinger: consulta los datos SMTP de tu cuenta en hPanel → Emails →
        Conectar aplicaciones. El servidor sugerido es editable; usa los datos
        de tu servicio. No necesitas modificar código ni variables de entorno.
      </p>
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      {status && (
        <>
          <p role="status">
            <strong>Estado: </strong>
            {status.verified
              ? "Conexión verificada"
              : status.configured
                ? "Guardado · conexión pendiente de verificar"
                : "Sin configurar"}
            {status.verifiedAt &&
              ` · ${new Date(status.verifiedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} (Lima)`}
          </p>
          {status.lastError && <p role="alert">{status.lastError}</p>}
          <form
            className="stack"
            key={JSON.stringify(status)}
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget,
                values = new FormData(form),
                action =
                  (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
                    "value",
                  ) ?? "save";
              if (
                action === "delete" &&
                !window.confirm(
                  "¿Eliminar la contraseña y configuración de correo? Los enlaces para copiar seguirán disponibles.",
                )
              )
                return;
              const currentPassword = values.get("currentPassword");
              setBusy(true);
              setMessage("");
              const operation =
                action === "save"
                  ? request("mail", "PUT", {
                      currentPassword,
                      host: values.get("host"),
                      port: Number(values.get("port")),
                      username: values.get("username"),
                      senderName: values.get("senderName"),
                      ...(values.get("password")
                        ? { password: values.get("password") }
                        : {}),
                    })
                  : request(
                      action === "delete" ? "mail" : `mail/${action}`,
                      action === "delete" ? "DELETE" : "POST",
                      { currentPassword },
                    );
              void operation
                .then(async (result) => {
                  form.reset();
                  setMessage(
                    result.message ??
                      (action === "delete"
                        ? "Configuración de correo eliminada."
                        : "Configuración guardada. Verifica la conexión antes de enviar mensajes."),
                  );
                  setStatus(await request());
                })
                .catch(async (error: Error) => {
                  setMessage(error.message);
                  try {
                    setStatus(await request());
                  } catch {
                    /* Keep the actionable original error. */
                  }
                })
                .finally(() => {
                  for (const field of form.querySelectorAll<HTMLInputElement>(
                    'input[type="password"]',
                  ))
                    field.value = "";
                  setBusy(false);
                });
            }}
          >
            <fieldset disabled={busy} className="stack">
              <legend>Cuenta SMTP · conexión cifrada obligatoria</legend>
              <label>
                Servidor SMTP
                <input
                  name="host"
                  required
                  maxLength={253}
                  defaultValue={status.host ?? "smtp.hostinger.com"}
                  autoComplete="off"
                />
              </label>
              <label>
                Puerto y seguridad
                <select name="port" defaultValue={status.port ?? 465}>
                  <option value={465}>465 · TLS desde el inicio</option>
                  <option value={587}>587 · STARTTLS obligatorio</option>
                </select>
              </label>
              <label>
                Correo completo de Hostinger
                <input
                  type="email"
                  name="username"
                  required
                  maxLength={200}
                  defaultValue={status.username ?? ""}
                  autoComplete="off"
                />
              </label>
              <label>
                Nombre del remitente
                <input
                  name="senderName"
                  required
                  maxLength={100}
                  defaultValue={status.senderName ?? "estudio AI"}
                />
              </label>
              <label>
                {status.configured
                  ? `Contraseña guardada: ${status.passwordMask}. Nueva contraseña (dejar vacía para conservar)`
                  : "Contraseña del correo de Hostinger"}
                <input
                  type="password"
                  name="password"
                  maxLength={1000}
                  autoComplete="new-password"
                />
              </label>
              <p className="muted">
                La contraseña se cifra en el servidor y nunca vuelve al
                navegador después de guardarla. Usa la contraseña del buzón, no
                la de acceso a Hostinger. Guarda los cambios antes de verificar;
                cada guardado invalida la verificación anterior.
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
              <button value="save" className="primary">
                Guardar configuración de correo
              </button>
              <button value="verify" disabled={!status.configured}>
                Verificar conexión guardada
              </button>
              <p className="muted">
                La prueba siguiente enviará un mensaje a tu correo de acceso.
                Puede contar para los límites de envío de tu proveedor. Revisa
                también spam.
              </p>
              <button value="test" disabled={!status.verified}>
                Enviar correo de prueba a mi cuenta
              </button>
              <button
                value="delete"
                disabled={!status.configured}
                className="danger"
              >
                Eliminar configuración de correo
              </button>
            </fieldset>
          </form>
        </>
      )}
    </section>
  );
}
