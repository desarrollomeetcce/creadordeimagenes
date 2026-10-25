"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaEffectiveness } from "./meta-effectiveness";
import { EffectivenessTotals } from "./effectiveness-totals";
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
  const [view, setView] = useState<"manual" | "automatic">("manual");
  const [totals, setTotals] = useState(false);
  const table = tables.find((t) => t.id === selected);
  const sheetTabs = (
    <nav className="sheet-tabs" aria-label="Hojas del libro de efectividad">
      <div
        className="sheet-tab-list"
        role="tablist"
        aria-label="Tablas de efectividad"
      >
        {tables.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={!totals && selected === t.id}
            className="sheet-tab-alias"
            onClick={() => {
              setSelected(t.id);
              setTotals(false);
              setMessage("");
            }}
          >
            {t.name} ({t.aliases.length})
          </button>
        ))}
        <button
          role="tab"
          aria-selected={totals}
          className="sheet-tab-totals"
          onClick={() => {
            setTotals(true);
            setMessage("");
          }}
        >
          Totales
        </button>
      </div>
      <button
        className="sheet-add-tab"
        aria-expanded={adding}
        onClick={() => setAdding((v) => !v)}
      >
        + Tabla
      </button>
    </nav>
  );
  return (
    <section className="products-catalog effectiveness-workbook">
      {!totals && (
        <div className="sheet-book-bar">
          {!totals && (
            <div
              className="row sheet-view-buttons"
              aria-label="Vista de la hoja"
            >
              <button
                className={
                  "sheet-mode-manual" + (view === "manual" ? " primary" : "")
                }
                aria-pressed={view === "manual"}
                onClick={() => setView("manual")}
              >
                Vista manual
              </button>
              <button
                className={
                  "sheet-mode-automatic" +
                  (view === "automatic" ? " primary" : "")
                }
                aria-pressed={view === "automatic"}
                onClick={() => setView("automatic")}
              >
                Vista automática
              </button>
            </div>
          )}
          {table && !totals && (
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
      )}
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
              setTotals(false);
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
      {totals && table && (
        <EffectivenessTotals
          tables={tables}
          initialTableId={table.id}
          sheetTabs={sheetTabs}
        />
      )}
      {table && !totals && (
        <MetaEffectiveness
          key={table.id}
          view={view}
          sheetTabs={sheetTabs}
          tables={tables}
          tableId={table.id}
          aliases={table.aliases}
          settings={table}
          onNamesChanged={load}
        />
      )}
    </section>
  );
}
