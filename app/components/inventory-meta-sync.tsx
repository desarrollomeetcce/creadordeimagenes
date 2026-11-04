"use client";
import { memo, useEffect, useRef, useState } from "react";
import { MetaAliasAction } from "./meta-alias-action";
import { fetchJsonResponse } from "../../lib/http-response";
import type { SavedAssignmentContext } from "../../lib/meta-ads/aliases";
import type { MetaAliasOption } from "./meta-alias-directory";
type Campaign = {
  id: string;
  name: string;
  accountName: string;
  status: string | null;
  linkedHere: boolean;
};
export const InventoryMetaSync = memo(function InventoryMetaSync({
  tableId,
  tableName,
  listId,
  listName = "Inventario",
  name,
  country,
  aliasId,
  catalogId,
  disabled,
  onSynced,
  syncState,
}: {
  tableId: string;
  tableName: string;
  listId: string;
  listName?: string;
  name: string;
  country: string;
  aliasId?: string;
  catalogId?: string;
  disabled?: boolean;
  syncState?: "ready" | "pending";
  onSynced: () => Promise<void>;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [selected, setSelected] = useState<Campaign[]>([]),
    [advisors, setAdvisors] = useState<{ id: string; name: string }[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [more, setMore] = useState(false),
    [identity, setIdentity] = useState<{
      context: SavedAssignmentContext | null;
      loading: boolean;
      error: string;
    }>({ context: null, loading: false, error: "" });
  const active = useRef<AbortController | null>(null),
    saving = useRef(false);
  useEffect(() => () => active.current?.abort(), []);
  async function load(initial = false) {
    active.current?.abort();
    const ac = new AbortController();
    active.current = ac;
    setLoading(true);
    setMessage("");
    if (initial) {
      setIdentity({ context: null, loading: true, error: "" });
      setSelected([]);
      setCampaigns([]);
      setQuery("");
    }
    try {
      const params = new URLSearchParams({
        tableId,
        country,
        ...(aliasId ? { aliasId } : catalogId ? { catalogId } : {}),
        ...(!initial && query.trim() ? { q: query.trim() } : {}),
      });
      const result = await fetchJsonResponse(
        "/api/meta-ads/objects/inventory-candidates?" + params,
        { cache: "no-store", signal: ac.signal },
      );
      if (ac.signal.aborted) return;
      setCampaigns(result.campaigns);
      setAdvisors(result.advisors);
      setMore(result.hasMore);
      if (initial) {
        setIdentity({ context: result.context, loading: false, error: "" });
        setSelected(result.campaigns.filter((c: Campaign) => c.linkedHere));
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        setMessage((e as Error).message);
        if (initial)
          setIdentity({
            context: null,
            loading: false,
            error: (e as Error).message,
          });
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }
  const aliases: MetaAliasOption[] = aliasId
    ? [{ id: aliasId, name, tableId, inventorySheetId: listId }]
    : [];
  const storedReady = identity.context
    ? !!(
        identity.context.hasRow &&
        identity.context.advisorId &&
        identity.context.rowCurrency &&
        !identity.context.advisorConflicts?.length &&
        syncState !== "pending"
      )
    : syncState === "ready";
  const status = storedReady
    ? "ready"
    : identity.context || syncState === "pending"
      ? "pending"
      : "unknown";
  return (
    <span className="inventory-meta-sync" data-sync-state={status}>
      <MetaAliasAction
        name={name}
        value={aliasId ?? catalogId}
        country={country}
        aliases={aliases}
        catalog={
          !aliasId && catalogId
            ? [
                {
                  catalogId,
                  name,
                  inventorySheetId: listId,
                  inventorySheetName: listName,
                },
              ]
            : []
        }
        advisors={advisors}
        tables={[{ id: tableId, name: tableName }]}
        inventories={[{ id: listId, name: listName }]}
        initialTableId={tableId}
        initialListId={listId}
        triggerLabel={
          status === "ready"
            ? "Sincronizado"
            : status === "pending"
              ? "Por sincronizar"
              : "Sincronización"
        }
        lockIdentity
        savedIdentity={identity}
        onRetrySavedIdentity={() => void load(true)}
        allowRemove={false}
        disabled={disabled || busy || !country || (!aliasId && !catalogId)}
        extraSaveDisabled={loading || busy}
        onOpen={() => void load(true)}
        extraFields={
          <section
            className="inventory-meta-sync-campaigns"
            aria-label="Campañas de Meta para sincronizar"
          >
            <strong className="inventory-sync-status" role="status">
              {loading && !identity.context
                ? "Consultando vínculos guardados…"
                : selected.some((c) => c.linkedHere)
                  ? "Sincronizado · vínculos guardados"
                  : storedReady
                    ? "Datos sincronizados · campaña opcional"
                    : "Datos por sincronizar · campaña opcional"}
            </strong>
            {selected
              .filter((c) => c.linkedHere)
              .slice(0, 2)
              .map((c) => (
                <small
                  className="inventory-saved-campaign"
                  key={c.id}
                  title={c.name + " · " + c.accountName}
                >
                  {c.name}
                  <span>
                    {c.accountName} · {c.status ?? "Estado sin registro"}
                  </span>
                </small>
              ))}
            <details
              className="inventory-sync-picker"
              open={!selected.some((c) => c.linkedHere)}
            >
              <summary>Campañas · opcional</summary>
              <label>
                Buscar campañas
                <input
                  type="search"
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (query.trim().length >= 2) void load();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                disabled={loading || query.trim().length < 2}
                onClick={() => void load()}
              >
                Buscar campañas
              </button>
              {loading ? (
                <p role="status">Consultando catálogo guardado…</p>
              ) : (
                <>
                  <div className="inventory-meta-sync-options">
                    {[
                      ...new Map(
                        [...selected, ...campaigns].map((c) => [c.id, c]),
                      ).values(),
                    ].map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === c.id)}
                          disabled={busy}
                          onChange={(e) =>
                            setSelected((old) =>
                              e.target.checked
                                ? [...old, c]
                                : old.filter((s) => s.id !== c.id),
                            )
                          }
                        />
                        <span>
                          {c.name}
                          <small>
                            {c.accountName} ·{" "}
                            {c.status ?? "Estado sin registro"}
                            {c.linkedHere ? " · ya vinculada" : ""}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!campaigns.length && !selected.length && (
                    <small>
                      Busca y elige la campaña que corresponde. No se vinculan
                      campañas por semejanza de nombre.
                    </small>
                  )}
                  {more && (
                    <small>Hay más coincidencias. Precisa la búsqueda.</small>
                  )}
                  <small>
                    {selected.length} campaña(s) para vincular. Desmarcar no
                    elimina vínculos existentes.
                  </small>
                </>
              )}
            </details>
          </section>
        }
        onAssign={async (id, code, selection, details) => {
          if (saving.current || !code) return;
          if (
            selected.every((c) => c.linkedHere) &&
            identity.context?.hasRow &&
            identity.context.source === "row" &&
            !identity.context.advisorConflicts?.length &&
            identity.context.rowCurrency === identity.context.currency &&
            (!details?.advisorId ||
              details.advisorId === identity.context.advisorId) &&
            (!details?.currency ||
              details.currency === identity.context.currency)
          ) {
            setMessage(
              "Ya está sincronizado. Se reutilizan los datos guardados.",
            );
            return;
          }
          saving.current = true;
          setBusy(true);
          setMessage("");
          let committed = false;
          try {
            const result = await fetchJsonResponse(
              "/api/meta-ads/objects/alias",
              {
                method: "PATCH",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  objectIds: selected.map((c) => c.id),
                  inventorySync: true,
                  aliasId: id,
                  country: code,
                  ...(selection ? { selection } : {}),
                  ...details,
                }),
              },
            );
            committed = true;
            setIdentity({ context: null, loading: false, error: "" });
            await onSynced();
            setMessage(
              result.advisorReview
                ? "Sincronización guardada. El asesor diferente quedó por revisar; se conserva el titular y su historial."
                : "Sincronización guardada.",
            );
          } catch (e) {
            setMessage(
              (committed ? "Vínculo guardado; actualiza la vista. " : "") +
                (e as Error).message,
            );
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      />
      {message && <small role="status">{message}</small>}
    </span>
  );
});
