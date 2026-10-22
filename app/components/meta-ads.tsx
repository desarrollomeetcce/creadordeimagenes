"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  MetaMarketingOAuth,
  type MarketingOAuthInfo,
} from "./meta-marketing-oauth";
import { MetaAccountPicker } from "./meta-account-picker";
import {
  matchesAccount,
  activityOptions,
  accountActivityText,
  type AccountActivity,
} from "../../lib/meta-ads/account-filters";
import { parseMetaPreferences } from "../../lib/meta-ads/preferences";
import type { SyncProgress } from "../../lib/meta-ads/sync-progress";
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
  loginConfigId: string | null;
  appSecretConfiguredAt: string | null;
  authMethod: string | null;
  tokenExpiresAt: string | null;
};
type Account = {
  activity?: AccountActivity;
  progress?: SyncProgress;
  id: string;
  name: string;
  connectionId: string;
  connection?: {
    transport: string;
    name: string;
    revision: number;
    verifiedAt: string | null;
    disconnectedAt: string | null;
  };
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
  ageFromCreation?: boolean;
  activeDays: number;
  historyPartial: boolean;
  historyPending?: boolean;
  historyUpdatedAt?: string | null;
  createdTime: string | null;
  scheduledStart: string | null;
  syncedAt: string | null;
  changePercent: number | null;
  rating: string;
  pausedCandidate: boolean;
};
type ObjectOption = {
  accountId: string;
  id: string;
  name: string;
  level: string;
  campaignId: string | null;
};
const metrics = [
  ["AUTO", "Automático · detectar tipo de resultado"],
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
const costLabels: Record<string, string> = {
  MESSAGES: "Costo por conversación iniciada",
  LEADS: "Costo por cliente potencial",
  PURCHASES: "Costo por compra",
  LINK_CLICKS: "Costo por clic",
  UNKNOWN: "Costo por resultado no identificado",
};
const deliveryLabels: Record<string, string> = {
  ACTIVE: "Activo",
  PAUSED: "Pausado",
  CAMPAIGN_PAUSED: "Campaña pausada",
  ADSET_PAUSED: "Conjunto pausado",
  PENDING_REVIEW: "En revisión",
  DISAPPROVED: "Rechazado",
  WITH_ISSUES: "Con problemas",
  DELETED: "Eliminado",
  ARCHIVED: "Archivado",
  NOT_RETURNED: "No disponible",
};
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
function SyncIndicator({
  account,
  busy = false,
  onControl,
  onResume,
}: {
  account: Account;
  busy?: boolean;
  onControl?: (action: "pause" | "cancel") => void;
  onResume?: () => void;
}) {
  const p = account.progress;
  if (!p || p.status === "disabled") return null;
  const ongoing = ["running", "queued", "stalled", "error", "paused", "waiting"].includes(
    p.status,
  );
  return (
    <div className="meta-sync-progress" role="status">
      <div className="row spread">
        <strong>{p.label}</strong>
        <span>
          {p.phase}/{p.totalPhases}
        </span>
      </div>
      <progress
        max={p.totalPhases}
        value={p.phase}
        aria-label={`Sincronización de ${account.name}: etapas completadas`}
      />
      {p.recentReady && p.status !== "complete" && (
        <small>
          Comparativos recientes disponibles. Completando el histórico.
        </small>
      )}
      {p.status === "waiting" && p.nextSyncAt && (
        <p className="notice">Avance guardado. Próximo intento automático: {displayTime(p.nextSyncAt)}. {p.waitReason !== "pacing" && "Meta puede ampliar la espera si el límite continúa."}</p>
      )}
      {onControl && ongoing && (
        <div className="row">
          {p.status === "paused" && onResume && (
            <button type="button" disabled={busy} onClick={onResume}>
              Reanudar sincronización
            </button>
          )}
          {!["paused", "error"].includes(p.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onControl("pause")}
            >
              Pausar sincronización
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            className="danger"
            onClick={() => onControl("cancel")}
          >
            Cancelar sincronización
          </button>
        </div>
      )}
      <details>
        <summary>Detalles del progreso</summary>
        {p.scope && <small>{p.scope}</small>}
        <small>
          {p.pages} consultas procesadas · {p.processed} registros.
        </small>
        {p.attemptAt && (
          <small>Último intento: {displayTime(p.attemptAt)}</small>
        )}
      </details>
    </div>
  );
}
export function MetaAds({ role, userId }: { role: string; userId: string }) {
  const owner = role === "OWNER";
  const [accounts, setAccounts] = useState<Account[]>([]),
    [preferencesReady, setPreferencesReady] = useState(false),
    [accountsLoaded, setAccountsLoaded] = useState(false),
    [accountPickerQuery, setAccountPickerQuery] = useState(""),
    [accountPickerActivity, setAccountPickerActivity] = useState("all"),
    [connections, setConnections] = useState<Connection[]>([]),
    [showDisconnected, setShowDisconnected] = useState(false),
    [accountListQuery, setAccountListQuery] = useState(""),
    [accountListActivity, setAccountListActivity] = useState("all"),
    [accountListBusiness, setAccountListBusiness] = useState(""),
    [accountListPage, setAccountListPage] = useState(1),
    [objects, setObjects] = useState<ObjectOption[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [total, setTotal] = useState(0),
    [limited, setLimited] = useState(false),
    [rankingExcluded, setRankingExcluded] = useState(0),
    [tab, setTab] = useState(() =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("metaTab") ===
        "connections"
        ? "connections"
        : "panel",
    ),
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
    [analysisPeriod, setAnalysisPeriod] = useState("30"),
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
    [apiMode, setApiMode] = useState("oauth"),
    [marketingInfo, setMarketingInfo] = useState<MarketingOAuthInfo | null>(
      null,
    ),
    [revision, setRevision] = useState(0),
    [sharing, setSharing] = useState<Account | null>(null);
  const preferencesKey = `meta-ads:preferences:v1:${userId}`;
  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(preferencesKey);
    } catch {}
    const p = parseMetaPreferences(stored);
    setAccountIds(p.accountIds);
    setLevel(p.level);
    setBusiness(p.business);
    setCampaign(p.campaign);
    setAdset(p.adset);
    setQ(p.q);
    setSearch(p.q);
    setState(p.state);
    setMetric(p.metric);
    setCurrency(p.currency);
    setSort(p.sort);
    setAnalysisPeriod(p.analysisPeriod);
    setDirection(p.direction);
    setAge(p.age);
    setRating(p.rating);
    setSince(p.since);
    setUntil(p.until);
    setCalendar(p.calendar);
    setView(p.view);
    setAccountListQuery(p.accountListQuery);
    setAccountListActivity(p.accountListActivity);
    setAccountListBusiness(p.accountListBusiness);
    setAccountListPage(p.accountListPage);
    setAccountPickerQuery(p.accountPickerQuery);
    setAccountPickerActivity(p.accountPickerActivity);
    setTab(
      new URLSearchParams(window.location.search).get("metaTab") ===
        "connections" && owner
        ? "connections"
        : p.tab === "connections" && !owner
          ? "panel"
          : p.tab,
    );
    setPreferencesReady(true);
  }, [preferencesKey, owner]);
  useEffect(() => {
    if (!preferencesReady || !accountsLoaded) return;
    try {
      localStorage.setItem(
        preferencesKey,
        JSON.stringify({
          accountIds,
          tab,
          level,
          business,
          campaign,
          adset,
          q,
          state,
          metric,
          currency,
          sort,
          analysisPeriod,
          direction,
          age,
          rating,
          since,
          until,
          calendar,
          view,
          accountListQuery,
          accountListActivity,
          accountListBusiness,
          accountListPage,
          accountPickerQuery,
          accountPickerActivity,
        }),
      );
    } catch {}
  }, [
    preferencesReady,
    accountsLoaded,
    preferencesKey,
    accountIds,
    tab,
    level,
    business,
    campaign,
    adset,
    q,
    state,
    metric,
    currency,
    sort,
    analysisPeriod,
    direction,
    age,
    rating,
    since,
    until,
    calendar,
    view,
    accountListQuery,
    accountListActivity,
    accountListBusiness,
    accountListPage,
    accountPickerQuery,
    accountPickerActivity,
  ]);
  const businesses = [
    ...new Map(
      accounts
        .filter((a) => a.businessId)
        .map((a) => [a.businessId!, a.businessName ?? a.businessId!]),
    ).entries(),
  ];
  const filteredAccounts = accounts.filter((a) =>
    matchesAccount(
      a,
      accountListQuery,
      accountListActivity,
      accountListBusiness,
    ),
  );
  const accountPages = Math.max(1, Math.ceil(filteredAccounts.length / 25));
  const accountPage = Math.min(accountListPage, accountPages);
  const visibleAccounts = filteredAccounts.slice(
    (accountPage - 1) * 25,
    accountPage * 25,
  );
  const accountKey = accountIds.join(",");
  const serial = useRef(0);
  const syncVersions = useRef(new Map<string, string | null>());
  const analyticsTab = ["panel", "ranking", "alerts"].includes(tab);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);
  const refresh = useCallback(async () => {
    const rows: Account[] = await api("meta-ads/accounts");
    rows.forEach((a) => syncVersions.current.set(a.id, a.syncedAt));
    setAccounts(rows);
    setAccountIds((ids) => ids.filter((id) => rows.some((a) => a.id === id)));
    setAccountsLoaded(true);
  }, []);
  useEffect(() => {
    if (!preferencesReady || !owner || tab !== "connections") return;
    let live = true;
    Promise.all([
      api("meta-ads/connections"),
      api("meta-ads/marketing-oauth-config"),
    ])
      .then(([data, info]) => {
        if (live) {
          setConnections(data);
          setMarketingInfo(info);
        }
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [owner, tab, revision, preferencesReady]);
  useEffect(() => {
    if (!preferencesReady) return;
    let live = true;
    refresh().catch((e) => {
      if (live) setMessage(e.message);
    });
    return () => {
      live = false;
    };
  }, [refresh, preferencesReady]);
  useEffect(() => {
    if (!analyticsTab || !preferencesReady || !accountsLoaded) return;
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
  }, [analyticsTab, accountKey, revision, preferencesReady, accountsLoaded]);
  useEffect(() => {
    if (!analyticsTab || !preferencesReady || !accountsLoaded) {
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
    preferencesReady,
    accountsLoaded,
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
  const pendingKey = accounts
    .filter(
      (a) => a.enabled && (!accountIds.length || accountIds.includes(a.id)),
    )
    .map((a) => a.id)
    .slice(0, 100)
    .join(",");
  useEffect(() => {
    if (!preferencesReady || !pendingKey) return;
    let stopped = false,
      delay = 5000,
      timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState !== "visible") {
        timer = setTimeout(poll, 5000);
        return;
      }
      try {
        const response = await fetch(
          "/api/meta-ads/sync-status?" +
            new URLSearchParams({ accounts: pendingKey }),
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          if (response.status === 404) await refresh();
          else throw Error("No se pudo actualizar el progreso de Meta.");
          return;
        }
        const updates: Pick<
          Account,
          "id" | "syncedAt" | "syncError" | "syncState" | "progress"
        >[] = await response.json();
        if (stopped) return;
        delay = updates.some((u) =>
          ["queued", "running", "stalled"].includes(u.progress?.status ?? ""),
        )
          ? 5000
          : 30000;
        const finished = updates.some(
          (u) =>
            (u.progress?.status === "complete" || u.progress?.recentReady) &&
            !!u.syncedAt &&
            u.syncedAt !== syncVersions.current.get(u.id),
        );
        updates.forEach((u) => syncVersions.current.set(u.id, u.syncedAt));
        if (finished) setRevision((n) => n + 1);
        setAccounts((old) =>
          old.map((a) => {
            const update = updates.find((u) => u.id === a.id);
            return update ? { ...a, ...update } : a;
          }),
        );
        if (finished) await refresh();
      } catch (e) {
        if (!stopped && (e as Error).name !== "AbortError")
          setMessage((e as Error).message);
      } finally {
        if (!stopped) timer = setTimeout(poll, delay);
      }
    };
    timer = setTimeout(poll, 1000);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [preferencesReady, pendingKey, refresh]);
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
      try {
        await refresh();
      } catch {}
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
  if (!preferencesReady)
    return <p role="status">Restaurando tu selección de Meta Ads…</p>;
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
          ...(owner ? [["connections", "Conexiones"]] : []),
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
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </aside>
      )}
      <div className="meta-content">
        {tab === "connections" && owner ? (
          <>
            <details
              className="panel"
              open={
                connections.filter(
                  (c) => c.transport === "API" && !c.disconnectedAt,
                ).length === 0
              }
            >
              <summary>Agregar conexión de Facebook</summary>
              <div className="inside stack">
                <p>
                  Autoriza tu app de Meta para consultar cuentas y estadísticas.
                </p>
                <div className="row">
                  <button
                    type="button"
                    className={apiMode === "oauth" ? "primary" : ""}
                    onClick={() => setApiMode("oauth")}
                  >
                    Autorizar con Facebook
                  </button>
                  <button
                    type="button"
                    className={apiMode === "manual" ? "primary" : ""}
                    onClick={() => setApiMode("manual")}
                  >
                    Token manual
                  </button>
                </div>
                {apiMode === "oauth" ? (
                  <MetaMarketingOAuth
                    info={marketingInfo}
                    onUpdated={() => {
                      void refresh();
                      setRevision((r) => r + 1);
                    }}
                  />
                ) : (
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget,
                        data = new FormData(form);
                      void run(async () => {
                        await api("meta-ads/connections", "POST", {
                          name: String(data.get("name")),
                          transport: "API",
                          apiVersion: String(data.get("version")),
                          token: String(data.get("token")),
                        });
                        form.reset();
                      }, "Conexión guardada. Verifica el acceso para traer tus cuentas.");
                    }}
                  >
                    <div className="fields">
                      <label>
                        Nombre
                        <input name="name" required maxLength={100} />
                      </label>
                      <label>
                        Versión Graph
                        <input
                          name="version"
                          defaultValue="v26.0"
                          required
                          pattern="v[0-9]{2}\.0"
                        />
                      </label>
                    </div>
                    <label>
                      Token oficial de Marketing API
                      <PasswordInput
                        name="token"
                        required
                        secretLabel="token de Meta"
                        autoComplete="off"
                      />
                    </label>
                    <button disabled={busy}>Guardar conexión API</button>
                  </form>
                )}
              </div>
            </details>
            {connections.some(
              (c) => c.transport === "API" && c.disconnectedAt,
            ) && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={showDisconnected}
                  onChange={(e) => setShowDisconnected(e.target.checked)}
                />
                Ver conexiones retiradas (
                {
                  connections.filter(
                    (c) => c.transport === "API" && c.disconnectedAt,
                  ).length
                }
                )
              </label>
            )}
            {connections
              .filter(
                (c) =>
                  c.transport === "API" &&
                  (showDisconnected || !c.disconnectedAt),
              )
              .map((c) => (
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
                    {c.tokenMask ?? "Sin token guardado"} · Última verificación:{" "}
                    {displayTime(c.verifiedAt)}
                  </small>
                  {c.transport === "API" && (
                    <small>
                      Credencial:{" "}
                      {c.authMethod === "OAUTH"
                        ? "OAuth de tu app"
                        : "Token manual"}{" "}
                      · Caducidad:{" "}
                      {c.tokenExpiresAt
                        ? displayTime(c.tokenExpiresAt)
                        : "No informada"}
                      {c.tokenExpiresAt &&
                      Date.parse(c.tokenExpiresAt) <= Date.now()
                        ? " · Reconecta con Facebook"
                        : ""}
                    </small>
                  )}
                  {c.transport === "API" && !c.disconnectedAt && (
                    <details>
                      <summary>
                        Conectar con Facebook · configuración OAuth de mi app
                      </summary>
                      <div className="inside">
                        <MetaMarketingOAuth
                          key={c.id + (c.appSecretConfiguredAt ?? "")}
                          connection={c}
                          info={marketingInfo}
                          onUpdated={() => {
                            void refresh().catch((e) => setMessage(e.message));
                            setRevision((r) => r + 1);
                          }}
                        />
                      </div>
                    </details>
                  )}
                  {c.lastError &&
                    (c.verifiedAt ? (
                      <details>
                        <summary>Información de la verificación</summary>
                        <p>{c.lastError}</p>
                      </details>
                    ) : (
                      <p className="notice">{c.lastError}</p>
                    ))}
                  {c.transport === "API" && (
                    <details>
                      <summary>Versión de la API · avanzado</summary>
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const apiVersion = String(
                            new FormData(e.currentTarget).get("apiVersion"),
                          );
                          void run(async () => {
                            await api(`meta-ads/connections/${c.id}`, "PATCH", {
                              apiVersion,
                            });
                          }, "Versión actualizada. Se conserva el token; vuelve a Verificar y traer cuentas.");
                        }}
                      >
                        <label>
                          Versión Graph guardada
                          <input
                            name="apiVersion"
                            defaultValue={c.apiVersion}
                            key={c.apiVersion}
                            required
                            pattern="v[0-9]{2}\.0"
                          />
                        </label>
                        <button disabled={busy}>
                          Actualizar versión sin cambiar token
                        </button>
                        <small>
                          Usa la misma versión que funcionó en Explorer.
                          Actualizar el formulario de una conexión nueva no
                          cambia esta conexión.
                        </small>
                      </form>
                    </details>
                  )}

                  <div className="row">
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
                            `Acceso verificado · ${r.accounts} cuentas disponibles.`,
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
                      {c.disconnectedAt
                        ? "Conexión retirada"
                        : "Eliminar conexión"}
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
                        }, "Token reemplazado. Se retiró el error anterior y se conservó el avance. Pulsa Verificar y traer cuentas en esta misma conexión; después continúa la sincronización.");
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
          </>
        ) : tab === "accounts" ? (
          <>
            <div className="row">
              <h2>Cuentas autorizadas · {accounts.length}</h2>
              <button type="button" disabled={busy} onClick={reload}>
                Actualizar vista
              </button>
            </div>
            <p className="hint">
              Busca tus cuentas publicitarias por nombre o ID.
            </p>
            <div className="fields meta-filters panel">
              <label>
                Buscar cuenta por nombre o ID
                <input
                  type="search"
                  value={accountListQuery}
                  onChange={(e) => {
                    setAccountListQuery(e.target.value);
                    setAccountListPage(1);
                  }}
                  placeholder="Nombre, negocio o act_…"
                />
              </label>
              <label>
                Actividad de cuentas
                <select
                  value={accountListActivity}
                  onChange={(e) => {
                    setAccountListActivity(e.target.value);
                    setAccountListPage(1);
                  }}
                >
                  {activityOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Negocio informado por Meta
                <select
                  value={accountListBusiness}
                  onChange={(e) => {
                    setAccountListBusiness(e.target.value);
                    setAccountListPage(1);
                  }}
                >
                  <option value="">Todos los autorizados</option>
                  <option value="__unknown">Sin agrupación disponible</option>
                  {businesses.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <small>
              {filteredAccounts.length} de {accounts.length} cuentas · actividad
              basada en la última importación completa de hoy. Antes de
              sincronizar, el gasto y las campañas activas son desconocidos.
            </small>
            {!!accounts.length && !filteredAccounts.length && (
              <p className="panel">
                No hay cuentas que coincidan. Prueba otro nombre o ID, o elige
                Toda la actividad para incluir cuentas sin sincronizar.
              </p>
            )}
            {!accounts.length && (
              <p className="panel">
                {owner
                  ? "Conecta Meta y pulsa Verificar y traer cuentas para empezar."
                  : "El OWNER todavía no te ha asignado cuentas publicitarias."}
              </p>
            )}
            {visibleAccounts.map((a) => (
              <article className="panel stack" key={a.id}>
                <h3>
                  {a.name} <small>act_{a.id}</small>
                </h3>
                <p>
                  {a.businessName ? `${a.businessName} · ` : ""}
                  {a.currency} · {a.timezone}
                </p>
                <div className="row spread">
                  <small>Datos recientes: {displayTime(a.syncedAt)}</small>
                  {owner && a.sources && (
                    <label>
                      Conexión
                      <select
                        aria-label={`Conexión de ${a.name}`}
                        value={a.connectionId}
                        disabled={busy}
                        onChange={(e) =>
                          void run(
                            () =>
                              api(`meta-ads/accounts/${a.id}`, "PATCH", {
                                connectionId: e.target.value,
                              }),
                            "Conexión actualizada.",
                          )
                        }
                      >
                        {a.sources
                          .filter(
                            (source) =>
                              source.connection.transport === "API" &&
                              !source.connection.disconnectedAt,
                          )
                          .map((source) => (
                            <option
                              key={source.connectionId}
                              value={source.connectionId}
                            >
                              {source.connection.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </div>
                {a.connection && !a.connection.verifiedAt && (
                  <p className="notice">
                    Verifica esta conexión en Conexiones antes de sincronizar.
                  </p>
                )}
                <small className="meta-account-activity">
                  {accountActivityText(a)}
                </small>
                {a.progress && (
                  <SyncIndicator
                    account={a}
                    busy={busy}
                    onResume={
                      a.canSync
                        ? () =>
                            void run(
                              () =>
                                api(`meta-ads/accounts/${a.id}/sync`, "POST", {
                                  focused: true,
                                  recentDays: a.progress?.focused
                                    ? a.progress.recentDays
                                    : 7,
                                }),
                              "Sincronización retomada.",
                            )
                        : undefined
                    }
                    onControl={
                      a.canSync
                        ? (action) =>
                            void run(
                              () =>
                                api(
                                  `meta-ads/accounts/${a.id}/control`,
                                  "POST",
                                  { action },
                                ),
                              action === "pause"
                                ? "Sincronización pausada; puedes retomarla."
                                : "Sincronización cancelada. Los datos guardados se conservan.",
                            )
                        : undefined
                    }
                  />
                )}
                {a.syncError && (
                  <details className="notice" open={a.progress?.status !== "waiting"}>
                    <summary>{a.progress?.status === "waiting" ? "Detalle del límite de Meta" : "No se completó la sincronización"}</summary>
                    <p>{a.syncError}</p>
                  </details>
                )}
                {a.canSync && (
                  <form
                    className="row meta-sync-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const recentDays = Number(
                        new FormData(e.currentTarget).get("recentDays"),
                      );
                      void run(async () => {
                        const r = await api(
                          `meta-ads/accounts/${a.id}/sync`,
                          "POST",
                          { focused: true, recentDays },
                        );
                        setMessage(
                          r.waiting ? "Sincronización programada después de la pausa por límite de Meta." : r.syncError ??
                            (r.resumed
                              ? "Sincronización retomada."
                              : "Análisis iniciado. Primero se cargarán los datos recientes y después el histórico."),
                        );
                      });
                    }}
                  >
                    <label>
                      Activos o con entrega en
                      <select
                        name="recentDays"
                        defaultValue={
                          a.progress?.focused &&
                          [7, 15, 30, 90].includes(a.progress.recentDays)
                            ? a.progress.recentDays
                            : 7
                        }
                      >
                        {[7, 15, 30, 90].map((days) => (
                          <option key={days} value={days}>
                            Últimos {days} días
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={busy || !a.connection?.verifiedAt || a.progress?.status === "waiting"}
                    >
                      {busy
                        ? "Procesando…"
                        : a.progress?.status === "waiting" ? "Esperando a Meta"
                        : a.progress &&
                            ["running", "stalled", "error", "paused"].includes(
                              a.progress.status,
                            )
                          ? "Continuar análisis"
                          : "Sincronizar y analizar"}
                    </button>
                  </form>
                )}
                <small>
                  El periodo selecciona qué mostrar. Los comparativos incluyen
                  hoy, 7, 15, 30 días e histórico disponible en Meta.
                </small>
                {owner && (
                  <div className="row">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setSharing(a)}
                    >
                      Accesos por usuario
                    </button>
                    <details>
                      <summary>Costo objetivo · opcional</summary>
                      <form
                        className="row"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const value = new FormData(e.currentTarget).get(
                            "target",
                          );
                          void run(
                            () =>
                              api(`meta-ads/accounts/${a.id}`, "PATCH", {
                                targetCost: value ? Number(value) : null,
                              }),
                            "Costo objetivo actualizado.",
                          );
                        }}
                      >
                        <label>
                          Meta de costo · {a.currency}
                          <input
                            name="target"
                            type="number"
                            min="0.000001"
                            step="any"
                            defaultValue={a.targetCost ?? ""}
                            placeholder="Sin meta"
                          />
                        </label>
                        <button disabled={busy}>Guardar</button>
                      </form>
                    </details>
                  </div>
                )}
              </article>
            ))}
            {!!filteredAccounts.length && (
              <div className="row" aria-label="Paginación de cuentas">
                <button
                  type="button"
                  disabled={accountPage === 1}
                  onClick={() => setAccountListPage(accountPage - 1)}
                >
                  Anterior
                </button>
                <span>
                  {filteredAccounts.length} cuentas · Página {accountPage} de{" "}
                  {accountPages}
                </span>
                <button
                  type="button"
                  disabled={accountPage === accountPages}
                  onClick={() => setAccountListPage(accountPage + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
            <p className="hint">
              La actualización continúa en segundo plano. Consultar estadísticas
              no consume IA.
            </p>
          </>
        ) : (
          <>
            {chosen
              .filter(
                (a) =>
                  a.progress &&
                  !["complete", "disabled", "cancelled"].includes(
                    a.progress.status,
                  ),
              )
              .map((a) => (
                <div className="panel" key={a.id}>
                  <strong>{a.name}</strong>
                  <SyncIndicator
                    account={a}
                    busy={busy}
                    onResume={
                      a.canSync
                        ? () =>
                            void run(
                              () =>
                                api(`meta-ads/accounts/${a.id}/sync`, "POST", {
                                  focused: true,
                                  recentDays: a.progress?.focused
                                    ? a.progress.recentDays
                                    : 7,
                                }),
                              "Sincronización retomada.",
                            )
                        : undefined
                    }
                    onControl={
                      a.canSync
                        ? (action) =>
                            void run(
                              () =>
                                api(
                                  `meta-ads/accounts/${a.id}/control`,
                                  "POST",
                                  { action },
                                ),
                              action === "pause"
                                ? "Sincronización pausada; puedes retomarla."
                                : "Sincronización cancelada. Los datos guardados se conservan.",
                            )
                        : undefined
                    }
                  />
                  {a.syncError && <p className="notice">{a.syncError}</p>}
                </div>
              ))}
            <div className="panel stack">
              <div
                className="meta-level-tabs"
                role="tablist"
                aria-label="Nivel publicitario"
              >
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
                <MetaAccountPicker
                  accounts={accounts}
                  selected={accountIds}
                  business={business}
                  query={accountPickerQuery}
                  activity={accountPickerActivity}
                  onQueryChange={setAccountPickerQuery}
                  onActivityChange={setAccountPickerActivity}
                  onChange={(ids) =>
                    resetPage(() => {
                      setAccountIds(ids);
                      setCampaign("");
                      setAdset("");
                    })
                  }
                />
                <label>
                  Buscar por palabra
                  <input
                    type="search"
                    aria-label="Buscar campañas, conjuntos o anuncios"
                    placeholder="Escribe parte del nombre"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                <label>
                  Medir resultado
                  <select
                    value={metric}
                    onChange={(e) => resetPage(() => setMetric(e.target.value))}
                  >
                    <option value="">Automático según objetivo</option>
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
                  Estado / entrega
                  <select
                    value={state}
                    onChange={(e) => resetPage(() => setState(e.target.value))}
                  >
                    <option value="all">Todos</option>
                    <option value="active">Activos configurados</option>
                    <option value="campaign-active">
                      Solo campañas activas
                    </option>
                    <option value="delivery">Entrega registrada hoy</option>
                    <option value="effective">Estado efectivo activo</option>
                    <option value="paused">Pausados</option>
                    <option value="issues">Revisión o problemas</option>
                  </select>
                </label>
                <label>
                  Periodo de análisis
                  <select
                    value={calendar ? "custom" : analysisPeriod}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value !== "custom") {
                        setAnalysisPeriod(value);
                        setCalendar("");
                        setSince("");
                        setUntil("");
                        if (sort === "custom") setSort("7");
                      }
                    }}
                  >
                    {periods.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                    {calendar && (
                      <option value="custom">Calendario elegido</option>
                    )}
                  </select>
                </label>
              </div>
              <details
                open={
                  !!(business || campaign || adset || currency || age || rating)
                }
              >
                <summary>Más filtros</summary>
                <div className="inside stack">
                  <div className="fields meta-filters">
                    {businesses.length > 0 && (
                      <label>
                        Administrador comercial
                        <select
                          value={business}
                          onChange={(e) =>
                            resetPage(() => {
                              setBusiness(e.target.value);
                              setAccountIds([]);
                              setCampaign("");
                              setAdset("");
                            })
                          }
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
                    )}
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
                          .filter(
                            (o) =>
                              o.level === "campaign" &&
                              chosen.some((a) => a.id === o.accountId),
                          )
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
                        onChange={(e) =>
                          resetPage(() => setAdset(e.target.value))
                        }
                      >
                        <option value="">Todos los conjuntos</option>
                        {objects
                          .filter(
                            (o) =>
                              o.level === "adset" &&
                              chosen.some((a) => a.id === o.accountId) &&
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
                      Moneda
                      <select
                        value={currency}
                        onChange={(e) =>
                          resetPage(() => setCurrency(e.target.value))
                        }
                      >
                        <option value="">Todas · separadas al ordenar</option>
                        {[...new Set(chosen.map((a) => a.currency))].map(
                          (c) => (
                            <option key={c}>{c}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Antigüedad · días
                      <select
                        value={age}
                        onChange={(e) =>
                          resetPage(() => setAge(e.target.value))
                        }
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
                        onChange={(e) =>
                          resetPage(() => setRating(e.target.value))
                        }
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
                  <button
                    type="button"
                    onClick={() =>
                      resetPage(() => {
                        setBusiness("");
                        setCampaign("");
                        setAdset("");
                        setCurrency("");
                        setAge("");
                        setRating("");
                      })
                    }
                  >
                    Limpiar filtros adicionales
                  </button>
                </div>
              </details>
              <div className="meta-sort-tools" aria-label="Orden de resultados">
                <span>Ordenar por costo</span>
                <div
                  className="meta-cost-sort"
                  aria-label="Periodo para ordenar por costo"
                >
                  {[...periods, ["custom", "Calendario"]].map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={sort === id}
                      disabled={id === "custom" && !calendar}
                      className={sort === id ? "primary" : ""}
                      onClick={() =>
                        resetPage(() => {
                          setSort(id);
                          setDirection(
                            sort === id && direction === "asc" ? "desc" : "asc",
                          );
                        })
                      }
                    >
                      {label}
                      <span aria-hidden="true">
                        {sort === id
                          ? direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : " ↕"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button
                    type="button"
                    aria-pressed={sort === "newest"}
                    onClick={() => resetPage(() => setSort("newest"))}
                  >
                    Más nuevos
                  </button>
                  <button
                    type="button"
                    aria-pressed={sort === "age"}
                    onClick={() =>
                      resetPage(() => {
                        setSort("age");
                        setDirection(
                          sort === "age" && direction === "asc"
                            ? "desc"
                            : "asc",
                        );
                      })
                    }
                  >
                    Antigüedad en días
                  </button>
                </div>
                <small>
                  Las tarjetas muestran siempre Hoy, 7, 15, 30 días y Desde el
                  inicio. Estos botones solo cambian el orden; otro clic
                  invierte la dirección. Sin costo disponible queda al final.
                </small>
              </div>
              <div className="row meta-view-tools">
                <details className="meta-calendar">
                  <summary>
                    Calendario opcional
                    <span className="meta-calendar-state" aria-hidden="true">
                      {calendar ? "●" : ""}
                    </span>
                    <span className="sr-only">
                      {calendar
                        ? "Rango personalizado activo"
                        : "Sin rango personalizado"}
                    </span>
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
                Atribución: 7 días clic / 1 día vista, por fecha de impresión.
                Hoy es parcial; Meta puede actualizar resultados. Se ordena por
                moneda y tipo de resultado.
              </small>
            </div>
            <div className="meta-results" aria-busy={loading}>
              {tab === "ranking" && rankingExcluded > 0 && (
                <p className="hint">
                  {rankingExcluded} elementos separados por datos insuficientes
                  en el periodo elegido. Puedes consultarlos en Rendimiento.
                </p>
              )}
              {limited && (
                <p className="notice">
                  Hay más de 10.000 elementos: filtra por cuenta o campaña para
                  acotar el ranking.
                </p>
              )}
              <div
                className="meta-load-status"
                role="status"
                aria-live="polite"
              >
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
                        ? "Conecta tu cuenta de Facebook para empezar."
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
                              <button
                                type="button"
                                onClick={() => setSelected(o)}
                              >
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
                                <small>
                                  {o.periods[key].results} resultados
                                </small>
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
                        [
                          "CRITICAL",
                          "WATCH",
                          "DETERIORATING",
                          "STALE",
                        ].includes(o.rating),
                    )
                    .map((o) => {
                      const summary =
                        o.periods[calendar ? "custom" : analysisPeriod] ??
                        o.periods["30"];
                      const summaryLabel = calendar
                        ? "Calendario elegido"
                        : (periods.find(([id]) => id === analysisPeriod)?.[1] ??
                          "30 días");
                      return (
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
                            <span
                              className={
                                "meta-delivery " +
                                (o.effectiveStatus === "ACTIVE"
                                  ? "is-active"
                                  : "")
                              }
                            >
                              {deliveryLabels[o.effectiveStatus] ??
                                o.effectiveStatus ??
                                "Entrega no informada"}
                            </span>
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
                              <small className="meta-object-level">
                                {o.level === "ad"
                                  ? "Anuncio"
                                  : o.level === "adset"
                                    ? "Conjunto de anuncios"
                                    : "Campaña"}
                              </small>
                              <h2>{o.name}</h2>
                              <small>Campaña: {o.campaignName}</small>
                              {o.level !== "campaign" && (
                                <small>Conjunto: {o.adsetName}</small>
                              )}
                            </div>
                          </div>
                          <div className="meta-circulation">
                            <div>
                              <span>
                                {o.createdTime
                                  ? "Creado el"
                                  : "Entrega registrada desde"}
                              </span>
                              <strong>
                                {date(
                                  o.createdTime ?? o.firstDelivery,
                                  o.timezone,
                                )}
                              </strong>
                            </div>
                            <div>
                              <span>
                                {o.ageFromCreation
                                  ? "Antigüedad"
                                  : "Días registrados"}
                              </span>
                              <strong>
                                {o.ageDays !== null
                                  ? `${o.ageDays} días`
                                  : "Por confirmar"}
                              </strong>
                            </div>
                          </div>
                          <div className="meta-summary-heading">
                            <strong>Resumen · {summaryLabel}</strong>
                            <small>
                              {date(summary.since)} → {date(summary.until)}
                            </small>
                          </div>
                          <div className="meta-summary-metrics">
                            <div>
                              <span>Gasto</span>
                              <strong>
                                {summary.state === "UNAVAILABLE"
                                  ? "—"
                                  : money(summary.spend, o.currency)}
                              </strong>
                            </div>
                            <div title={o.metricName}>
                              <span>Resultados</span>
                              <strong>
                                {summary.state === "UNAVAILABLE"
                                  ? "—"
                                  : summary.results.toLocaleString("es-PE")}
                              </strong>
                              <span className="sr-only">{o.metricName}</span>
                            </div>
                            <div>
                              <span>Costo por resultado</span>
                              <strong>{cost(summary, o.currency)}</strong>
                            </div>
                          </div>
                          <strong className="meta-metric-name">
                            {costLabels[o.metric] ?? "Costo por resultado"}
                          </strong>
                          <div className="meta-periods">
                            {periods.map(([key, label]) => (
                              <div
                                key={key}
                                title={`${o.periods[key].since} → ${o.periods[key].until}`}
                              >
                                <span>{label}</span>
                                <strong>
                                  {cost(o.periods[key], o.currency)}
                                </strong>
                                <small>
                                  {o.periods[key].state === "UNAVAILABLE"
                                    ? "Pendiente / no disponible"
                                    : `${o.periods[key].results} resultados`}{" "}
                                  · {money(o.periods[key].spend, o.currency)}
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
                          <div className="meta-card-evaluation">
                            <span className="badge">{ratings[o.rating]}</span>
                            <small>
                              Evaluación orientativa · últimos 7 días
                            </small>
                          </div>
                          <div className="meta-dates">
                            <span>
                              Creado: {date(o.createdTime, o.timezone)} ·
                              Activos conocidos: {o.activeDays} días
                            </span>
                            <span>
                              {o.historyPending
                                ? "Histórico en preparación"
                                : "Histórico disponible en Meta"}{" "}
                              · Actualizado:{" "}
                              {displayTime(o.historyUpdatedAt ?? o.syncedAt)}
                            </span>
                          </div>
                          {o.changePercent !== null && (
                            <p className="hint">
                              Costo de 7 días completos frente a los 7
                              anteriores: {o.changePercent > 0 ? "+" : ""}
                              {o.changePercent.toFixed(1)}%.{" "}
                              {o.changePercent > 0 ? "Aumento" : "Reducción"}{" "}
                              del costo; compara también el volumen.
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
                      );
                    })}
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
                <td>
                  {o.periods[key].state === "UNAVAILABLE"
                    ? "—"
                    : o.periods[key].results}
                </td>
                <td>
                  {o.periods[key].state === "UNAVAILABLE"
                    ? "—"
                    : money(o.periods[key].spend, o.currency)}
                </td>
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
        volumen de resultados disponible. No son puntuaciones oficiales de Meta.
        Un estado efectivo activo no garantiza entrega actual.
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
