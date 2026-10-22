"use client";
import { useState } from "react";
import { PasswordInput } from "./password-input";
import { engineRequest as api } from "./generation-engine";
export type MarketingOAuthInfo = { origin: string; callbackUrl: string; scope: string };
export type MarketingConnection = { id: string; name: string; appId: string | null; loginConfigId: string | null; appSecretConfiguredAt: string | null; authMethod: string | null; tokenExpiresAt: string | null; disconnectedAt: string | null };
export function MetaMarketingOAuth({ connection, info, onUpdated }: { connection?: MarketingConnection; info: MarketingOAuthInfo | null; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const originMismatch = !!info && typeof window !== "undefined" && info.origin !== window.location.origin;
  return <section className="stack meta-marketing-oauth" aria-label={connection ? `OAuth de ${connection.name}` : "Nueva conexión OAuth Marketing API"}>
    {!connection && <><h3>Conecta con tu propia app de Meta</h3><p>Autoriza en Facebook sin copiar tokens. La clave secreta se cifra en el servidor y nunca se devuelve al navegador. Si ya tienes una conexión, configura OAuth en su tarjeta para conservar su vínculo con las cuentas.</p></>}
    {info && <div className="panel stack"><strong>URI de redireccionamiento OAuth válido para esta instalación</strong><input aria-label="URI de retorno de Marketing API" readOnly value={info.callbackUrl} onFocus={e => e.currentTarget.select()} /><small>Copia esta URL exacta en Facebook Login → Configurar → URI de redireccionamiento OAuth válidos. Solicitud de lectura: ads_read. Es un retorno diferente del MCP.</small></div>}
    {originMismatch && <p className="notice" role="alert">El servidor tiene APP_ORIGIN configurado para otro dominio. Debe coincidir con el dominio desde el que abriste esta instalación antes de autorizar.</p>}
    <form className="stack" method="post" onSubmit={e => {
      e.preventDefault(); const form = e.currentTarget, d = new FormData(form), intent = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "connect";
      setBusy(true); setMessage("");
      void (async () => {
        let c = connection;
        const appId = String(d.get("oauthAppId")), appSecret = String(d.get("appSecret") ?? "").trim(), loginConfigId = String(d.get("loginConfigId") ?? "").trim() || null;
        if (!c) c = await api("meta-ads/connections", "POST", { name: String(d.get("oauthName")), transport: "API", apiVersion: String(d.get("oauthVersion")), appId });
        if (!c) throw Error("No se pudo crear la conexión.");
        if (!connection || appSecret || c.appId !== appId || c.loginConfigId !== loginConfigId) await api(`meta-ads/connections/${c.id}/app`, "PATCH", { appId, loginConfigId, ...(appSecret ? { appSecret } : {}) });
        form.querySelectorAll<HTMLInputElement>("[data-secret-input]").forEach(input => { input.value = ""; });
        form.dispatchEvent(new Event("reset"));
        onUpdated();
        if (intent === "save") { setMessage("Configuración guardada. Pulsa Conectar con Facebook para autorizar y verificar las cuentas."); return; }
        const auth = await api(`meta-ads/connections/${c.id}/oauth`, "POST", {});
        window.location.assign(auth.url);
      })().catch(e => setMessage(e.message)).finally(() => setBusy(false));
    }}>
      <div className="fields">
        {!connection && <label>Nombre de la conexión<input name="oauthName" defaultValue="PULPO ANALISIS Y AUTO" required maxLength={100} disabled={busy} /></label>}
        <label>ID de tu app de Meta<input name="oauthAppId" defaultValue={connection?.appId ?? ""} required pattern="[0-9]{1,40}" inputMode="numeric" disabled={busy} /></label>
        {!connection && <label>Versión Graph<input name="oauthVersion" defaultValue="v26.0" required pattern="v[0-9]{2}\.0" disabled={busy} /></label>}
        <label>Clave secreta de la app{connection?.appSecretConfiguredAt ? " · guardada, escribe solo para reemplazar" : ""}<PasswordInput name="appSecret" secretLabel="clave secreta de Meta" autoComplete="off" required={!connection?.appSecretConfiguredAt} minLength={16} maxLength={200} disabled={busy} /></label>
        <label>ID de configuración de Facebook Login para empresas · opcional<input name="loginConfigId" defaultValue={connection?.loginConfigId ?? ""} inputMode="numeric" pattern="[0-9]{1,40}" disabled={busy} /><small>Si tu app utiliza Facebook Login para empresas, crea una configuración con ads_read y pega aquí su ID. No es el ID de la cuenta publicitaria.</small></label>
      </div>
      <small>El ID y la clave secreta están en Meta for Developers → Configuración de la app → Básica. No introduzcas tu contraseña de Facebook. Si deniegas el acceso o falta ads_read, la plataforma mostrará el error.</small>
      <div className="row">{connection && <button type="submit" value="save" disabled={busy || !!connection.disconnectedAt}>Guardar configuración OAuth</button>}<button type="submit" value="connect" className="primary" disabled={busy || !info || originMismatch || !!connection?.disconnectedAt}>{busy ? "Preparando autorización…" : connection?.authMethod === "OAUTH" ? "Reconectar con Facebook" : "Conectar con Facebook"}</button></div>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
  </section>;
}
