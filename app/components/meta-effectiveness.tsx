"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
import {
  parseEffectivenessPaste,
  resolveCountry,
} from "../../lib/meta-ads/effectiveness-paste";
import { EffectivenessCell } from "./effectiveness-cell";
type Cell = {
  spend: number | null;
  base: number | null;
  sales: number | null;
  fixedCost: number | null;
  campaigns: number;
  updatedAt: string | null;
  revision: number;
};
type Row = {
  aliasId: string;
  country: string;
  currency: string;
  rowRevision: number;
  days: Record<string, Cell>;
  campaigns: number;
  timezones: string[];
};
type Data = { rows: Row[] };
export function MetaEffectiveness({
  tableId,
  aliases,
  onNamesChanged,
}: {
  tableId: string;
  aliases: { id: string; name: string }[];
  onNamesChanged: () => Promise<void>;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [since, setSince] = useState(
      today.slice(0, 8) + (Number(today.slice(8)) >= 20 ? "20" : "01"),
    ),
    [until, setUntil] = useState(today),
    [country, setCountry] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [paste, setPaste] = useState<string | null>(null),
    [pasteCountry, setPasteCountry] = useState(""),
    [pasteCurrency, setPasteCurrency] = useState("PEN"),
    [csv, setCsv] = useState(false);
  const [newName, setNewName] = useState(""),
    [newCountry, setNewCountry] = useState(""),
    [newCurrency, setNewCurrency] = useState("PEN");
  const currentRange = useRef(""),
    queryVersion = useRef(0);
  const valid =
    !!since &&
    !!until &&
    since <= until &&
    (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  const query = `meta-ads/effectiveness?${new URLSearchParams({ tableId, since, until })}`;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    if (currentRange.current !== query) {
      setData(null);
      currentRange.current = query;
    }
    const load = () => {
      if (document.hidden) return;
      const version = ++queryVersion.current;
      void api(query)
        .then((v: Data) => {
          if (active && queryVersion.current === version) setData(v);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [query, valid]);
  const refresh = async () => {
    const version = ++queryVersion.current;
    const v: Data = await api(query);
    if (queryVersion.current === version && currentRange.current === query)
      setData(v);
  };
  const mutate = async (
    path: string,
    method: string,
    body: unknown,
    names = false,
  ) => {
    await api(path, method, body);
    try {
      if (names) await onNamesChanged();
      await refresh();
      setMessage("");
    } catch {
      throw Error(
        "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
      );
    }
  };
  const identity = async (
    r: Row,
    field: "country" | "currency",
    value: string,
  ) => {
    const code = field === "country" ? resolveCountry(value) : r.country;
    if (code === null)
      throw Error("País no reconocido. Escribe PE, Perú o elige una opción.");
    const currency = field === "currency" ? value.toUpperCase() : r.currency;
    if (!/^[A-Z]{3}$/.test(currency))
      throw Error(
        "Moneda no válida: usa PEN, USD, ARS u otro código de 3 letras.",
      );
    await mutate("meta-ads/effectiveness/identity", "PATCH", {
      aliasId: r.aliasId,
      fromCountry: r.country,
      fromCurrency: r.currency,
      country: code,
      currency,
      revision: r.rowRevision,
    });
  };
  const manualQueues = useRef(new Map<string, Promise<void>>());
  const manualVersions = useRef(new Map<string, number>());
  const manual = (
    r: Row,
    day: string,
    field: "sales" | "fixedCost",
    value: string,
  ) => {
    const c = r.days[day],
      key = JSON.stringify([
        r.aliasId,
        r.country,
        r.currency,
        r.rowRevision,
        day,
      ]);
    const previous = manualQueues.current.get(key) ?? Promise.resolve();
    const job = previous
      .catch(() => {})
      .then(async () => {
        const revision = Math.max(
          c?.revision ?? 0,
          manualVersions.current.get(key) ?? 0,
        );
        await api("meta-ads/effectiveness", "PATCH", {
          aliasId: r.aliasId,
          country: r.country,
          currency: r.currency,
          day,
          [field]: value === "" ? null : Number(value),
          revision,
          rowRevision: r.rowRevision,
        });
        manualVersions.current.set(key, revision + 1);
        try {
          await refresh();
          setMessage("");
        } catch {
          throw Error(
            "Guardado, pero no se pudo recargar la tabla. Actualiza la página antes de seguir editando.",
          );
        }
      });
    manualQueues.current.set(key, job);
    return job.finally(() => {
      if (manualQueues.current.get(key) === job)
        manualQueues.current.delete(key);
    });
  };
  const importRows = async () => {
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(pasteCountry);
      if (code === null)
        throw Error("Selecciona un país válido o déjalo vacío.");
      const rows = parseEffectivenessPaste(
        paste ?? "",
        code,
        pasteCurrency,
        csv,
      );
      const result = await api("meta-ads/effectiveness/import", "POST", {
        tableId,
        rows,
      });
      await onNamesChanged();
      await refresh();
      setPaste(null);
      setMessage(
        `${result.rows} filas listas; ${result.created} diplomados nuevos.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo importar.");
    } finally {
      setBusy(false);
    }
  };
  const openPaste = (text: string) => {
    if (!/[\n\t]/.test(text)) return false;
    setCsv(false);
    setPaste(text);
    return true;
  };
  const addRow = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const code = resolveCountry(newCountry);
      if (code === null) throw Error("País no reconocido.");
      const rows = parseEffectivenessPaste(newName, code, newCurrency);
      await mutate(
        "meta-ads/effectiveness/import",
        "POST",
        { tableId, rows },
        true,
      );
      setNewName("");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudo agregar la fila.",
      );
    } finally {
      setBusy(false);
    }
  };
  const days: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      days.push(new Date(d).toISOString().slice(0, 10));
  const names = new Map(aliases.map((a) => [a.id, a.name]));
  const rows = (data?.rows ?? [])
    .filter((r) =>
      country === "__none" ? !r.country : !country || r.country === country,
    )
    .sort(
      (a, b) =>
        (names.get(a.aliasId) ?? "").localeCompare(
          names.get(b.aliasId) ?? "",
          "es",
        ) ||
        a.country.localeCompare(b.country) ||
        a.currency.localeCompare(b.currency),
    );
  return (
    <section
      className="effectiveness sheet-view"
      aria-label="Efectividad diaria"
    >
      <datalist id="effectiveness-countries">
        {countryOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </datalist>
      <div className="row sheet-toolbar">
        <span className="sheet-legend">
          <b>V</b> Ventas · <b>B</b> Conversaciones · <b>G</b> Gasto · <b>CF</b>{" "}
          Costos fijos
        </span>
        <label>
          Desde
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </label>
        <label>
          País
          <select
            aria-label="País de efectividad"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="__none">Sin país</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setCsv(false);
            setPaste("");
          }}
        >
          Pegar diplomados
        </button>
        <label className="sheet-file">
          Subir archivo
          <input
            type="file"
            aria-label="Subir lista de diplomados"
            accept=".txt,.tsv,.csv,text/plain,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > 100000) {
                setMessage("El archivo admite hasta 100 KB.");
                return;
              }
              try {
                setCsv(f.name.toLowerCase().endsWith(".csv"));
                setPaste(await f.text());
              } catch {
                setMessage("No se pudo leer el archivo.");
              }
            }}
          />
        </label>
      </div>
      <div className="sheet-help">
        Edita y pulsa Enter o Tab para guardar; Escape descarta. V y CF
        manuales; B y G solo de Meta por coincidencia exacta de alias + país y
        misma moneda.{" "}
        <details>
          <summary>Cómo se calcula</summary>Solo campañas, incluidas apagadas;
          nunca suma sus conjuntos/anuncios. Se consulta lo importado cada 30 s;
          hoy puede ser parcial y cada cuenta conserva su zona horaria. — sin
          dato, * cobertura parcial. Cambiar país/moneda en esta hoja conserva
          V/CF y vuelve a consultar B/G; no cambia las etiquetas de Meta Ads. Un
          diplomado puede tener varias filas, una por país/moneda.
        </details>
      </div>
      {message && (
        <p className="sheet-message" role="status">
          {message}
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </p>
      )}
      {!valid && <p role="alert">Elige un rango válido de hasta 31 días.</p>}
      {paste !== null && (
        <form
          className="sheet-import"
          onSubmit={(e) => {
            e.preventDefault();
            void importRows();
          }}
        >
          <label>
            Pega una columna de nombres o tres columnas: Diplomado, País y
            Moneda (sin encabezados).
            <textarea
              aria-label="Lista de diplomados"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={
                "Monitoreo ambiental\tPE\tPEN\nDermatología\tAR\tUSD"
              }
              required
              rows={6}
            />
          </label>
          <div className="row">
            <label>
              País si la columna no está
              <input
                list="effectiveness-countries"
                aria-label="País para la lista"
                value={pasteCountry}
                onChange={(e) => setPasteCountry(e.target.value)}
                placeholder="Sin asignar"
              />
            </label>
            <label>
              Moneda si la columna no está
              <input
                value={pasteCurrency}
                onChange={(e) => setPasteCurrency(e.target.value)}
                required
                pattern="[A-Za-z]{3}"
                maxLength={3}
              />
            </label>
            <span>
              Hasta 500 filas. Nombres existentes se reutilizan; no se
              sobrescriben cifras.
            </span>
            <button className="primary" disabled={busy}>
              Importar filas
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPaste(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {valid && (
        <div className="table-scroll effectiveness-scroll sheet-scroll">
          <table className="effectiveness-grid">
            <caption className="sr-only">
              Efectividad diaria desde {since} hasta {until}
            </caption>
            <thead>
              <tr>
                <th rowSpan={2} scope="col" className="effectiveness-name">
                  Diplomado / alias
                </th>
                <th rowSpan={2} scope="col" className="effectiveness-country">
                  País
                </th>
                <th rowSpan={2} scope="col" className="effectiveness-currency">
                  Moneda
                </th>
                {days.map((d) => (
                  <th key={d} colSpan={4} scope="colgroup">
                    {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr>
                {days.flatMap((d) =>
                  ["V", "B", "G", "CF"].map((k) => (
                    <th key={d + k} scope="col">
                      {k}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const name = names.get(r.aliasId) ?? "Alias";
                return (
                  <tr
                    key={JSON.stringify([r.aliasId, r.country, r.currency])}
                    data-alias-id={r.aliasId}
                    data-country={r.country}
                    data-currency={r.currency}
                  >
                    <td className="effectiveness-name">
                      <EffectivenessCell
                        label={`Diplomado ${name} ${r.country || "sin país"}`}
                        value={name}
                        onError={setMessage}
                        onPaste={openPaste}
                        onSave={async (v) => {
                          if (!v || v.length > 150)
                            throw Error(
                              "El nombre debe tener entre 1 y 150 caracteres.",
                            );
                          await mutate(
                            "meta-ads/aliases/" + r.aliasId,
                            "PATCH",
                            { name: v },
                            true,
                          );
                        }}
                      />
                    </td>
                    <td className="effectiveness-country">
                      <EffectivenessCell
                        label={`País de ${name} ${r.country || "sin país"}`}
                        value={r.country}
                        list="effectiveness-countries"
                        onError={setMessage}
                        onSave={(v) => identity(r, "country", v)}
                      />
                    </td>
                    <td className="effectiveness-currency">
                      <EffectivenessCell
                        label={`Moneda de ${name} ${r.country}`}
                        value={r.currency}
                        onError={setMessage}
                        onSave={(v) => identity(r, "currency", v)}
                      />
                    </td>
                    {days.flatMap((d) => {
                      const c = r.days[d],
                        partial = c && c.campaigns < r.campaigns;
                      return [
                        <td key={d + "V"}>
                          <EffectivenessCell
                            label={`V ${name} ${r.country} ${d}`}
                            value={
                              c?.sales === null || c?.sales === undefined
                                ? ""
                                : String(c.sales)
                            }
                            type="number"
                            step="1"
                            onError={setMessage}
                            onSave={(v) => manual(r, d, "sales", v)}
                          />
                        </td>,
                        <td
                          key={d + "B"}
                          className="sheet-derived"
                          title={
                            partial
                              ? `${c.campaigns}/${r.campaigns} campañas importadas`
                              : "Conversaciones iniciadas de campañas"
                          }
                        >
                          {c?.base ?? "—"}
                          {partial ? " *" : ""}
                        </td>,
                        <td
                          key={d + "G"}
                          className="sheet-derived"
                          title={
                            c?.updatedAt
                              ? `Datos recibidos: ${new Date(c.updatedAt).toLocaleString("es-PE", { timeZone: "America/Lima" })} · ${r.timezones.join(", ")}`
                              : "Sin datos importados"
                          }
                        >
                          {c?.spend === null || c?.spend === undefined
                            ? "—"
                            : c.spend.toLocaleString("es-PE", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                          {partial ? " *" : ""}
                        </td>,
                        <td key={d + "CF"}>
                          <EffectivenessCell
                            label={`CF ${name} ${r.country} ${d}`}
                            value={
                              c?.fixedCost === null ||
                              c?.fixedCost === undefined
                                ? ""
                                : String(c.fixedCost)
                            }
                            type="number"
                            step="0.000001"
                            onError={setMessage}
                            onSave={(v) => manual(r, d, "fixedCost", v)}
                          />
                        </td>,
                      ];
                    })}
                  </tr>
                );
              })}
              <tr className="sheet-new-row">
                <td className="effectiveness-name">
                  <input
                    aria-label="Nuevo diplomado"
                    placeholder="+ Escribe o pega diplomados…"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onPaste={(e) => {
                      if (openPaste(e.clipboardData.getData("text")))
                        e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addRow();
                      }
                    }}
                  />
                </td>
                <td className="effectiveness-country">
                  <input
                    aria-label="País del nuevo diplomado"
                    list="effectiveness-countries"
                    value={newCountry}
                    placeholder="PE / Perú"
                    onChange={(e) => setNewCountry(e.target.value)}
                  />
                </td>
                <td className="effectiveness-currency">
                  <input
                    aria-label="Moneda del nuevo diplomado"
                    value={newCurrency}
                    maxLength={3}
                    onChange={(e) => setNewCurrency(e.target.value)}
                  />
                </td>
                <td colSpan={days.length * 4}>
                  <button
                    disabled={busy || !newName.trim()}
                    onClick={() => void addRow()}
                  >
                    Agregar fila
                  </button>
                  {!data && <span role="status"> Cargando datos…</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
