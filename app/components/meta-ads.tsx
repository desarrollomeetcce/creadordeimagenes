"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  MetaMarketingOAuth,
  MetaOAuthQuickConnect,
  type MarketingOAuthInfo,
} from "./meta-marketing-oauth";
import { MetaConnectionScope } from "./meta-connection-scope";
import { MetaConnectionAccess } from "./meta-connection-access";
import { MetaAnalysisPeriod } from "./meta-analysis-period";
import {
  MetaAliasDirectory,
  type MetaAliasOption,
} from "./meta-alias-directory";
import { MetaStatusSwitch } from "./meta-status-switch";
import { MetaDataFreshness } from "./meta-data-freshness";
import { MetaDailyDetail } from "./meta-daily-detail";
import { MetaCostOrder } from "./meta-cost-order";
import type { MetaSelection } from "../../lib/meta-ads/preferences";
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
  lastDataAt?: string | null;
  lastCompletedAt?: string | null;
  coverage?: { since: string; until: string } | null;
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
  aliasId: string | null;
  alias: MetaAliasOption | null;
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
  seenAt: string;
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
  PAUSED: "Desactivado (pausado)",
  CAMPAIGN_PAUSED: "Desactivado por campaña",
  ADSET_PAUSED: "Desactivado por conjunto",
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
    ? new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima" })
    : "Todavía no sincronizada";
}
function SyncIndicator({
  account,
  busy = false,
  onControl,
  onResume,
  onAnalyze,
}: {
  account: Account;
  busy?: boolean;
  onControl?: (action: "pause" | "cancel") => void;
  onResume?: () => void;
  onAnalyze?: () => void;
}) {
  const p = account.progress;
  if (!p || p.status === "disabled") return null;
  const ongoing = [
    "running",
    "queued",
    "stalled",
    "error",
    "paused",
    "waiting",
  ].includes(p.status);
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
      {ongoing && (
        <small>
          La barra cuenta etapas; una etapa puede procesar muchos anuncios.
        </small>
      )}
      {p.lastActivityAt && (
        <small>
          Última actividad registrada: {displayTime(p.lastActivityAt)} · hora de
          Lima.
        </small>
      )}
      {p.status === "stalled" && (
        <small>
          El servidor no ha confirmado avance reciente. Revisa el detalle del
          progreso antes de iniciar otra actualización.
        </small>
      )}
      {p.status === "error" && (
        <small>
          La importación está detenida por un error; el avance guardado se
          conserva.
        </small>
      )}
      {p.recentReady && p.status !== "complete" && (
        <small>
          Análisis reciente disponible. Falta completar el histórico.
        </small>
      )}
      {p.recentReady && p.historyTotal > 0 && (
        <small>
          Histórico: {p.historyProcessed} de {p.historyTotal} elementos
          completados.
        </small>
      )}
      {p.recentReady && onAnalyze && (
        <div>
          <button type="button" className="primary" onClick={onAnalyze}>
            Ver análisis disponible
          </button>
        </div>
      )}
      {p.status === "waiting" && p.nextSyncAt && (
        <p className="notice">
          Avance guardado. Próximo intento automático:{" "}
          {displayTime(p.nextSyncAt)}.{" "}
          {p.waitReason !== "pacing" &&
            "Meta puede ampliar la espera si el límite continúa."}
        </p>
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
    [pinnedAccountIds, setPinnedAccountIds] = useState<string[]>([]),
    [selectedObjects, setSelectedObjects] = useState<MetaSelection[]>([]),
    [campaignScope, setCampaignScope] = useState<string[]>([]),
    [adsetScope, setAdsetScope] = useState<string[]>([]),
    [business, setBusiness] = useState(""),
    [campaign, setCampaign] = useState(""),
    [adset, setAdset] = useState(""),
    [aliases, setAliases] = useState<MetaAliasOption[]>([]),
    [aliasFilter, setAliasFilter] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [state, setState] = useState("all"),
    [metric, setMetric] = useState("MESSAGES"),
    [currency, setCurrency] = useState(""),
    [sort, setSort] = useState("7"),
    [analysisPeriod, setAnalysisPeriod] = useState("today"),
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
    [progressError, setProgressError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [apiMode, setApiMode] = useState(""),
    [marketingInfo, setMarketingInfo] = useState<MarketingOAuthInfo | null>(
      null,
    ),
    [revision, setRevision] = useState(0),
    [sharing, setSharing] = useState<Account | null>(null);
  useEffect(() => {
    let active = true;
    api("meta-ads/aliases")
      .then((rows) => {
        if (active) {
          setAliases(rows);
          setAliasFilter((current) =>
            current &&
            current !== "__none" &&
            !rows.some((a: MetaAliasOption) => a.id === current)
              ? ""
              : current,
          );
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const aliasControl = (o: Item) =>
    owner ? (
      <select
        aria-label={`Alias de ${o.name}`}
        value={o.aliasId ?? ""}
        disabled={busy}
        onChange={(e) => {
          const aliasId = e.target.value || null;
          void run(
            () => api(`meta-ads/objects/${o.id}/alias`, "PATCH", { aliasId }),
            "Alias actualizado.",
          );
        }}
      >
        <option value="">Sin alias</option>
        {aliases.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    ) : (
      <span>{o.alias?.name ?? "Sin alias"}</span>
    );
  const selectedIds = new Set(selectedObjects.map((o) => o.id));
  const chooseAccounts = (ids: string[], pin = true) =>
    resetPage(() => {
      setAccountIds(ids);
      setCampaign("");
      setAdset("");
      setCampaignScope([]);
      setAdsetScope([]);
      if (pin)
        setPinnedAccountIds((old) =>
          [...new Set([...old, ...ids])].slice(0, 100),
        );
    });
  const selectObject = (o: Item, checked: boolean) => {
    const next = selectedObjects.filter((s) => s.id !== o.id);
    if (checked) {
      if (next.filter((s) => s.level === o.level).length >= 100) {
        setMessage("Puedes seleccionar hasta 100 elementos por nivel.");
        return;
      }
      next.push({
        id: o.id,
        accountId: o.accountId,
        level: o.level as MetaSelection["level"],
      });
    }
    setSelectedObjects(next);
    if (o.level === "campaign") {
      setCampaignScope(
        next
          .filter(
            (s) =>
              s.level === "campaign" &&
              (!accountIds.length || accountIds.includes(s.accountId)),
          )
          .map((s) => s.id),
      );
      setAdsetScope([]);
    }
    if (o.level === "adset")
      setAdsetScope(
        next
          .filter(
            (s) =>
              s.level === "adset" &&
              (!accountIds.length || accountIds.includes(s.accountId)),
          )
          .map((s) => s.id),
      );
    setPage(1);
  };
  const openChildren = (o: Item) => {
    if (!selectedIds.has(o.id)) selectObject(o, true);
    if (o.level === "ad") {
      setSelected(o);
      return;
    }
    resetPage(() => {
      setAccountIds([o.accountId]);
      setCampaign("");
      setAdset("");
      setCampaignScope([o.level === "campaign" ? o.id : o.campaignId]);
      setAdsetScope(o.level === "adset" ? [o.id] : []);
      setLevel(o.level === "campaign" ? "adset" : "ad");
      setAliasFilter("");
      setQ("");
      setSearch("");
    });
  };
  const clearFilters = () =>
    resetPage(() => {
      setAccountIds([]);
      setCampaign("");
      setAdset("");
      setCampaignScope([]);
      setAdsetScope([]);
      setBusiness("");
      setCurrency("");
      setAge("");
      setState("all");
      setMetric("MESSAGES");
      setRating("");
      setAliasFilter("");
      setQ("");
      setSearch("");
      setAccountPickerQuery("");
      setAccountPickerActivity("all");
      setCalendar("");
      setSince("");
      setUntil("");
      setAnalysisPeriod("today");
      setSort("today");
      setDirection("asc");
    });
  const changeStatus = (o: Item) => {
    const next = o.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    if (
      !window.confirm(
        `${next === "ACTIVE" ? "Activar" : "Pausar"} «${o.name}» en Meta?${next === "ACTIVE" ? " Puede reanudar la entrega y el gasto publicitario según su presupuesto." : ""}`,
      )
    )
      return;
    void run(
      () =>
        api(`meta-ads/objects/${o.id}/status`, "POST", {
          status: next,
          expectedStatus: o.status,
          confirmed: true,
        }),
      "Estado actualizado en Meta. Los resultados anteriores se conservan.",
    );
  };
  const preferencesKey = `meta-ads:preferences:v1:${userId}`;
  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(preferencesKey);
    } catch {}
    const p = parseMetaPreferences(stored);
    setAccountIds(p.accountIds);
    setPinnedAccountIds(p.pinnedAccountIds);
    setSelectedObjects(p.selectedObjects);
    setCampaignScope(p.campaignScope);
    setAdsetScope(p.adsetScope);
    setLevel(p.level);
    setBusiness(p.business);
    setCampaign(p.campaign);
    setAdset(p.adset);
    setAliasFilter(p.aliasFilter);
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
        : ["connections", "aliases"].includes(p.tab) && !owner
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
          layoutRevision: 2,
          accountIds,
          pinnedAccountIds,
          selectedObjects,
          campaignScope,
          adsetScope,
          tab,
          level,
          business,
          campaign,
          adset,
          q,
          aliasFilter,
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
    pinnedAccountIds,
    selectedObjects,
    campaignScope,
    adsetScope,
    tab,
    level,
    business,
    campaign,
    adset,
    q,
    aliasFilter,
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
  const campaignScopeKey = level === "campaign" ? "" : campaignScope.join(",");
  const adsetScopeKey = level === "ad" ? adsetScope.join(",") : "";
  const serial = useRef(0);
  const syncVersions = useRef(new Map<string, string | null>());
  const historicalVersions = useRef(new Map<string, number>());
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
    const allowed = new Set(rows.map((a) => a.id));
    setPinnedAccountIds((ids) => ids.filter((id) => allowed.has(id)));
    setSelectedObjects((old) => old.filter((o) => allowed.has(o.accountId)));
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
        campaigns: campaignScopeKey,
        adsets: adsetScopeKey,
        q: search,
        alias: aliasFilter,
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
    campaignScopeKey,
    adsetScopeKey,
    search,
    aliasFilter,
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
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          },
        );
        if (!response.ok) {
          if (response.status === 404) await refresh();
          else {
            let detail = "";
            try {
              const body = await response.json();
              detail =
                typeof body.error === "string" ? body.error.slice(0, 300) : "";
            } catch {}
            throw Error(
              `No se pudo consultar el progreso (HTTP ${response.status}). ${detail}`,
            );
          }
          return;
        }
        const updates: Pick<
          Account,
          "id" | "syncedAt" | "syncError" | "syncState" | "progress"
        >[] = await response.json();
        if (stopped) return;
        setProgressError("");
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
        const historyChanged = updates.some(
          (u) =>
            u.progress?.recentReady &&
            u.progress.historyProcessed !==
              historicalVersions.current.get(u.id),
        );
        updates.forEach((u) => {
          syncVersions.current.set(u.id, u.syncedAt);
          historicalVersions.current.set(
            u.id,
            u.progress?.historyProcessed ?? 0,
          );
        });
        if (finished || historyChanged) setRevision((n) => n + 1);
        setAccounts((old) =>
          old.map((a) => {
            const update = updates.find((u) => u.id === a.id);
            return update ? { ...a, ...update } : a;
          }),
        );
        if (finished) await refresh();
      } catch (e) {
        if (!stopped && (e as Error).name !== "AbortError") {
          delay = Math.min(60000, Math.max(10000, delay * 2));
          setProgressError(
            (e as Error).name === "TimeoutError"
              ? "El servidor tardó demasiado en responder al consultar el progreso."
              : (e as Error).message,
          );
        }
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
        <span className="meta-readonly">
          {owner ? "Análisis y control de Meta" : "Consulta de Meta"}
        </span>
      </header>
      <div className="row" role="tablist" aria-label="Secciones Meta Ads">
        {[
          ["panel", "Rendimiento"],
          ["ranking", "Ranking de eficiencia"],
          ["alerts", "Alertas"],
          ["accounts", "Cuentas publicitarias"],
          ...(owner
            ? [
                ["connections", "Conexiones"],
                ["aliases", "Alias de diplomados"],
              ]
            : []),
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
      {progressError && (
        <p className="notice" role="status">
          {progressError} Se conserva el último avance conocido y se volverá a
          consultar automáticamente. Este aviso no confirma que la importación
          se haya detenido.
        </p>
      )}
      <div className="meta-content">
        {tab === "aliases" && owner ? (
          <MetaAliasDirectory
            aliases={aliases}
            onSaved={() => setRevision((v) => v + 1)}
          />
        ) : tab === "connections" && owner ? (
          <>
            <section
              className="panel stack"
              aria-label="Agregar conexión de Meta"
            >
              <h3>Conectar cuentas de Meta</h3>
              <p>
                Elige cómo conectar. Cada conexión utiliza un único método de
                acceso.
              </p>
              <div
                className="row"
                role="group"
                aria-label="Opciones para conectar con Meta"
              >
                {[
                  ["manual", "Manual (token)"],
                  ["quick", "Conexión OAuth con Meta"],
                  ["oauth", "Agregar conexión OAuth"],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={apiMode === mode ? "primary" : ""}
                    aria-expanded={apiMode === mode}
                    onClick={() => setApiMode(apiMode === mode ? "" : mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="stack">
                {apiMode === "quick" && (
                  <section
                    className="stack"
                    aria-label="Conexiones OAuth disponibles"
                  >
                    <p>
                      Abre Facebook con una conexión cuya app ya esté
                      configurada. Al completar la autorización se reemplazará
                      su credencial actual.
                    </p>
                    {connections
                      .filter(
                        (c) =>
                          c.transport === "API" &&
                          !c.disconnectedAt &&
                          c.appId &&
                          c.appSecretConfiguredAt,
                      )
                      .map((c) => (
                        <div className="panel stack" key={c.id}>
                          <strong>{c.name}</strong>
                          <MetaOAuthQuickConnect
                            connection={c}
                            info={marketingInfo}
                          />
                        </div>
                      ))}
                    {!connections.some(
                      (c) =>
                        c.transport === "API" &&
                        !c.disconnectedAt &&
                        c.appId &&
                        c.appSecretConfiguredAt,
                    ) && (
                      <p>
                        Primero usa «Agregar conexión OAuth» para configurar tu
                        app de Meta.
                      </p>
                    )}
                  </section>
                )}
                {apiMode === "oauth" ? (
                  <MetaMarketingOAuth
                    info={marketingInfo}
                    onUpdated={() => {
                      void refresh();
                      setRevision((r) => r + 1);
                    }}
                  />
                ) : apiMode === "manual" ? (
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
                        setApiMode("");
                      }, "Conexión guardada. El token aparece oculto en su tarjeta. Verifica el acceso para traer tus cuentas.");
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
                ) : null}
              </div>
            </section>
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
                      {!c.tokenMask
                        ? "Sin autorización"
                        : c.authMethod === "OAUTH"
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
                  <MetaConnectionScope
                    accounts={accounts.filter((a) => a.connectionId === c.id)}
                  />
                  {!c.disconnectedAt && (
                    <MetaConnectionAccess
                      connection={c}
                      info={marketingInfo}
                      onUpdated={async () => {
                        await refresh();
                        setRevision((r) => r + 1);
                      }}
                    />
                  )}
                  {!c.disconnectedAt && (
                    <details>
                      <summary>Permiso para activar y pausar en Meta</summary>
                      <p>
                        Estos controles requieren ads_management y acceso para
                        administrar la cuenta. ads_read permite consultar
                        estadísticas y miniaturas.
                      </p>
                      {c.appSecretConfiguredAt && c.appId && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                "Autorizar administración con Facebook sustituirá la credencial actual al completar el acceso. ¿Continuar?",
                              )
                            )
                              return;
                            void run(async () => {
                              const r = await api(
                                `meta-ads/connections/${c.id}/manage-oauth`,
                                "POST",
                                {},
                              );
                              window.location.assign(r.url);
                            });
                          }}
                        >
                          Autorizar activar y pausar con Facebook
                        </button>
                      )}
                      {c.loginConfigId && (
                        <p>
                          En tu configuración de Facebook Login para empresas
                          incluye ads_read y ads_management antes de autorizar.
                        </p>
                      )}
                      <p>
                        Si usas token manual, reemplázalo por uno que incluya
                        ads_management y verifica la conexión.
                      </p>
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
                          }, "Versión actualizada. Se conserva el token; pulsa Actualizar conexión.");
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
                        void run(
                          () =>
                            api(
                              `meta-ads/connections/${c.id}/refresh`,
                              "POST",
                              {},
                            ),
                          "Conexión verificada con Meta. Se conservaron las cuentas y los datos; no se importaron anuncios.",
                        )
                      }
                    >
                      Actualizar conexión
                    </button>
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
                      Buscar cuentas nuevas
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
                  ? "Conecta Meta y pulsa Buscar cuentas nuevas para empezar."
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
                    onAnalyze={() => {
                      chooseAccounts([a.id]);
                      setBusiness("");
                      setPage(1);
                      setTab("panel");
                      setRevision((r) => r + 1);
                    }}
                    busy={busy}
                    onResume={
                      a.canSync
                        ? () =>
                            void run(
                              () =>
                                api(`meta-ads/accounts/${a.id}/sync`, "POST", {
                                  focused: true,
                                  inventory: "all",
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
                  <details
                    className="notice"
                    open={a.progress?.status !== "waiting"}
                  >
                    <summary>
                      {a.progress?.status === "waiting"
                        ? "Detalle del límite de Meta"
                        : "No se completó la sincronización"}
                    </summary>
                    <p>{a.syncError}</p>
                  </details>
                )}
                {a.canSync && (
                  <form
                    className="row meta-sync-actions"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const r = await api(
                          `meta-ads/accounts/${a.id}/sync`,
                          "POST",
                          { focused: true, recentDays: 7, inventory: "all" },
                        );
                        setMessage(
                          r.waiting
                            ? "Sincronización programada después de la pausa por límite de Meta."
                            : (r.syncError ??
                                (r.resumed
                                  ? "Sincronización retomada."
                                  : "Análisis iniciado. Primero se cargarán los datos recientes y después el histórico.")),
                        );
                      });
                    }}
                  >
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !a.connection?.verifiedAt ||
                        a.progress?.status === "waiting"
                      }
                    >
                      {busy
                        ? "Procesando…"
                        : a.progress?.status === "waiting"
                          ? "Esperando a Meta"
                          : a.progress &&
                              [
                                "running",
                                "stalled",
                                "error",
                                "paused",
                              ].includes(a.progress.status)
                            ? a.progress?.inventory === "all"
                              ? "Continuar sincronización"
                              : "Sincronizar todos"
                            : "Sincronizar todos"}
                    </button>
                  </form>
                )}
                <small>
                  Incluye campañas, conjuntos y anuncios activos y desactivados
                  de cualquier antigüedad. Los comparativos muestran hoy, 7, 15,
                  30 días y el histórico disponible en Meta.
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
                <div className="panel meta-analysis-progress" key={a.id}>
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
                                  inventory: "all",
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
              <div className="fields meta-filters meta-main-filters">
                <MetaAccountPicker
                  accounts={accounts}
                  selected={accountIds}
                  business={business}
                  query={accountPickerQuery}
                  activity={accountPickerActivity}
                  onQueryChange={setAccountPickerQuery}
                  onActivityChange={setAccountPickerActivity}
                  onChange={(ids) => chooseAccounts(ids)}
                />
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
                    <option value="paused">Desactivados (pausados)</option>
                    <option value="issues">Revisión o problemas</option>
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
                <div className="meta-filter-actions">
                  <button
                    type="button"
                    onClick={clearFilters}
                    title="Volver a todas las cuentas y al periodo Hoy; conserva tus checks y cuentas fijadas"
                  >
                    Borrar filtros
                  </button>
                  <button
                    className="meta-refresh"
                    type="button"
                    onClick={reload}
                    disabled={busy || loading}
                    aria-label="Actualizar datos guardados"
                    title="Actualizar vista con los datos guardados"
                  >
                    ↻
                  </button>
                </div>
              </div>
              {pinnedAccountIds.length > 0 && (
                <div
                  className="meta-pinned-accounts"
                  aria-label="Cuentas fijadas"
                >
                  <span>Cuentas fijadas</span>
                  <button
                    type="button"
                    aria-pressed={!accountIds.length}
                    className={!accountIds.length ? "primary" : ""}
                    onClick={() => chooseAccounts([], false)}
                  >
                    Todas
                  </button>
                  {pinnedAccountIds.map((id) => {
                    const a = accounts.find((a) => a.id === id);
                    return a ? (
                      <div className="meta-account-pin" key={id}>
                        <button
                          type="button"
                          aria-pressed={accountIds.includes(id)}
                          className={accountIds.includes(id) ? "primary" : ""}
                          onClick={() => chooseAccounts([id], false)}
                        >
                          {a.name}
                        </button>
                        <button
                          type="button"
                          className="meta-unpin"
                          aria-label={`Desfijar ${a.name}`}
                          onClick={() =>
                            setPinnedAccountIds((old) =>
                              old.filter((v) => v !== id),
                            )
                          }
                        >
                          Desfijar
                        </button>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
            <MetaDataFreshness accounts={chosen} />
            <div className="meta-result-controls">
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
              <button
                className="meta-view-toggle"
                type="button"
                onClick={() => setView(view === "cards" ? "table" : "cards")}
              >
                {view === "cards" ? "Ver tabla" : "Ver tarjetas"}
              </button>
              {chosen.some((a) => a.canSync) && (
                <button
                  type="button"
                  className="meta-live-refresh"
                  disabled={busy || !accountIds.length}
                  title={
                    accountIds.length
                      ? "Actualizar datos y miniaturas desde Meta"
                      : "Selecciona una cuenta para actualizar desde Meta"
                  }
                  onClick={() =>
                    void run(async () => {
                      const targets = chosen.filter((a) => a.canSync);
                      const failed: string[] = [];
                      let queued = 0;
                      for (const a of targets) {
                        try {
                          await api(`meta-ads/accounts/${a.id}/sync`, "POST", {
                            focused: true,
                            inventory: "all",
                            recentDays: 7,
                            fresh: true,
                          });
                          queued++;
                        } catch (e) {
                          failed.push(
                            `${a.name}: ${e instanceof Error ? e.message : "No se pudo solicitar"}`,
                          );
                        }
                      }
                      setMessage(
                        `${queued} cuenta(s) en actualización desde Meta. Los datos y miniaturas aparecerán conforme se reciban.${failed.length ? " " + failed.join(" · ") : ""}`,
                      );
                    })
                  }
                >
                  ↻ Actualizar desde Meta
                </button>
              )}
              <MetaCostOrder
                calendar={!!calendar}
                value={sort}
                direction={direction}
                onChange={(id) =>
                  resetPage(() => {
                    setSort(id);
                    setDirection(
                      sort === id && direction === "asc" ? "desc" : "asc",
                    );
                  })
                }
              />
              <MetaAnalysisPeriod
                value={calendar ? "custom" : analysisPeriod}
                since={since}
                until={until}
                onPreset={(id) => {
                  setAnalysisPeriod(id);
                  setCalendar("");
                  setSince("");
                  setUntil("");
                  if (sort === "custom") setSort("today");
                }}
                onRange={(start, end) => {
                  setSince(start);
                  setUntil(end);
                  setCalendar("custom");
                  setPage(1);
                }}
              />
            </div>
            <div className="meta-search-row">
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
                Buscar por alias
                <select
                  value={aliasFilter}
                  onChange={(e) =>
                    resetPage(() => setAliasFilter(e.target.value))
                  }
                >
                  <option value="">Todos los alias</option>
                  <option value="__none">Sin alias</option>
                  {aliases.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedObjects.some(
              (o) =>
                o.level === level &&
                (!accountIds.length || accountIds.includes(o.accountId)),
            ) && (
              <div className="row meta-selection-tools">
                <span>
                  {
                    selectedObjects.filter(
                      (o) =>
                        o.level === level &&
                        (!accountIds.length ||
                          accountIds.includes(o.accountId)),
                    ).length
                  }{" "}
                  seleccionados
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedObjects((old) =>
                      old.filter(
                        (o) =>
                          o.level !== level ||
                          (accountIds.length > 0 &&
                            !accountIds.includes(o.accountId)),
                      ),
                    );
                    if (level === "campaign") {
                      setCampaignScope([]);
                      setAdsetScope([]);
                    }
                    if (level === "adset") setAdsetScope([]);
                  }}
                >
                  Deseleccionar este nivel
                </button>
              </div>
            )}
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
                        <th className="meta-check-cell">
                          <span className="sr-only">Selección</span>
                        </th>
                        <th>Activado</th>
                        <th>Campaña / Conjunto / Anuncio</th>
                        <th>Alias</th>
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
                          <tr
                            key={o.id}
                            data-object-id={o.id}
                            aria-selected={selectedIds.has(o.id)}
                            className={
                              selectedIds.has(o.id)
                                ? "meta-object-selected"
                                : ""
                            }
                          >
                            <td className="meta-check-cell">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${o.name}`}
                                checked={selectedIds.has(o.id)}
                                onChange={(e) =>
                                  selectObject(o, e.target.checked)
                                }
                              />
                            </td>
                            <td>
                              <MetaStatusSwitch
                                name={o.name}
                                status={o.status}
                                delivery={
                                  deliveryLabels[o.effectiveStatus] ??
                                  o.effectiveStatus ??
                                  "No informado"
                                }
                                disabled={!owner || busy}
                                onToggle={() => changeStatus(o)}
                              />
                            </td>
                            <td>
                              <button
                                className="meta-name-button"
                                type="button"
                                onClick={() => openChildren(o)}
                              >
                                {o.name}
                              </button>
                              <small>
                                {o.campaignName} / {o.adsetName}
                              </small>
                            </td>
                            <td className="meta-alias-cell">
                              {aliasControl(o)}
                            </td>
                            <td>
                              {o.accountName}
                              <small>{o.metricName}</small>
                            </td>
                            <td
                              className="meta-delivery-state"
                              data-active={o.effectiveStatus === "ACTIVE"}
                            >
                              {deliveryLabels[o.effectiveStatus] ??
                                o.effectiveStatus ??
                                (o.status === "ACTIVE"
                                  ? "Activo · entrega por confirmar"
                                  : "No informado")}
                            </td>
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
                            <td>
                              {ratings[o.rating]}

                              <button
                                type="button"
                                onClick={() => setSelected(o)}
                              >
                                Ver detalle
                              </button>
                            </td>
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
                            "meta-card meta-rating-" +
                            o.rating.toLowerCase() +
                            (selectedIds.has(o.id)
                              ? " meta-object-selected"
                              : "")
                          }
                          key={o.id}
                          data-object-id={o.id}
                        >
                          <header>
                            <MetaStatusSwitch
                              name={o.name}
                              status={o.status}
                              delivery={
                                deliveryLabels[o.effectiveStatus] ??
                                o.effectiveStatus ??
                                "No informado"
                              }
                              disabled={!owner || busy}
                              onToggle={() => changeStatus(o)}
                            />
                            <label className="meta-object-check">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${o.name}`}
                                checked={selectedIds.has(o.id)}
                                onChange={(e) =>
                                  selectObject(o, e.target.checked)
                                }
                              />
                              <span className="meta-account-name">
                                {o.accountName} · {o.currency}
                              </span>
                            </label>
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
                                (o.status === "ACTIVE"
                                  ? "Activo · entrega por confirmar"
                                  : "Entrega no informada")}
                            </span>
                          </header>
                          <div className="meta-card-heading">
                            {o.thumbnailUrl && (
                              <img
                                src={`/api/meta-ads/objects/${o.id}/thumbnail?v=${encodeURIComponent(o.seenAt)}`}
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
                              <h2>
                                <button
                                  className="meta-name-button"
                                  type="button"
                                  onClick={() => openChildren(o)}
                                >
                                  {o.name}
                                </button>
                              </h2>
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
                          <div className="meta-card-alias">
                            <span>Alias</span>
                            {aliasControl(o)}
                          </div>
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
                          <div className="row">
                            {o.level !== "ad" && (
                              <button
                                type="button"
                                onClick={() => openChildren(o)}
                              >
                                {o.level === "campaign"
                                  ? "Ver conjuntos"
                                  : "Ver anuncios"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelected(o)}
                            >
                              Ver detalle y periodos
                            </button>
                          </div>
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
    <dialog
      ref={ref}
      className="meta-detail"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
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
      <MetaDailyDetail key={o.id} item={o} />
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
    <dialog
      ref={ref}
      className="meta-detail"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
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
