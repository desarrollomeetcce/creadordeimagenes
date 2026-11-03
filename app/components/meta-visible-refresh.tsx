"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJsonResponse } from "../../lib/http-response";
type Target = { id: string; accountId: string };
type Result = {
  updated: boolean;
  statusUpdated?: boolean;
  covered?: boolean;
  nextAt?: string | null;
  checkedAt?: string | null;
  waiting?: boolean;
  authorizationRequired?: boolean;
  error?: string | null;
};
/** A separate, bounded read of the visible page; full catalogue/history imports keep their cursors. */
export function MetaVisibleRefresh({
  items,
  accounts,
  onUpdated,
  onReconnect,
}: {
  items: Target[];
  accounts: { id: string; canSync: boolean }[];
  onUpdated: () => void;
  onReconnect: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [checkedAt, setCheckedAt] = useState(""),
    running = useRef(false);
  const allowed = new Set(accounts.filter((a) => a.canSync).map((a) => a.id));
  const key = JSON.stringify(
    items
      .filter((o) => allowed.has(o.accountId))
      .map((o) => [o.accountId, o.id])
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
  );
  const currentKey = useRef(key);
  currentKey.current = key;
  const updated = useRef(onUpdated);
  updated.current = onUpdated;
  const mounted = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const notified = useRef(new Map<string, string>());
  const refresh = useCallback(async () => {
    if (running.current || document.visibilityState !== "visible") return;
    const pairs = JSON.parse(key) as string[][];
    if (!pairs.length) return;
    running.current = true;
    setBusy(true);
    let nextAt = Date.now() + 60000;
    let changed = false,
      needsAuth = false,
      latest = "",
      errors: string[] = [];
    try {
      const grouped = new Map<string, string[]>();
      for (const [a, id] of pairs)
        grouped.set(a, [...(grouped.get(a) ?? []), id]);
      // Sequential accounts share the provider's quota and avoid bursts across a large selection.
      for (const [accountId, objects] of grouped) {
        if (
          !mounted.current ||
          currentKey.current !== key ||
          document.visibilityState !== "visible"
        )
          break;
        try {
          const r: Result = await fetchJsonResponse(
            "/api/meta-ads/accounts/" + accountId + "/refresh-visible",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ objects }),
            },
          );
          changed ||=
            r.updated ||
            !!r.statusUpdated ||
            !!(
              r.covered &&
              r.checkedAt &&
              notified.current.get(accountId) !== r.checkedAt
            );
          if (r.checkedAt && (r.updated || r.covered)) {
            if (
              notified.current.size >= 1000 &&
              !notified.current.has(accountId)
            )
              notified.current.clear();
            notified.current.set(accountId, r.checkedAt);
          }
          const due = r.nextAt ? Date.parse(r.nextAt) : NaN;
          if (Number.isFinite(due)) nextAt = Math.min(nextAt, due + 100);
          needsAuth ||= !!r.authorizationRequired;
          if ((r.updated || r.covered) && r.checkedAt && r.checkedAt > latest)
            latest = r.checkedAt;
          if (r.error) errors.push(r.error);
          else if (r.waiting && !r.covered)
            errors.push("Esperando el turno de actualización de Meta.");
        } catch (e) {
          errors.push(
            e instanceof Error
              ? e.message
              : "No se pudo actualizar esta vista.",
          );
        }
      }
      if (!mounted.current || currentKey.current !== key) return;
      setAuth(needsAuth);
      if (latest) setCheckedAt(latest);
      setNotice(
        errors.length
          ? errors[0]
          : latest
            ? "Vista consultada: " +
              new Date(latest).toLocaleTimeString("es-PE", {
                timeZone: "America/Lima",
              })
            : "Esperando la próxima lectura.",
      );
      if (changed) updated.current();
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(false);
        if (timer.current) clearTimeout(timer.current);
        if (document.visibilityState === "visible")
          timer.current = setTimeout(
            () => void refreshRef.current(),
            currentKey.current !== key
              ? 0
              : Math.max(1000, Math.min(60000, nextAt - Date.now())),
          );
      }
    }
  }, [key]);
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    setCheckedAt("");
    setNotice("");
    const tick = () => {
      void refreshRef.current();
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(tick, 0);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [key]);
  if (key === "[]") return null;
  return (
    <section
      className="meta-visible-refresh"
      aria-label="Actualización breve de Meta"
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void refresh()}
        title={
          (notice ? notice + ". " : "") +
          "Consulta estados y gasto de hoy y ayer de los elementos visibles cada 60 s. No espera al histórico ni cambia las campañas."
        }
      >
        {busy
          ? "↻ Consultando Meta…"
          : checkedAt
            ? "↻ Meta · " +
              new Date(checkedAt).toLocaleTimeString("es-PE", {
                timeZone: "America/Lima",
              })
            : "↻ Actualizar vista"}
      </button>
      <details className="meta-refresh-notice">
        <summary
          title={notice || "Consulta estados y gasto de hoy/ayer"}
          aria-label="Ver estado de actualización"
        >
          ⓘ
        </summary>
        <div>
          {" "}
          <small role="status">
            {notice || "Estados y gasto de hoy/ayer · consulta cada 60 s"}
          </small>
          <small>
            Verde: activado · Gris: pausado · Borde ámbar: último estado sin
            verificar. Meta puede entregar métricas con retraso.
          </small>
        </div>
      </details>
      {auth && (
        <button type="button" onClick={onReconnect}>
          Reconectar Meta
        </button>
      )}
    </section>
  );
}
