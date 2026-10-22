"use client";
import { useEffect, useState } from "react";
import { PasswordInput } from "./password-input";
const labels: Record<string, string> = { PRIVACY: "Consulta de privacidad o acceso a datos", DELETE_ACCOUNT: "Eliminar datos o cerrar mi cuenta", DELETE_META: "Eliminar datos importados de Meta", DELETE_FILES: "Eliminar archivos o proyectos", OTHER: "Otra consulta del servicio" };
const statuses: Record<string, string> = { PENDING: "Recibida", IN_REVIEW: "En revisión", ANSWERED: "Respondida", CLOSED: "Cerrada" };
async function request(path: string, method = "GET", value?: unknown) {
  const r = await fetch("/api/site/privacy-requests" + path, { method, headers: { "Content-Type": "application/json" }, body: value ? JSON.stringify(value) : undefined, cache: "no-store" });
  const b = await r.json(); if (!r.ok) throw Error(b.error ?? "No se pudo tramitar la solicitud."); return b;
}
export function PrivacyRequestForm() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState(""), [result, setResult] = useState<{ status: string; reply: string } | null>(null);
  return <div className="stack">
    <section><h2>Enviar una solicitud</h2><p>El correo que indiques será privado. Describe tu solicitud sin incluir contraseñas, tokens ni claves. El envío no borra datos automáticamente: la administración verificará tu identidad y el alcance.</p>
    <form method="post" className="stack" onSubmit={e => { e.preventDefault(); const f = e.currentTarget, d = new FormData(f); setBusy(true); setError(""); void request("", "POST", { kind: d.get("kind"), name: d.get("name"), email: d.get("email"), message: d.get("message"), consent: d.get("consent") === "on", website: d.get("website") }).then(b => { setReceipt(b.receipt); setResult({ status: b.status, reply: b.reply }); f.reset(); }).catch(e => setError(e.message)).finally(() => setBusy(false)); }}>
      <label>Tipo de solicitud<select name="kind" required disabled={busy}>{Object.entries(labels).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label>
      <label>Nombre · opcional<input name="name" maxLength={100} autoComplete="name" disabled={busy} /></label>
      <label>Correo de tu cuenta o de contacto · privado<input name="email" type="email" maxLength={200} autoComplete="email" required disabled={busy} /></label>
      <label>Solicitud<textarea name="message" minLength={15} maxLength={6000} rows={6} required disabled={busy} placeholder="Indica qué datos quieres consultar, corregir o eliminar y en qué dominio utilizaste la plataforma." /></label>
      <label className="privacy-honeypot" aria-hidden="true">Deja este campo vacío<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="row"><input type="checkbox" name="consent" required disabled={busy} />He leído la política de privacidad y solicito el tratamiento de estos datos para atender mi petición.</label>
      <button className="primary" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
    </form></section>
    {receipt && <section className="panel" role="status"><h2>Solicitud registrada</h2><p>Guarda este código privado para consultar la respuesta. No se envía por correo y no se guarda en este navegador.</p><code className="privacy-receipt">{receipt}</code><button type="button" onClick={() => { void navigator.clipboard.writeText(receipt).catch(() => setError("Selecciona y copia el código manualmente.")); }}>Copiar código</button></section>}
    <section><h2>Consultar estado y respuesta</h2><form method="post" className="stack" onSubmit={e => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get("receipt")).trim(); setBusy(true); setError(""); setResult(null); void request("/lookup", "POST", { receipt: code }).then(setResult).catch(e => setError(e.message)).finally(() => setBusy(false)); }}><label>Código privado de seguimiento<PasswordInput name="receipt" secretLabel="código de seguimiento" required autoComplete="off" minLength={64} maxLength={64} disabled={busy} /></label><button disabled={busy}>Consultar solicitud</button></form>
    {result && <div className="panel" role="status"><strong>Estado: {statuses[result.status] ?? result.status}</strong><p>{result.reply || "Recibimos tu solicitud. La administración aún no ha publicado una respuesta. Conserva el código y vuelve a consultar aquí."}</p></div>}</section>
    {error && <p className="notice" role="alert">{error}</p>}
  </div>;
}
type Row = { id: string; kind: string; name: string; email: string; message: string; origin: string; status: string; reply: string; updatedAt: string; createdAt: string };
export function PrivacyRequestInbox() {
  const [rows, setRows] = useState<Row[]>([]), [status, setStatus] = useState("ALL"), [page, setPage] = useState(1), [total, setTotal] = useState(0), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; setBusy(true); void request(`?status=${status}&page=${page}`).then(b => { if (active) { setRows(b.items); setTotal(b.total); setError(""); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [status, page, revision]);
  return <div className="stack">
    <p>Revisa identidad y alcance antes de actuar. Responder o cerrar una solicitud no elimina datos de la plataforma ni de Meta. La respuesta se consulta con el código privado; no se envían correos automáticos. No incluyas secretos ni datos de otras personas en la respuesta.</p>
    <div className="row"><label>Estado<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="ALL">Todas</option>{Object.entries(statuses).map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label><button type="button" disabled={busy} onClick={() => setRevision(n => n + 1)}>Actualizar solicitudes</button></div>
    {rows.map(row => <article className="panel stack" key={row.id}><h3>{labels[row.kind]} · {statuses[row.status]}</h3><small>{row.id} · {new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" }).format(new Date(row.createdAt))}</small><p>{row.name || "Sin nombre"} · {row.email}<br />Instalación: {row.origin}</p><p className="privacy-message">{row.message}</p>
      <form method="post" className="stack" key={row.id + row.updatedAt} onSubmit={e => { e.preventDefault(); const d = new FormData(e.currentTarget); setBusy(true); void request("/" + row.id, "PATCH", { status: d.get("status"), reply: d.get("reply"), revision: row.updatedAt }).then(() => setRevision(n => n + 1)).catch(e => setError(e.message)).finally(() => setBusy(false)); }}><label>Respuesta para la persona solicitante<textarea name="reply" minLength={5} maxLength={4000} required defaultValue={row.reply} rows={4} /></label><label>Estado<select name="status" defaultValue={row.status === "PENDING" ? "IN_REVIEW" : row.status}>{Object.entries(statuses).filter(([v]) => v !== "PENDING").map(([v, text]) => <option key={v} value={v}>{text}</option>)}</select></label><button disabled={busy}>Guardar respuesta y estado</button></form>
    </article>)}
    {!busy && !rows.length && <p>No hay solicitudes en esta selección.</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="row"><button disabled={busy || page <= 1} onClick={() => setPage(n => n - 1)}>Anterior</button><span>{total} solicitudes · Página {page}</span><button disabled={busy || page * 20 >= total} onClick={() => setPage(n => n + 1)}>Siguiente</button></div>
  </div>;
}
