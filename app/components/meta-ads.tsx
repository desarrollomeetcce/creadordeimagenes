"use client";
import { useCallback, useEffect, useState, useRef, useId } from "react";
import { PasswordInput } from "./password-input";
import { engineRequest as api } from "./generation-engine";
type Connection = {
  id: string;
  name: string;
  transport: string;
  apiVersion: string;
  appId: string | null;
  tokenMask: string | null;
  verifiedAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
};
type Account = {
  id: string;
  name: string;
  connectionId: string;
  currency: string;
  timezone: string;
  businessId: string | null;
  businessName: string | null;
  enabled: boolean;
  metric: string;
  targetCost: string | null;
  minResults: number;
  intervalMinutes: number;
  syncedAt: string | null;
  syncError: string | null;
  canSync: boolean;
  syncState: { phase: number | null };
  sources?: {
    connectionId: string;
    connection: {
      name: string;
      transport: string;
      disconnectedAt: string | null;
    };
  }[];
};
type Period = {
  cost: number | null;
  spend: number;
  results: number;
  state: string;
  since: string;
  until: string;
};
type Item = {
  id: string;
  name: string;
  level: string;
  accountId: string;
  campaignId: string;
  adsetId: string;
  campaignName: string;
  adsetName: string;
  accountName: string;
  currency: string;
  timezone: string;
  businessName: string | null;
  status: string;
  effectiveStatus: string;
  objective: string | null;
  thumbnailUrl: string | null;
  metric: string;
  metricName: string;
  periods: Record<string, Period>;
  firstDelivery: string | null;
  lastDelivery: string | null;
  ageDays: number | null;
  activeDays: number;
  historyPartial: boolean;
  createdTime: string | null;
  scheduledStart: string | null;
  syncedAt: string | null;
  changePercent: number | null;
  rating: string;
  pausedCandidate: boolean;
};
type ObjectOption = {
  id: string;
  name: string;
  level: string;
  campaignId: string | null;
};
const metrics = [
  ["AUTO", "Según objetivo compatible"],
  ["MESSAGES", "Conversaciones iniciadas"],
  ["LEADS", "Clientes potenciales"],
  ["PURCHASES", "Compras"],
  ["LINK_CLICKS", "Clics en enlaces"],
];
const periods = [
  ["today", "Hoy"],
  ["7", "7 días"],
  ["15", "15 días"],
  ["30", "30 días"],
  ["lifetime", "Desde el inicio"],
];
const ratings: Record<string, string> = {
  STALE: "Datos atrasados · sincronizar",
  GOOD: "Buen rendimiento",
  WATCH: "En observación",
  CRITICAL: "Crítico",
  DETERIORATING: "Deterioro",
  INSUFFICIENT: "Datos insuficientes",
  ENOUGH_DATA: "Volumen suficiente · define una meta",
};
function money(n: number, currency: string) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}
function cost(p: Period, currency: string) {
  return p.cost !== null
    ? money(p.cost, currency)
    : p.state === "NO_RESULTS"
      ? "Sin resultados"
      : p.state === "INACTIVE"
        ? "Sin actividad"
        : "No disponible";
}
function date(value: string | null, timezone = "UTC") {
  return value
    ? new Date(
        value.includes("T") ? value : value + "T12:00:00Z",
      ).toLocaleDateString("es-PE", { timeZone: "UTC" })
    : "No conocida";
}
function displayTime(value: string | null) {
  return value
    ? new Date(value).toLocaleString("es-PE")
    : "Todavía no sincronizada";
}
function exportCSV(items: Item[]) {
  const cols = [
    "Cuenta",
    "Campaña",
    "Conjunto",
    "Anuncio",
    "Moneda",
    "Resultado",
    "Primera circulación",
    "Días",
    ...periods.map((p) => p[1]),
  ];
  const safe = (s: unknown) =>
    '"' +
    String(s ?? "")
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = items.map((o) => [
    o.accountName,
    o.campaignName,
    o.adsetName,
    o.name,
    o.currency,
    o.metricName,
    o.firstDelivery,
    o.ageDays,
    ...periods.map(
      ([key]) => o.periods[key].cost ?? cost(o.periods[key], o.currency),
    ),
  ]);
  const url = URL.createObjectURL(
    new Blob(
      [
        "\ufeff" +
          [cols, ...rows].map((r) => r.map(safe).join(";")).join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "meta-ads-pagina.csv";
  a.click();
  URL.revokeObjectURL(url);
}
export function MetaAds({ role }: { role: string }) {
  const owner = role === "OWNER";
  const [accounts, setAccounts] = useState<Account[]>([]),
    [connections, setConnections] = useState<Connection[]>([]),
    [showDisconnected, setShowDisconnected] = useState(false),
    [objects, setObjects] = useState<ObjectOption[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [total, setTotal] = useState(0),
    [limited, setLimited] = useState(false),
    [rankingExcluded, setRankingExcluded] = useState(0),
    [tab, setTab] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("metaTab") === "connections" ? "connections" : "panel"),
    [level, setLevel] = useState("ad"),
    [accountIds, setAccountIds] = useState<string[]>([]),
    [business, setBusiness] = useState(""),
    [campaign, setCampaign] = useState(""),
    [adset, setAdset] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState("all"),
    [metric, setMetric] = useState(""),
    [currency, setCurrency] = useState(""),
    [sort, setSort] = useState("7"),
    [direction, setDirection] = useState("asc"),
    [age, setAge] = useState(""),
    [rating, setRating] = useState(""),
    [since, setSince] = useState(""),
    [until, setUntil] = useState(""),
    [calendar, setCalendar] = useState(""),
    [page, setPage] = useState(1),
    [view, setView] = useState("cards"),
    [selected, setSelected] = useState<Item | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [transport, setTransport] = useState("MCP"),
    [revision, setRevision] = useState(0),
    [sharing, setSharing] = useState<Account | null>(null);
  const accountLabelId = useId();
  const accountKey = accountIds.join(",");
  const serial = useRef(0);
  const analyticsTab = ["panel", "ranking", "alerts"].includes(tab);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(q); setPage(1); }, 200);
    return () => clearTimeout(timer);
  }, [q]);
  const refresh = useCallback(async () => {
    setAccounts(await api("meta-ads/accounts"));
  }, []);
  useEffect(() => {
    if (!owner || tab !== "connections") return;
    let live = true;
    api("meta-ads/connections")
      .then((data) => {
        if (live) setConnections(data);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [owner, tab, revision]);
  useEffect(() => {
    let live = true;
    refresh().catch((e) => {
      if (live) setMessage(e.message);
    });
    return () => {
      live = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!analyticsTab) return;
    let live = true;
    api("meta-ads/objects?" + new URLSearchParams({ accounts: accountKey }))
      .then((rows) => {
        if (live) setObjects(rows);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [analyticsTab, accountKey, revision]);
  useEffect(() => {
    if (!analyticsTab) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const current = ++serial.current;
    void (async () => {
      setLoading(true);
      const p = new URLSearchParams({
        level,
        accounts: accountKey,
        business,
        campaign,
        adset,
        q: search,
        state,
        metric,
        currency,
        sort,
        direction,
        age,
        rating: tab === "alerts" ? "alerts" : rating,
        ranking: tab === "ranking" ? "1" : "0",
        page: String(page),
        limit: "25",
        ...(calendar ? { since, until } : {}),
      });
      fetch("/api/meta-ads/dashboard?" + p, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error ?? "No se pudo consultar Meta Ads.");
          return data;
        })
        .then((data) => {
          if (serial.current === current) {
            setItems(data.items);
            setTotal(data.total);
            setLimited(data.limited);
            setRankingExcluded(data.excludedForRanking ?? 0);
          }
        })
        .catch((e) => {
          if (serial.current === current && e.name !== "AbortError")
            setMessage(e.message);
        })
        .finally(() => {
          if (serial.current === current) setLoading(false);
        });
    })();
    return () => {
      controller.abort();
      serial.current++;
    };
  }, [
    tab,
    analyticsTab,
    level,
    accountKey,
    business,
    campaign,
    adset,
    search,
    state,
    metric,
    currency,
    sort,
    direction,
    age,
    rating,
    page,
    calendar,
    since,
    until,
    revision,
  ]);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
      setRevision((r) => r + 1);
      if (success) setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
      // Read persisted diagnostics without repeating the verification request.
      try { await refresh(); } catch {}
    } finally {
      setBusy(false);
    }
  };
  const reload = () =>
    void run(
      async () => {},
      "Datos guardados actualizados. No se consultó Meta.",
    );
  const chooseCalendar = (value: string) => {
    if (!value) {
      setCalendar("");
      setSince("");
      setUntil("");
      if (sort === "custom") setSort("7");
      return;
    }
    const tz =
      accounts.find((a) => accountIds.includes(a.id))?.timezone ??
      accounts[0]?.timezone ??
      "America/Lima";
    const end = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const start = new Date(end + "T12:00:00Z");
    start.setUTCDate(start.getUTCDate() + 1 - Number(value));
    setSince(start.toISOString().slice(0, 10));
    setUntil(end);
    setCalendar("custom");
    setPage(1);
  };
  const resetPage = (fn: () => void) => {
    setPage(1);
    fn();
  };
  const chosen = accounts.filter(
    (a) =>
      (!accountIds.length || accountIds.includes(a.id)) &&
      (!business || a.businessId === business),
  );
  return (
    <section className="meta-ads stack">
      <header className="meta-header">
        <div>
          <span className="eyebrow">CONTROL PUBLICITARIO</span>
          <h1>Meta Ads</h1>
          <p>Resultados claros, cinco periodos a la vez.</p>
        </div>
        <span className="meta-readonly">Solo lectura en Meta</span>
      </header>
      <div className="row" role="tablist" aria-label="Secciones Meta Ads">
        {[
          ["panel", "Rendimiento"],
          ["ranking", "Ranking de eficiencia"],
          ["alerts", "Alertas"],
          ["accounts", "Cuentas publicitarias"],
          ...(owner ? [["connections", "Conexiones · API y MCP"]] : []),
        ].map(([id, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "primary" : ""}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <aside className="notice meta-feedback" role="status">
          <span>{message}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setMessage("")}>×</button>
        </aside>
      )}
      <div className="meta-content">
      {tab === "connections" && owner ? (
        <>
          <section className="panel stack">
            <h2>Dos formas de conectar, un solo panel</h2>
            <p>
              Marketing API usa el token de tu app de Meta. MCP descubre
              herramientas de lectura en el servidor configurado de Meta.
              Autorizar no demuestra que todas las métricas estén disponibles:
              la verificación indica las capacidades que ofrece tu cuenta.
            </p>
            <div className="row">
              <button
                type="button"
                className={transport === "MCP" ? "primary" : ""}
                onClick={() => setTransport("MCP")}
              >
                Conexión MCP
              </button>
              <button
                type="button"
                className={transport === "API" ? "primary" : ""}
                onClick={() => setTransport("API")}
              >
                Mi app · Marketing API
              </button>
            </div>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = new FormData(form),
                  manual = transport === "API" || (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "manual";
                void run(async () => {
                  if (manual && !data.get("token")) throw Error("Introduce el token oficial en el campo seguro.");
                  const created = await api("meta-ads/connections", "POST", {
                    name: String(data.get("name")),
                    transport,
                    ...(transport === "API"
                      ? {
                          apiVersion: String(data.get("version")),
                          ...(data.get("appId")
                            ? { appId: String(data.get("appId")) }
                            : {}),
                        }
                      : {}),
                    ...(manual && data.get("token")
                      ? { token: String(data.get("token")) }
                      : {}),
                  });
                  setConnections(old => [...old, created]);
                  form.reset();
                  if (transport === "MCP") {
                    if (manual) {
                      const result = await api(`meta-ads/connections/${created.id}/verify`, "POST", {});
                      setMessage(`Acceso MCP verificado: ${result.accounts} cuentas. ${result.accounts === 0 ? "Meta no devolvió cuentas accesibles." : "Ya puedes configurar su lectura."}`);
                    } else {
                      const auth = await api(`meta-ads/connections/${created.id}/oauth`, "POST", {});
                      window.location.assign(auth.url);
                    }
                  } else setMessage("Conexión guardada; verifica el acceso antes de sincronizar.");
                });
              }}
            >
              <div className="fields">
                <label>
                  Nombre de la conexión
                  <input
                    name="name"
                    key={transport}
                    defaultValue={transport === "MCP" ? "Meta MCP" : ""}
                    required
                    maxLength={100}
                    placeholder={
                      transport === "MCP"
                        ? "Meta MCP principal"
                        : "Mi app de Meta"
                    }
                  />
                </label>
                {transport === "API" && (
                  <>
                    <label>
                      ID de tu app de Meta · opcional
                      <input
                        name="appId"
                        inputMode="numeric"
                        pattern="[0-9]+"
                      />
                    </label>
                    <label>
                      Versión Graph de tu app
                      <input
                        name="version"
                        required
                        defaultValue="v26.0"
                        pattern="v[0-9]{2}\.0"
                      />
                      <small>
                        Confirma la versión compatible en tu app de Meta.
                      </small>
                    </label>
                  </>
                )}
              </div>
              {transport === "MCP" ? <>
                <p className="hint">Autoriza tu cuenta en Facebook sin copiar un token. Antes de abrir la autorización se comprobará si Meta admite este cliente; al regresar se validarán la sesión, herramientas y cuentas. Si Meta exige un cliente previamente aprobado, se indicará sin simular una conexión.</p>
                <details>
                  <summary>Configuración avanzada · token MCP oficial</summary>
                  <div className="inside stack">
                    <label>Token emitido para este servidor MCP
                      <PasswordInput name="token" secretLabel="token de Meta" autoComplete="off" />
                    </label>
                    <small>No se considera válido hasta completar la verificación real. No uses claves de OpenAI, contraseñas de Facebook ni tokens de otro cliente.</small>
                    <button type="submit" value="manual" disabled={busy}>Guardar token y verificar</button>
                  </div>
                </details>
              </> : <label>Token de acceso de Marketing API
                <PasswordInput name="token" secretLabel="token de Meta" required autoComplete="off" />
              </label>}
              <small>{transport === "MCP" ? "Servidor: https://mcp.facebook.com/ads. OAuth disponible solo si Meta autoriza este cliente y la URL de retorno." : "Token de tu app con ads_read y acceso a las cuentas; business_management cuando corresponda. Introduce el token solo aquí, nunca por chat."}</small>
              <button type="submit" disabled={busy} className="primary">
                {transport === "MCP" ? "Conectar con Meta" : "Guardar conexión API"}
              </button>
            </form>
            {transport === "API" && <details>
              <summary>Preparar mi app de Meta · pruebas y publicación</summary>
              <div className="inside stack">
                <p>Para pruebas con tus propias cuentas, normalmente puedes usar la app en desarrollo: tu usuario debe tener un rol aceptado en la app y acceso a las cuentas publicitarias. «Listo para la prueba» en un permiso no confirma que el token lo tenga concedido.</p>
                <ol>
                  <li>En <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Meta for Developers</a>, revisa los roles de tu app y el acceso publicitario de ese mismo usuario.</li>
                  <li>En <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Graph API Explorer</a>, selecciona esa app y la versión que usarás aquí. Obtén un token de usuario con ads_read concedido.</li>
                  <li>Ejecuta GET <code>/me/adaccounts?fields=id,name</code>. Consultar <code>/me?fields=id,name</code> solo confirma tu perfil; no acredita acceso publicitario. Una lista vacía indica que Meta no devuelve cuentas accesibles para ese token.</li>
                  <li>Guarda el token únicamente en el campo protegido. Si la conexión ya existe, actualiza su versión en su propia tarjeta y vuelve a verificarla; no necesitas eliminarla.</li>
                </ol>
                <p>Esta integración solo lee cuentas y estadísticas. No solicita ads_management ni requiere configurar Facebook Login para verificar un token manual. El retorno OAuth del MCP es un flujo distinto: no lo copies como configuración de tu app Marketing API.</p>
                <p>Para usuarios externos pueden hacer falta publicación, revisión de permisos y verificación del negocio según lo que Meta solicite. Completa dominio, privacidad y eliminación de datos con información real de tu servicio; la plataforma no puede aprobar esos requisitos por ti. No generes llamadas artificiales ni cambies campañas para completar los contadores de pruebas.</p>
              </div>
            </details>}
            <details>
              <summary>Si OAuth no está disponible: credenciales y alternativa</summary>
              <div className="inside stack">
                <p>Para MCP necesitas que Meta admita el registro de este cliente, un documento de cliente público o un ID de cliente MCP autorizado para la URL de retorno de esta plataforma. Un ID de app Graph o el ID de Claude/ChatGPT no sirve como sustituto. No podemos crear una autorización que Meta no conceda.</p>
                <p>Para Marketing API, crea o utiliza tu propia app en <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Meta for Developers</a>, habilita el acceso publicitario y obtén un token de usuario o usuario del sistema con ads_read, acceso a las cuentas y business_management si tu organización lo requiere. Meta puede exigir revisión de la app o verificación del negocio.</p>
                <p>Selecciona «Mi app · Marketing API», guarda el token en el campo protegido y pulsa «Verificar y traer cuentas». No pegues contraseñas, tokens ni el secreto de tu app en el chat. Las credenciales se cifran en el servidor; guardar una credencial no demuestra acceso.</p>
              </div>
            </details>
          </section>
          {connections.some(c => c.disconnectedAt) && <label className="row"><input type="checkbox" checked={showDisconnected} onChange={e => setShowDisconnected(e.target.checked)} />Ver conexiones retiradas ({connections.filter(c => c.disconnectedAt).length})</label>}
          {connections.filter(c => showDisconnected || !c.disconnectedAt).map((c) => (
            <article className="panel stack" key={c.id}>
              <div className="row spread">
                <h3>{c.name}</h3>
                <span className="badge">
                  {c.transport} ·{" "}
                  {c.disconnectedAt
                    ? "Desconectada"
                    : c.verifiedAt
                      ? "Acceso verificado"
                      : "Pendiente de verificar"}
                </span>
              </div>
              <small>
                {c.transport === "API" ? `Graph ${c.apiVersion} · GET /me/adaccounts · ` : ""}{c.tokenMask ?? "Sin token guardado"} · Última verificación:{" "}
                {displayTime(c.verifiedAt)}
              </small>
              {c.lastError && <p className="notice">{c.lastError}</p>}
              {c.transport === "API" && <form className="row" onSubmit={e=>{e.preventDefault();const apiVersion=String(new FormData(e.currentTarget).get("apiVersion"));void run(async()=>{await api(`meta-ads/connections/${c.id}`,"PATCH",{apiVersion});},"Versión actualizada. Se conserva el token; vuelve a Verificar y traer cuentas.");}}>
                <label>Versión Graph guardada<input name="apiVersion" defaultValue={c.apiVersion} key={c.apiVersion} required pattern="v[0-9]{2}\.0" /></label>
                <button disabled={busy}>Actualizar versión sin cambiar token</button>
                <small>Usa la misma versión que funcionó en Explorer. Actualizar el formulario de una conexión nueva no cambia esta conexión.</small>
              </form>}

              <div className="row">
                {c.transport === "MCP" && (
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void run(async () => {
                        const r = await api(
                          `meta-ads/connections/${c.id}/oauth`,
                          "POST",
                          {
                            ...(data.get("clientId")
                              ? { clientId: String(data.get("clientId")) }
                              : {}),
                          },
                        );
                        window.location.assign(r.url);
                      });
                    }}
                  >
                    <details>
                      <summary>Cliente OAuth registrado · avanzado</summary>
                      <div className="inside stack"><label>ID de cliente MCP autorizado por Meta<input name="clientId" maxLength={300} /></label><small>Debe tener registrada la URL /api/meta/oauth/callback de esta plataforma. No copies el ID de otro cliente ni lo sustituyas por un ID de app Graph.</small></div>
                    </details>
                    <button disabled={busy} className="primary">Conectar con Meta</button>
                  </form>
                )}
                <button
                  type="button"
                  disabled={busy || !c.tokenMask || !!c.disconnectedAt}
                  onClick={() =>
                    void run(async () => {
                      const r = await api(
                        `meta-ads/connections/${c.id}/verify`,
                        "POST",
                        {},
                      );
                      setMessage(
                        `${r.minimalVerified ? `Consulta mínima id,name correcta en ${r.apiVersion}. ` : ""}${r.accounts} cuentas encontradas${r.tools.length ? ` · Herramientas de lectura: ${r.tools.join(", ")}` : ""}.${r.warnings?.length ? ` Aviso: se omitieron campos opcionales. ${r.warnings.map((w:{fields:string;code:number|null;message:string})=>`${w.fields} · código ${w.code ?? "no indicado"}: ${w.message}`).join("; ")}` : ""}`,
                      );
                    })
                  }
                >
                  Verificar y traer cuentas
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || !!c.disconnectedAt}
                  onClick={() => {
                    if (
                      confirm(
                        "¿Eliminar esta conexión de la lista activa? Se retirará su token y se desactivará su sincronización. Se conservan las cuentas y el histórico. No se modifica nada en Meta ni otras conexiones.",
                      )
                    )
                      void run(
                        () => api("meta-ads/connections/" + c.id, "DELETE"),
                        "Conexión retirada de la lista activa. Se conserva el histórico; puedes consultarla en Ver conexiones retiradas.",
                      );
                  }}
                >
                  {c.disconnectedAt ? "Conexión retirada" : "Eliminar conexión"}
                </button>
              </div>
              <details>
                <summary>Reemplazar token</summary>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      token = String(new FormData(form).get("token"));
                    void run(async () => {
                      await api("meta-ads/connections/" + c.id, "PATCH", {
                        token,
                      });
                      form.reset();
                    }, "Token reemplazado. Verifica otra vez la conexión.");
                  }}
                >
                  <label>
                    Token nuevo
                    <PasswordInput
                      name="token"
                      autoComplete="off"
                      required
                      secretLabel="token"
                    />
                  </label>
                  <button disabled={busy}>Guardar token</button>
                </form>
              </details>
            </article>
          ))}
          <details className="panel">
            <summary>Configuración de tu app y alcance de MCP</summary>
            <p>
              Usa una app empresarial de Meta y habilita el acceso que
              corresponda a tus cuentas. Los permisos avanzados pueden necesitar
              revisión y verificación empresarial. El ID de app no sustituye un
              token autorizado. MCP requiere una autorización propia; no se
              presupone que un token Graph funcione para MCP.
            </p>
            <p>
              OAuth usa PKCE y descubrimiento del servidor. Si Meta no ofrece
              registro de clientes públicos o herramientas con estadísticas
              diarias/atribución compatibles, la pantalla indicará el requisito;
              Marketing API permanece disponible. La compatibilidad real debe
              comprobarse con tu autorización.
            </p>
          </details>
        </>
      ) : tab === "accounts" ? (
        <>
          <div className="row">
            <h2>Cuentas autorizadas · {accounts.length}</h2>
            <button type="button" disabled={busy} onClick={reload}>
              Actualizar vista
            </button>
          </div>
          {!accounts.length && (
            <p className="panel">
              {owner
                ? "Conecta Meta y pulsa Verificar y traer cuentas para empezar."
                : "El OWNER todavía no te ha asignado cuentas publicitarias."}
            </p>
          )}
          {accounts.map((a) => (
            <article className="panel stack" key={a.id}>
              <h3>
                {a.name} <small>act_{a.id}</small>
              </h3>
              <p>
                {a.businessName ?? "Sin administrador comercial informado"} ·{" "}
                {a.currency} · {a.timezone}
              </p>
              <small>
                Última sincronización: {displayTime(a.syncedAt)} ·{" "}
                {a.enabled ? "Cuenta habilitada" : "Cuenta deshabilitada"}
                {a.syncState.phase !== null ? " · Importación en curso" : ""}
              </small>
              {a.syncError && <p className="notice">{a.syncError}</p>}
              {owner && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    void run(
                      () =>
                        api("meta-ads/accounts/" + a.id, "PATCH", {
                          enabled: data.has("enabled"),
                          metric: String(data.get("metric")),
                          targetCost: data.get("target")
                            ? Number(data.get("target"))
                            : null,
                          minResults: Number(data.get("minimum")),
                          intervalMinutes: Number(data.get("interval")),
                          ...(data.get("connection")
                            ? { connectionId: String(data.get("connection")) }
                            : {}),
                        }),
                      "Cuenta actualizada.",
                    );
                  }}
                >
                  <div className="fields">
                    <label className="check">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={a.enabled}
                      />
                      Habilitar sincronización
                    </label>
                    <label>
                      Resultado principal
                      <select name="metric" defaultValue={a.metric}>
                        {metrics.map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Costo objetivo · {a.currency}
                      <input
                        name="target"
                        type="number"
                        min="0.000001"
                        step="any"
                        defaultValue={a.targetCost ?? ""}
                        placeholder="Sin umbral"
                      />
                    </label>
                    <label>
                      Mínimo de resultados
                      <input
                        name="minimum"
                        type="number"
                        min="1"
                        max="10000"
                        defaultValue={a.minResults}
                      />
                    </label>
                    <label>
                      Intervalo solicitado · minutos
                      <input
                        name="interval"
                        type="number"
                        min="15"
                        max="1440"
                        defaultValue={a.intervalMinutes}
                      />
                    </label>
                    {a.sources && a.sources.length > 0 && (
                      <label>
                        Conexión de esta cuenta
                        <select name="connection" defaultValue={a.connectionId}>
                          {a.sources
                            .filter((s) => !s.connection.disconnectedAt)
                            .map((s) => (
                              <option
                                key={s.connectionId}
                                value={s.connectionId}
                              >
                                {s.connection.name} · {s.connection.transport}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <button disabled={busy}>Guardar cuenta</button>
                </form>
              )}
              <div className="row">
                {a.canSync && (
                  <button
                    type="button"
                    disabled={busy || !a.enabled}
                    onClick={() =>
                      void run(async () => {
                        const r = await api(
                          `meta-ads/accounts/${a.id}/sync`,
                          "POST",
                          {},
                        );
                        setMessage(
                          r.scheduled
                            ? "Sincronización solicitada. Actualiza la vista para consultar el progreso."
                            : "En cola: el programador no confirmó su arranque. Revisa el worker.",
                        );
                      })
                    }
                  >
                    Sincronizar ahora
                  </button>
                )}
                {owner && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSharing(a)}
                    >
                      Accesos por usuario
                    </button>
                    <button
                      type="button"
                      disabled={busy || !a.enabled}
                      onClick={() => {
                        if (
                          confirm(
                            "¿Volver a importar el histórico disponible de esta cuenta?",
                          )
                        )
                          void run(
                            () =>
                              api(`meta-ads/accounts/${a.id}/sync`, "POST", {
                                full: true,
                              }),
                            "Reimportación solicitada.",
                          );
                      }}
                    >
                      Reimportar histórico
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          <p className="hint">
            La frecuencia efectiva depende de los límites de Meta y del
            programador disponible. Consultar este panel no sincroniza ni
            consume tokens de IA.
          </p>
        </>
      ) : (
        <>
          <div className="panel stack">
            <div className="meta-level-tabs" role="tablist" aria-label="Nivel publicitario">
              {[
                ["campaign", "Campañas"],
                ["adset", "Conjuntos de anuncios"],
                ["ad", "Anuncios"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={level === id}
                  key={id}
                  className={level === id ? "primary" : ""}
                  onClick={() => resetPage(() => setLevel(id))}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="fields meta-filters">
              <label>
                Administrador comercial
                <select
                  value={business}
                  onChange={(e) => resetPage(() => setBusiness(e.target.value))}
                >
                  <option value="">Todos los autorizados</option>
                  {[
                    ...new Map(
                      accounts
                        .filter((a) => a.businessId)
                        .map((a) => [a.businessId, a.businessName]),
                    ).entries(),
                  ].map(([id, name]) => (
                    <option key={id} value={id!}>
                      {name ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="meta-filter-field">
                <span id={accountLabelId}>Cuentas publicitarias</span>
                <details className="meta-account-picker">
                <summary aria-labelledby={`${accountLabelId} ${accountLabelId}-value`}>
                  <span id={`${accountLabelId}-value`}>{accountIds.length ? `${accountIds.length} ${accountIds.length === 1 ? "seleccionada" : "seleccionadas"}` : "Todas las autorizadas"}</span>
                </summary>
                <div className="stack">
                  {accounts
                    .filter((a) => !business || a.businessId === business)
                    .map((a) => (
                      <label className="check" key={a.id}>
                        <input
                          type="checkbox"
                          checked={accountIds.includes(a.id)}
                          onChange={(e) =>
                            resetPage(() => {
                              setAccountIds((old) =>
                                e.target.checked
                                  ? [...old, a.id]
                                  : old.filter((id) => id !== a.id),
                              );
                              setCampaign("");
                              setAdset("");
                            })
                          }
                        />
                        {a.name} · {a.id} · {a.currency}
                      </label>
                    ))}
                  <button
                    type="button"
                    onClick={() => resetPage(() => setAccountIds([]))}
                  >
                    Todas las autorizadas
                  </button>
                </div>
                </details>
              </div>
              <label>
                Campaña
                <select
                  value={campaign}
                  onChange={(e) =>
                    resetPage(() => {
                      setCampaign(e.target.value);
                      setAdset("");
                    })
                  }
                >
                  <option value="">Todas las campañas</option>
                  {objects
                    .filter((o) => o.level === "campaign")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Conjunto
                <select
                  value={adset}
                  onChange={(e) => resetPage(() => setAdset(e.target.value))}
                >
                  <option value="">Todos los conjuntos</option>
                  {objects
                    .filter(
                      (o) =>
                        o.level === "adset" &&
                        (!campaign || o.campaignId === campaign),
                    )
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Estado / entrega
                <select
                  value={state}
                  onChange={(e) => resetPage(() => setState(e.target.value))}
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos configurados</option>
                  <option value="campaign-active">Solo campañas activas</option>
                  <option value="delivery">Entrega registrada hoy</option>
                  <option value="effective">Estado efectivo activo</option>
                  <option value="paused">Pausados</option>
                  <option value="issues">Revisión o problemas</option>
                </select>
              </label>
              <label>
                Buscar nombre
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <label>
                Resultado
                <select
                  value={metric}
                  onChange={(e) => resetPage(() => setMetric(e.target.value))}
                >
                  <option value="">Todos · separados al ordenar</option>
                  {metrics
                    .filter(([id]) => id !== "AUTO")
                    .map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Moneda
                <select
                  value={currency}
                  onChange={(e) => resetPage(() => setCurrency(e.target.value))}
                >
                  <option value="">Todas · separadas al ordenar</option>
                  {[...new Set(chosen.map((a) => a.currency))].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Ordenar por menor costo
                <select
                  value={sort}
                  onChange={(e) => resetPage(() => setSort(e.target.value))}
                >
                  {periods.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                  {calendar && (
                    <option value="custom">Calendario elegido</option>
                  )}
                  <option value="newest">Más nuevos</option>
                  <option value="age">Antigüedad en días</option>
                </select>
              </label>
              <label>
                Dirección
                <select
                  value={direction}
                  onChange={(e) =>
                    resetPage(() => setDirection(e.target.value))
                  }
                >
                  <option value="asc">Menor primero</option>
                  <option value="desc">Mayor primero</option>
                </select>
              </label>
              <label>
                Antigüedad · días
                <select
                  value={age}
                  onChange={(e) => resetPage(() => setAge(e.target.value))}
                >
                  <option value="">Todas</option>
                  <option value="7">Hasta 7 días</option>
                  <option value="15">8 a 15 días</option>
                  <option value="30">16 a 30 días</option>
                  <option value="older">Más de 30 días</option>
                </select>
              </label>
              <label>
                Evaluación
                <select
                  value={rating}
                  onChange={(e) => resetPage(() => setRating(e.target.value))}
                >
                  <option value="">Todas</option>
                  {Object.entries(ratings).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row meta-view-tools">
              <details className="meta-calendar">
                <summary>
                  Calendario opcional
                  <span className="meta-calendar-state" aria-hidden="true">{calendar ? "●" : ""}</span>
                  <span className="sr-only">{calendar ? "Rango personalizado activo" : "Sin rango personalizado"}</span>
                </summary>
                <div className="fields">
                  <label>
                    Periodo rápido
                    <select
                      defaultValue=""
                      aria-label="Periodo del calendario"
                      onChange={(e) => chooseCalendar(e.target.value)}
                    >
                      <option value="">Desde el inicio / sin rango</option>
                      <option value="1">Hoy</option>
                      <option value="7">Últimos 7 días</option>
                      <option value="15">Últimos 15 días</option>
                      <option value="30">Últimos 30 días</option>
                    </select>
                  </label>
                  <label>
                    Desde
                    <input
                      type="date"
                      value={since}
                      onChange={(e) => {
                        setSince(e.target.value);
                        if (e.target.value && until) setCalendar("custom");
                      }}
                    />
                  </label>
                  <label>
                    Hasta
                    <input
                      type="date"
                      value={until}
                      onChange={(e) => {
                        setUntil(e.target.value);
                        if (e.target.value && since) setCalendar("custom");
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendar("");
                      setSince("");
                      setUntil("");
                      if (sort === "custom") setSort("7");
                    }}
                  >
                    Quitar rango
                  </button>
                </div>
              </details>
              <button
                type="button"
                onClick={() => setView(view === "cards" ? "table" : "cards")}
              >
                {view === "cards" ? "Ver tabla" : "Ver tarjetas"}
              </button>
              <button type="button" onClick={reload} disabled={busy}>
                Actualizar datos guardados
              </button>
              <button
                type="button"
                onClick={() => exportCSV(items)}
                disabled={!items.length}
              >
                Exportar esta página · CSV
              </button>
            </div>
            <small>
              Comparaciones permanentes independientes del calendario.
              Atribución: 7 días clic / 1 día vista, por fecha de impresión. Hoy
              es parcial; Meta puede actualizar resultados. Se ordena por moneda
              y tipo de resultado.
            </small>
          </div>
          <div className="meta-results" aria-busy={loading}>
          {tab === "ranking" && rankingExcluded > 0 && (
            <p className="hint">
              {rankingExcluded} elementos separados por datos insuficientes en
              el periodo elegido. Puedes consultarlos en Rendimiento.
            </p>
          )}
          {limited && (
            <p className="notice">
              Hay más de 10.000 elementos: filtra por cuenta o campaña para
              acotar el ranking.
            </p>
          )}
          <div className="meta-load-status" role="status" aria-live="polite">
            {loading ? "Consultando estadísticas guardadas…" : ""}
          </div>
          {!loading && !items.length && (
            <section className="panel meta-empty">
              <h2>
                {accounts.length
                  ? "No hay resultados para esta selección"
                  : "Conecta tus cuentas publicitarias"}
              </h2>
              <p>
                {accounts.length
                  ? "Habilita y sincroniza una cuenta, o ajusta los filtros. Las estadísticas aparecerán cuando termine la importación."
                  : owner
                    ? "Puedes empezar por MCP o conectar el token de tu app de Meta."
                    : "Solicita al OWNER acceso a las cuentas que necesitas consultar."}
              </p>
              {owner && (
                <button
                  type="button"
                  onClick={() =>
                    setTab(accounts.length ? "accounts" : "connections")
                  }
                >
                  {accounts.length ? "Configurar cuentas" : "Conectar Meta"}
                </button>
              )}
            </section>
          )}
          {view === "table" ? (
            <div className="meta-table">
              <table>
                <thead>
                  <tr>
                    <th>Campaña / Conjunto / Anuncio</th>
                    <th>Cuenta / Resultado</th>
                    <th>Estado</th>
                    <th>Inicio · días</th>
                    {periods.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th>Evaluación</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter(
                      (o) =>
                        tab !== "alerts" ||
                        ["CRITICAL", "WATCH", "DETERIORATING"].includes(
                          o.rating,
                        ),
                    )
                    .map((o) => (
                      <tr key={o.id}>
                        <td>
                          <button type="button" onClick={() => setSelected(o)}>
                            {o.name}
                          </button>
                          <small>
                            {o.campaignName} / {o.adsetName}
                          </small>
                        </td>
                        <td>
                          {o.accountName}
                          <small>{o.metricName}</small>
                        </td>
                        <td>{o.effectiveStatus ?? "No informado"}</td>
                        <td>
                          {date(o.firstDelivery)}
                          <small>{o.ageDays ?? "—"} días</small>
                        </td>
                        {periods.map(([key]) => (
                          <td key={key}>
                            {cost(o.periods[key], o.currency)}
                            <small>{o.periods[key].results} resultados</small>
                          </td>
                        ))}
                        <td>{ratings[o.rating]}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="meta-cards">
              {items
                .filter(
                  (o) =>
                    tab !== "alerts" ||
                    ["CRITICAL", "WATCH", "DETERIORATING", "STALE"].includes(
                      o.rating,
                    ),
                )
                .map((o) => (
                  <article
                    className={
                      "meta-card meta-rating-" + o.rating.toLowerCase()
                    }
                    key={o.id}
                  >
                    <header>
                      <span className="meta-account-name">
                        {o.accountName} · {o.currency}
                      </span>
                      <span className="badge">{ratings[o.rating]}</span>
                    </header>
                    <div className="meta-card-heading">
                      {o.thumbnailUrl && (
                        <img
                          src={`/api/meta-ads/objects/${o.id}/thumbnail`}
                          width={84}
                          height={84}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          alt="Creatividad del anuncio"
                          onError={(e) => {
                            e.currentTarget.hidden = true;
                          }}
                        />
                      )}
                      <div>
                        <small>Campaña: {o.campaignName}</small>
                        {o.level !== "campaign" && (
                          <small>Conjunto: {o.adsetName}</small>
                        )}
                        <h2>{o.name}</h2>
                      </div>
                    </div>
                    <div className="row">
                      <span className="badge">
                        {o.effectiveStatus ?? "Entrega no informada"}
                      </span>
                      <small>Configurado: {o.status ?? "No informado"}</small>
                    </div>
                    <strong className="meta-metric-name">{o.metricName}</strong>
                    <div className="meta-periods">
                      {periods.map(([key, label]) => (
                        <div
                          key={key}
                          title={`${o.periods[key].since} → ${o.periods[key].until}`}
                        >
                          <span>
                            {label}
                            {key === "lifetime" && o.ageDays !== null
                              ? ` · ${o.ageDays} días`
                              : ""}
                          </span>
                          <strong>{cost(o.periods[key], o.currency)}</strong>
                          <small>
                            {o.periods[key].results} resultados ·{" "}
                            {money(o.periods[key].spend, o.currency)}
                          </small>
                        </div>
                      ))}
                    </div>
                    {calendar && o.periods.custom && (
                      <p>
                        Calendario: {cost(o.periods.custom, o.currency)} ·{" "}
                        {o.periods.custom.results} resultados
                      </p>
                    )}
                    <div className="meta-dates">
                      <span>
                        Primera circulación conocida:{" "}
                        <b>{date(o.firstDelivery)}</b>
                      </span>
                      <span>
                        Creado: {date(o.createdTime, o.timezone)} · Activos
                        conocidos: {o.activeDays} días
                      </span>
                      <span>
                        Histórico parcial / disponible · Actualizado:{" "}
                        {displayTime(o.syncedAt)}
                      </span>
                    </div>
                    {o.changePercent !== null && (
                      <p className="hint">
                        Costo de 7 días completos frente a los 7 anteriores:{" "}
                        {o.changePercent > 0 ? "+" : ""}
                        {o.changePercent.toFixed(1)}%.{" "}
                        {o.changePercent > 0 ? "Aumento" : "Reducción"} del
                        costo; compara también el volumen.
                      </p>
                    )}
                    {o.pausedCandidate && (
                      <p className="notice">
                        Pausado con buen historial · candidato a revisión
                        manual.
                      </p>
                    )}
                    <button type="button" onClick={() => setSelected(o)}>
                      Ver detalle y periodos
                    </button>
                  </article>
                ))}
            </div>
          )}
          <div className="row">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              {total} elementos · Página {page} de{" "}
              {Math.max(1, Math.ceil(total / 25))}
            </span>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
          </div>
        </>
      )}
      </div>
      {selected && (
        <MetaDetail item={selected} onClose={() => setSelected(null)} />
      )}
      {sharing && (
        <MetaSharing account={sharing} onClose={() => setSharing(null)} />
      )}
    </section>
  );
}
function MetaDetail({ item: o, onClose }: { item: Item; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="meta-detail" onCancel={onClose}>
      <div className="row spread">
        <h2>{o.name}</h2>
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p>
        {o.campaignName} / {o.adsetName} / {o.accountName}
      </p>
      <p>
        {o.metricName} · {o.timezone}
      </p>
      <div className="meta-table">
        <table>
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Fechas</th>
              <th>Resultados</th>
              <th>Gasto</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  {date(o.periods[key].since)} – {date(o.periods[key].until)}
                </td>
                <td>{o.periods[key].results}</td>
                <td>{money(o.periods[key].spend, o.currency)}</td>
                <td>{cost(o.periods[key], o.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MetaDailyChart item={o} />
      <p>
        Primera circulación conocida: {date(o.firstDelivery)} ·{" "}
        {o.ageDays ?? "—"} días transcurridos. Última circulación:{" "}
        {date(o.lastDelivery)}. El histórico disponible puede empezar después de
        la circulación real.
      </p>
      <p>
        Las clasificaciones son cálculos internos, según el costo objetivo y
        mínimo de resultados configurados. No son puntuaciones oficiales de
        Meta. Un estado efectivo activo no garantiza entrega actual.
      </p>
      <a
        href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(o.accountId)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir cuenta en Meta ↗
      </a>
    </dialog>
  );
}
function MetaSharing({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [users, setUsers] = useState<
      { id: string; name: string; email: string; role: string }[]
    >([]),
    [grants, setGrants] = useState<{ userId: string; canSync: boolean }[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    let live = true;
    Promise.all([
      api("meta-ads/directory"),
      api(`meta-ads/accounts/${account.id}/grants`),
    ])
      .then(([u, g]) => {
        if (live) {
          setUsers(u);
          setGrants(g);
        }
      })
      .catch((e) => setMessage(e.message));
    return () => {
      live = false;
    };
  }, [account.id]);
  return (
    <dialog ref={ref} className="meta-detail" onCancel={onClose}>
      <h2>Accesos · {account.name}</h2>
      <p>
        Lectura de resultados y gasto publicitario. Solo ADMIN puede recibir
        permiso adicional para sincronizar. No concede permisos sobre proyectos
        ni claves de IA.
      </p>
      <div className="stack">
        {users.map((u) => (
          <div className="row" key={u.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={grants.some((g) => g.userId === u.id)}
                disabled={busy || u.role === "OWNER"}
                onChange={(e) =>
                  setGrants((old) =>
                    e.target.checked
                      ? [...old, { userId: u.id, canSync: false }]
                      : old.filter((g) => g.userId !== u.id),
                  )
                }
              />
              {u.name} · {u.email} · {u.role}
            </label>
            {u.role === "ADMIN" && grants.some((g) => g.userId === u.id) && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={
                    grants.find((g) => g.userId === u.id)?.canSync ?? false
                  }
                  onChange={(e) =>
                    setGrants((old) =>
                      old.map((g) =>
                        g.userId === u.id
                          ? { ...g, canSync: e.target.checked }
                          : g,
                      ),
                    )
                  }
                />
                Puede sincronizar
              </label>
            )}
          </div>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            api(`meta-ads/accounts/${account.id}/grants`, "PUT", { grants })
              .then(onClose)
              .catch((e) => setMessage(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Guardar accesos
        </button>
        <button type="button" disabled={busy} onClick={onClose}>
          Cerrar
        </button>
      </div>
    </dialog>
  );
}

function MetaDailyChart({ item }: { item: Item }) {
  const [rows, setRows] = useState<
      {
        day: string;
        spend: string;
        impressions: number;
        actions: Record<string, number>;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    api(`meta-ads/objects/${item.id}/daily`)
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [item.id]);
  const actionKeys: Record<string, string[]> = {
    MESSAGES: ["onsite_conversion.messaging_conversation_started_7d"],
    LEADS: [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
    ],
    PURCHASES: [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
    ],
    LINK_CLICKS: ["link_click"],
  };
  const values = rows.map((r) => {
    const key = actionKeys[item.metric]?.find((k) =>
      Object.hasOwn(r.actions, k),
    );
    const results = key ? r.actions[key] : 0;
    return {
      ...r,
      results,
      cost: results > 0 ? Number(r.spend) / results : null,
    };
  });
  const max = Math.max(1, ...values.map((r) => Number(r.spend)));
  return (
    <section className="stack">
      <h3>Actividad diaria · últimos 30 días</h3>
      {error ? (
        <p role="status">{error}</p>
      ) : !rows.length ? (
        <p>No hay datos diarios disponibles.</p>
      ) : (
        <>
          <div
            className="meta-daily-bars"
            role="img"
            aria-label="Gasto diario; el detalle accesible figura en la tabla siguiente"
          >
            {values.map((r) => (
              <div
                key={r.day}
                title={`${r.day}: ${money(Number(r.spend), item.currency)} · ${r.results} resultados`}
              >
                <span
                  style={{
                    height: `${Math.max(2, (Number(r.spend) / max) * 100)}%`,
                  }}
                />
                <small>{r.day.slice(8)}</small>
              </div>
            ))}
          </div>
          <details>
            <summary>Ver fechas, gasto, resultados y costo diario</summary>
            <div className="meta-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Gasto</th>
                    <th>Resultados</th>
                    <th>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {values.map((r) => (
                    <tr key={r.day}>
                      <td>{date(r.day)}</td>
                      <td>{money(Number(r.spend), item.currency)}</td>
                      <td>{r.results}</td>
                      <td>
                        {r.cost === null
                          ? "Sin resultados"
                          : money(r.cost, item.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <small>
            Solo fechas con datos importados; los intervalos ausentes no se
            rellenan con resultados inventados. Hoy puede ser parcial.
          </small>
        </>
      )}
    </section>
  );
}
