"use client";
import { ErrorNotice } from "./error-notice";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OrderProgressCard,
  driveOrder,
  orderRequest,
  type OrderProgress,
} from "./order-progress";
export type ExecutionMode =
  "queue" | "background" | "user-queue" | "system-queue" | "here";
export function ExecutionChoice({
  value,
  onChange,
  disabled = false,
  label = "Opciones de generación",
}: {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <label className="execution-choice">
      {label}
      <select
        value={value === "queue" ? "user-queue" : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ExecutionMode)}
      >
        <option value="background">En segundo plano</option>
        <option value="user-queue">En cola · mis órdenes primero</option>
        <option value="system-queue">En cola · turno del sistema</option>
        <option value="here">Ejecución inmediata · en esta pantalla</option>
      </select>
      <small>
        Segundo plano permite cerrar la pestaña. Las colas esperan su turno sin
        iniciar más imágenes a la vez. Inmediata empieza al quedar libre tu
        generación actual.
      </small>
    </label>
  );
}
export function useProductionController(
  onUpdate?: () => Promise<void>,
  scope?: { project: string; product?: string; subproduct?: string },
  enabled = true,
) {
  const [orders, setOrders] = useState<OrderProgress[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [error, setError] = useState(""),
    [dispatching, setDispatching] = useState(false);
  const mounted = useRef(true),
    update = useRef(onUpdate),
    latest = useRef(orders),
    idsRef = useRef(ids),
    sending = useRef(false),
    pending = useRef<{ ids: string[]; mode: string; requestId: string } | null>(
      null,
    );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  latest.current = orders;
  idsRef.current = ids;
  update.current = onUpdate;
  const refresh = useCallback(async () => {
    if (!idsRef.current.length || !enabledRef.current) return;
    const r = await fetch(
      "/api/orders?" + new URLSearchParams({ ids: idsRef.current.join(",") }),
      { cache: "no-store" },
    );
    const b = await r.json();
    if (!r.ok) throw Error(b.error ?? "No se pudo consultar la orden.");
    if (mounted.current) {setOrders(b.filter((order:OrderProgress)=>!order.hiddenFromProduction));setError("");}
    await update.current?.();
  }, []);
  const scopeRevision = useRef(0);
  const scopeQuery = scope ? new URLSearchParams(scope).toString() : "";
  useEffect(() => {
    if (!scopeQuery || !enabled) return;
    const controller = new AbortController();
    const revision = ++scopeRevision.current;
    void fetch("/api/orders?" + scopeQuery, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const rows: OrderProgress[] = await r.json();
        if (!r.ok) throw Error("No se pudieron consultar las órdenes.");
        if (!controller.signal.aborted && revision === scopeRevision.current) {
          const visible = rows
            .filter(
              (o) =>
                o.running > 0 ||
                ((o.pending > 0 || o.failed > 0 || o.uncertain > 0 || !!o.error) &&
                  !["ACCEPTED", "COMPLETED", "STOPPED"].includes(o.status)),
            )
            .concat(
              rows
                .filter((o) =>
                  ["ACCEPTED", "COMPLETED", "STOPPED"].includes(o.status),
                )
                .slice(0, 1),
            );
          setOrders(visible);
          const next = visible.map((o) => o.id);
          idsRef.current = next;
          setIds(next);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [scopeQuery, enabled]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const order of latest.current)
        if (order.mode === "immediate" && order.status === "ACTIVE")
          void orderRequest(`/${order.id}/pause`).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!ids.length || !enabled) return;
    const load = () => {
      if (document.visibilityState === "visible")
        void refresh().catch((e) => setError(e.message));
    };
    load();
    const timer = setInterval(() => {
      if (
        latest.current.some(
          (o) =>
            ["QUEUED", "STARTING", "ACTIVE"].includes(o.status) ||
            o.running > 0,
        )
      )
        load();
    }, 5000);
    const channel = new BroadcastChannel("studio-updates");
    channel.onmessage = load;
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      channel.close();
      window.removeEventListener("focus", load);
    };
  }, [ids, refresh, enabled]);
  const start = async (
    _ready: string[],
    mode: ExecutionMode,
    allIds = _ready,
  ) => {
    if (!allIds.length) return;
    if (sending.current) throw Error("La orden se está enviando.");
    scopeRevision.current++;
    sending.current = true;
    setDispatching(true);
    setError("");
    const mapped =
      mode === "here" ? "immediate" : mode === "queue" ? "user-queue" : mode;
    try {
      const request = pending.current ?? {
        ids: allIds,
        mode: mapped,
        requestId: crypto.randomUUID(),
      };
      pending.current = request;
      const result = await orderRequest("", request);
      pending.current = null;
      const next = [...new Set([...result.orders, ...idsRef.current])].slice(
        0,
        100,
      );
      idsRef.current = next;
      setIds(next);
      await refresh();
      if (mapped === "immediate")
        void (async () => {
          for (const id of result.orders) {
            if (!mounted.current) break;
            await driveOrder(id, refresh, () => mounted.current);
          }
        })().catch((e) => {
          if (mounted.current) setError(e.message);
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la orden.");
      throw e;
    } finally {
      sending.current = false;
      if (mounted.current) setDispatching(false);
    }
  };
  const control = async (action: string) => {
    try {
      for (const id of idsRef.current) await orderRequest(`/${id}/${action}`);
      await refresh();
      if (action === "resume")
        for (const order of latest.current)
          if (order.mode === "immediate")
            void driveOrder(order.id, refresh, () => mounted.current).catch(
              (e) => setError(e.message),
            );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  };
  return {
    dismissError:()=>setError(""),
    orders,
    start,
    refresh,
    error,
    dispatching,
    uncertainDispatch: !!pending.current,
    resolveDispatch: () => {
      const p = pending.current;
      if (p)
        void start(
          p.ids,
          (p.mode === "immediate" ? "here" : p.mode) as ExecutionMode,
          p.ids,
        ).catch(() => {});
    },
    active: orders.some(
      (o) =>
        o.running > 0 ||
        (o.pending > 0 &&
          !["ACCEPTED", "COMPLETED", "STOPPED"].includes(o.status)),
    ),
    running: orders.some((o) => o.running > 0),
    paused: orders.some((o) => o.status === "PAUSED"),
    remaining: orders.reduce((n, o) => n + o.pending, 0),
    current: null as string | null,
    last: null as string | null,
    batchId: ids[0] ?? null,
    pause: () => void control("pause"),
    resume: () => void control("resume"),
    stop: () => void control("stop"),
  };
}
export type ProductionController = ReturnType<typeof useProductionController>;
export function ProductionControls({
  controller: c,
}: {
  controller: ProductionController;
}) {
  return (
    <div className="stack production-controls">
      {c.dispatching && <p role="status">Enviando orden…</p>}
      {c.orders.filter(order=>!order.hiddenFromProduction).map((order) => (
        <OrderProgressCard
          key={order.id}
          order={order}
          refresh={c.refresh}
          compact
        />
      ))}
      {c.uncertainDispatch && (
        <button
          type="button"
          disabled={c.dispatching}
          onClick={c.resolveDispatch}
        >
          Consultar el mismo envío
        </button>
      )}
      {c.error && <ErrorNotice message={c.error} onDismiss={c.dismissError} />}
    </div>
  );
}
