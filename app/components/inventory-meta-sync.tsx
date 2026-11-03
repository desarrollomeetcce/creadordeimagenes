"use client";
import { useEffect, useRef, useState } from "react";
import { MetaAliasAction } from "./meta-alias-action";
import { fetchJsonResponse } from "../../lib/http-response";
import type { MetaAliasOption } from "./meta-alias-directory";
type Campaign = {
  id: string;
  name: string;
  accountName: string;
  status: string | null;
  linkedHere: boolean;
};
export function InventoryMetaSync({
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
  onSynced: () => Promise<void>;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [selected, setSelected] = useState<Campaign[]>([]),
    [advisors, setAdvisors] = useState<{ id: string; name: string }[]>([]),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [more, setMore] = useState(false);
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
      if (initial)
        setSelected(result.campaigns.filter((c: Campaign) => c.linkedHere));
    } catch (e) {
      if (!ac.signal.aborted) setMessage((e as Error).message);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }
  const aliases: MetaAliasOption[] = aliasId
    ? [{ id: aliasId, name, tableId, inventorySheetId: listId }]
    : [];
  return (
    <span className="inventory-meta-sync">
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
        triggerLabel="Sincronización"
        lockIdentity
        allowRemove={false}
        disabled={disabled || busy || !country || (!aliasId && !catalogId)}
        extraSaveDisabled={loading || !selected.length || busy}
        onOpen={() => void load(true)}
        extraFields={
          <section
            className="inventory-meta-sync-campaigns"
            aria-label="Campañas de Meta para sincronizar"
          >
            <strong>Campañas guardadas de Meta</strong>
            <p>
              Vincula sus resultados y gasto a este diplomado y país. Conserva
              las ventas y el historial de la hoja.
            </p>
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
                          {c.accountName} · {c.status ?? "Estado sin registro"}
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
            {message && <p role="status">{message}</p>}
          </section>
        }
        onAssign={async (id, code, selection, details) => {
          if (saving.current || !selected.length || !code) return;
          saving.current = true;
          setBusy(true);
          setMessage("");
          let committed = false;
          try {
            await fetchJsonResponse("/api/meta-ads/objects/alias", {
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
            });
            committed = true;
            await onSynced();
            setMessage("Sincronización guardada.");
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
}
