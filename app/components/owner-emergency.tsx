"use client";
import { useEffect, useState } from "react";
type Status = {
  enabled: boolean;
  createdAt: string | null;
  expiresAt: string | null;
};
async function call(path: string, method = "GET", payload?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: payload ? { "Content-Type": "application/json" } : {},
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "No se pudo completar la operación.");
  return data;
}
export function OwnerEmergencyKit({ email }: { email: string }) {
  const [status, setStatus] = useState<Status | null>(null),
    [code, setCode] = useState(""),
    [expires, setExpires] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void call("auth/owner-recovery")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function manage(form: HTMLFormElement, revoke: boolean) {
    setBusy(true);
    setMessage("");
    setCode("");
    try {
      const result = await call(
        "auth/owner-recovery",
        revoke ? "DELETE" : "POST",
        { currentPassword: new FormData(form).get("currentPassword") },
      );
      form.reset();
      setStatus(await call("auth/owner-recovery"));
      if (!revoke) {
        setCode(result.code);
        setExpires(result.expiresAt);
        setMessage(
          "Guarda el código ahora: no volverá a mostrarse. El código anterior quedó invalidado.",
        );
      } else setMessage("Código de emergencia revocado.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel stack"
      aria-label="Recuperación de emergencia del OWNER"
    >
      <h2>Recuperación de emergencia del OWNER</h2>
      <p>
        Prepara este código mientras tienes acceso. Si olvidas tu contraseña y
        no hay otro OWNER disponible, podrás recuperarla desde el ingreso, sin
        programador ni correo automático.
      </p>
      {status && (
        <p>
          {status.enabled
            ? `Código activo hasta ${new Date(status.expiresAt!).toLocaleString("es-PE", { timeZone: "America/Lima" })}, hora de Perú.`
            : "No tienes un código de emergencia activo."}
        </p>
      )}
      <p className="hint">
        Es de un solo uso y vence al año. Generar otro invalida el anterior.
        Cambiar o recuperar la contraseña, o modificar el rol/estado de tu
        cuenta, lo invalida. Guárdalo en un lugar privado fuera de esta
        plataforma: quien lo tenga junto con tu correo puede restablecer tu
        contraseña. No recupera claves de cifrado perdidas.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void manage(e.currentTarget, false);
        }}
      >
        <label>
          Tu contraseña actual
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
            disabled={busy}
          />
        </label>
        <div className="row">
          <button className="primary" disabled={busy}>
            Generar código de emergencia
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || !status?.enabled}
            onClick={(e) => {
              if (
                confirm(
                  "¿Revocar tu código de emergencia actual? Dejará de funcionar.",
                )
              ) {
                const form = e.currentTarget.closest("form")!;
                if (form.reportValidity()) void manage(form, true);
              }
            }}
          >
            Revocar código actual
          </button>
        </div>
      </form>
      {code && (
        <div className="stack">
          <label>
            Código de emergencia · visible solo ahora
            <textarea
              readOnly
              value={code}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const text = `Recuperación de emergencia de Estudio AI\nSitio: ${window.location.origin}\nCorreo OWNER: ${email}\nCódigo: ${code}\nVálido hasta: ${new Date(expires).toISOString()}\n\nGuárdalo en privado. Es de un solo uso. En el ingreso elige Recuperar OWNER con código de emergencia.\nCambiar contraseña, rol o estado invalida este código. Nunca lo compartas ni lo subas a GitHub.\n`;
              const url = URL.createObjectURL(
                new Blob([text], { type: "text/plain;charset=utf-8" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "recuperacion-owner.txt";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Descargar mi código de emergencia
          </button>
          <button
            type="button"
            onClick={() => {
              setCode("");
              setMessage(
                "Código ocultado. Solo podrás utilizar la copia que guardaste; si la perdiste, genera otro código.",
              );
            }}
          >
            Ya lo guardé · ocultar código
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function EmergencyOwnerForm({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  return (
    <div className="stack">
      <h1>Recuperar OWNER</h1>
      <p>
        Usa el código de emergencia que guardaste previamente desde Mi cuenta.
        No sustituye el token de instalación ni la clave de cifrado.
      </p>
      {done ? (
        <p role="status">
          Contraseña recuperada. Se cerraron todas las sesiones anteriores.
          Ingresa con tu nueva contraseña y genera otro código de emergencia.
        </p>
      ) : (
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
            void call("auth/emergency-recovery", "POST", {
              email: b.get("email"),
              code: String(b.get("code") ?? "").trim(),
              newPassword: b.get("newPassword"),
            })
              .then(() => {
                form.reset();
                setDone(true);
              })
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Correo de tu cuenta OWNER
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={200}
            />
          </label>
          <label>
            Código de emergencia
            <input
              name="code"
              type="password"
              autoComplete="off"
              required
              pattern="OWNER-[A-Za-z0-9_-]{43}"
              maxLength={49}
            />
          </label>
          <label>
            Nueva contraseña · mínimo 12 caracteres
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label>
            Repite la nueva contraseña
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <button className="primary" disabled={busy}>
            Recuperar cuenta OWNER
          </button>
        </form>
      )}
      {message && <p role="alert">{message}</p>}
      <button disabled={busy} onClick={onBack}>
        Volver al ingreso
      </button>
    </div>
  );
}
