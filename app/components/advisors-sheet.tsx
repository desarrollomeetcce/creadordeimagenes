"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { engineRequest as api } from "./generation-engine";
import { MetaDateRange } from "./meta-date-range";
import { EffectivenessCell } from "./effectiveness-cell";
import { AdvisorAbsenceCell } from "./advisor-absence-cell";
import { AdvisorDetail } from "./advisor-detail";
import type {
  AdvisorDayData as Day,
  AdvisorPerson as Person,
  Attendance,
  AdvisorTable,
} from "./advisor-types";
import { countryOptions } from "../../lib/meta-ads/countries";
import { SheetSearchSelect } from "./sheet-search-select";
const statuses = [
  { value: "", label: "Sin registrar" },
  { value: "PRESENT", label: "Presente" },
  { value: "ABSENT", label: "Ausente" },
  { value: "NA", label: "N.A." },
];
export function AdvisorsSheet({
  tables,
  initialTableId,
  sheetTabs,
  onChanged,
}: {
  tables: AdvisorTable[];
  initialTableId: string;
  sheetTabs: ReactNode;
  onChanged: () => Promise<void>;
}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [since, setSince] = useState(today.slice(0, 8) + "01"),
    [until, setUntil] = useState(today),
    [tableId, setTableId] = useState(initialTableId),
    [aliasId, setAliasId] = useState(""),
    [country, setCountry] = useState(""),
    [detail, setDetail] = useState<Person | null>(null),
    [rows, setRows] = useState<Person[]>([]),
    [message, setMessage] = useState(""),
    [reload, setReload] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (tableId !== "all" && !tables.some((t) => t.id === tableId)) {
      setTableId(tables[0]?.id ?? "all");
      setAliasId("");
    } else if (
      aliasId &&
      !tables
        .filter((t) => tableId === "all" || t.id === tableId)
        .some((t) => (t.aliases ?? []).some((a) => a.id === aliasId))
    )
      setAliasId("");
  }, [tables, tableId, aliasId]);
  const sequence = useRef(0),
    context = useRef("");
  const valid =
    since <= until && (Date.parse(until) - Date.parse(since)) / 86400000 < 31;
  const key = JSON.stringify([tableId, since, until, aliasId, country]);
  context.current = key;
  const load = async (saved = false) => {
    const token = ++sequence.current,
      requested = key;
    setLoading(true);
    try {
      const data = await api(
        "meta-ads/advisors/sheet?" +
          new URLSearchParams({
            tableId,
            since,
            until,
            ...(aliasId ? { aliasId } : {}),
            ...(country ? { country } : {}),
          }),
      );
      if (token === sequence.current && context.current === requested)
        setRows(data.rows);
    } catch (e) {
      if (token === sequence.current && context.current === requested)
        setMessage(
          saved
            ? "Guardado, pero no se pudo recargar. Pulsa Actualizar antes de seguir editando."
            : (e as Error).message,
        );
    } finally {
      if (token === sequence.current && context.current === requested)
        setLoading(false);
    }
  };
  useEffect(() => {
    if (valid) void load();
    else setLoading(false);
    return () => {
      sequence.current++;
    };
  }, [key, valid, reload]);
  const write = async (path: string, method: string, body: unknown) => {
    const requested = key;
    setBusy(true);
    setMessage("");
    try {
      await api(path, method, body);
      if (path === "meta-ads/advisors") await onChanged();
      if (context.current === requested) await load(true);
      else setReload((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };
  const days: string[] = [];
  if (valid)
    for (let d = Date.parse(since); d <= Date.parse(until); d += 86400000)
      days.push(new Date(d).toISOString().slice(0, 10));
  const words = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const filtered = rows.filter((p) =>
    words.every((w) =>
      p.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(w),
    ),
  );
  return (
    <section className="sheet-view advisor-sheet" aria-label="Hoja Asesores">
      <div className="row sheet-toolbar">
        <strong>Asesores</strong>
        <MetaDateRange
          from={since}
          to={until}
          onChange={(a, b) => {
            setSince(a);
            setUntil(b);
          }}
        />
        <label>
          Ventas de{" "}
          <SheetSearchSelect
            label="Hojas para ventas por asesor"
            value={tableId}
            options={[
              ...tables.map((t) => ({ value: t.id, label: t.name })),
              { value: "all", label: "Todas las hojas" },
            ]}
            onSelect={(id) => {
              setTableId(id);
              setAliasId("");
            }}
          />
        </label>
        <SheetSearchSelect
          label="Alias de ventas por asesor"
          value={aliasId}
          placeholder="Todos los alias"
          options={[
            { value: "", label: "Todos los alias" },
            ...tables
              .filter((t) => tableId === "all" || t.id === tableId)
              .flatMap((t) =>
                (t.aliases ?? []).map((a) => ({
                  value: a.id,
                  label: a.name + (tableId === "all" ? " · " + t.name : ""),
                })),
              ),
          ]}
          onSelect={setAliasId}
        />
        <SheetSearchSelect
          label="País de ventas por asesor"
          value={country}
          placeholder="Todos los países"
          options={[
            { value: "", label: "Todos los países" },
            ...countryOptions.map((c) => ({
              value: c.code,
              label: c.name + " · " + c.code,
            })),
          ]}
          onSelect={setCountry}
        />
        <input
          type="search"
          aria-label="Buscar asesor"
          placeholder="Buscar asesor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await write("meta-ads/advisors", "POST", { name: name.trim() });
              setName("");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <input
            aria-label="Nombre del nuevo asesor"
            placeholder="Nombre del asesor"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            disabled={busy}
          />
          <button disabled={busy || !name.trim()}>+ Asesor</button>
        </form>
        <button
          disabled={busy || loading || !valid}
          onClick={() => void load()}
        >
          Actualizar
        </button>
      </div>
      <p className="sheet-help">
        A = Asistencia. V = Ventas por coincidencia exacta de alias + asesor +
        país. H = Horas ausentes (0,5 = 30 minutos). A y H corresponden a la
        persona y no se reparten por producto. La asignación actual también se
        aplica al histórico. * Total parcial; — sin datos; N.A. no es cero.
        Todas las hojas incluye también las copias sincronizadas.
      </p>
      {message && (
        <p className="sheet-message" role="status">
          {message}
        </p>
      )}
      {!valid && <p role="alert">Elige un período de hasta 31 días.</p>}
      {loading && <p role="status">Cargando asesores…</p>}
      {sheetTabs}
      {valid && (
        <div className="table-scroll effectiveness-scroll">
          <table
            className="effectiveness-grid advisor-grid"
            style={{ width: 180 + days.length * 188 }}
          >
            <colgroup>
              <col style={{ width: 180 }} />
              {days.flatMap((d) => [
                <col key={d + "attendance"} style={{ width: 84 }} />,
                <col key={d + "sales"} style={{ width: 48 }} />,
                <col key={d + "absence"} style={{ width: 56 }} />,
              ])}
            </colgroup>
            <caption className="sr-only">
              Asistencia y ventas diarias por asesor
            </caption>
            <thead>
              <tr>
                <th className="advisor-name" rowSpan={2}>
                  Asesor
                </th>
                {days.map((d) => (
                  <th key={d} colSpan={3} scope="colgroup">
                    {d.slice(8)}.{d.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr>
                {days.map((d) => (
                  <FragmentHeaders key={d} />
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                filtered.map((p) => (
                  <tr key={p.id} data-advisor-id={p.id}>
                    <td className="advisor-name">
                      <div className="advisor-name-actions">
                        <button
                          type="button"
                          className="advisor-detail-trigger"
                          aria-label={`Detalle de ${p.name}`}
                          title="Ver evolución y detalle de ventas"
                          onClick={() => setDetail(p)}
                        >
                          ⓘ
                        </button>
                        <EffectivenessCell
                          label={`Nombre del asesor ${p.name}`}
                          value={p.name}
                          onError={setMessage}
                          onSave={async (name) => {
                            if (!name.trim() || name.length > 100)
                              throw Error("Nombre de 1 a 100 caracteres.");
                            await write("meta-ads/advisors", "PATCH", {
                              id: p.id,
                              name: name.trim(),
                              revision: p.revision,
                            });
                          }}
                        />
                      </div>
                    </td>
                    {days.map((d) => {
                      const c = p.days[d];
                      return (
                        <AdvisorDay
                          key={d}
                          person={p}
                          day={d}
                          cell={c}
                          disabled={busy || loading}
                          onError={setMessage}
                          onAbsenceSave={async (input) => {
                            await write(
                              "meta-ads/advisors/absence",
                              "PATCH",
                              input,
                            );
                          }}
                          onSave={async (status) => {
                            await write(
                              "meta-ads/advisors/attendance",
                              "PATCH",
                              {
                                advisorId: p.id,
                                day: d,
                                status,
                                revision: c.revision,
                              },
                            );
                          }}
                        />
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
          {!loading && !filtered.length && (
            <p className="hint">
              {rows.length
                ? "No hay asesores que coincidan con la búsqueda."
                : "Añade un asesor para empezar."}
            </p>
          )}
        </div>
      )}
      {detail && (
        <AdvisorDetail
          person={detail}
          tables={tables}
          initialTableId={tableId}
          initialAliasId={aliasId}
          initialCountry={country}
          initialSince={since}
          initialUntil={until}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}
function FragmentHeaders() {
  return (
    <>
      <th scope="col" title="Asistencia" aria-label="Asistencia">
        A
      </th>
      <th scope="col" title="Ventas" aria-label="Ventas">
        V
      </th>
      <th scope="col" title="Horas ausentes" aria-label="Horas ausentes">
        H
      </th>
    </>
  );
}
function AdvisorDay({
  person,
  day,
  cell,
  disabled,
  onError,
  onSave,
  onAbsenceSave,
}: {
  person: Person;
  day: string;
  cell: Day;
  disabled: boolean;
  onError: (v: string) => void;
  onSave: (v: Attendance) => Promise<void>;
  onAbsenceSave: (
    v: import("../../lib/meta-ads/advisor-absence").AbsenceInput,
  ) => Promise<void>;
}) {
  return (
    <>
      <td className="advisor-attendance" data-status={cell.status ?? ""}>
        {disabled ? (
          <span>
            {statuses.find((s) => s.value === (cell.status ?? ""))?.label}
          </span>
        ) : (
          <SheetSearchSelect
            compact
            displayLabel
            placeholder="Sin registrar"
            label={`Asistencia ${person.name} ${day}`}
            value={cell.status ?? ""}
            options={statuses}
            onSelect={(v) => onSave((v || null) as Attendance)}
            onError={onError}
          />
        )}
      </td>
      <td
        title={
          cell.partial
            ? "Faltan ventas en algunas filas asignadas"
            : "Ventas de las filas asignadas"
        }
      >
        {cell.na
          ? "N.A."
          : cell.sales === null
            ? "—"
            : new Intl.NumberFormat("es-PE").format(cell.sales)}
        {cell.partial ? " *" : ""}
      </td>
      <td className="advisor-hours">
        <AdvisorAbsenceCell
          advisorId={person.id}
          name={person.name}
          day={day}
          value={cell.absence}
          disabled={disabled}
          onSave={onAbsenceSave}
          onError={onError}
        />
      </td>
    </>
  );
}
