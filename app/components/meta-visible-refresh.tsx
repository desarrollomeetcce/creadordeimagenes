"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { visibleRefreshDelay } from "../../lib/meta-ads/realtime-policy";
import { fetchJsonResponse } from "../../lib/http-response";
type Target = { id: string; accountId: string };
type Result = {
  updated: boolean;
  automaticDisabled?: boolean;
  statusUpdated?: boolean;
  covered?: boolean;
  nextAt?: string | null;
  recoveryAt?: string | null;
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
  extraActions,
  manualOnly = false,
}: {
  manualOnly?: boolean;
  extraActions?:ReactNode;
  items: Target[];
  accounts: {
    id: string;
    canSync: boolean;
    autoSync?: boolean;
    connectionId?: string;
    connection?: { revision?: number };
  }[];
  onUpdated: () => void;
  onReconnect: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [auth, setAuth] = useState(false),
    [checkedAt, setCheckedAt] = useState(""),
    [recoveryUntil, setRecoveryUntil] = useState<number | null>(null),
    [pausedUntil, setPausedUntil] = useState<number | null>(null),
    running = useRef(false);
  const allowed = new Set(accounts.filter((a) => a.canSync).map((a) => a.id));
  const key = JSON.stringify(
    items
      .filter((o) => allowed.has(o.accountId))
      .map((o) => [o.accountId, o.id])
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
  );
  const visibleAccountIds = new Set(items.map((o) => o.accountId));
  const connectionKey = JSON.stringify(
    accounts
      .filter((a) => allowed.has(a.id) && visibleAccountIds.has(a.id))
      .map((a) => [
        a.id,
        a.connectionId ?? a.id,
        a.connection?.revision ?? 0,
        a.autoSync !== false,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  const fetchScope = key + connectionKey;
  const currentKey = useRef(fetchScope);
  currentKey.current = fetchScope;
  const rotation = useRef({ key: "", offset: 0 });
  const authHolds = useRef(new Map<string, string>());
  const paused = useRef(new Map<string, { until: number; error: string }>());

  const updated = useRef(onUpdated);
  updated.current = onUpdated;
  const mounted = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const notified = useRef(new Map<string, string>());
  const refresh = useCallback(
    async (recover = false, manual = false) => {
      if (running.current || document.visibilityState !== "visible" || (manualOnly && !manual)) return;
      const allPairs = (JSON.parse(key) as string[][]).filter(
        ([id]) =>
          manual || accounts.find((a) => a.id === id)?.autoSync !== false,
      );
      if (!allPairs.length) return;
      const rotationKey = fetchScope + JSON.stringify(allPairs);
      const offset =
        rotation.current.key === rotationKey ? rotation.current.offset : 0;
      const pairs = allPairs.slice(offset, offset + 25);
      running.current = true;
      setBusy(true);
      let nextAt: number | null = null;
      let pauseAt: number | null = null;
      let retryable = false;
      let needsAuth = false,
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
            currentKey.current !== fetchScope ||
            document.visibilityState !== "visible"
          )
            break;
          const account = accounts.find((a) => a.id === accountId),
            scope = JSON.stringify([
              account?.connectionId ?? accountId,
              account?.connection?.revision ?? 0,
            ]);
          const authError = authHolds.current.get(scope);
          if (authError) {
            needsAuth = true;
            errors.push(authError);
            continue;
          }
          const hold = paused.current.get(scope);
          if (!recover && hold && hold.until > Date.now()) {
            retryable = true;
            nextAt = Math.min(nextAt ?? Infinity, hold.until + 100);
            pauseAt = Math.min(pauseAt ?? Infinity, hold.until);
            errors.push(hold.error);
            continue;
          }
          try {
            const r: Result = await fetchJsonResponse(
              "/api/meta-ads/accounts/" + accountId + "/refresh-visible",
              {
                method: "POST",
                // Reads may finish server-side; a slow response must release the browser poller.
                signal: AbortSignal.timeout(25000),
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  objects,
                  ...(recover ? { recover: true } : {}),
                  ...(manual ? { manual: true } : {}),
                }),
              },
            );
            const accountChanged =
              r.updated ||
              !!r.statusUpdated ||
              !!(
                r.covered &&
                r.checkedAt &&
                notified.current.get(accountId) !== r.checkedAt
              );
            if(accountChanged && mounted.current && currentKey.current===fetchScope)updated.current();
            if (r.checkedAt && (r.updated || r.covered)) {
              if (
                notified.current.size >= 1000 &&
                !notified.current.has(accountId)
              )
                notified.current.clear();
              notified.current.set(accountId, r.checkedAt);
            }
            if (recover)
              setRecoveryUntil(r.recoveryAt ? Date.parse(r.recoveryAt) : null);
            const due = r.nextAt ? Date.parse(r.nextAt) : NaN;
            if (Number.isFinite(due))
              nextAt = Math.min(nextAt ?? Infinity, due + 100);
            if (
              r.waiting &&
              r.error &&
              Number.isFinite(due) &&
              due > Date.now()
            ) {
              if (paused.current.size >= 1000 && !paused.current.has(scope))
                paused.current.clear();
              paused.current.set(scope, { until: due, error: r.error });
              pauseAt = Math.min(pauseAt ?? Infinity, due);
            } else if (!r.error) paused.current.delete(scope);
            if (r.authorizationRequired) {
              if (
                authHolds.current.size >= 1000 &&
                !authHolds.current.has(scope)
              )
                authHolds.current.clear();
              authHolds.current.set(
                scope,
                r.error ?? "Reconecta Meta para renovar la autorización.",
              );
            } else retryable ||= !r.automaticDisabled;
            needsAuth ||= !!r.authorizationRequired;
            if ((r.updated || r.covered) && r.checkedAt && r.checkedAt > latest)
              latest = r.checkedAt;
            if (r.automaticDisabled)
              errors.push(
                "Actualización a petición: pulsa Actualizar vista para consultar esta cuenta.",
              );
            if (r.error) errors.push(r.error);
            else if (r.waiting && !r.covered)
              errors.push("Esperando el turno de actualización de Meta.");
          } catch (e) {
            retryable = true;
            errors.push(
              e instanceof Error && e.name === "TimeoutError"
                ? "Meta tardó demasiado en responder. Se conservan los datos y se volverá a consultar sin reiniciar el histórico."
                : e instanceof Error
                ? e.message
                : "No se pudo actualizar esta vista.",
            );
          }
        }
        if (!mounted.current || currentKey.current !== fetchScope) return;
        rotation.current = {
          key: rotationKey,
          offset: offset + 25 >= allPairs.length ? 0 : offset + 25,
        };
        retryable ||= allPairs.length > pairs.length;
        setAuth(needsAuth);
        setPausedUntil(pauseAt);
        if (latest) setCheckedAt(latest);
        setNotice(
          errors.length
            ? errors[0] +
                (pauseAt
                  ? " Próximo intento: " +
                    new Date(pauseAt).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    }) +
                    " (Lima)."
                  : "")
            : latest
              ? "Última consulta de datos recientes: " +
                new Date(latest).toLocaleTimeString("es-PE", {
                  timeZone: "America/Lima",
                })
              : "Esperando la próxima lectura.",
        );

      } finally {
        running.current = false;
        if (mounted.current) {
          setBusy(false);
          if (timer.current) clearTimeout(timer.current);
          if (
            document.visibilityState === "visible" &&
            (retryable || currentKey.current !== fetchScope)
          )
            timer.current = setTimeout(
              () => void refreshRef.current(),
              currentKey.current !== fetchScope
                ? 0
                : visibleRefreshDelay(nextAt),
            );
        }
      }
    },
    [key, connectionKey, manualOnly],
  );
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    setCheckedAt("");
    setNotice("");
    setPausedUntil(null);
    const tick = () => {
      void refreshRef.current();
    };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(tick, 750);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fetchScope]);
  if (key === "[]" && !extraActions) return null;
  return (
    <section
      className="meta-visible-refresh"
      aria-label="Actualización breve de Meta"
    >
      <button
        type="button"
        className="primary"
        disabled={key === "[]" || busy || (pausedUntil !== null && pausedUntil > Date.now())}
        onClick={() => void refresh(false, true)}
        title={
          (notice ? notice + ". " : "") +
          (manualOnly ? "Consulta hasta 25 candidatos de esta selección para recuperar la entrega de hoy. No carga el catálogo ni el histórico." : "Consulta estados y gasto de hoy y ayer de los elementos visibles cada 60 s. No espera al histórico ni cambia las campañas.")
        }
      >
        {busy
          ? "↻ Consultando Meta…"
          : pausedUntil && pausedUntil > Date.now()
            ? "Meta en pausa"
            : "↻ Actualizar vista"}
      </button>
      {extraActions&&<details className="meta-update-options"><summary aria-label="Opciones de actualización" title="Actualización completa y avance de sincronización">▾</summary><div>{extraActions}</div></details>}
      {pausedUntil && pausedUntil > Date.now() && (
        <button
          type="button"
          disabled={
            busy || (recoveryUntil !== null && recoveryUntil > Date.now())
          }
          onClick={() => void refresh(true, true)}
          title="Comprueba una vez estados y gasto de hoy/ayer de esta página. No reinicia el histórico. Respeta los plazos indicados por Meta y limita las comprobaciones por conexión."
        >
          Comprobar Meta
        </button>
      )}
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
            {notice || (manualOnly ? "Pulsa Actualizar vista para consultar hasta 25 elementos de esta selección." : "Estados y gasto de hoy/ayer · consulta cada 60 s")}
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
