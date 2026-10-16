"use client";
import { ProviderDailyCosts } from "./provider-daily-costs";
import { useEffect, useState } from "react";
import {
  HierarchyFilters,
  hierarchyFromLocation,
  type HierarchyValue,
} from "./hierarchy-filters";
import { parseUsdMicros, usdMicros } from "../../lib/usage-format";
type Row = {
  id: string;
  jobId: string;
  actorName: string;
  createdAt: string;
  model: string;
  status: string;
  reservedMicros: string;
  actualMicros: string | null;
  costConfirmation: {
    id?: string;
    source: string;
    confirmedAt: string;
    reference?: string;
  } | null;
  contexts: {
    projectName: string;
    productName?: string;
    subproductName?: string;
  }[];
};
type Report = {
  rows: Row[];
  total: number;
  canReconcile: boolean;
  page: number;
  pages: number;
  summary: {
    reservedMicros: string;
    knownActualMicros: string;
    knownCosts: number;
    unknownCosts: number;
    uncertain: number;
  };
};
const labels: Record<string, string> = {
  RESERVED: "Reserva pendiente",
  RELEASED: "Reserva liberada",
  UNCERTAIN: "Cargo incierto",
  CONSUMED_ESTIMATE: "Procesado con reserva estimada",
};
function CostEditor({
  row,
  close,
  saved,
}: {
  row: Row;
  close: () => void;
  saved: () => void;
}) {
  const [amount, setAmount] = useState(
    row.actualMicros === null ? "" : usdMicros(row.actualMicros),
  );
  const [reference, setReference] = useState(
    row.costConfirmation?.reference ?? "",
  );
  const [expected] = useState({
    expectedActualMicros: row.actualMicros,
    expectedConfirmationId: row.costConfirmation?.id ?? null,
  });
  const [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="stack cost-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (parseUsdMicros(amount) === null) {
          setError(
            "Introduce USD sin separador de miles y con hasta seis decimales.",
          );
          return;
        }
        setSaving(true);
        setError("");
        void fetch(`/api/usage/${row.id}/reconcile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd: amount,
            reference,
            confirmed,
            ...expected,
          }),
        })
          .then(async (response) => {
            const result = await response.json();
            if (!response.ok)
              throw Error(result.error ?? "No se pudo registrar el coste.");
            saved();
          })
          .catch((e) =>
            setError(
              e instanceof Error ? e.message : "No se pudo registrar el coste.",
            ),
          )
          .finally(() => setSaving(false));
      }}
    >
      <label>
        Importe comprobado · USD
        <input
          type="text"
          inputMode="decimal"
          maxLength={16}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          disabled={saving}
        />
        <span className="hint">
          Introduce el coste comprobado de esta operación, incluidos los modelos
          que se utilizaron. Usa punto o coma decimal, hasta seis decimales.
          Cero solo si confirmaste que no hubo cargo. No distribuyas una factura
          agregada como si fuera un coste exacto.
        </span>
      </label>
      <label>
        Referencia de comprobación
        <input
          type="text"
          minLength={3}
          maxLength={120}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
          disabled={saving}
        />
        <span className="hint">
          Por ejemplo: identificador de operación o comprobante y fecha. Visible
          únicamente al OWNER. No pegues claves API ni datos de tarjeta.
        </span>
      </label>
      <label className="row">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={saving}
        />
        Confirmo que revisé este importe en el proveedor; no es una estimación.
      </label>
      <p className="hint">
        Registrar el coste no modifica reservas, estado incierto, presupuestos
        ni factura del proveedor. Las correcciones quedan en Historial.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" disabled={saving || !confirmed}>
          Guardar coste comprobado
        </button>
        <button type="button" disabled={saving} onClick={close}>
          Cancelar registro
        </button>
      </div>
    </form>
  );
}
function CostCell({
  row,
  canReconcile,
  saved,
}: {
  row: Row;
  canReconcile: boolean;
  saved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <span>{usdMicros(row.actualMicros)}</span>
      {row.costConfirmation && (
        <p className="hint">
          {row.costConfirmation.source} ·{" "}
          {new Date(row.costConfirmation.confirmedAt).toLocaleString("es-PE", {
            timeZone: "America/Lima",
          })}
        </p>
      )}
      {canReconcile &&
        ["CONSUMED_ESTIMATE", "UNCERTAIN", "RELEASED"].includes(row.status) &&
        (editing ? (
          <CostEditor
            row={row}
            close={() => setEditing(false)}
            saved={() => {
              setEditing(false);
              saved();
            }}
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)}>
            {row.actualMicros === null
              ? "Registrar coste comprobado"
              : "Corregir coste comprobado"}
          </button>
        ))}
    </>
  );
}
export function UsagePanel() {
  const [hierarchy, setHierarchy] = useState<HierarchyValue>(
    hierarchyFromLocation,
  );
  const [ancestors, setAncestors] = useState<
    { label: string; summary: Report["summary"] }[]
  >([]);
  const [ancestorError, setAncestorError] = useState("");
  const [data, setData] = useState<Report | null>(null),
    [days, setDays] = useState("30"),
    [status, setStatus] = useState(""),
    [cost, setCost] = useState("all"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const params = new URLSearchParams({
    days,
    status,
    cost,
    q: query,
    page: String(page),
    ...hierarchy,
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      void fetch("/api/usage/list?" + params, {
        signal: controller.signal,
        cache: "no-store",
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok)
            throw Error(body.error ?? "No se pudo consultar el consumo.");
          if (active) {
            setData(body);
            setError("");
            if (page > body.pages) setPage(body.pages);
          }
        })
        .catch((e) => {
          if (active && !controller.signal.aborted) {
            setData(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 200);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [params, version, page]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!hierarchy.project) {
      setAncestors([]);
      setAncestorError("");
      return;
    }
    const levels = [
      {
        label:
          hierarchy.project === "none" ? "Sin proyecto · pruebas" : "Proyecto",
        product: "",
        subproduct: "",
      },
      ...(hierarchy.product
        ? [{ label: "Producto", product: hierarchy.product, subproduct: "" }]
        : []),
      ...(hierarchy.subproduct
        ? [
            {
              label: "Subproducto",
              product: hierarchy.product,
              subproduct: hierarchy.subproduct,
            },
          ]
        : []),
    ];
    void Promise.all(
      levels.map(async (level) => {
        const p = new URLSearchParams(params);
        p.set("product", level.product);
        p.set("subproduct", level.subproduct);
        p.set("page", "1");
        const r = await fetch("/api/usage/summary?" + p, {
          cache: "no-store",
          signal: controller.signal,
        });
        const b = await r.json();
        if (!r.ok)
          throw Error(b.error ?? "No se pudo consultar el total del ámbito.");
        return { label: level.label, summary: b.summary };
      }),
    )
      .then((rows) => {
        if (active) {
          setAncestors(rows);
          setAncestorError("");
        }
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) {
          setAncestors([]);
          setAncestorError(e.message);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    params,
    version,
    hierarchy.project,
    hierarchy.product,
    hierarchy.subproduct,
  ]);
  async function download() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/usage/export?" + params, {
        cache: "no-store",
      });
      if (!response.ok) {
        const b = await response.json();
        throw Error(b.error ?? "No se pudo preparar el informe.");
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "consumo-ia.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo descargar el informe.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="stack usage-panel">
      <h1>Costos y consumo de IA</h1>
      <p className="muted">
        Reservas locales y costes reales informados, separados. Una reserva no
        es una factura; un coste no informado permanece desconocido. OWNER ve
        todas las cuentas; las demás ven sus operaciones y las generaciones
        terminadas de espacios disponibles para su cuenta.
      </p>
      <ProviderDailyCosts />
      <HierarchyFilters
        onAllDates={() => setDays("all")}
        value={hierarchy}
        onChange={(v) => {
          if (v.from !== hierarchy.from || v.to !== hierarchy.to)
            setDays("all");
          setHierarchy(v);
          setPage(1);
        }}
      />
      <div className="fields">
        <label>
          Período del consumo
          <select
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              setHierarchy((v) => ({ ...v, from: "", to: "" }));
              setPage(1);
            }}
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="all">Todo el historial</option>
          </select>
        </label>
        <label>
          Estado del consumo
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Coste real
          <select
            value={cost}
            onChange={(e) => {
              setCost(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Todos</option>
            <option value="known">Informado</option>
            <option value="unknown">No informado · reserva no liberada</option>
          </select>
        </label>
        <label>
          Buscar modelo
          <input
            type="search"
            maxLength={100}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Nombre del modelo…"
          />
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          Actualizar consumo
        </button>
        <button
          type="button"
          disabled={busy || exporting || !data?.total}
          onClick={() => void download()}
        >
          Descargar informe CSV
        </button>
      </div>
      <p className="hint">
        El informe incluye todas las coincidencias del filtro, hasta 2000
        operaciones; no solo la página visible. Puedes abrirlo en Excel. Los
        períodos usan días de Lima.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && !data && <p role="status">Consultando consumo…</p>}
      {ancestorError && (
        <p className="notice error" role="alert">
          {ancestorError}
        </p>
      )}
      {ancestors.length > 0 && (
        <section className="panel stack">
          <h2>Totales por ámbito disponible</h2>
          <p className="hint">
            Se calculan con los mismos filtros de fecha, estado, modelo y coste.
            Un importe parcial no incluye los costes todavía desconocidos.
          </p>
          <div className="metrics">
            {ancestors.map((a) => (
              <div key={a.label}>
                <strong>
                  {a.summary.knownCosts
                    ? "USD " + usdMicros(a.summary.knownActualMicros)
                    : "No informado"}
                </strong>
                <span>{a.label} · coste comprobado/informado</span>
                <span>
                  {a.summary.unknownCosts} costes no informados · reserva USD{" "}
                  {usdMicros(a.summary.reservedMicros)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {data && (
        <>
          <div className="metrics">
            <div>
              <strong>USD {usdMicros(data.summary.reservedMicros)}</strong>
              <span>Reservas no liberadas del filtro completo</span>
            </div>
            <div>
              <strong>
                {data.summary.knownCosts
                  ? "USD " + usdMicros(data.summary.knownActualMicros)
                  : "No informado"}
              </strong>
              <span>
                Coste informado en {data.summary.knownCosts} operaciones
              </span>
            </div>
            <div>
              <strong>{data.summary.unknownCosts}</strong>
              <span>Costes no informados</span>
            </div>
            <div>
              <strong>{data.summary.uncertain}</strong>
              <span>Cargos inciertos por revisar</span>
            </div>
          </div>
          <p>
            {data.total} operaciones · página {data.page} de {data.pages} · 50
            por página
          </p>
          <div className="table-wrap">
            <table>
              <caption>Operaciones del filtro · importes en USD</caption>
              <thead>
                <tr>
                  <th>Fecha · Lima</th>
                  <th>Persona y recurso</th>
                  <th>Modelo y estado</th>
                  <th>Reserva local USD</th>
                  <th>Coste real USD</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} data-usage-id={row.id}>
                    <td data-label="Fecha · Lima">
                      {new Date(row.createdAt).toLocaleString("es-PE", {
                        timeZone: "America/Lima",
                      })}
                    </td>
                    <td data-label="Persona y recurso">
                      {row.actorName}
                      <br />
                      {row.contexts[0]
                        ? [
                            row.contexts[0].projectName,
                            row.contexts[0].productName,
                            row.contexts[0].subproductName,
                          ]
                            .filter(Boolean)
                            .join(" / ")
                        : "Recurso no disponible"}
                    </td>
                    <td data-label="Modelo y estado">
                      {row.model}
                      <br />
                      {labels[row.status] ?? row.status}
                    </td>
                    <td data-label="Reserva local USD">
                      {usdMicros(row.reservedMicros)}
                    </td>
                    <td data-label="Coste real USD">
                      <CostCell
                        row={row}
                        canReconcile={data.canReconcile}
                        saved={() => {
                          setMessage(
                            "Coste comprobado registrado. El historial conserva las correcciones y las reservas no cambian.",
                          );
                          setVersion((v) => v + 1);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length && (
            <div className="empty">No hay operaciones para estos filtros.</div>
          )}
          <div className="row">
            <button
              type="button"
              disabled={busy || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Página anterior
            </button>
            <button
              type="button"
              disabled={busy || page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Página siguiente
            </button>
          </div>
        </>
      )}
    </section>
  );
}
