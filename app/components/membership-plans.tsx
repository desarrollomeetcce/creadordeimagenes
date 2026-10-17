"use client";
import { useEffect, useState } from "react";
import { SearchSelect } from "./search-select";
import { roleLabels } from "../../lib/roles";
import { planLabel } from "../../lib/plan-label";
import { PlanCheckout } from "./payment-settings";
type Plan = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  monthlyImages: number | null;
  monthlyAIMicros: string | null;
  isPublic: boolean;
  customUserId?: string | null;
  customUser?: { email: string; name: string } | null;
};
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo consultar el plan.");
  return b;
}
export const amount = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "USD" }).format(
    n,
  );
export function PublicPlans({
  initialPlans,
  embedded = false,
}: {
  initialPlans?: Plan[];
  embedded?: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>(initialPlans ?? []),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialPlans) return;
    void api("plans/public")
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, [initialPlans]);
  return (
    <section className="stack">
      {!embedded && (
        <div className="heading">
          <div>
            <div className="eyebrow">Estudio AI · Planes mensuales</div>
            <h1>De una idea a una campaña</h1>
            <p>
              Organiza tus proyectos y crea afiches con inteligencia artificial.
            </p>
          </div>
          <a className="button" href="/">
            Ingresar
          </a>
        </div>
      )}
      <div className="grid plan-cards">
        {plans.map((p) => (
          <article key={p.id} className="panel stack">
            <h2>{p.name}</h2>
            <strong className="plan-price">
              {amount(p.priceCents / 100)} <small>/ mes</small>
            </strong>
            <p>{p.description}</p>
            <ul>
              <li>{p.monthlyImages} imágenes al mes</li>
              <li>
                Hasta {amount(Number(p.monthlyAIMicros) / 1e6)} de presupuesto
                de IA
              </li>
              <li>Proyectos, variaciones y descargas</li>
            </ul>
            <a className="button primary" href={"/?view=plans&plan=" + p.id}>
              Elegir {p.name}
            </a>
          </article>
        ))}
      </div>
      <p className="hint">
        Cuotas por mes calendario, hora de Lima. El presupuesto es un límite de
        uso dentro de la plataforma, no un depósito en tu cuenta del proveedor
        de IA. La contratación se completa desde tu cuenta; ningún plan se
        activa por hacer clic en este enlace.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function MyPlan({ canPurchase = true }: { canPurchase?: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api("plans/me")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel stack">
      <h1>Mi plan</h1>
      {canPurchase && (
        <PlanCheckout
          onPaid={() =>
            void api("plans/me")
              .then(setData)
              .catch((e) => setError(e.message))
          }
        />
      )}
      {error && <p className="notice error">{error}</p>}
      {data && (
        <>
          <h2>
            {data.ownerExempt
              ? "OWNER · acceso completo"
              : data.plan
                ? planLabel(data.plan)
                : "Sin plan asignado"}
          </h2>
          <p>
            {data.images} imágenes reservadas o utilizadas este mes
            {data.plan?.monthlyImages != null
              ? ` de ${data.plan.monthlyImages}`
              : ""}
            .
          </p>
          <p>
            Presupuesto de IA:{" "}
            {data.plan?.monthlyAIMicros
              ? amount(Number(data.plan.monthlyAIMicros) / 1e6)
              : "Sin cuota de plan asignada"}
            .
          </p>
          {data.validUntil && (
            <p>
              Vigencia:{" "}
              {new Date(data.validUntil).toLocaleDateString("es-PE", {
                timeZone: "America/Lima",
              })}
              .
            </p>
          )}
          <p className="hint">
            Las reservas canceladas se liberan; los resultados inciertos
            conservan su consumo reservado. Ilimitado elimina las cuotas de
            plan, pero conserva los permisos y los controles de seguridad de IA.
          </p>
          <a href="/plans">Comparar planes</a>
          <p className="hint">
            OWNER también puede asignar planes desde Usuarios.
          </p>
        </>
      )}
    </section>
  );
}
export function PlanSettings() {
  const [accounts, setAccounts] = useState<
    { email: string; name: string; role: string; status: string }[]
  >([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");
  useEffect(() => {
    let active = true;
    void api("users")
      .then((rows) => {
        if (active) setAccounts(rows);
      })
      .catch((e) => {
        if (active) setAccountsError(e.message);
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [plans, setPlans] = useState<Plan[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [custom, setCustom] = useState({
    name: "",
    email: "",
    priceCents: 2000,
    monthlyImages: 20,
    monthlyAIMicros: "10000000",
  });
  const load = () => api("plans").then(setPlans);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const change = (id: string, k: string, v: unknown) =>
    setPlans((current) =>
      current.map((p) => (p.id === id ? { ...p, [k]: v } : p)),
    );
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await load();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  function row(p: Plan) {
    return (
      <form
        key={p.id}
        className="plan-edit-row"
        data-plan-id={p.id}
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              api("plans/" + p.id, "PUT", {
                name: p.name,
                description: p.customUserId ? "" : p.description,
                priceCents: p.priceCents,
                monthlyImages: p.monthlyImages,
                monthlyAIMicros: p.monthlyAIMicros,
              }),
            "Plan guardado.",
          );
        }}
      >
        <label>
          Nombre
          <input
            aria-label={"Nombre del plan " + p.id}
            value={p.name}
            maxLength={80}
            required
            disabled={busy}
            onChange={(e) => change(p.id, "name", e.target.value)}
          />
        </label>
        <label>
          Precio · USD/mes
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={p.priceCents / 100}
            disabled={busy}
            onChange={(e) =>
              change(
                p.id,
                "priceCents",
                Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
        <label>
          Imágenes/mes
          <input
            type="number"
            min={1}
            max={1000000}
            required={p.id !== "ILIMITADO"}
            disabled={busy || p.id === "ILIMITADO"}
            placeholder="Sin límite"
            value={p.monthlyImages ?? ""}
            onChange={(e) =>
              change(p.id, "monthlyImages", Number(e.target.value))
            }
          />
        </label>
        <label>
          IA · USD/mes
          <input
            type="number"
            min="0.01"
            step="0.01"
            required={p.id !== "ILIMITADO"}
            disabled={busy || p.id === "ILIMITADO"}
            placeholder="Sin límite"
            value={
              p.monthlyAIMicros === null ? "" : Number(p.monthlyAIMicros) / 1e6
            }
            onChange={(e) =>
              change(
                p.id,
                "monthlyAIMicros",
                String(Math.round(Number(e.target.value) * 1e6)),
              )
            }
          />
        </label>
        {p.customUserId ? (
          <label>
            Usuario asignado
            <input
              type="email"
              value={p.customUser?.email ?? ""}
              readOnly
              title="Para otro destinatario, crea un plan personalizado nuevo."
            />
          </label>
        ) : (
          <label>
            Descripción
            <input
              value={p.description}
              maxLength={500}
              disabled={busy}
              onChange={(e) => change(p.id, "description", e.target.value)}
            />
          </label>
        )}
        <div className="plan-row-actions">
          <button
            type="submit"
            disabled={busy}
            aria-label={"Guardar plan " + p.name}
            title="Guardar este plan"
          >
            ✓
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            aria-label={"Eliminar plan " + p.name}
            title="Retirar de nuevas asignaciones y contrataciones"
            onClick={() => {
              if (
                confirm(
                  "¿Retirar este plan? Dejará de ofrecerse y no podrá asignarse de nuevo. Las cuentas que ya lo tengan conservan sus cuotas hasta que les asignes otro; no se borran pagos ni historial.",
                )
              )
                void run(
                  () => api("plans/" + p.id, "DELETE"),
                  "Plan retirado. Las cuentas actuales conservan sus condiciones.",
                );
            }}
          >
            ×
          </button>
        </div>
      </form>
    );
  }
  return (
    <section
      className="panel stack compact-plan-settings"
      id="membership-plans"
    >
      <div className="heading">
        <div>
          <h2>Planes y cuotas mensuales</h2>
          <p className="hint">
            Precio de venta y presupuesto de IA separados. Guardar cambia las
            cuotas de las cuentas de ese plan.
          </p>
        </div>
        <a href="/plans" target="_blank" rel="noreferrer">
          Ver página pública ↗
        </a>
      </div>
      <div className="plan-rows">
        {plans.filter((p) => !p.customUserId).map(row)}
      </div>
      <details className="custom-plans" data-custom-plans>
        <summary>
          Planes personalizados · {plans.filter((p) => p.customUserId).length}
        </summary>
        <p className="hint">
          Privados y asignados a una cuenta concreta. No aparecen en la página
          pública.
        </p>
        <div className="plan-rows">
          {plans.filter((p) => p.customUserId).map(row)}
        </div>
        <h3>Crear un plan personalizado</h3>
        <form
          className="plan-edit-row custom-create-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("plans/custom", "POST", custom);
              setCustom({
                name: "",
                email: "",
                priceCents: 2000,
                monthlyImages: 20,
                monthlyAIMicros: "10000000",
              });
            }, "Plan personalizado creado y asignado al usuario.");
          }}
        >
          <label>
            Nombre
            <input
              name="customPlanName"
              value={custom.name}
              required
              maxLength={80}
              disabled={busy}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
            />
          </label>
          <label>
            Precio · USD/mes
            <input
              name="customPlanPrice"
              type="number"
              min={0}
              step="0.01"
              required
              value={custom.priceCents / 100}
              disabled={busy}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  priceCents: Math.round(Number(e.target.value) * 100),
                })
              }
            />
          </label>
          <label>
            Imágenes/mes
            <input
              name="customPlanImages"
              type="number"
              min={1}
              max={1000000}
              required
              value={custom.monthlyImages}
              disabled={busy}
              onChange={(e) =>
                setCustom({ ...custom, monthlyImages: Number(e.target.value) })
              }
            />
          </label>
          <label>
            IA · USD/mes
            <input
              name="customPlanBudget"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={Number(custom.monthlyAIMicros) / 1e6}
              disabled={busy}
              onChange={(e) =>
                setCustom({
                  ...custom,
                  monthlyAIMicros: String(
                    Math.round(Number(e.target.value) * 1e6),
                  ),
                })
              }
            />
          </label>
          <div className="custom-plan-recipient">
            <SearchSelect
              label="Correo del usuario"
              name="customPlanEmail"
              value={custom.email}
              required
              disabled={busy}
              loading={accountsLoading}
              browseOnToggle
              onChange={(email) => setCustom({ ...custom, email })}
              onSelect={(option) => setCustom({ ...custom, email: option.id })}
              options={["OWNER", "ADMIN", "USER"].flatMap((role) =>
                accounts
                  .filter(
                    (account) =>
                      account.role === role && account.status === "APPROVED",
                  )
                  .map((account) => ({
                    id: account.email,
                    label: account.email,
                    detail: account.name,
                    group: roleLabels[role],
                  })),
              )}
            />
            {accountsError && (
              <span role="alert" className="hint">
                No se pudieron cargar las cuentas. Puedes escribir el correo
                directamente.
              </span>
            )}
          </div>
          <button disabled={busy} title="Crear y asignar al usuario">
            Crear y asignar
          </button>
        </form>
        <p className="hint">
          La cuenta debe existir y estar aprobada. Se reemplazará su plan actual
          sin fecha de vencimiento; no se cobrará dinero. Puedes definir su
          vigencia después en Usuarios.
        </p>
      </details>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="hint">
        Cuotas por mes calendario de Lima. Ilimitado solo interno. Retirar un
        plan no elimina las condiciones de las cuentas ya asignadas ni sus
        pagos.
      </p>
    </section>
  );
}
