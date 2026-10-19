"use client";
import { useEffect, useRef, useState } from "react";
import type { SubproductStatistics } from "../../lib/subproduct-statistics-types";
import type { OrderProgress } from "./order-progress";
const active = (o: OrderProgress) =>
  o.running > 0 ||
  ["QUEUED", "STARTING", "ACTIVE", "PAUSING"].includes(o.status);
export function useSubproductStatuses(
  project: string,
  product: string,
  from = "",
  to = "",
) {
  const [orders, setOrders] = useState<Record<string, OrderProgress>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statistics, setStatistics] = useState<
    Record<string, SubproductStatistics>
  >({});
  const [statisticsError, setStatisticsError] = useState("");
  const latest = useRef(orders);
  latest.current = orders;
  useEffect(() => {
    const controller = new AbortController();
    setStatistics({});
    setStatisticsError("");
    let fetching = false;
    const load = async () => {
      if (
        fetching ||
        controller.signal.aborted ||
        document.visibilityState !== "visible"
      )
        return;
      fetching = true;
      try {
        const [r, c] = await Promise.all([
          fetch(
            "/api/orders?" +
              new URLSearchParams({ project, product, includeClosed: "true" }),
            { signal: controller.signal, cache: "no-store" },
          ),
          fetch(
            "/api/categories/" +
              product +
              "/image-counts?" +
              new URLSearchParams({ statistics: "true", from, to }),
            {
              signal: controller.signal,
              cache: "no-store",
            },
          ),
        ]);
        if (c.ok) {
          const rows: {
            id: string;
            count: number;
            statistics: SubproductStatistics;
          }[] = await c.json();
          if (!controller.signal.aborted) {
            setStatistics(
              Object.fromEntries(rows.map((row) => [row.id, row.statistics])),
            );
            setStatisticsError("");
            setCounts(
              Object.fromEntries(rows.map((row) => [row.id, row.count])),
            );
          }
        } else if (!controller.signal.aborted) {
          const body = await c.json();
          setStatisticsError(
            body.error ?? "No se pudieron actualizar los contadores.",
          );
        }
        if (!r.ok) return;
        const rows: OrderProgress[] = await r.json();
        const next: Record<string, OrderProgress> = {};
        for (const row of rows) {
          const id = row.scope?.subproduct;
          if (id && (!next[id] || row.createdAt > next[id].createdAt))
            next[id] = row;
        }
        if (!controller.signal.aborted) {
          latest.current = next;
          setOrders(next);
        }
      } catch {
        if (!controller.signal.aborted)
          setStatisticsError(
            "No se pudieron actualizar los contadores. Vuelve a abrir el período para intentarlo otra vez.",
          );
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (Object.values(latest.current).some(active)) void load();
    }, 5000);
    const channel = new BroadcastChannel("studio-updates");
    channel.onmessage = () => void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      channel.close();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [project, product, from, to]);
  return { orders, counts, statistics, statisticsError };
}
export function SubproductStatus({ order }: { order?: OrderProgress }) {
  if (!order) return <span className="badge subproduct-status">Sin orden</span>;
  const error =
    order.status !== "STOPPED" &&
    (order.failed > 0 ||
      order.uncertain > 0 ||
      ["NEEDS_REVIEW", "DISPATCH_UNCERTAIN"].includes(order.status));
  const label = error
    ? "Error · revisar"
    : ({
        QUEUED: "Pendiente · en cola",
        STARTING: "Pendiente · iniciando",
        ACTIVE: "En producción",
        PAUSING: "Pausando",
        PAUSED: "En pausa",
        STOPPED: "Detenido",
        REVIEW: "Pendiente de aprobación",
        COMPLETED: "Completado",
        ACCEPTED: "Completado",
      }[order.status] ?? order.status);
  return (
    <span
      role="status"
      title="Estado actual del último lote; independiente del período de los contadores."
      aria-live="polite"
      className={
        "badge subproduct-status " +
        (error
          ? "status-error"
          : ["COMPLETED", "ACCEPTED"].includes(order.status)
            ? "status-completed"
            : "status-pending")
      }
    >
      Último lote · {label} · {order.completed}/{order.target}
    </span>
  );
}

export function SubproductCounters({
  statistics,
}: {
  statistics?: SubproductStatistics;
}) {
  const metrics: [keyof SubproductStatistics, string, string][] = [
    [
      "generated",
      "Generadas",
      "Total de imágenes producidas en el período, incluidas las eliminadas o caducadas. No cuenta versiones manuales.",
    ],
    [
      "deleted",
      "Eliminadas",
      "Imágenes generadas que están en la papelera o que retiraste de tu Biblioteca. No incluye caducadas ni eliminaciones personales de otra cuenta.",
    ],
    [
      "unapproved",
      "No aprobadas",
      "Primeras muestras generadas que siguen sin aprobar, incluidas las retiradas. No cuenta las demás variaciones.",
    ],
    [
      "approvalBlocked",
      "Sin generar",
      "Imágenes pendientes o canceladas cuya primera muestra sigue sin aprobar. No incluye cola anterior a la muestra ni imágenes fallidas.",
    ],
    [
      "failed",
      "Errores",
      "Solicitudes de imagen fallidas en el período. Los resultados inciertos se indican por separado.",
    ],
    ...(statistics?.uncertain
      ? [
          [
            "uncertain",
            "Inciertas",
            "Solicitudes con resultado o cargo sin confirmar; no se reintentan automáticamente.",
          ] as [keyof SubproductStatistics, string, string],
        ]
      : []),
  ];
  return (
    <span
      className="subproduct-counters"
      role="group"
      aria-label="Contadores de imágenes del período"
    >
      {metrics.map(([key, label, title]) => (
        <span
          className={"subproduct-counter counter-" + key}
          title={title}
          key={key}
        >
          <strong>{statistics?.[key] ?? "…"}</strong> {label}
        </span>
      ))}
    </span>
  );
}
