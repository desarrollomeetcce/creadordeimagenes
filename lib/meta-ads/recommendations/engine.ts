import { shiftDay } from "../analytics";

export const ENGINE_VERSION = "rules-2";
export type Rules = {
  dayNoResultSpend: number;
  dayMaxCost: number;
  currency: string;
  favorableCost: number;
  contextCost: number;
  reviewCost: number;
  newHours: number;
  unspentAmount: number;
  minSpend: number;
  minResults: number;
  deteriorationPercent: number;
  windowDays: number;
  recentDays: number;
  idealPerAdset: number;
  minimumPerCampaign: number;
  cacheMinutes: number;
};
export const defaultRules: Rules = {
  dayNoResultSpend: 0.5,
  dayMaxCost: 2,
  currency: "PEN",
  favorableCost: 1,
  contextCost: 1.5,
  reviewCost: 2,
  newHours: 24,
  unspentAmount: 0.3,
  minSpend: 1.5,
  minResults: 3,
  deteriorationPercent: 30,
  windowDays: 3,
  recentDays: 14,
  idealPerAdset: 2,
  minimumPerCampaign: 2,
  cacheMinutes: 15,
};
export type Fact = { day: string; spend: number; results: number };
export type Ad = {
  id: string;
  name: string;
  adsetId: string | null;
  status: string | null;
  effectiveStatus: string | null;
  createdTime: string | null;
  confirmed?: boolean;
  daily: Fact[];
  total: {
    spend: number;
    results: number;
    until: string;
    since: string;
  } | null;
};
export type Group = {
  confirmed?: boolean;
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
};
export type Input = {
  campaign: Group;
  adsets: Group[];
  ads: Ad[];
  today: string;
  now: string;
  currency: string;
  coverage: boolean;
  fresh: boolean;
  mode?: "night" | "day";
};
export type Aggregate = {
  spend: number;
  results: number;
  cost: number | null;
  days: number;
};
export function aggregate(rows: Fact[]): Aggregate {
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const results = rows.reduce((a, r) => a + r.results, 0);
  return {
    spend,
    results,
    cost: results > 0 ? spend / results : null,
    days: rows.length,
  };
}
export type Decision = {
  dependencies: { id: string; name: string; status: "PAUSED" }[];
  dataComplete: boolean;
  lifetimeKnown: boolean;
  id: string;
  badge: "NUEVO" | "SIN GASTO" | "CON HISTORIAL" | null;
  behavior:
    | "ESTABLE"
    | "MEJORA"
    | "DETERIORADO"
    | "NUEVO"
    | "SIN GASTO"
    | "INSUFICIENTE";
  action:
    | "MANTENER"
    | "PROBAR"
    | "ACTIVAR"
    | "REACTIVAR"
    | "EVALUAR PAUSA"
    | "NO RECOMENDADO"
    | "REVISAR DATOS";
  reason: string;
  priority: number;
  viable: boolean;
  active: boolean;
  today: Aggregate;
  periods: Record<string, Aggregate>;
  comparison: {
    recent: Aggregate;
    previous: Aggregate;
    recentSince: string;
    recentUntil: string;
    previousSince: string;
    previousUntil: string;
    windowDays: number;
  };
  changePercent: number | null;
  forecast: {
    cost: number;
    low: number;
    high: number;
    observations: number;
    method: string;
  } | null;
  proposedStatus: "ACTIVE" | "PAUSED" | null;
};
const usableStatus = (v: string | null) => v === "ACTIVE" || v === "PAUSED";
export function analyzeCampaign(input: Input, rules: Rules | null) {
  const { today } = input;
  const enough = (s: Aggregate) =>
    !!rules && s.results >= rules.minResults && s.spend >= rules.minSpend;
  const sets = new Map(input.adsets.map((s) => [s.id, s]));
  const adMap = new Map(input.ads.map((ad) => [ad.id, ad]));
  const decisions: Decision[] = input.ads.map((ad) => {
    const daily = ad.daily
      .filter((r) => r.day <= today)
      .sort((a, b) => a.day.localeCompare(b.day));
    const range = (days: number, offset = 0) =>
      aggregate(
        daily.filter(
          (r) =>
            r.day >= shiftDay(today, -offset - days + 1) &&
            r.day <= shiftDay(today, -offset),
        ),
      );
    const current = range(1),
      recent = range(rules?.windowDays ?? 3, 1),
      prior = range(rules?.windowDays ?? 3, 1 + (rules?.windowDays ?? 3));
    const periods = {
      today: current,
      yesterday: range(1, 1),
      "3": range(3),
      "7": range(7),
      "14": range(14),
      "15": range(15),
      "30": range(30),
      lifetime: ad.total
        ? {
            ...ad.total,
            cost:
              ad.total.results > 0 ? ad.total.spend / ad.total.results : null,
            days: 0,
          }
        : aggregate(daily),
    };
    const age = ad.createdTime
      ? (Date.parse(input.now) - Date.parse(ad.createdTime)) / 3600000
      : null;
    const newAd = age !== null && age >= 0 && age < (rules?.newHours ?? 24);
    // A missing lifetime aggregate is never evidence of a lifetime spend of zero.
    const badge = newAd
      ? "NUEVO"
      : rules &&
          ad.total &&
          ad.total.until >= today &&
          ad.total.spend < rules.unspentAmount
        ? "SIN GASTO"
        : ad.total
          ? "CON HISTORIAL"
          : null;
    const active =
      ad.status === "ACTIVE" &&
      ad.effectiveStatus === "ACTIVE" &&
      ad.confirmed !== false &&
      sets.get(ad.adsetId ?? "")?.confirmed !== false &&
      input.campaign.confirmed !== false;
    const changePercent =
      enough(recent) && enough(prior) && prior.cost && recent.cost !== null
        ? (recent.cost / prior.cost - 1) * 100
        : null;
    const complete = daily.filter(
      (r) =>
        r.day < today &&
        r.day >= shiftDay(today, -(rules?.recentDays ?? 14)) &&
        r.results > 0 &&
        r.spend >= (rules?.minSpend ?? 1.5) &&
        r.results >= (rules?.minResults ?? 3),
    );
    // Weighted regression in log cost, actual calendar spacing; missing days are not zero-filled.
    let forecast: Decision["forecast"] = null;
    if (
      rules &&
      complete.length >= 4 &&
      complete.at(-1)!.day >= shiftDay(today, -3)
    ) {
      const x = complete.map(
        (r) => (Date.parse(r.day) - Date.parse(today)) / 86400000,
      );
      const y = complete.map((r) => Math.log(r.spend / r.results));
      const w = complete.map(
        (r, i) =>
          Math.min(r.results, 30) * Math.pow(0.85, complete.length - 1 - i),
      );
      const total = w.reduce((a, b) => a + b, 0),
        mx = x.reduce((s, v, i) => s + v * w[i], 0) / total,
        my = y.reduce((s, v, i) => s + v * w[i], 0) / total;
      const variance = x.reduce((s, v, i) => s + w[i] * (v - mx) ** 2, 0);
      const slope = variance
        ? x.reduce((s, v, i) => s + w[i] * (v - mx) * (y[i] - my), 0) / variance
        : 0;
      const boundedSlope = Math.max(-0.15, Math.min(0.15, slope));
      const predicted = my + boundedSlope * (1 - mx);
      const residual = Math.sqrt(
        y.reduce(
          (s, v, i) => s + w[i] * (v - (my + boundedSlope * (x[i] - mx))) ** 2,
          0,
        ) / total,
      );
      const spread = Math.max(0.15, 2 * residual);
      forecast = {
        cost: Math.exp(predicted),
        low: Math.exp(predicted - spread),
        high: Math.exp(predicted + spread),
        observations: complete.length,
        method:
          "Regresión ponderada del logaritmo del costo; banda descriptiva de variación, sin garantía ni probabilidad calibrada.",
      };
    }
    const worseningSteps = complete
      .slice(-6)
      .filter(
        (r, i, arr) =>
          i > 0 && r.spend / r.results > arr[i - 1].spend / arr[i - 1].results,
      ).length;
    const sustained =
      changePercent !== null &&
      rules &&
      changePercent >= rules.deteriorationPercent &&
      worseningSteps >= 2;
    const improvingToday =
      enough(current) &&
      enough(recent) &&
      current.cost !== null &&
      recent.cost !== null &&
      current.cost <
        recent.cost * (1 - (rules?.deteriorationPercent ?? 30) / 100);
    const deteriorated = !!sustained && !improvingToday;
    const behavior: Decision["behavior"] = newAd
      ? "NUEVO"
      : badge === "SIN GASTO"
        ? "SIN GASTO"
        : improvingToday ||
            (changePercent !== null &&
              changePercent <= -(rules?.deteriorationPercent ?? 30))
          ? "MEJORA"
          : deteriorated
            ? "DETERIORADO"
            : enough(recent)
              ? "ESTABLE"
              : "INSUFICIENTE";
    const parentSet = sets.get(ad.adsetId ?? "");
    const dependencies = [input.campaign, parentSet]
      .filter((p): p is Group => !!p && p.status === "PAUSED")
      .map((p) => ({ id: p.id, name: p.name, status: "PAUSED" as const }));
    const base: Decision = {
      dependencies,
      dataComplete:
        input.coverage &&
        input.fresh &&
        ad.confirmed !== false &&
        !!parentSet &&
        parentSet.confirmed !== false &&
        input.campaign.confirmed !== false,
      lifetimeKnown: !!ad.total,
      id: ad.id,
      badge,
      behavior,
      action: "REVISAR DATOS",
      reason: `Hoy se recibieron ${current.results} conversaciones con gasto ${current.spend.toFixed(2)} ${input.currency}. Se revisará la cobertura y su historial antes de proponer cambios.`,
      priority: 8,
      viable: false,
      active,
      today: current,
      periods,
      comparison: {
        recent,
        previous: prior,
        recentSince: shiftDay(today, -(rules?.windowDays ?? 3)),
        recentUntil: shiftDay(today, -1),
        previousSince: shiftDay(today, -2 * (rules?.windowDays ?? 3)),
        previousUntil: shiftDay(today, -1 - (rules?.windowDays ?? 3)),
        windowDays: rules?.windowDays ?? 3,
      },
      changePercent,
      forecast,
      proposedStatus: null,
    };
    if (!rules || rules.currency !== input.currency)
      return {
        ...base,
        reason:
          "Configura umbrales para la moneda de esta cuenta; no se convierten automáticamente.",
      };
    const set = sets.get(ad.adsetId ?? "");
    if (
      !input.coverage ||
      !input.fresh ||
      ad.confirmed === false ||
      !set ||
      set.confirmed === false ||
      input.campaign.confirmed === false ||
      !usableStatus(ad.status) ||
      !usableStatus(set.status) ||
      !usableStatus(input.campaign.status)
    )
      return {
        ...base,
        reason:
          "Sincronización incompleta, antigua o jerarquía/estado sin confirmar. Actualiza los datos antes de decidir.",
      };
    const parentPaused =
      set.status === "PAUSED" || input.campaign.status === "PAUSED";
    const blocked = ad.status === "ACTIVE" && !active;
    if (blocked)
      return {
        ...base,
        reason: parentPaused
          ? "El anuncio está activado pero un padre está pausado. Revisa campaña/conjunto antes de cambiar el anuncio."
          : "Activado sin entrega confirmada o con incidencia. Revisa elegibilidad, presupuesto y estado en Meta.",
      };
    if (input.mode === "day" && active) {
      if (current.results === 0 && current.spend >= rules.dayNoResultSpend)
        return {
          ...base,
          action: "EVALUAR PAUSA" as const,
          priority: 5,
          proposedStatus: "PAUSED" as const,
          reason: `Diurna: gasto de hoy ≥ ${rules.dayNoResultSpend} ${rules.currency} sin conversaciones. Proponer pausa manual aunque no queden anuncios activos.`,
        };
      if (
        current.results > 0 &&
        current.cost !== null &&
        current.cost >= rules.dayMaxCost
      )
        return {
          ...base,
          action: "EVALUAR PAUSA" as const,
          priority: 5,
          proposedStatus: "PAUSED" as const,
          reason: `Diurna: costo de hoy ≥ ${rules.dayMaxCost} ${rules.currency} por conversación. Proponer pausa manual aunque sea el único que produce.`,
        };
      if (
        current.results > 0 &&
        current.cost !== null &&
        current.cost < rules.dayMaxCost
      )
        return {
          ...base,
          action: "MANTENER" as const,
          priority: 1,
          viable: true,
          reason:
            "Diurna: está produciendo hoy por debajo del límite. Conservar; el histórico aporta contexto, no anula esta regla diaria.",
        };
      return {
        ...base,
        reason:
          "Diurna: aún no alcanza el gasto sin resultados para proponer pausa. Revisar más tarde, sin inferir cero entrega.",
      };
    }
    if (newAd)
      return {
        ...base,
        behavior: "NUEVO" as const,
        action: active ? ("MANTENER" as const) : ("PROBAR" as const),
        priority: 2,
        reason:
          "Nuevo por fecha de creación: respetar la observación inicial. Prioridad de prueba, todavía no eficacia demostrada.",
      };
    if (active && current.spend === 0)
      return {
        ...base,
        reason:
          "Activado sin gasto observado hoy: revisar entrega; no volver a activar ni asumir fracaso.",
      };
    if (
      active &&
      enough(current) &&
      current.cost !== null &&
      current.cost <= rules.reviewCost &&
      !deteriorated
    )
      return {
        ...base,
        viable: true,
        action: "MANTENER" as const,
        priority: 1,
        reason: improvingToday
          ? "Mejora frente a su propio historial y volumen suficiente hoy; conservar."
          : `Costo de hoy aceptable con ${current.results} conversaciones; ${behavior === "ESTABLE" ? "historial estable" : "sin deterioro sostenido demostrado"}. Conservar aunque existan anuncios más baratos.`,
      };
    if (
      active &&
      !enough(current) &&
      current.results > 0 &&
      enough(recent) &&
      recent.cost !== null &&
      recent.cost <= rules.reviewCost &&
      !deteriorated
    )
      return {
        ...base,
        action: "MANTENER" as const,
        priority: 1,
        reason: `Hoy: ${current.results} conversaciones con gasto ${current.spend.toFixed(2)} ${rules.currency} y costo real ${current.cost!.toFixed(2)} ${rules.currency}. En sus últimos ${rules.windowDays} días completos produjo ${recent.results} conversaciones a ${recent.cost.toFixed(2)} ${rules.currency}. Conservar en observación por su historial propio; esperar ${rules.minResults} conversaciones y ${rules.minSpend.toFixed(2)} ${rules.currency} antes de confirmar la tendencia de hoy.`,
      };
    if (active && !enough(current))
      return {
        ...base,
        reason: `Hoy: ${current.results} conversaciones y gasto ${current.spend.toFixed(2)} ${rules.currency}${current.cost !== null ? `; costo real ${current.cost.toFixed(2)} ${rules.currency}` : " sin conversaciones"}. Para confirmar la tendencia nocturna se requieren ${rules.minResults} conversaciones y ${rules.minSpend.toFixed(2)} ${rules.currency} de gasto. En sus últimos ${rules.windowDays} días completos produjo ${recent.results} conversaciones con ${recent.spend.toFixed(2)} ${rules.currency}; no recomendar pausa solo por una muestra pequeña.`,
      };
    if (
      active &&
      deteriorated &&
      enough(current) &&
      (current.cost === null || current.cost > rules.contextCost)
    )
      return {
        ...base,
        action: "EVALUAR PAUSA" as const,
        priority: 5,
        reason: `DETERIORO DEL RENDIMIENTO: costo +${changePercent!.toFixed(1)}% entre ventanas completas no solapadas y aumentos sostenidos. Revisar pausa manual; sin atribuirlo a saturación.`,
        proposedStatus: "PAUSED" as const,
      };
    if (active)
      return {
        ...base,
        reason:
          "Costo de hoy elevado sin deterioro histórico sostenido suficiente. Revisar; no pausar únicamente por el precio.",
      };
    if (badge === "SIN GASTO")
      return {
        ...base,
        action: "ACTIVAR" as const,
        priority: 3,
        reason:
          "Pausado sin gasto significativo acumulado: candidato de prueba después de los nuevos.",
      };
    const lastDelivery = daily.filter((r) => r.spend > 0).at(-1)?.day;
    const history = lastDelivery
      ? aggregate(
          daily.filter(
            (r) =>
              r.day <= lastDelivery &&
              r.day >= shiftDay(lastDelivery, -rules.recentDays + 1),
          ),
        )
      : aggregate([]);
    if (
      enough(history) &&
      history.cost !== null &&
      history.cost <= rules.reviewCost &&
      !deteriorated &&
      lastDelivery! >= shiftDay(today, -rules.recentDays)
    )
      return {
        ...base,
        action: "REACTIVAR" as const,
        priority: 4,
        reason:
          "Pausado con costo, volumen e historial reciente aceptables, sin deterioro sostenido. Candidato después de nuevos y sin gasto.",
      };
    return {
      ...base,
      action: "NO RECOMENDADO" as const,
      priority: 9,
      reason: parentPaused
        ? "Padre pausado: revisar el conjunto y campaña; no activar solo el anuncio."
        : "Sin evidencia reciente suficiente de eficacia; conservar visible para revisión.",
    };
  });
  const viable = decisions.filter((d) => d.viable).length;
  const deteriorated = decisions.filter(
    (d) => d.behavior === "DETERIORADO",
  ).length;
  const active = decisions.filter((d) => d.active).length;
  const allCurrentGood = active > 0 && viable === active;
  const viableBySet = new Map<string, number>();
  for (const d of decisions)
    if (d.viable) {
      const id = adMap.get(d.id)?.adsetId ?? "";
      viableBySet.set(id, (viableBySet.get(id) ?? 0) + 1);
    }
  const needsCandidates =
    viable < (rules?.minimumPerCampaign ?? 2) ||
    deteriorated > 0 ||
    (!allCurrentGood &&
      [...viableBySet.values()].some(
        (count) => count > 0 && count < (rules?.idealPerAdset ?? 2),
      ));
  for (const d of decisions) {
    if (["PROBAR", "ACTIVAR", "REACTIVAR"].includes(d.action)) {
      if (needsCandidates) d.proposedStatus = "ACTIVE";
      else {
        d.action = "NO RECOMENDADO";
        d.proposedStatus = null;
        d.reason =
          "Los anuncios actuales funcionan y hay cobertura suficiente; no es necesario incorporar más pruebas.";
        d.priority = 9;
      }
    }
  }
  const candidates = decisions.filter(
    (d) => d.proposedStatus === "ACTIVE",
  ).length;
  const uncertain =
    !input.coverage ||
    !input.fresh ||
    !rules ||
    rules.currency !== input.currency;
  const observing =
    active > 0 &&
    viable === 0 &&
    decisions
      .filter((d) => d.active)
      .every((d) => d.action === "REVISAR DATOS" || d.action === "MANTENER");
  const status =
    uncertain || observing
      ? "REVISAR DATOS"
      : viable === 0
        ? "CRÍTICO"
        : viable < (rules?.minimumPerCampaign ?? 2)
          ? "REPONER"
          : deteriorated
            ? "REVISAR PAUSAS"
            : needsCandidates
              ? "COMPLETAR CONJUNTOS"
              : "MANTENER";
  const groupedDecisions = new Map<string, Decision[]>();
  for (const d of decisions) {
    const id = adMap.get(d.id)?.adsetId ?? "";
    const list = groupedDecisions.get(id) ?? [];
    list.push(d);
    groupedDecisions.set(id, list);
  }
  const adsets = input.adsets
    .map((s) => {
      const rows = groupedDecisions.get(s.id) ?? [];
      const good = rows.filter((d) => d.viable).length;
      return {
        ...s,
        viable: good,
        recommendation:
          rows.some((d) => d.active) &&
          rows
            .filter((d) => d.active)
            .every((d) => d.action === "EVALUAR PAUSA")
            ? "EVALUAR PAUSA DEL CONJUNTO"
            : good
              ? "CONSERVAR ANUNCIOS VIABLES"
              : "REVISAR EVIDENCIA",
        ads: rows.sort(
          (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
        ),
        placementRank: good
          ? 1
          : rows.some(
                (d) =>
                  d.behavior === "DETERIORADO" ||
                  (enough(d.periods["14"]) &&
                    d.periods["14"].cost !== null &&
                    d.periods["14"].cost! <= (rules?.reviewCost ?? 0)),
              )
            ? 2
            : rows.some((d) =>
                  ["INSUFICIENTE", "NUEVO", "SIN GASTO"].includes(d.behavior),
                )
              ? 3
              : 4,
      };
    })
    .sort(
      (a, b) => a.placementRank - b.placementRank || a.id.localeCompare(b.id),
    );
  return {
    version: ENGINE_VERSION,
    campaign: input.campaign,
    today,
    currency: input.currency,
    status,
    counts: {
      active,
      viable,
      new: decisions.filter((d) => d.badge === "NUEVO").length,
      unspent: decisions.filter((d) => d.badge === "SIN GASTO").length,
      deteriorated,
      candidates,
      total: decisions.length,
    },
    summary: uncertain
      ? "Datos incompletos o configuración pendiente: no aplicar cambios."
      : observing
        ? "Aún falta evidencia de los anuncios activos. Revisar entrega y respetar la observación antes de concluir que no funcionan."
        : viable >= (rules?.minimumPerCampaign ?? 2) && !needsCandidates
          ? "Conservar todos los anuncios que funcionan. No hace falta reducirlos a dos ni crear anuncios."
          : viable === 1
            ? "Conservar el único anuncio viable. Reponer pruebas sin forzar un segundo anuncio caro."
            : viable === 0
              ? "No hay anuncios con eficacia confirmada. Revisar entrega y preparar pruebas controladas."
              : "Conservar los anuncios viables y revisar los conjuntos que necesitan pruebas.",
    task:
      !uncertain && !observing && needsCandidates && candidates === 0
        ? "Preparar creatividades nuevas; priorizar el conjunto con eficacia actual, después el que antes funcionó y luego una prueba controlada. Crear otro conjunto solo si ninguno es adecuado."
        : null,
    warning: uncertain
      ? "La recomendación no acredita toda la cuenta ni permite inferir ceros durante una importación parcial."
      : "Hoy es parcial. La proyección orienta, no garantiza los resultados de mañana. Activar un anuncio puede requerir revisar sus padres.",
    mode: input.mode ?? "night",
    adsets,
    orphanAds: decisions.filter(
      (d) => !sets.has(adMap.get(d.id)?.adsetId ?? ""),
    ),
  };
}
export type Analysis = ReturnType<typeof analyzeCampaign>;
