"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaEffectiveness } from "./meta-effectiveness";
import { EffectivenessCell } from "./effectiveness-cell";
import type { MetaAliasOption } from "./meta-alias-directory";
type CatalogTable = {
  id: string;
  name: string;
  aliases: MetaAliasOption[];
  aliasColumnName: string;
  defaultCountry: string;
  defaultCurrency: string;
};
export function ProductsCatalog() {
  const [tables, setTables] = useState<CatalogTable[]>([]),
    [selected, setSelected] = useState("diplomados"),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const v: CatalogTable[] = await api("meta-ads/alias-tables");
    setTables(v);
  };
  useEffect(() => {
    let active = true;
    void api("meta-ads/alias-tables")
      .then((v: CatalogTable[]) => {
        if (active) setTables(v);
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const table = tables.find((t) => t.id === selected);
  return (
    <section className="products-catalog effectiveness-workbook">
      <div className="sheet-book-bar">
        <h1>Efectividad</h1>
        <div className="row" role="tablist" aria-label="Tablas de efectividad">
          {tables.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={selected === t.id}
              className={selected === t.id ? "primary" : ""}
              onClick={() => {
                setSelected(t.id);
                setMessage("");
              }}
            >
              {t.name} ({t.aliases.length})
            </button>
          ))}
        </div>
        <button aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          + Tabla
        </button>
        {table && (
          <label className="sheet-table-title">
            Nombre de tabla
            <EffectivenessCell
              key={table.id}
              value={table.name}
              label="Nombre de la tabla"
              onError={setMessage}
              onSave={async (name) => {
                if (!name || name.length > 100)
                  throw Error(
                    "El nombre de la tabla admite de 1 a 100 caracteres.",
                  );
                await api("meta-ads/alias-tables/" + table.id, "PATCH", {
                  name,
                });
                await load();
              }}
            />
          </label>
        )}
      </div>
      {adding && (
        <form
          className="row sheet-add-table"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get("name"));
            setBusy(true);
            try {
              const t = await api("meta-ads/alias-tables", "POST", { name });
              await load();
              setSelected(t.id);
              setAdding(false);
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "No se pudo crear la tabla.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nombre de la nueva tabla
            <input name="name" required maxLength={100} />
          </label>
          <button disabled={busy}>Crear tabla</button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      )}
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {loading && <p role="status">Cargando tablas…</p>}
      {table && (
        <MetaEffectiveness
          key={table.id}
          tableId={table.id}
          aliases={table.aliases}
          settings={table}
          onNamesChanged={load}
        />
      )}
    </section>
  );
}
