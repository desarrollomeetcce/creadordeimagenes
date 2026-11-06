"use client";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
import { readGroupDirectory } from "./inventory-group-directory-cache";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import type { InventoryReplacementContext } from "../../lib/meta-ads/inventory-sheet-activation";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { studioRequest } from "./inventory-meta-picker";
import { financialRequest as api } from "./financial-request";
import {
  InventoryBatchReplacement,
  type ReplacementPlan,
} from "./inventory-batch-replacement";
import { EffectivenessHistory } from "./effectiveness-history";
import { limaToday } from "./date-range";
import { countryName } from "../../lib/meta-ads/countries";
/** Inline, country-scoped replacement plan. Opening reads metadata; history is explicit. */
export function InventorySheetReplacement({
  listId,
  tableId,
  country,
  name,
  names,
  sheetName,
  since,
  until,
  onChanged,
  onClose,
  source = "budget",
  directoryOverride,
  onCompleted,
}: {
  source?: "budget" | "meta";
  onCompleted?:(notice:string)=>void;
  directoryOverride?:TrialDirectory;
  listId: string;
  tableId: string;
  country: string;
  name: string;
  names?: string[];
  sheetName: string;
  since: string;
  until: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const userId = useContext(CurrentUserId),
    pending = useRef(false),
    usageRequest = useRef<Promise<void> | null>(null);
  const [directory, setDirectory] = useState<TrialDirectory | null>(null),
    [context, setContext] = useState<InventoryReplacementContext | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [inspect, setInspect] = useState<{ name: string; aliasId: string } | null>(
      null,
    ),
    [retry, setRetry] = useState(0),
    [saved, setSaved] = useState(false);
  const requestedNames = useMemo(
    () => [...new Set(names?.length ? names : [name])],
    [name, JSON.stringify(names)],
  );
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setContext(null);
    setDirectory(null);
    setError("");
    setSaved(false);
    void Promise.all([
      directoryOverride ? Promise.resolve(directoryOverride) : readGroupDirectory(userId, listId, () =>
        api(
          "meta-ads/inventory/trials?" +
            new URLSearchParams({ listId, mode: "directory" }),
        ),
      ),
      api(
        "meta-ads/inventory/sheet-activation/replacement-context?" +
          new URLSearchParams({ listId, tableId, country }),
        "GET",
        undefined,
        { signal: controller.signal },
      ),
    ])
      .then(([d, c]) => {
        if (alive) {
          setDirectory(d);
          setContext(c);
        }
      })
      .catch((e) => {
        if (alive && !controller.signal.aborted) setError(e.message);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [listId, tableId, country, userId, retry]);
  const points = useMemo(
    () =>
      new Map(context?.rows.map((row) => [categoryKey(row.name), row]) ?? []),
    [context],
  );
  const sourceNames = new Set(requestedNames.map(categoryKey));
  const origins =
    directory?.catalog.filter((i) => sourceNames.has(categoryKey(i.name))) ??
    [];
  const candidates =
    directory?.catalog.filter(
      (i) =>
        !sourceNames.has(categoryKey(i.name)) &&
        (points.get(categoryKey(i.name))?.available ?? true),
    ) ?? [];
  const loadUsage = () => {
    if (usageRequest.current) return;
    const query = api(
      "meta-ads/inventory/trials?" +
        new URLSearchParams({ listId, mode: "usage" }),
    )
      .then((data: TrialDirectory) =>
        setDirectory((current) =>
          current
            ? {
                ...current,
                usage: data.usage,
                usageReady: true,
                countries: data.countries,
                campaignStates: data.campaignStates,
              }
            : current,
        ),
      )
      .catch((e) => setError(e.message))
      .finally(() => {
        if (usageRequest.current === query) usageRequest.current = null;
      });
    usageRequest.current = query;
  };
  async function confirm(plan: ReplacementPlan[], withAds=false) {
    if (pending.current || saved || !context?.canEdit) return;
    const pauseNames = source === "meta" ? plan.filter(p=>p.pauseNow).map(p=>p.from) : [];
    if(pauseNames.length && !window.confirm(`Se reemplazarán los diplomados y se solicitará pausar en Meta todas las campañas vinculadas de: ${pauseNames.join(", ")}, solo en ${countryName(country)}. Si Meta no confirma, quedarán por desactivar. ¿Continuar?`))return;
    const target=withAds ? window.open("about:blank","_blank") : null;
    if(withAds && !target){setError("Permite abrir una pestaña nueva para continuar a Proyectos.");return;}
    if(target){target.opener=null;target.document.title="Preparando Proyectos";target.document.body.textContent="Preparando los diplomados seleccionados…";}
    pending.current = true;
    setBusy(true);
    setError("");
    let written = false;
    try {
      if (origins.length !== requestedNames.length)
        throw Error(
          "Un diplomado ya no está en el catálogo. Actualiza la selección.",
        );
      if (plan.some((p) => !points.get(categoryKey(p.from))?.hasRecord))
        throw Error("Un origen no tiene registros en esta hoja y país.");
      let selectionId="";
      if(withAds){
        const itemIds=plan.map(p=>directory!.catalog.find(i=>categoryKey(i.name)===categoryKey(p.to))?.id);
        if(itemIds.some(id=>!id))throw Error("Un reemplazo ya no está disponible en el catálogo.");
        selectionId=(await studioRequest("/selections","POST",{listId,country,itemIds})).id;
      }
      const result=await api(source === "meta" ? "meta-ads/inventory/sheet-activation/replace-meta" : "meta-ads/inventory/sheet-activation/replace-batch", "POST", {
        listId,
        tableId,
        country,
        ...(source === "meta" ? {pauseNow:pauseNames} : {}),
        replacements: plan.map((p) => ({
          from: {
            name: p.from,
            targets: points.get(categoryKey(p.from))!.targets,
          },
          to: {
            name: p.to,
            targets: points.get(categoryKey(p.to))?.targets ?? [],
          },
          mode: p.mode,
        })),
      });
      written = true;
      setSaved(true);
      if(target)target.location.replace("?"+new URLSearchParams({view:"projects",selection:selectionId}));
      const notice=result.warnings?.length ? result.warnings.join(" ") : `Reemplazo guardado en ${countryName(country)}. Los nuevos diplomados quedan por hacer campaña.`;
      try{await onChanged();}finally{if(onCompleted)onCompleted(notice);else onClose();}
    } catch (e) {
      if(target && !written)target.close();
      setError(
        (written
          ? "Los cambios ya se guardaron. Falta actualizar la vista. "
          : "") + (e as Error).message,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="inventory-meta-replacement-panel"
      aria-label={`Reemplazar diplomados en ${countryName(country)}`}
      data-effectiveness-document={"TAB:" + listId}
    >
      <div className="inventory-meta-replacement-heading">
        <strong>Reemplazar · {countryName(country)}</strong>
        <small>{sheetName}</small>
        {!directory && (
          <button type="button" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {error && (
        <p role="alert">
          {error}
          {!directory && (
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              Reintentar
            </button>
          )}
        </p>
      )}
      {!directory || !context ? (
        <p role="status">Preparando catálogo y vínculos…</p>
      ) : origins.length !== requestedNames.length ? (
        <p role="alert">
          Un diplomado ya no está disponible en este inventario.
        </p>
      ) : (
        <InventoryBatchReplacement
          key={JSON.stringify([tableId, country, retry])}
          origins={origins}
          candidates={candidates}
          directory={directory}
          country={country}
          busy={busy}
          canConfirm={!saved && context.canEdit}
          onClose={onClose}
          onUsageNeeded={loadUsage}
          onConfirm={plan=>confirm(plan)}
          metaActions={source === "meta"}
          onConfirmAndAds={source === "meta" ? plan=>confirm(plan,true) : undefined}
          onInspect={(name) => {
            const point = points.get(categoryKey(name));
            if (point?.hasRecord)
              setInspect({ name, aliasId: point.targets[0].aliasId });
            else
              setError(
                `${name}: no hay historial guardado en ${countryName(country)}.`,
              );
          }}
        />
      )}
      {inspect && (
        <EffectivenessHistory
          tableId={tableId}
          aliasId={inspect.aliasId}
          name={inspect.name}
          country={country}
          initialSince={since || limaToday()}
          initialUntil={until || limaToday()}
          initialMode={source === "meta" ? "meta" : "manual"}
          autoOpen
          onClose={() => setInspect(null)}
          onPeriod={() => {}}
        />
      )}
    </section>
  );
}
