"use client";
import { useEffect, useState } from "react";
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch("/api/payments/" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo configurar el cobro.");
  return b;
}
export function PaymentSettings() {
  const [rows, setRows] = useState<any[]>([]),
    [provider, setProvider] = useState("mercadopago"),
    [mode, setMode] = useState("SANDBOX"),
    [currency, setCurrency] = useState("PEN"),
    [rate, setRate] = useState(""),
    [merchant, setMerchant] = useState(""),
    [enabled, setEnabled] = useState(false),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    void api("connections")
      .then(setRows)
      .catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    const row = rows.find((r) => r.provider === provider);
    if (row) {
      setMode(row.mode);
      setCurrency(row.currency);
      setRate(String(Number(row.exchangeRateMicros) / 1e6));
      setMerchant(row.merchantId);
      setEnabled(row.enabled);
    }
  }, [rows, provider]);
  const current = rows.find((r) => r.provider === provider);
  function select(p: string) {
    setProvider(p);
    const row = rows.find((r) => r.provider === p);
    setKeys({});
    setMode(row?.mode ?? "SANDBOX");
    setCurrency(p === "paypal" ? "USD" : (row?.currency ?? "PEN"));
    setRate(
      p === "paypal"
        ? "1"
        : row
          ? String(Number(row.exchangeRateMicros) / 1e6)
          : "",
    );
    setMerchant(row?.merchantId ?? "");
    setEnabled(row?.enabled ?? false);
    setMessage("");
  }
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      const next = await api("connections");
      setRows(next);
      setKeys({});
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  const fields =
    provider === "paypal"
      ? [
          ["clientId", "Client ID"],
          ["clientSecret", "Client Secret"],
          ["webhookId", "Webhook ID"],
        ]
      : [
          ["accessToken", "Access Token"],
          ["webhookSecret", "Secreto de firma de Webhooks"],
        ];
  return (
    <section className="stack">
      <h1>Configuración de pagos</h1>
      <p>
        Conecta Mercado Pago o PayPal. Las claves se cifran en el servidor y
        nunca se devuelven completas. Los cobros van a tu cuenta de la pasarela;
        no a la cuenta de IA.
      </p>
      <div className="panel stack">
        <div className="fields">
          <label>
            Pasarela
            <select
              value={provider}
              disabled={busy}
              onChange={(e) => select(e.target.value)}
            >
              <option value="mercadopago">Mercado Pago</option>
              <option value="paypal">PayPal</option>
            </select>
          </label>
          <label>
            Entorno
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="SANDBOX">Pruebas · no activa planes reales</option>
              <option value="LIVE">Producción · cobra dinero real</option>
            </select>
          </label>
        </div>
        <p className={"notice " + (current?.verified ? "" : "warning")}>
          {current?.verified
            ? "Credenciales verificadas · no acredita una venta real"
            : "Guarda y verifica las credenciales antes de ofrecer esta pasarela."}
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api("connections", "PUT", {
                  provider,
                  mode,
                  currency,
                  exchangeRateMicros: String(Math.round(Number(rate) * 1e6)),
                  merchantId: merchant,
                  enabled,
                  credentials: keys,
                }),
              "Configuración guardada. Verifica la conexión antes de cobrar.",
            );
          }}
        >
          <div className="fields">
            <label>
              Identificador del vendedor / Merchant ID
              <input
                required
                value={merchant}
                maxLength={80}
                disabled={busy}
                onChange={(e) => setMerchant(e.target.value)}
              />
              <span className="hint">
                {provider === "paypal"
                  ? "ID de comerciante de tu cuenta Business; no es tu correo."
                  : "ID numérico de tu cuenta de vendedor de Mercado Pago."}
              </span>
            </label>
            {fields.map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  name={"payment-" + k}
                  type="password"
                  autoComplete="new-password"
                  maxLength={1000}
                  value={keys[k] ?? ""}
                  disabled={busy}
                  required={!current?.maskedCredentials?.[k]}
                  placeholder={
                    current?.maskedCredentials?.[k] ?? "Introduce este dato"
                  }
                  onChange={(e) =>
                    setKeys((old) => ({ ...old, [k]: e.target.value }))
                  }
                />
                <span className="hint">
                  {current?.maskedCredentials?.[k]
                    ? "Guardado: " +
                      current.maskedCredentials[k] +
                      ". Déjalo vacío para conservarlo."
                    : "Solo OWNER puede guardar o reemplazar este dato."}
                </span>
              </label>
            ))}
          </div>
          <div className="fields">
            <label>
              Moneda del cobro
              <select
                disabled={busy || provider === "paypal"}
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setRate(e.target.value === "USD" ? "1" : "");
                }}
              >
                <option value="PEN">PEN · soles</option>
                <option value="USD">USD · dólares</option>
              </select>
            </label>
            <label>
              Conversión: 1 USD equivale a
              <input
                required
                type="number"
                min="0.000001"
                max="9999"
                step="0.000001"
                value={provider === "paypal" ? "1" : rate}
                disabled={busy || provider === "paypal" || currency === "USD"}
                onChange={(e) => setRate(e.target.value)}
              />
              <span className="hint">
                {currency === "PEN"
                  ? "Introduce tu tipo de cambio comercial. Se muestra al comprador y queda fijado en su compra; no se consulta una tasa automática."
                  : "Cobro en USD, sin conversión."}
              </span>
            </label>
          </div>
          <label className="row">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Ofrecer esta pasarela al contratar planes
          </label>
          <button className="primary" disabled={busy}>
            Guardar configuración de pagos
          </button>
        </form>
        <div className="row">
          <button
            disabled={busy || !current}
            onClick={() =>
              void run(
                () => api("connections/" + provider + "/verify", "POST", {}),
                "Credenciales verificadas. Falta probar una compra completa en tu cuenta.",
              )
            }
          >
            Verificar credenciales · sin cobrar
          </button>
          <button
            className="danger"
            disabled={busy || !current}
            onClick={() => {
              if (
                confirm(
                  "¿Eliminar estas credenciales? Se bloquearán nuevas compras por esta pasarela. Las compras pendientes pueden necesitar revisión.",
                )
              )
                void run(
                  () => api("connections/" + provider, "DELETE"),
                  "Credenciales eliminadas.",
                );
            }}
          >
            Eliminar credenciales
          </button>
        </div>
        <details>
          <summary>Registrar el webhook de confirmación</summary>
          <p>
            En el panel de tu pasarela registra esta URL para recibir
            confirmaciones firmadas:
          </p>
          <code style={{ overflowWrap: "anywhere" }}>
            {typeof window !== "undefined" ? window.location.origin : ""}
            /api/payments/webhook/{provider}
          </code>
          <p>
            {provider === "paypal"
              ? "Selecciona el evento PAYMENT.CAPTURE.COMPLETED y copia aquí su Webhook ID."
              : "Selecciona el evento Pagos (payment) y copia el secreto de firma. Usa credenciales del mismo entorno."}
          </p>
          <p>
            Guardar o volver desde la página de pago no activa un plan. Se
            comprueban firma, vendedor, moneda, importe y compra. Las pruebas
            Sandbox no conceden planes pagados reales.
          </p>
        </details>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
export function PlanCheckout({ onPaid }: { onPaid: () => void }) {
  const [plans, setPlans] = useState<any[]>([]),
    [options, setOptions] = useState<any[]>([]),
    [orders, setOrders] = useState<any[]>([]),
    [plan, setPlan] = useState("INICIO"),
    [provider, setProvider] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function load() {
    const [p, o, h] = await Promise.all([
      fetch("/api/plans/available").then((r) => r.json()),
      api("options"),
      api("purchases"),
    ]);
    setPlans(p);
    setOptions(o);
    setOrders(h);
    setProvider((old) => old || o[0]?.provider || "");
  }
  useEffect(() => {
    const selected = new URLSearchParams(location.search).get("plan");
    if (selected) setPlan(selected);
    void load().catch((e) => setMessage(e.message));
  }, []);
  const selected = plans.find((p) => p.id === plan),
    connection = options.find((o) => o.provider === provider),
    total =
      selected && connection
        ? Math.round(
            (selected.priceCents * Number(connection.exchangeRateMicros)) / 1e6,
          ) / 100
        : 0;
  async function run(fn: () => Promise<any>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fn();
      await load();
      onPaid();
      if (r?.checkoutUrl && r.status === "PENDING")
        setMessage("Enlace preparado. Abre la pasarela para pagar.");
      else
        setMessage(
          r?.status === "PAID"
            ? "Pago confirmado: plan activado."
            : r?.status === "TEST_COMPLETED"
              ? "Prueba confirmada; no activa un plan real."
              : "Aún no hay un pago confirmado.",
        );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo confirmar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <h2>Contratar o renovar un plan</h2>
      <p>
        Compra de 30 días, sin renovación automática. Las cuotas de imágenes y
        de IA se cuentan por mes calendario de Lima; cambiar de plan no reinicia
        el consumo del mes. El plan se activa solo tras confirmar el pago.
      </p>
      {options.length ? (
        <>
          <div className="fields">
            <label>
              Plan
              <select
                disabled={busy}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · US${(p.priceCents / 100).toFixed(2)}/mes
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pagar con
              <select
                disabled={busy}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.provider} value={o.provider}>
                    {o.provider === "paypal" ? "PayPal" : "Mercado Pago"}
                    {o.mode === "SANDBOX" ? " · PRUEBAS" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            <strong>
              Total a pagar: {connection?.currency} {total.toFixed(2)}
            </strong>
            {connection?.currency === "PEN" &&
              ` · Tipo de cambio: ${Number(connection.exchangeRateMicros) / 1e6} PEN por USD.`}
          </p>
          <button
            className="primary"
            disabled={busy || !connection || !selected}
            onClick={() => {
              if (
                confirm(
                  `¿Preparar el pago de ${connection.currency} ${total.toFixed(2)} por el plan ${selected.name}?${connection.mode === "SANDBOX" ? " Es una prueba y no activa acceso real." : ""}`,
                )
              )
                void run(() =>
                  api("purchases", "POST", {
                    planId: plan,
                    provider,
                    requestId: crypto.randomUUID(),
                  }),
                );
            }}
          >
            Preparar pago seguro
          </button>
        </>
      ) : (
        <p className="notice">
          El OWNER todavía no ha habilitado y verificado una pasarela. Puedes
          comparar planes o solicitar su asignación.
        </p>
      )}
      <h3>Mis compras recientes</h3>
      {orders.map((o) => (
        <article key={o.id} className="card stack">
          <strong>
            {o.planName} · {o.currency} {(o.amountCents / 100).toFixed(2)}
          </strong>
          <span>
            {(
              {
                PAID: "Pagado · plan activado",
                PENDING: "Esperando pago",
                CREATING: "Preparando enlace",
                REVIEW: "Revisión necesaria",
                TEST_COMPLETED: "Prueba confirmada · sin activación real",
              } as Record<string, string>
            )[o.status] ?? o.status}
          </span>
          {o.error && <p>{o.error}</p>}
          {o.status === "PENDING" && (
            <div className="row">
              <a
                className="button primary"
                href={o.checkoutUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ir a pagar en{" "}
                {o.provider === "paypal" ? "PayPal" : "Mercado Pago"} ↗
              </a>
              {o.provider === "paypal" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "¿Confirmar el cobro de esta compra que aprobaste en PayPal? Se puede cobrar dinero real.",
                      )
                    )
                      void run(() =>
                        api("purchases/" + o.id + "/capture", "POST", {}),
                      );
                  }}
                >
                  Confirmar pago aprobado en PayPal
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    api("purchases/" + o.id + "/refresh", "POST", {}),
                  )
                }
              >
                Consultar estado
              </button>
            </div>
          )}
        </article>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </section>
  );
}
