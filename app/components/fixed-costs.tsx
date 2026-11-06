"use client";
import { useEffect, useRef, useState } from "react";
import "./fixed-costs.css";
type Entry = {
  sheetId: string;
  date: string;
  kind: "FIXED" | "VARIABLE";
  concept: string;
  category: string;
  country: string;
  location: string;
  person: string;
  amount: string;
  currency: string;
  paid: boolean;
  notes: string;
};
type Row = Entry & { id: string; version: number };
type Data = {
  owner: boolean;
  canEdit: boolean;
  sheets: { id: string; name: string }[];
  rows: Row[];
  total: number;
  countries: string[];
  categories: string[];
  groups: {
    currency: string;
    paid: boolean;
    kind: string;
    _sum: { amount: string | null };
  }[];
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const blank = (sheetId: string): Entry => ({
  sheetId,
  date: today(),
  kind: "FIXED",
  concept: "",
  category: "",
  country: "",
  location: "",
  person: "",
  amount: "",
  currency: "PEN",
  paid: false,
  notes: "",
});
const cents = (s: string) =>
  BigInt(
    (s.split(".")[0] || "0") +
      (s.split(".")[1] || "").padEnd(2, "0").slice(0, 2),
  );
const money = (n: bigint) =>
  new Intl.NumberFormat("es-PE").format(n / 100n) +
  "." +
  String(n % 100n).padStart(2, "0");
async function request(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
) {
  const r = await fetch("/api/fixed-costs" + path, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal,
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error || "No se pudo guardar.");
  return b;
}
function fields(row: Entry): Entry {
  return {
    sheetId: row.sheetId,
    date: row.date,
    kind: row.kind,
    concept: row.concept,
    category: row.category,
    country: row.country,
    location: row.location,
    person: row.person,
    amount: row.amount,
    currency: row.currency,
    paid: row.paid,
    notes: row.notes,
  };
}
export function FixedCosts() {
  const [data, setData] = useState<Data | null>(null),
    [month, setMonth] = useState(today().slice(0, 7)),
    [sheet, setSheet] = useState(""),
    [country, setCountry] = useState(""),
    [category, setCategory] = useState(""),
    [kind, setKind] = useState(""),
    [paid, setPaid] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<{
      id: string;
      version: number;
      entry: Entry;
    } | null>(null),
    [draft, setDraft] = useState<Entry | null>(null),
    [sheetName, setSheetName] = useState(""),
    [rename, setRename] = useState(false),
    [remove, setRemove] = useState(""),
    [share, setShare] = useState(false),
    [members, setMembers] = useState<any[]>([]),
    [email, setEmail] = useState(""),
    [permission, setPermission] = useState("VIEW");
  const lock = useRef(false),
    requestId = useRef(""),
    epoch = useRef(0);
  const query = new URLSearchParams({
    month,
    page: String(page),
    ...(sheet ? { sheet } : {}),
    ...(country ? { country } : {}),
    ...(category ? { category } : {}),
    ...(kind ? { kind } : {}),
    ...(paid ? { paid } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController();
    const version = ++epoch.current;
    setLoading(true);
    setError("");
    setData(null);
    void request("?" + query, "GET", undefined, controller.signal)
      .then((b) => {
        if (version === epoch.current) setData(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, revision]);
  async function mutate(fn: () => Promise<unknown>, message = "Guardado.") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function resetFilters(action: () => void) {
    if (edit || draft) {
      setError(
        "Guarda o cancela la fila que estás editando antes de cambiar de vista.",
      );
      return;
    }
    setPage(1);
    setNotice("");
    setRemove("");
    action();
  }
  function editor(entry: Entry, change: (v: Entry) => void) {
    const input = (
      key: keyof Entry,
      label: string,
      type = "text",
      width?: string,
    ) => (
      <input
        style={width ? { width } : undefined}
        aria-label={label}
        type={type}
        value={String(entry[key])}
        onChange={(e) =>
          change({
            ...entry,
            [key]:
              key === "currency"
                ? e.target.value.toUpperCase()
                : e.target.value,
          })
        }
        maxLength={key === "notes" ? 2000 : 160}
        step={key === "amount" ? "0.01" : undefined}
        min={key === "amount" ? "0" : undefined}
      />
    );
    return (
      <>
        <td>{input("date", "Fecha", "date")}</td>
        <td>{input("concept", "Concepto")}</td>
        <td>
          <select
            aria-label="Hoja del gasto"
            value={entry.sheetId}
            onChange={(e) => change({ ...entry, sheetId: e.target.value })}
          >
            {data?.sheets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </td>
        <td>{input("category", "Categoría")}</td>
        <td>{input("country", "País")}</td>
        <td>{input("location", "Lugar")}</td>
        <td>{input("person", "Persona")}</td>
        <td>{input("amount", "Importe", "number", "110px")}</td>
        <td>{input("currency", "Moneda", "text", "66px")}</td>
        <td>
          <select
            aria-label="Tipo de gasto"
            value={entry.kind}
            onChange={(e) =>
              change({ ...entry, kind: e.target.value as Entry["kind"] })
            }
          >
            <option value="FIXED">Fijo</option>
            <option value="VARIABLE">Variable</option>
          </select>
        </td>
        <td>
          <input
            aria-label="Pagado"
            type="checkbox"
            checked={entry.paid}
            onChange={(e) => change({ ...entry, paid: e.target.checked })}
          />
        </td>
        <td>{input("notes", "Nota")}</td>
      </>
    );
  }
  const totals = new Map<
    string,
    { total: bigint; paid: bigint; fixed: bigint; variable: bigint }
  >();
  for (const g of data?.groups ?? []) {
    const t = totals.get(g.currency) ?? {
        total: 0n,
        paid: 0n,
        fixed: 0n,
        variable: 0n,
      },
      n = cents(g._sum.amount ?? "0");
    t.total += n;
    if (g.paid) t.paid += n;
    if (g.kind === "FIXED") t.fixed += n;
    else t.variable += n;
    totals.set(g.currency, t);
  }
  const disabled = busy || loading,
    canEdit = data?.canEdit && !disabled;
  return (
    <section className="fixed-costs stack" aria-label="Control de costos fijos">
      <header className="fc-heading">
        <div>
          <span className="eyebrow">ORDENA TUS GASTOS</span>
          <h1>Costos fijos</h1>
          <small className="muted">
            Fijos y variables · un solo control mensual
          </small>
        </div>
        <div className="row">
          <span className="badge">
            {data?.owner
              ? "Privado · OWNER"
              : data?.canEdit
                ? "Acceso de edición"
                : "Solo consulta"}
          </span>
          {data?.owner && (
            <button
              type="button"
              aria-expanded={share}
              onClick={() => {
                setShare(!share);
                if (!share)
                  void request("/sharing")
                    .then((b) => setMembers(b.members))
                    .catch((e) => setError(e.message));
              }}
            >
              Compartir
            </button>
          )}
        </div>
      </header>
      {share && data?.owner && (
        <section className="panel fc-share" aria-label="Compartir costos">
          <strong>Los OWNER siempre tienen acceso</strong>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(async () => {
                await request("/sharing", "POST", {
                  email: email.trim(),
                  permission,
                });
                const b = await request("/sharing");
                setMembers(b.members);
                setEmail("");
              }, "Acceso actualizado.");
            }}
          >
            <input
              type="email"
              aria-label="Correo para compartir"
              placeholder="Correo de una cuenta aprobada"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select
              aria-label="Permiso de costos"
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
            >
              <option value="VIEW">Solo consultar</option>
              <option value="EDIT">Consultar y editar</option>
            </select>
            <button disabled={busy}>Dar acceso</button>
            <button type="button" onClick={() => setShare(false)}>
              Cerrar
            </button>
          </form>
          {members.map((m) => (
            <div className="row" key={m.userId}>
              <span>
                {m.user.name} · {m.user.email} ·{" "}
                {m.permission === "EDIT" ? "Edición" : "Consulta"}
              </span>
              <button
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await request("/sharing/" + m.userId, "DELETE");
                    setMembers((v) => v.filter((x) => x.userId !== m.userId));
                  }, "Acceso retirado.")
                }
              >
                Retirar
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="fc-toolbar">
        <label>
          Mes
          <input
            aria-label="Mes de costos"
            type="month"
            value={month}
            min="2000-01"
            max="2199-12"
            disabled={busy}
            onChange={(e) => resetFilters(() => setMonth(e.target.value))}
          />
        </label>
        <label>
          País
          <select
            value={country}
            disabled={disabled}
            onChange={(e) => resetFilters(() => setCountry(e.target.value))}
          >
            <option value="">Todos</option>
            {data?.countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Categoría
          <select
            value={category}
            disabled={disabled}
            onChange={(e) => resetFilters(() => setCategory(e.target.value))}
          >
            <option value="">Todas</option>
            {data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select
            value={kind}
            disabled={disabled}
            onChange={(e) => resetFilters(() => setKind(e.target.value))}
          >
            <option value="">Todos</option>
            <option value="FIXED">Fijos</option>
            <option value="VARIABLE">Variables</option>
          </select>
        </label>
        <label>
          Pago
          <select
            value={paid}
            disabled={disabled}
            onChange={(e) => resetFilters(() => setPaid(e.target.value))}
          >
            <option value="">Todos</option>
            <option value="yes">Pagados</option>
            <option value="no">Pendientes</option>
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || !!edit || !!draft}
          onClick={() => setRevision((v) => v + 1)}
        >
          Actualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      <div className="fc-totals">
        {[...totals].map(([currency, t]) => (
          <article key={currency}>
            <span className="badge">{currency}</span>
            <strong>{money(t.total)}</strong>
            <small>
              Registrado · Fijos {money(t.fixed)} + Variables{" "}
              {money(t.variable)}
            </small>
            <div>
              <span className="fc-paid">Pagado {money(t.paid)}</span>
              <span className="fc-pending">
                Pendiente {money(t.total - t.paid)}
              </span>
            </div>
          </article>
        ))}
      </div>
      <nav className="fc-sheets" aria-label="Hojas de costos">
        <button
          type="button"
          aria-pressed={!sheet}
          disabled={busy}
          onClick={() => resetFilters(() => setSheet(""))}
        >
          Todas las hojas
        </button>
        {data?.sheets.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={sheet === s.id}
            disabled={busy}
            onClick={() =>
              resetFilters(() => {
                setSheet(s.id);
                setRename(false);
              })
            }
          >
            {s.name}
          </button>
        ))}
        {canEdit && (
          <details>
            <summary>+ Hoja</summary>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(async () => {
                  const b = await request("/sheets", "POST", {
                    name: sheetName.trim(),
                  });
                  setSheet(b.id);
                  setSheetName("");
                }, "Hoja creada.");
              }}
            >
              <input
                aria-label="Nombre de nueva hoja"
                placeholder="Nombre de hoja"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                maxLength={160}
                required
              />
              <button disabled={busy}>Crear</button>
            </form>
          </details>
        )}
      </nav>
      {loading ? (
        <p role="status">Cargando gastos…</p>
      ) : data && !data.sheets.length ? (
        <div className="panel fc-empty">
          <h2>Tu control mensual empieza aquí</h2>
          <p>Crea tus hojas y registra únicamente tus gastos reales.</p>
          {data.owner && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(
                  () => request("/sheets/initialize", "POST", {}),
                  "Hojas listas. Ya puedes registrar tus gastos.",
                )
              }
            >
              Preparar hojas sugeridas
            </button>
          )}
        </div>
      ) : (
        data && (
          <>
            <div className="fc-actions">
              <span>
                {data.total} gastos · {month}
              </span>
              <div className="row">
                {canEdit && sheet && (
                  <button
                    onClick={() => {
                      setRename(!rename);
                      setSheetName(
                        data.sheets.find((s) => s.id === sheet)?.name ?? "",
                      );
                    }}
                  >
                    Editar hoja
                  </button>
                )}
                {canEdit && (
                  <>
                    <button
                      disabled={!!edit || !!draft}
                      onClick={() => {
                        requestId.current = crypto.randomUUID();
                        const next = blank(sheet || data.sheets[0].id);
                        if (next.date.slice(0, 7) !== month)
                          next.date = month + "-01";
                        setDraft(next);
                      }}
                    >
                      + Gasto fijo
                    </button>
                    <button
                      className="primary"
                      disabled={!!edit || !!draft}
                      onClick={() => {
                        requestId.current = crypto.randomUUID();
                        const next = blank(
                          sheet ||
                            data.sheets.find((s) => s.name === "Variables")
                              ?.id ||
                            data.sheets[0].id,
                        );
                        next.kind = "VARIABLE";
                        next.paid = true;
                        if (next.date.slice(0, 7) !== month)
                          next.date = month + "-01";
                        setDraft(next);
                      }}
                    >
                      + Gasto del día
                    </button>
                    <details>
                      <summary>Traer fijos del mes anterior</summary>
                      <p>
                        Se crearán pendientes en {month}, en todas las hojas. No
                        duplica los ya trasladados.
                      </p>
                      <button
                        disabled={busy || !!edit || !!draft}
                        onClick={() =>
                          void mutate(async () => {
                            const b = await request("/carry", "POST", {
                              month,
                            });
                            setNotice(`${b.copied} gastos trasladados.`);
                          }, "Fijos del mes anterior revisados; los nuevos quedan pendientes.")
                        }
                      >
                        Confirmar traslado
                      </button>
                    </details>
                  </>
                )}
              </div>
            </div>
            {rename && canEdit && sheet && (
              <form
                className="row panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutate(async () => {
                    await request("/sheets/" + sheet, "PATCH", {
                      name: sheetName,
                    });
                    setRename(false);
                  }, "Nombre actualizado.");
                }}
              >
                <input
                  aria-label="Renombrar hoja"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  required
                  maxLength={160}
                />
                <button>Guardar nombre</button>
                <button type="button" onClick={() => setRename(false)}>
                  Cancelar
                </button>
                <details>
                  <summary>Eliminar hoja vacía</summary>
                  <button
                    type="button"
                    onClick={() =>
                      void mutate(async () => {
                        await request("/sheets/" + sheet, "DELETE");
                        setSheet("");
                        setRename(false);
                      }, "Hoja vacía eliminada.")
                    }
                  >
                    Confirmar eliminación
                  </button>
                </details>
              </form>
            )}
            <div
              className="fc-table-wrap"
              tabIndex={0}
              aria-label="Tabla de gastos, desplazamiento horizontal"
            >
              <table className="fc-table">
                <thead>
                  <tr>
                    {[
                      "Fecha",
                      "Concepto",
                      "Hoja",
                      "Categoría",
                      "País",
                      "Lugar",
                      "Persona",
                      "Importe",
                      "Moneda",
                      "Tipo",
                      "Pagado",
                      "Nota",
                      "Acciones",
                    ].map((v) => (
                      <th key={v} scope="col">
                        {v}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft && (
                    <tr className="fc-edit">
                      {editor(draft, setDraft)}
                      <td>
                        <button
                          className="primary"
                          disabled={
                            busy || !draft.concept.trim() || !draft.amount
                          }
                          onClick={() =>
                            void mutate(async () => {
                              await request("/entries", "POST", {
                                requestId: requestId.current,
                                entry: draft,
                              });
                              setDraft(null);
                            }, "Gasto registrado.")
                          }
                        >
                          Guardar
                        </button>
                        <button disabled={busy} onClick={() => setDraft(null)}>
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row) =>
                    edit?.id === row.id ? (
                      <tr className="fc-edit" key={row.id}>
                        {editor(edit.entry, (v) =>
                          setEdit({ ...edit, entry: v }),
                        )}
                        <td>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void mutate(async () => {
                                await request("/entries/" + row.id, "PATCH", {
                                  version: edit.version,
                                  entry: edit.entry,
                                });
                                setEdit(null);
                              }, "Gasto actualizado.")
                            }
                          >
                            Guardar
                          </button>
                          <button disabled={busy} onClick={() => setEdit(null)}>
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <th scope="row">{row.concept}</th>
                        <td>
                          {data.sheets.find((s) => s.id === row.sheetId)?.name}
                        </td>
                        <td>{row.category || "—"}</td>
                        <td>{row.country || "—"}</td>
                        <td>{row.location || "—"}</td>
                        <td>{row.person || "—"}</td>
                        <td className="fc-number">
                          {money(cents(row.amount))}
                        </td>
                        <td>{row.currency}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (row.kind === "FIXED"
                                ? "fc-fixed"
                                : "fc-variable")
                            }
                          >
                            {row.kind === "FIXED" ? "Fijo" : "Variable"}
                          </span>
                        </td>
                        <td>
                          {data.canEdit ? (
                            <button
                              disabled={disabled || !!edit || !!draft}
                              className={row.paid ? "fc-paid" : "fc-pending"}
                              onClick={() =>
                                void mutate(() =>
                                  request("/entries/" + row.id, "PATCH", {
                                    version: row.version,
                                    entry: { ...fields(row), paid: !row.paid },
                                  }),
                                )
                              }
                            >
                              {row.paid ? "✓ Pagado" : "Pendiente"}
                            </button>
                          ) : row.paid ? (
                            "Pagado"
                          ) : (
                            "Pendiente"
                          )}
                        </td>
                        <td className="fc-note">{row.notes || "—"}</td>
                        <td>
                          {data.canEdit && (
                            <>
                              <button
                                disabled={disabled || !!edit || !!draft}
                                onClick={() => {
                                  setEdit({
                                    id: row.id,
                                    version: row.version,
                                    entry: fields(row),
                                  });
                                  setRemove("");
                                }}
                              >
                                Editar
                              </button>
                              {remove === row.id ? (
                                <>
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      void mutate(async () => {
                                        await request(
                                          "/entries/" + row.id,
                                          "DELETE",
                                          { version: row.version },
                                        );
                                        setRemove("");
                                      }, "Gasto eliminado.")
                                    }
                                  >
                                    Confirmar eliminación
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => setRemove("")}
                                  >
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <button
                                  disabled={disabled || !!edit || !!draft}
                                  aria-label={"Eliminar " + row.concept}
                                  onClick={() => setRemove(row.id)}
                                >
                                  ×
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                  {!data.rows.length && !draft && (
                    <tr>
                      <td colSpan={13} className="fc-empty">
                        Sin gastos en esta vista. Registra un gasto fijo o un
                        gasto del día.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="row">
              <button
                disabled={disabled || page === 1 || !!edit || !!draft}
                onClick={() => setPage((v) => v - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {Math.max(1, Math.ceil(data.total / 50))} · 50
                por página
              </span>
              <button
                disabled={
                  disabled || page * 50 >= data.total || !!edit || !!draft
                }
                onClick={() => setPage((v) => v + 1)}
              >
                Siguiente
              </button>
              <small className="muted">
                Totales de toda la vista · monedas separadas
              </small>
            </footer>
          </>
        )
      )}
    </section>
  );
}
