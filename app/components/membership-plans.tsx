"use client";
import { useEffect, useState } from "react";
import { PlanCheckout } from "./payment-settings";
type Plan = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  monthlyImages: number | null;
  monthlyAIMicros: string | null;
  isPublic: boolean;
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
export function PublicPlans() {
  const [plans, setPlans] = useState<Plan[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void api("plans/public")
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="stack">
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
              : (data.plan?.name ?? "Sin plan asignado")}
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
  const [plans, setPlans] = useState<Plan[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = () => api("plans").then(setPlans);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const change = (id: string, k: string, v: unknown) =>
    setPlans((p) => p.map((x) => (x.id === id ? { ...x, [k]: v } : x)));
  return (
    <section className="panel stack" id="membership-plans">
      <h2>Planes y cuotas mensuales</h2>
      <p>
        Precio de venta del plan separado del presupuesto de IA. Las cuotas se
        aplican por usuario y mes calendario de Lima. Editar un plan cambia las
        cuotas de todas las cuentas asignadas a ese plan.
      </p>
      <a href="/plans" target="_blank" rel="noreferrer">
        Ver página pública de planes ↗
      </a>
      {plans.map((p) => (
        <details key={p.id} className="panel">
          <summary>
            {p.name} ·{" "}
            {p.isPublic ? amount(p.priceCents / 100) + "/mes" : "Solo interno"}{" "}
            · {p.monthlyImages ?? "Sin límite de"} imágenes
          </summary>
          <form
            className="inside stack"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              void api("plans/" + p.id, "PUT", {
                name: p.name,
                description: p.description,
                priceCents: p.priceCents,
                monthlyImages: p.monthlyImages,
                monthlyAIMicros: p.monthlyAIMicros,
              })
                .then(() => setMessage("Plan guardado."))
                .catch((e) => setMessage(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <div className="fields">
              <label>
                Nombre
                <input
                  value={p.name}
                  required
                  maxLength={80}
                  onChange={(e) => change(p.id, "name", e.target.value)}
                />
              </label>
              <label>
                Precio mensual · USD
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={p.priceCents / 100}
                  onChange={(e) =>
                    change(
                      p.id,
                      "priceCents",
                      Math.round(Number(e.target.value) * 100),
                    )
                  }
                />
              </label>
              {p.id !== "ILIMITADO" && (
                <>
                  <label>
                    Imágenes por mes
                    <input
                      type="number"
                      min={1}
                      required
                      value={p.monthlyImages ?? ""}
                      onChange={(e) =>
                        change(p.id, "monthlyImages", Number(e.target.value))
                      }
                    />
                  </label>
                  <label>
                    Presupuesto de IA por mes · USD
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={Number(p.monthlyAIMicros) / 1e6}
                      onChange={(e) =>
                        change(
                          p.id,
                          "monthlyAIMicros",
                          String(Math.round(Number(e.target.value) * 1e6)),
                        )
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <label>
              Descripción
              <textarea
                maxLength={500}
                value={p.description}
                onChange={(e) => change(p.id, "description", e.target.value)}
              />
            </label>
            <button disabled={busy}>Guardar este plan</button>
          </form>
        </details>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <p className="hint">
        El plan Ilimitado no se incluye en la página pública y solo OWNER puede
        asignarlo. Las cuentas existentes sin plan conservan su acceso hasta que
        OWNER las asigne.
      </p>
    </section>
  );
}
