"use client";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CostChoice } from "./cost-choice";
import { convertedCost } from "../../lib/cost-ledger";
import { MetaDateRange } from "./meta-date-range";
import { limaToday } from "./date-range";
import "./fixed-costs.css";
type Entry = {
  project: string;
  unit: string;
  bonus: string;
  conversionRate: string | null;
  targetCurrency: string;
  entryType: "EXPENSE" | "INCOME";
  sheetId: string;
  date: string;
  kind: "FIXED" | "VARIABLE";
  concept: string;
  category: string;
  country: string;
  location: string;
  person: string;
  quantity: number;
  unitPrice: string;
  amount: string;
  currency: string;
  paid: boolean;
  notes: string;
};
type Row = Entry & { id: string; version: number };
type Dirty = {
  id?: string;
  version?: number;
  requestId?: string;
  entry: Entry;
};
type Data = {
  projects: string[];
  units: string[];
  owner: boolean;
  canEdit: boolean;
  sheets: { id: string; name: string }[];
  rows: Row[];
  total: number;
  countries: string[];
  categories: string[];
  groups: {
    currency: string;
    entryType: string;
    paid: boolean;
    kind: string;
    _sum: { amount: string | null; bonus?: string | null };
  }[];
};
type Column = { key: keyof Entry; name: string; width: number };
const expenseColumns: Column[] = [
  { key: "concept", name: "Concepto", width: 230 },
  { key: "project", name: "Proyecto", width: 170 },
  { key: "unit", name: "Unidad", width: 160 },
  { key: "country", name: "País", width: 110 },
  { key: "unitPrice", name: "Monto", width: 110 },
  { key: "bonus", name: "Comisión / bono", width: 120 },
  { key: "conversionRate", name: "Conversión", width: 135 },
  { key: "currency", name: "Moneda", width: 80 },
  { key: "targetCurrency", name: "Convertir a", width: 90 },
  { key: "paid", name: "Pago", width: 110 },
  { key: "date", name: "Fecha", width: 115 },
  { key: "kind", name: "Tipo", width: 100 },
  { key: "notes", name: "Nota", width: 200 },
];
const incomeColumns: Column[] = [
  { key: "concept", name: "Producto / concepto", width: 230 },
  { key: "project", name: "Proyecto", width: 170 },
  { key: "unit", name: "Unidad", width: 160 },
  { key: "country", name: "País", width: 110 },
  { key: "quantity", name: "Unidades vendidas", width: 125 },
  { key: "unitPrice", name: "Precio unitario", width: 110 },
  { key: "amount", name: "Total", width: 110 },
  { key: "currency", name: "Moneda", width: 80 },
  { key: "paid", name: "Cobro", width: 110 },
  { key: "date", name: "Fecha", width: 115 },
  { key: "notes", name: "Nota", width: 200 },
];
const minor = (v: string) =>
  /^\d+(\.\d{0,2})?$/.test(v)
    ? BigInt(v.split(".")[0]) * 100n +
      BigInt((v.split(".")[1] ?? "").padEnd(2, "0"))
    : null;
const money = (n: bigint) => {
  const sign = n < 0n ? "-" : "",
    v = n < 0n ? -n : n;
  return (
    sign +
    new Intl.NumberFormat("es-PE").format(v / 100n) +
    "." +
    String(v % 100n).padStart(2, "0")
  );
};
const rawMoney = (n: bigint) =>
  String(n / 100n) + "." + String(n % 100n).padStart(2, "0");
function computed(e: Entry): Entry {
  const price = minor(e.unitPrice.replace(",", "."));
  return {
    ...e,
    amount:
      price !== null && Number.isInteger(e.quantity) && e.quantity >= 0
        ? rawMoney(price * BigInt(e.quantity))
        : "0.00",
  };
}
function fields(r: Entry): Entry {
  return {
    project: r.project ?? "",
    unit: r.unit ?? "",
    bonus: r.bonus ?? "0.00",
    conversionRate: r.conversionRate ?? null,
    targetCurrency: r.targetCurrency ?? "PEN",
    entryType: r.entryType ?? "EXPENSE",
    sheetId: r.sheetId,
    date: r.date,
    kind: r.kind,
    concept: r.concept,
    category: r.category,
    country: r.country,
    location: r.location,
    person: r.person,
    quantity: r.quantity ?? 1,
    unitPrice: r.unitPrice ?? r.amount,
    amount: r.amount,
    currency: r.currency,
    paid: r.paid,
    notes: r.notes,
  };
}
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
export function FixedCosts() {
  const [data, setData] = useState<Data | null>(null),
    [type, setType] = useState<Entry["entryType"]>("EXPENSE"),
    [from, setFrom] = useState(() => limaToday().slice(0, 7) + "-01"),
    [to, setTo] = useState(() => {
      const d = limaToday();
      return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0))
        .toISOString()
        .slice(0, 10);
    }),
    [sheet, setSheet] = useState(""),
    [project, setProject] = useState(""),
    [unit, setUnit] = useState(""),
    [catalog, setCatalog] = useState<"PROJECT" | "UNIT" | null>(null),
    [catalogText, setCatalogText] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [widths, setWidths] = useState<Record<string, number>>({}),
    [maximized, setMaximized] = useState(false),
    [country, setCountry] = useState(""),
    [countryText, setCountryText] = useState(""),
    [category, setCategory] = useState(""),
    [categoryText, setCategoryText] = useState(""),
    [paid, setPaid] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState<Record<string, Dirty>>({}),
    [extras, setExtras] = useState<string[]>([]),
    [ghost, setGhost] = useState(0),
    [remove, setRemove] = useState(""),
    [sheetName, setSheetName] = useState(""),
    [rename, setRename] = useState(false),
    [share, setShare] = useState(false),
    [members, setMembers] = useState<any[]>([]),
    [email, setEmail] = useState(""),
    [permission, setPermission] = useState("VIEW");
  const lock = useRef(false),
    grid = useRef<HTMLDivElement>(null),
    epoch = useRef(0),
    dirtyCount = Object.keys(dirty).length,
    columns = type === "INCOME" ? incomeColumns : expenseColumns;
  const query = new URLSearchParams({
    from,
    to,
    page: String(page),
    entryType: type,
    ...(sheet ? { sheet } : {}),
    ...(project ? { project } : {}),
    ...(unit ? { unit } : {}),
    ...(country ? { country } : {}),
    ...(category ? { category } : {}),
    ...(paid ? { paid } : {}),
  }).toString();
  useEffect(() => {
    const controller = new AbortController(),
      version = ++epoch.current;
    setLoading(true);
    setError("");
    void request("?" + query, "GET", undefined, controller.signal)
      .then((b) => {
        if (version === epoch.current) setData(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, revision]);
  const changeView = (fn: () => void) => {
    if (dirtyCount) {
      setError("Guarda o descarta los cambios antes de cambiar de vista.");
      return;
    }
    setData(null);
    setSelected(new Set());
    setPage(1);
    setNotice("");
    setRemove("");
    fn();
  };
  async function mutate(fn: () => Promise<void>, message = "Guardado.") {
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
  function empty(): Entry {
    return {
      project,
      unit:
        unit ||
        (data?.sheets.find((s) => s.id === sheet)?.name &&
          data?.units.find(
            (u) => u === data.sheets.find((s) => s.id === sheet)?.name,
          )) ||
        "",
      bonus: "0.00",
      conversionRate: null,
      targetCurrency: "PEN",
      entryType: type,
      sheetId: sheet || data?.sheets[0]?.id || "",
      date: limaToday() >= from && limaToday() <= to ? limaToday() : from,
      kind: type === "INCOME" ? "VARIABLE" : "FIXED",
      concept: "",
      category,
      country,
      location: "",
      person: "",
      quantity: 1,
      unitPrice: "",
      amount: "0.00",
      currency: "PEN",
      paid: type === "INCOME",
      notes: "",
    };
  }
  function add(focus = true) {
    if (!data?.sheets.length || !data.canEdit || busy) return;
    const key = crypto.randomUUID();
    setExtras((v) => [...v, key]);
    setDirty((v) => ({ ...v, [key]: { requestId: key, entry: empty() } }));
    if (focus)
      requestAnimationFrame(() =>
        grid.current
          ?.querySelector<HTMLInputElement>(
            '[data-row="' + key + '"][data-col="0"]',
          )
          ?.focus(),
      );
  }
  const rows: { key: string; row: Row | undefined; entry: Entry }[] = [
    ...(data?.rows ?? []).map((row) => ({
      key: row.id,
      row,
      entry: dirty[row.id]?.entry ?? fields(row),
    })),
    ...extras.map((key) => ({
      key,
      row: undefined,
      entry: dirty[key]?.entry ?? empty(),
    })),
    ...(data?.canEdit && data.sheets.length
      ? [{ key: "ghost:" + ghost, row: undefined, entry: empty() }]
      : []),
  ];
  function edit(
    key: string,
    col: keyof Entry,
    value: string | number | boolean | null,
  ) {
    const current = rows.find((r) => r.key === key);
    if (!current) return;
    if (key === "ghost:" + ghost) {
      setExtras((v) => (v.includes(key) ? v : [...v, key]));
      setGhost((v) => v + 1);
    }
    setDirty((previous) => {
      const baseline =
        previous[key] ??
        (current.row
          ? {
              id: key,
              version: current.row.version,
              entry: fields(current.row),
            }
          : {
              requestId: key.startsWith("ghost:") ? crypto.randomUUID() : key,
              entry: current.entry,
            });
      const entry = computed({
        ...baseline.entry,
        ...(type === "EXPENSE" && col === "unitPrice" ? { quantity: 1 } : {}),
        ...(["currency", "targetCurrency"].includes(col)
          ? { conversionRate: null }
          : {}),
        [col]: col === "conversionRate" && value === "" ? null : value,
      });
      return { ...previous, [key]: { ...baseline, entry } };
    });
    setNotice("");
  }
  async function save() {
    await mutate(async () => {
      if (
        Object.values(dirty).some(
          (r) =>
            !r.entry.concept.trim() ||
            minor(r.entry.unitPrice.replace(",", ".")) === null,
        )
      )
        throw Error("Completa el concepto y un precio válido en cada fila.");
      await request("/grid", "POST", {
        rows: Object.values(dirty).map((row) => ({
          ...row,
          entry: {
            ...computed(row.entry),
            unitPrice: row.entry.unitPrice.replace(",", "."),
          },
        })),
      });
      setDirty({});
      setExtras([]);
    }, "Cambios guardados.");
  }
  function keyboard(
    e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    r: number,
    c: number,
  ) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (dirtyCount && !busy) void save();
      return;
    }
    if (!["ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
    e.preventDefault();
    const next =
      r + (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
    const target = rows[next];
    if (target)
      grid.current
        ?.querySelector<HTMLInputElement>(
          '[data-row="' + target.key + '"][data-col="' + c + '"]',
        )
        ?.focus();
    else if (next === rows.length) add();
  }
  function paste(e: ClipboardEvent<HTMLInputElement>, r: number, c: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n");
    if (lines.length > 100) {
      setError("Pega como máximo100 filas por guardado.");
      return;
    }
    const updates: Record<string, Dirty> = {},
      newKeys: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const current = rows[r + i],
        key = current?.key ?? crypto.randomUUID(),
        baseline =
          dirty[key] ??
          (current?.row
            ? {
                id: key,
                version: current.row.version,
                entry: fields(current.row),
              }
            : {
                requestId: key.startsWith("ghost:") ? crypto.randomUUID() : key,
                entry: empty(),
              });
      let entry = { ...baseline.entry };
      const cells = lines[i].split("\t");
      for (let j = 0; j < cells.length && c + j < columns.length; j++) {
        const field = columns[c + j].key,
          value = cells[j].trim();
        if (field === "amount") continue;
        if (field === "quantity") entry.quantity = Number(value);
        else if (field === "paid")
          entry.paid = /^(sí|si|true|1|pagado|cobrado)$/i.test(value);
        else if (field === "kind")
          entry.kind = /^(variable|VARIABLE)$/.test(value)
            ? "VARIABLE"
            : "FIXED";
        else
          (entry as any)[field] =
            field === "currency" ? value.toUpperCase() : value;
      }
      updates[key] = { ...baseline, entry: computed(entry) };
      if (!current || key === "ghost:" + ghost) newKeys.push(key);
    }
    setDirty((v) => ({ ...v, ...updates }));
    setExtras((v) => [...v, ...newKeys.filter((k) => !v.includes(k))]);
    if (newKeys.includes("ghost:" + ghost)) setGhost((v) => v + 1);
    setNotice("");
  }
  const totals = new Map<
    string,
    { income: bigint; expense: bigint; collected: bigint; spent: bigint }
  >();
  for (const g of data?.groups ?? []) {
    const t = totals.get(g.currency) ?? {
        income: 0n,
        expense: 0n,
        collected: 0n,
        spent: 0n,
      },
      n =
        (minor(g._sum.amount ?? "0") ?? 0n) +
        (minor(g._sum.bonus ?? "0") ?? 0n);
    if (g.entryType === "INCOME") {
      t.income += n;
      if (g.paid) t.collected += n;
    } else {
      t.expense += n;
      if (g.paid) t.spent += n;
    }
    totals.set(g.currency, t);
  }
  function resizeColumn(
    e: ReactPointerEvent<HTMLSpanElement>,
    key: string,
    base: number,
  ) {
    e.preventDefault();
    const el = e.currentTarget,
      start = e.clientX,
      width = widths[key] ?? base;
    el.setPointerCapture(e.pointerId);
    const move = (event: PointerEvent) =>
      setWidths((v) => ({
        ...v,
        [key]: Math.max(
          key === "item" ? 48 : 65,
          Math.min(800, width + event.clientX - start),
        ),
      }));
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }
  const canEdit = data?.canEdit && !loading && !busy;
  return (
    <section
      className={"fixed-costs fc-workbook" + (maximized ? " fc-maximized" : "")}
      aria-label="Hoja de costos e ingresos"
    >
      <header className="fc-bar">
        <h1 className="sr-only">Costos fijos</h1>
        <div className="fc-modes" role="group" aria-label="Gastos e ingresos">
          <button
            aria-pressed={type === "EXPENSE"}
            onClick={() => changeView(() => setType("EXPENSE"))}
          >
            Gastos
          </button>
          <button
            aria-pressed={type === "INCOME"}
            onClick={() => changeView(() => setType("INCOME"))}
          >
            Ingresos
          </button>
        </div>
        <MetaDateRange
          from={from}
          to={to}
          maxDays={366}
          allowFuture
          triggerAriaLabel="Período de costos e ingresos"
          applyLabel="Aplicar período"
          onChange={(a, b) =>
            changeView(() => {
              setFrom(a);
              setTo(b);
            })
          }
        />
        <label className="fc-inline-label">
          País
          <input
            aria-label="Filtrar país"
            list="fc-countries"
            placeholder="Todos"
            value={countryText}
            title="Escribe el país y pulsa Enter"
            disabled={busy || !!dirtyCount}
            onChange={(e) => setCountryText(e.target.value)}
            onBlur={() => {
              if (countryText.trim() !== country)
                changeView(() => setCountry(countryText.trim()));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                changeView(() => setCountry(countryText.trim()));
              }
            }}
          />
        </label>
        <label className="fc-inline-label">
          Proyecto
          <CostChoice
            label="Filtrar proyecto"
            value={project}
            options={data?.projects ?? []}
            disabled={busy || !!dirtyCount}
            onChange={(v) => changeView(() => setProject(v))}
          />
          {project && (
            <button
              aria-label="Quitar filtro proyecto"
              onClick={() => changeView(() => setProject(""))}
            >
              ×
            </button>
          )}
        </label>
        <label className="fc-inline-label">
          Unidad
          <CostChoice
            label="Filtrar unidad"
            value={unit}
            options={data?.units ?? []}
            disabled={busy || !!dirtyCount}
            onChange={(v) => changeView(() => setUnit(v))}
          />
          {unit && (
            <button
              aria-label="Quitar filtro unidad"
              onClick={() => changeView(() => setUnit(""))}
            >
              ×
            </button>
          )}
        </label>
        <label className="fc-inline-label">
          {type === "INCOME" ? "Cobro" : "Pago"}
          <select
            aria-label="Filtrar estado de pago"
            value={paid}
            disabled={busy || !!dirtyCount}
            onChange={(e) => changeView(() => setPaid(e.target.value))}
          >
            <option value="">Todos</option>
            <option value="no">Pendiente</option>
            <option value="yes">
              {type === "INCOME" ? "Cobrado" : "Pagado"}
            </option>
          </select>
        </label>
        {data?.owner && (
          <button
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
      </header>
      <datalist id="fc-countries">
        {data?.countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="fc-categories">
        {data?.categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {share && data?.owner && (
        <section className="fc-share">
          <strong>OWNER siempre tiene acceso</strong>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(async () => {
                await request("/sharing", "POST", {
                  email: email.trim(),
                  permission,
                });
                setMembers((await request("/sharing")).members);
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
      <div className="fc-command-bar">
        <span>
          {data?.total ?? 0} registros
          {dirtyCount ? ` · ${dirtyCount} por guardar` : ""}
        </span>
        {canEdit && (
          <>
            <button onClick={() => add()}>＋ Fila</button>
            {dirtyCount > 0 && (
              <>
                <button className="primary" onClick={() => void save()}>
                  Guardar cambios ({dirtyCount})
                </button>
                <button
                  onClick={() => {
                    setDirty({});
                    setExtras([]);
                    setError("");
                  }}
                >
                  Descartar
                </button>
              </>
            )}
          </>
        )}
        <button
          aria-label="Actualizar tabla"
          disabled={loading || busy || !!dirtyCount}
          onClick={() => setRevision((v) => v + 1)}
        >
          ↻
        </button>
        <button
          aria-expanded={catalog === "PROJECT"}
          disabled={!canEdit}
          onClick={() => {
            setCatalog(catalog === "PROJECT" ? null : "PROJECT");
            setCatalogText("");
          }}
        >
          Proyectos
        </button>
        <button
          aria-expanded={catalog === "UNIT"}
          disabled={!canEdit}
          onClick={() => {
            setCatalog(catalog === "UNIT" ? null : "UNIT");
            setCatalogText("");
          }}
        >
          Unidades
        </button>
        <button
          aria-pressed={maximized}
          onClick={() => setMaximized((v) => !v)}
        >
          {maximized ? "− Restaurar tabla" : "⛶ Maximizar tabla"}
        </button>
        {selected.size > 0 && (
          <>
            <span>{selected.size} seleccionadas</span>
            {canEdit && (
              <button
                onClick={() => {
                  for (const row of rows.filter((r) => selected.has(r.key)))
                    edit(row.key, "paid", true);
                }}
              >
                Marcar {type === "INCOME" ? "cobradas" : "pagadas"}
              </button>
            )}
          </>
        )}
        <span className="fc-save-status" role="status">
          {loading
            ? "Cargando…"
            : busy
              ? "Guardando…"
              : notice ||
                (!data?.canEdit
                  ? "Solo consulta"
                  : dirtyCount
                    ? "Sin guardar"
                    : "Guardado")}
        </span>
        <details className="fc-options">
          <summary>Más</summary>
          <div>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(async () => {
                  const s = await request("/sheets", "POST", {
                    name: sheetName,
                  });
                  setSheet(s.id);
                  setSheetName("");
                }, "Hoja creada.");
              }}
            >
              <input
                aria-label="Nombre de nueva hoja"
                placeholder="Nueva hoja"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                maxLength={160}
                required
              />
              <button disabled={!canEdit || !!dirtyCount}>Crear hoja</button>
            </form>
            {sheet && (
              <button
                disabled={!canEdit || !!dirtyCount}
                onClick={() => {
                  setRename(!rename);
                  setSheetName(
                    data?.sheets.find((s) => s.id === sheet)?.name ?? "",
                  );
                }}
              >
                Editar hoja
              </button>
            )}
            {data?.owner && (
              <button
                disabled={busy || !!dirtyCount}
                onClick={() =>
                  void mutate(async () => {
                    await request("/sheets/initialize", "POST", {});
                  }, "Hojas listas.")
                }
              >
                Añadir hojas Asesores, Servicios, Tecnología e Impuestos
              </button>
            )}
            {type === "EXPENSE" && (
              <details>
                <summary>Traer fijos del mes anterior</summary>
                <p>
                  Se crearán pendientes en {from.slice(0, 7)}, sin duplicarlos.
                  No incluye ingresos.
                </p>
                <button
                  disabled={!canEdit || !!dirtyCount}
                  onClick={() =>
                    void mutate(async () => {
                      await request("/carry", "POST", {
                        month: from.slice(0, 7),
                      });
                    }, "Fijos trasladados; los nuevos quedan pendientes.")
                  }
                >
                  Confirmar traslado
                </button>
              </details>
            )}
          </div>
        </details>
      </div>
      {catalog && (
        <form
          className="fc-catalog"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(async () => {
              const names = catalogText
                .split(/[\n\t]+/)
                .map((v) => v.trim())
                .filter(Boolean);
              if (!names.length) throw Error("Escribe al menos un nombre.");
              await request("/options", "POST", { kind: catalog, names });
              setCatalogText("");
            }, "Catálogo guardado.");
          }}
        >
          <div>
            <strong>
              {catalog === "PROJECT" ? "Tus proyectos" : "Tus unidades"}
            </strong>
            <span>
              {(catalog === "PROJECT" ? data?.projects : data?.units)?.join(
                " · ",
              ) || "Aún no hay nombres"}
            </span>
          </div>
          <textarea
            aria-label={
              catalog === "PROJECT"
                ? "Nombres de proyectos"
                : "Nombres de unidades"
            }
            placeholder="Escribe o pega un nombre por línea"
            rows={2}
            value={catalogText}
            onChange={(e) => setCatalogText(e.target.value)}
            maxLength={32000}
          />
          <button disabled={busy || !catalogText.trim()}>
            Guardar nombres
          </button>
          <button type="button" onClick={() => setCatalog(null)}>
            Cerrar
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="fc-error">
          {error}
        </p>
      )}
      {rename && sheet && (
        <form
          className="fc-rename row"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(async () => {
              await request("/sheets/" + sheet, "PATCH", { name: sheetName });
              setRename(false);
            }, "Hoja actualizada.");
          }}
        >
          <input
            aria-label="Renombrar hoja"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            required
          />
          <button disabled={busy}>Guardar nombre</button>
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
      {data && !data.sheets.length ? (
        <div className="fc-start">
          <span>Sin registros. Prepara las hojas o crea una desde «Más».</span>
          {data.owner && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void mutate(async () => {
                  await request("/sheets/initialize", "POST", {});
                }, "Hojas listas, sin datos de ejemplo.")
              }
            >
              Preparar hojas
            </button>
          )}
        </div>
      ) : (
        <div
          ref={grid}
          className="fc-grid"
          tabIndex={0}
          aria-label={
            type === "INCOME"
              ? "Tabla de ingresos editable"
              : "Tabla de gastos editable"
          }
          aria-busy={loading || busy}
        >
          <table>
            <colgroup>
              <col style={{ width: widths.item ?? 60 }} />
              {columns.map((c) => (
                <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
              ))}
              {data?.canEdit && <col style={{ width: 44 }} />}
            </colgroup>
            <thead>
              <tr className="fc-letters">
                <th />
                <>
                  {columns.map((c, i) => (
                    <th key={c.key} scope="col">
                      {String.fromCharCode(65 + i)}
                    </th>
                  ))}
                </>
                {data?.canEdit && <th />}
              </tr>
              <tr>
                <th scope="col" className="fc-item-head">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar filas de esta página"
                    checked={
                      rows.filter((r) => r.row).length > 0 &&
                      rows
                        .filter((r) => r.row)
                        .every((r) => selected.has(r.key))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(rows.filter((r) => r.row).map((r) => r.key))
                          : new Set(),
                      )
                    }
                  />
                  <span>#</span>
                  <span
                    role="separator"
                    aria-label="Ancho de ítem"
                    aria-orientation="vertical"
                    tabIndex={0}
                    className="fc-resize"
                    onPointerDown={(e) => resizeColumn(e, "item", 60)}
                    onKeyDown={(e) => {
                      if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                        e.preventDefault();
                        setWidths((v) => ({
                          ...v,
                          item: Math.max(
                            48,
                            (v.item ?? 60) + (e.key === "ArrowRight" ? 8 : -8),
                          ),
                        }));
                      }
                    }}
                  />
                </th>
                {columns.map((c) => (
                  <th scope="col" key={c.key}>
                    {c.name}
                    <span
                      role="separator"
                      aria-label={"Ancho de " + c.name}
                      aria-orientation="vertical"
                      tabIndex={0}
                      className="fc-resize"
                      onKeyDown={(e) => {
                        if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                          e.preventDefault();
                          setWidths((v) => ({
                            ...v,
                            [c.key]: Math.max(
                              65,
                              (v[c.key] ?? c.width) +
                                (e.key === "ArrowRight" ? 10 : -10),
                            ),
                          }));
                        }
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const el = e.currentTarget;
                        el.setPointerCapture(e.pointerId);
                        const start = e.clientX,
                          width = widths[c.key] ?? c.width;
                        const move = (event: PointerEvent) =>
                          setWidths((v) => ({
                            ...v,
                            [c.key]: Math.max(
                              65,
                              Math.min(800, width + event.clientX - start),
                            ),
                          }));
                        const end = () => {
                          el.removeEventListener("pointermove", move);
                          el.removeEventListener("pointerup", end);
                          el.removeEventListener("pointercancel", end);
                        };
                        el.addEventListener("pointermove", move);
                        el.addEventListener("pointerup", end);
                        el.addEventListener("pointercancel", end);
                      }}
                    />
                  </th>
                ))}
                {data?.canEdit && <th scope="col" aria-label="Eliminar fila" />}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, row, entry }, r) => {
                return (
                  <Fragment key={key}>
                    <tr
                      className={
                        (dirty[key] ? "fc-dirty " : "") +
                        (selected.has(key) ? "fc-selected" : "")
                      }
                    >
                      <th scope="row" className="fc-row-number">
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar fila ${r + 1}`}
                            disabled={!row && !dirty[key]}
                            checked={selected.has(key)}
                            onChange={(e) =>
                              setSelected((v) => {
                                const n = new Set(v);
                                if (e.target.checked) n.add(key);
                                else n.delete(key);
                                return n;
                              })
                            }
                          />
                          <span>{(page - 1) * 50 + r + 1}</span>
                        </label>
                      </th>
                      {columns.map((c, i) => (
                        <td
                          key={c.key}
                          className={c.key === "amount" ? "fc-computed" : ""}
                        >
                          {c.key === "project" || c.key === "unit" ? (
                            <CostChoice
                              row={key}
                              col={i}
                              label={`${c.name} fila ${r + 1}`}
                              value={entry[c.key]}
                              options={
                                (c.key === "project"
                                  ? data?.projects
                                  : data?.units) ?? []
                              }
                              disabled={!canEdit}
                              onChange={(v) => edit(key, c.key, v)}
                              onKeyDown={(e) => keyboard(e, r, i)}
                            />
                          ) : c.key === "conversionRate" ? (
                            <div className="fc-conversion">
                              <input
                                aria-label={`Tasa de conversión fila ${r + 1}`}
                                data-row={key}
                                data-col={i}
                                placeholder={
                                  entry.currency === entry.targetCurrency
                                    ? "1"
                                    : "Tasa"
                                }
                                value={entry.conversionRate ?? ""}
                                inputMode="decimal"
                                readOnly={
                                  !canEdit ||
                                  entry.currency === entry.targetCurrency
                                }
                                onChange={(e) =>
                                  edit(
                                    key,
                                    "conversionRate",
                                    e.target.value.replace(",", "."),
                                  )
                                }
                                onKeyDown={(e) => keyboard(e, r, i)}
                                title={`1 ${entry.currency} equivale a esta cantidad de ${entry.targetCurrency}`}
                              />
                              <output
                                aria-label={`Conversión fila ${r + 1}`}
                                title="Monto más bono, convertido con tu tasa"
                              >
                                {convertedCost(
                                  computed(entry).amount,
                                  entry.bonus,
                                  entry.conversionRate,
                                  entry.currency,
                                  entry.targetCurrency,
                                ) ?? "—"}{" "}
                                {entry.targetCurrency}
                              </output>
                            </div>
                          ) : c.key === "paid" ? (
                            <select
                              data-row={key}
                              data-col={i}
                              aria-label={`${c.name} fila ${r + 1}`}
                              value={entry.paid ? "yes" : "no"}
                              disabled={!canEdit}
                              onKeyDown={(e) => keyboard(e, r, i)}
                              onChange={(e) =>
                                edit(key, c.key, e.target.value === "yes")
                              }
                              className={entry.paid ? "fc-paid" : "fc-pending"}
                            >
                              <option value="no">Pendiente</option>
                              <option value="yes">
                                {type === "INCOME" ? "Cobrado" : "Pagado"}
                              </option>
                            </select>
                          ) : c.key === "kind" ? (
                            <select
                              data-row={key}
                              data-col={i}
                              aria-label={`Tipo fila ${r + 1}`}
                              value={entry.kind}
                              disabled={!canEdit}
                              onChange={(e) => edit(key, c.key, e.target.value)}
                              onKeyDown={(e) => keyboard(e, r, i)}
                            >
                              <option value="FIXED">Fijo</option>
                              <option value="VARIABLE">Variable</option>
                            </select>
                          ) : (
                            <input
                              data-row={key}
                              data-col={i}
                              aria-label={`${c.name} fila ${r + 1}`}
                              type={
                                c.key === "date"
                                  ? "date"
                                  : c.key === "quantity"
                                    ? "number"
                                    : "text"
                              }
                              inputMode={
                                ["unitPrice", "amount", "bonus"].includes(c.key)
                                  ? "decimal"
                                  : undefined
                              }
                              list={
                                c.key === "category"
                                  ? "fc-categories"
                                  : c.key === "country"
                                    ? "fc-countries"
                                    : undefined
                              }
                              value={
                                c.key === "amount"
                                  ? money(minor(computed(entry).amount) ?? 0n)
                                  : c.key === "unitPrice" &&
                                      type === "EXPENSE" &&
                                      entry.quantity !== 1
                                    ? computed(entry).amount
                                    : String(entry[c.key] ?? "")
                              }
                              readOnly={!canEdit || c.key === "amount"}
                              tabIndex={c.key === "amount" ? -1 : undefined}
                              maxLength={c.key === "notes" ? 2000 : 160}
                              min={c.key === "quantity" ? 0 : undefined}
                              step={c.key === "quantity" ? 1 : undefined}
                              title={
                                c.key === "unitPrice"
                                  ? "Precio sin separadores de miles"
                                  : undefined
                              }
                              onChange={(e) =>
                                edit(
                                  key,
                                  c.key,
                                  c.key === "quantity"
                                    ? Number(e.target.value)
                                    : ["currency", "targetCurrency"].includes(
                                          c.key,
                                        )
                                      ? e.target.value.toUpperCase()
                                      : e.target.value,
                                )
                              }
                              onPaste={
                                canEdit && c.key !== "amount"
                                  ? (e) => paste(e, r, i)
                                  : undefined
                              }
                              onKeyDown={(e) => keyboard(e, r, i)}
                            />
                          )}
                        </td>
                      ))}
                      {data?.canEdit && (
                        <td className="fc-remove">
                          {remove === key ? (
                            <span>
                              <button
                                title="Confirmar eliminación"
                                disabled={busy}
                                onClick={() => {
                                  if (!row) {
                                    setExtras((v) =>
                                      v.filter((x) => x !== key),
                                    );
                                    setDirty((v) => {
                                      const n = { ...v };
                                      delete n[key];
                                      return n;
                                    });
                                    setRemove("");
                                  } else
                                    void mutate(async () => {
                                      await request(
                                        "/entries/" + row.id,
                                        "DELETE",
                                        { version: row.version },
                                      );
                                      setDirty((v) => {
                                        const n = { ...v };
                                        delete n[key];
                                        return n;
                                      });
                                      setRemove("");
                                    }, "Fila eliminada.");
                                }}
                              >
                                ✓
                              </button>
                              <button
                                title="Cancelar eliminación"
                                onClick={() => setRemove("")}
                              >
                                ×
                              </button>
                            </span>
                          ) : (
                            <button
                              disabled={busy || loading}
                              aria-label={`Eliminar fila ${r + 1}`}
                              onClick={() => setRemove(key)}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  </Fragment>
                );
              })}
              {!rows.length && (
                <tr className="fc-empty-row">
                  <th>1</th>
                  <td colSpan={columns.length + (data?.canEdit ? 1 : 0)}>
                    {loading ? (
                      "Cargando…"
                    ) : data?.canEdit ? (
                      <button onClick={() => add()}>
                        ＋ Escribe tu primer{" "}
                        {type === "INCOME" ? "ingreso" : "gasto"}
                      </button>
                    ) : (
                      "Sin registros en este período."
                    )}
                  </td>
                </tr>
              )}
              {Array.from({ length: Math.max(0, 50 - rows.length) }, (_, i) => (
                <tr className="fc-blank-grid-row" key={"blank" + i}>
                  <th scope="row">{(page - 1) * 50 + rows.length + i + 1}</th>
                  {columns.map((c, j) => (
                    <td
                      key={c.key}
                      onClick={() => {
                        if (!canEdit) return;
                        const keys = [
                          "ghost:" + ghost,
                          ...Array.from({ length: i + 1 }, () =>
                            crypto.randomUUID(),
                          ),
                        ];
                        setExtras((v) => [...v, ...keys]);
                        setGhost((v) => v + 1);
                        requestAnimationFrame(() =>
                          grid.current
                            ?.querySelector<HTMLInputElement>(
                              '[data-row="' +
                                keys.at(-1) +
                                '"][data-col="' +
                                j +
                                '"]',
                            )
                            ?.focus(),
                        );
                      }}
                    />
                  ))}
                  {data?.canEdit && <td />}
                </tr>
              ))}
              {rows.length > 0 && canEdit && (
                <tr className="fc-append-row">
                  <th>＋</th>
                  <td colSpan={columns.length + 1}>
                    <button onClick={() => add()}>Añadir fila</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <footer className="fc-workbook-footer">
        <nav className="fc-sheet-tabs" aria-label="Hojas de costos">
          <button
            aria-pressed={!sheet}
            disabled={busy || !!dirtyCount}
            onClick={() => changeView(() => setSheet(""))}
          >
            Totales
          </button>
          {data?.sheets.map((s) => (
            <button
              key={s.id}
              aria-pressed={sheet === s.id}
              disabled={busy || !!dirtyCount}
              onClick={() => changeView(() => setSheet(s.id))}
            >
              {s.name}
            </button>
          ))}
          {canEdit && (
            <button
              title="Crear hoja desde Más"
              onClick={() =>
                grid.current?.parentElement
                  ?.querySelector<HTMLDetailsElement>(".fc-options")
                  ?.setAttribute("open", "")
              }
            >
              ＋
            </button>
          )}
        </nav>
        <span className="fc-pagination">
          <button
            aria-label="Página anterior"
            disabled={loading || busy || !!dirtyCount || page === 1}
            onClick={() => setPage((v) => v - 1)}
          >
            ‹
          </button>
          {page}/{Math.max(1, Math.ceil((data?.total ?? 0) / 50))}
          <button
            aria-label="Página siguiente"
            disabled={
              loading || busy || !!dirtyCount || page * 50 >= (data?.total ?? 0)
            }
            onClick={() => setPage((v) => v + 1)}
          >
            ›
          </button>
        </span>
      </footer>
      <div className="fc-summary-line" aria-label="Totales del período">
        {[...totals].map(([currency, t]) => (
          <span key={currency}>
            <b>{currency}</b> Ingresos <strong>{money(t.income)}</strong> ·
            Gastos <strong>{money(t.expense)}</strong> · Saldo{" "}
            <strong
              className={t.income - t.expense < 0n ? "fc-pending" : "fc-paid"}
            >
              {money(t.income - t.expense)}
            </strong>
            <small title="Dinero efectivamente cobrado y pagado">
              {" "}
              · Cobrado {money(t.collected)} · Pagado {money(t.spent)}
            </small>
          </span>
        ))}
      </div>
    </section>
  );
}
