"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaEffectiveness } from "./meta-effectiveness";
import type { MetaAliasOption } from "./meta-alias-directory";
type CatalogTable = { id: string; name: string; aliases: MetaAliasOption[] };
export function ProductsCatalog() {
  const [tables, setTables] = useState<CatalogTable[]>([]),
    [selected, setSelected] = useState("diplomados"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [adding, setAdding] = useState(false);
  const load = async () => {
    const data: CatalogTable[] = await api("meta-ads/alias-tables");
    setTables(data);
  };
  useEffect(() => {
    let active = true;
    void api("meta-ads/alias-tables")
      .then((data: CatalogTable[]) => {
        if (active) setTables(data);
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
  const save = async (form: HTMLFormElement, id?: string, newTable = false) => {
    setBusy(true);
    setMessage("");
    let saved = false;
    try {
      const name = String(new FormData(form).get("name") ?? "");
      const row = await api(
        newTable
          ? "meta-ads/alias-tables"
          : "meta-ads/aliases" + (id ? "/" + id : ""),
        id ? "PATCH" : "POST",
        { name, ...(!newTable && !id ? { tableId: selected } : {}) },
      );
      saved = true;
      if (!id) form.reset();
      await load();
      if (newTable) {
        setSelected(row.id);
        setAdding(false);
      }
      setMessage(newTable ? "Tabla creada." : "Nombre guardado.");
    } catch (e) {
      setMessage(
        saved
          ? "Guardado, pero no se pudo recargar el catálogo. Actualiza la página para verlo."
          : e instanceof Error
            ? e.message
            : "No se pudo guardar.",
      );
    } finally {
      setBusy(false);
    }
  };
  const table = tables.find((t) => t.id === selected);
  return (
    <section className="products-catalog stack">
      <header className="row spread">
        <h1>Efectividad</h1>
        <button
          type="button"
          disabled={busy}
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
        >
          Agregar tabla
        </button>
      </header>
      {adding && (
        <form
          className="row panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget, undefined, true);
          }}
        >
          <label>
            Nombre de la tabla
            <input name="name" required maxLength={100} autoFocus />
          </label>
          <button disabled={busy}>Crear tabla</button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">Cargando tablas…</p>
      ) : (
        <>
          <div
            className="row"
            role="tablist"
            aria-label="Tablas de efectividad"
          >
            {tables.map((t) => (
              <button
                type="button"
                role="tab"
                key={t.id}
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
          {table && (
            <section className="panel stack" aria-label={`Tabla ${table.name}`}>
              <form
                key={table.id + table.name}
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = String(
                    new FormData(e.currentTarget).get("name") ?? "",
                  );
                  setBusy(true);
                  try {
                    await api("meta-ads/alias-tables/" + table.id, "PATCH", {
                      name,
                    });
                    await load();
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "No se pudo guardar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Nombre de la tabla
                  <input
                    name="name"
                    aria-label="Nombre de la tabla"
                    defaultValue={table.name}
                    required
                    maxLength={100}
                  />
                </label>
                <button disabled={busy}>Guardar tabla</button>
              </form>
              <MetaEffectiveness
                key={table.id}
                tableId={table.id}
                aliases={table.aliases}
                onNamesChanged={load}
              />
              <details>
                <summary>Editar nombres de diplomados / alias</summary>
                <p className="hint">
                  Estos nombres se pueden asignar como alias a campañas,
                  conjuntos y anuncios. Las asignaciones actuales se conservan.
                </p>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(e.currentTarget);
                  }}
                >
                  <label>
                    Nombre
                    <input
                      name="name"
                      placeholder="Escribe un nombre"
                      required
                      maxLength={150}
                    />
                  </label>
                  <button disabled={busy}>Agregar diplomado</button>
                </form>
                <div className="table-scroll">
                  <table>
                    <caption>{table.name}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Nombre</th>
                        <th scope="col">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.aliases.length ? (
                        table.aliases.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <form
                                id={`catalog-${a.id}`}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void save(e.currentTarget, a.id);
                                }}
                              >
                                <input
                                  name="name"
                                  aria-label={`Nombre de ${a.name}`}
                                  defaultValue={a.name}
                                  required
                                  maxLength={150}
                                />
                              </form>
                            </td>
                            <td>
                              <button form={`catalog-${a.id}`} disabled={busy}>
                                Guardar nombre
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={2}>
                            Todavía no hay diplomados en esta tabla.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}
        </>
      )}
    </section>
  );
}
