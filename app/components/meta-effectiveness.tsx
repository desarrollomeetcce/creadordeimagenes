"use client";
import { useEffect, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { countryName, countryOptions } from "../../lib/meta-ads/countries";
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
    [tick, setTick] = useState(0),
    [adding, setAdding] = useState(false),
    [edit, setEdit] = useState<{
      row: Row;
      day: string;
      cell: Cell | undefined;
    } | null>(null);
  const valid =
    since <= until &&
    (Date.parse(until) - Date.parse(since)) / 86400000 < 31 &&
    !!since &&
    !!until;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const load = () => {
      if (document.hidden) return;
      void api(
        `meta-ads/effectiveness?${new URLSearchParams({ tableId, since, until })}`,
      )
        .then((v: Data) => {
          if (active) {
            setData(v);
            setMessage("");
          }
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    };
    setData(null);
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tableId, since, until, tick, valid]);
  const days: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      days.push(new Date(d).toISOString().slice(0, 10));
  const save = async (form: HTMLFormElement) => {
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData(form);
      let body: Record<string, unknown>;
      if (edit) {
        const number = (key: string) =>
          String(f.get(key) ?? "").trim() === "" ? null : Number(f.get(key));
        body = {
          aliasId: edit.row.aliasId,
          country: edit.row.country,
          currency: edit.row.currency,
          day: edit.day,
          sales: number("sales"),
          fixedCost: number("fixedCost"),
          revision: edit.cell?.revision ?? 0,
        };
      } else
        body = {
          aliasId: f.get("aliasId"),
          country: f.get("country"),
          currency: String(f.get("currency")).toUpperCase(),
        };
      await api("meta-ads/effectiveness", "PATCH", body);
      setEdit(null);
      setAdding(false);
      setTick((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  const rows = (data?.rows ?? [])
    .filter((r) => !country || r.country === country)
    .sort(
      (a, b) =>
        (aliases.find((x) => x.id === a.aliasId)?.name ?? "").localeCompare(
          aliases.find((x) => x.id === b.aliasId)?.name ?? "",
          "es",
        ) ||
        a.country.localeCompare(b.country) ||
        a.currency.localeCompare(b.currency),
    );
  return (
    <section className="effectiveness stack" aria-label="Efectividad diaria">
      <div className="row effectiveness-toolbar">
        <strong>V</strong> Ventas · <strong>B</strong> Base (conversaciones
        iniciadas) · <strong>G</strong> Gasto · <strong>CF</strong> Costos fijos
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
            <option value="">Todos los países</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setAdding((v) => !v)}>
          Agregar fila
        </button>
      </div>
      <p className="hint">
        B y G: suma diaria de campañas con el mismo alias y país, de todas las
        cuentas. No incluye conjuntos ni anuncios. Monedas separadas. V y CF:
        edición manual. Días según zona horaria de cada cuenta; hoy es parcial.
        Se consulta lo importado cada 30 s; no es tiempo real de Meta.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!valid && (
        <p role="alert">Selecciona un rango válido de hasta 31 días.</p>
      )}
      {adding && (
        <form
          className="row panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
        >
          <label>
            Diplomado
            <select name="aliasId" required>
              {aliases.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            País
            <select name="country" required>
              <option value="">Selecciona país</option>
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Moneda
            <input
              name="currency"
              placeholder="PEN"
              required
              pattern="[A-Za-z]{3}"
              maxLength={3}
            />
          </label>
          <button disabled={busy}>Guardar fila</button>
          <button type="button" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      )}
      {edit && (
        <form
          className="panel row effectiveness-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
          aria-label="Editar ventas y costos fijos"
        >
          <strong>
            {aliases.find((a) => a.id === edit.row.aliasId)?.name} ·{" "}
            {edit.row.country} · {edit.day} · {edit.row.currency}
          </strong>
          <label>
            V · Ventas
            <input
              name="sales"
              type="number"
              min="0"
              max="100000000"
              step="1"
              defaultValue={edit.cell?.sales ?? ""}
            />
          </label>
          <label>
            CF · Costos fijos
            <input
              name="fixedCost"
              type="number"
              min="0"
              max="1000000000"
              step="0.000001"
              defaultValue={edit.cell?.fixedCost ?? ""}
            />
          </label>
          <button disabled={busy}>Guardar cifras</button>
          <button type="button" onClick={() => setEdit(null)}>
            Cancelar
          </button>
        </form>
      )}
      {valid && (
        <div className="table-scroll effectiveness-scroll">
          <table>
            <caption>
              Efectividad · {since} — {until}
            </caption>
            <thead>
              <tr>
                <th rowSpan={2} className="effectiveness-name">
                  Diplomado
                </th>
                <th rowSpan={2} className="effectiveness-country">
                  País / moneda
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
              {rows.map((r) => (
                <tr key={r.aliasId + r.country + r.currency}>
                  <td className="effectiveness-name">
                    <form
                      key={
                        r.aliasId +
                        (aliases.find((a) => a.id === r.aliasId)?.name ?? "")
                      }
                      className="effectiveness-name-edit"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        setBusy(true);
                        try {
                          await api("meta-ads/aliases/" + r.aliasId, "PATCH", {
                            name: String(
                              new FormData(e.currentTarget).get("name"),
                            ),
                          });
                          await onNamesChanged();
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
                      <input
                        name="name"
                        aria-label={`Nombre del diplomado ${r.country}`}
                        defaultValue={
                          aliases.find((a) => a.id === r.aliasId)?.name ?? ""
                        }
                        required
                        maxLength={150}
                      />
                      <button
                        disabled={busy}
                        title="Guardar nombre del alias (todos los países)"
                      >
                        Guardar
                      </button>
                    </form>
                    <small>{r.campaigns} campañas</small>
                  </td>
                  <td
                    className="effectiveness-country"
                    title={countryName(r.country)}
                  >
                    {r.country}
                    <small>{r.currency}</small>
                  </td>
                  {days.flatMap((d) => {
                    const c = r.days[d];
                    const partial = c && c.campaigns < r.campaigns;
                    return [
                      <td key={d + "V"}>
                        <button
                          className="effectiveness-cell"
                          type="button"
                          aria-label={`Editar V ${r.country} ${d}`}
                          onClick={() => setEdit({ row: r, day: d, cell: c })}
                        >
                          {c?.sales ?? "—"}
                        </button>
                      </td>,
                      <td
                        key={d + "B"}
                        title={
                          partial
                            ? `Cobertura parcial: ${c.campaigns}/${r.campaigns} campañas`
                            : "Conversaciones iniciadas importadas"
                        }
                      >
                        {c?.base ?? "—"}
                        {partial ? " *" : ""}
                      </td>,
                      <td
                        key={d + "G"}
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
                        <button
                          type="button"
                          className="effectiveness-cell"
                          aria-label={`Editar CF ${r.country} ${d}`}
                          onClick={() => setEdit({ row: r, day: d, cell: c })}
                        >
                          {c?.fixedCost ?? "—"}
                        </button>
                      </td>,
                    ];
                  })}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={2 + days.length * 4}>
                    {data
                      ? "Asigna alias y país a las campañas en Meta Ads o agrega una fila."
                      : "Cargando datos…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        — Sin dato, no equivale a cero. * Cobertura parcial. Asigna el alias y
        país directamente a la campaña para incluir su histórico disponible.
        Cambiar esa etiqueta reclasifica su histórico; los datos manuales
        permanecen en su fila.
      </p>
    </section>
  );
}
