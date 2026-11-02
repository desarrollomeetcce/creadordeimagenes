"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { countryName } from "../../lib/meta-ads/countries";
import type { HistoryFile } from "../../lib/meta-ads/financial-history-import";
type Options = {
  people: { id: string; name: string; sheetId: string }[];
  tables: { id: string; name: string; defaultCountry: string }[];
  sheets: { id: string; name: string; kind: string }[];
  aliases: { id: string; name: string; tableId: string }[];
};
type Choices = {
  inventoryListId: string;
  advisorListId: string;
  totalsListId: string;
  tables: { country: string; tableId: string | null }[];
  aliases: Record<string, string>;
  people: Record<string, string>;
};
function initialChoices(f: HistoryFile, options: Options): Choices {
  if (
    f.version !== 1 ||
    !Array.isArray(f.diplomas) ||
    !Array.isArray(f.advisors) ||
    !Array.isArray(f.totals) ||
    !Array.isArray(f.manual)
  )
    throw Error(
      "Usa el archivo de importación preparado, no el Excel original.",
    );
  const countries = [
    ...new Set(
      [...f.diplomas, ...f.advisors, ...f.totals, ...f.manual].map(
        (r) => r.country,
      ),
    ),
  ].sort();
  const pick = (kind: string) => {
    const found = options.sheets.filter((s) => s.kind === kind);
    return found.length === 1 ? found[0].id : "";
  };
  return {
    inventoryListId: pick("INVENTORY"),
    advisorListId: pick("ADVISORS"),
    totalsListId: pick("TOTALS"),
    tables: countries.map((country) => {
      const found = options.tables.filter(
        (t) =>
          t.defaultCountry === country ||
          categoryKey(t.name) === categoryKey(countryName(country)),
      );
      return { country, tableId: found.length === 1 ? found[0].id : null };
    }),
    aliases: {},
    people: {},
  };
}
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/meta-ads/history-import/" + path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(150000),
    cache: "no-store",
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la importación.");
  return b;
}
export function FinancialHistoryImport() {
  const userId = useContext(CurrentUserId),
    dialog = useRef<HTMLDialogElement>(null),
    flight = useRef(false);
  const [open, setOpen] = useState(false),
    [preparedKey, setPreparedKey] = useState<string | null>(null),
    [preparedBusy, setPreparedBusy] = useState(false),
    [options, setOptions] = useState<Options | null>(null),
    [file, setFile] = useState<HistoryFile | null>(null),
    [choices, setChoices] = useState<Choices | null>(null),
    [preview, setPreview] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [replace, setReplace] = useState(false);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      if (!options)
        void api("options")
          .then(setOptions)
          .catch((e) => setError(e.message));
    }
  }, [open, options]);
  useEffect(() => {
    const consumeLink = () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const key = fragment.get("historyImport");
      if (!key) return;
      fragment.delete("historyImport");
      const rest = fragment.toString();
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname +
          window.location.search +
          (rest ? "#" + rest : ""),
      );
      setPreparedKey(key);
      setOpen(true);
    };
    consumeLink();
    window.addEventListener("hashchange", consumeLink);
    return () => window.removeEventListener("hashchange", consumeLink);
  }, []);
  useEffect(() => {
    if (!open || !options || !preparedKey) return;
    let active = true;
    setPreparedBusy(true);
    setError("");
    void api("prepared", { key: preparedKey })
      .then((f: HistoryFile) => {
        if (!active) return;
        setChoices(initialChoices(f, options));
        setFile(f);
        setPreview(null);
        setReceipt(null);
        setReviewed(false);
        setReplace(false);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) {
          setPreparedBusy(false);
          setPreparedKey(null);
        }
      });
    return () => {
      active = false;
    };
  }, [open, options, preparedKey]);
  function resetPreview() {
    setPreview(null);
    setReviewed(false);
    setReplace(false);
    setError("");
  }
  const aliasRows = file
    ? [
        ...new Map(
          file.diplomas.map((r) => [r.country + "|" + categoryKey(r.name), r]),
        ).entries(),
      ]
    : [];
  async function run(commit: boolean) {
    if (!file || !choices || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(commit ? "commit" : "preview", {
        file,
        choices,
        ...(commit ? { token: preview.token, replaceConflicts: replace } : {}),
      });
      if (commit) setReceipt(result);
      else {
        setPreview(result);
        setReviewed(false);
        if (result.previous) setReceipt({ ...result.previous, reused: true });
      }
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "No se confirmó la operación.") +
          (commit
            ? " Revisa de nuevo este mismo archivo antes de otro intento."
            : ""),
      );
      if (commit) setPreview(null);
    } finally {
      setBusy(false);
      flight.current = false;
    }
  }
  function close() {
    if (busy || preparedBusy) return;
    dialog.current?.close();
    setOpen(false);
  }
  function showImported() {
    if (!choices || !file) return;
    const tableIds = receipt?.tableIds ?? receipt?.summary?.tableIds ?? [];
    for (const [sheetId, vals] of [
      [
        choices.totalsListId,
        {
          since: file.source.salesSince,
          until: file.source.marketingUntil,
          selected: tableIds,
          country: "",
          currency: "PEN",
        },
      ],
      [
        choices.advisorListId,
        {
          since: file.source.salesSince,
          until: file.source.salesUntil,
          tableId: "all",
          country: "",
          aliasId: "",
        },
      ],
    ] as const) {
      for (const [k, v] of Object.entries(vals))
        localStorage.setItem(
          `effectiveness-tab:v1:${userId}:${sheetId}:${k}`,
          JSON.stringify(v),
        );
    }
    const locationKey = "effectiveness-location:v1:" + userId;
    const location = JSON.stringify({
      tableId: tableIds[0] ?? "",
      specialId: choices.totalsListId,
      kind: "TOTALS",
      view: "manual",
    });
    localStorage.setItem(locationKey, location);
    sessionStorage.setItem(locationKey, location);
    window.location.reload();
  }
  return (
    <>
      <button
        type="button"
        className="sheet-history-import-trigger"
        onClick={() => setOpen(true)}
      >
        Importar histórico
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="meta-detail financial-history-import"
          aria-label="Importar histórico de ventas y marketing"
          onCancel={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <header className="row spread">
            <h2>Importar histórico</h2>
            <button type="button" disabled={busy} onClick={close}>
              Cerrar
            </button>
          </header>
          <p>
            Ventas por diplomado con vendedor desconocido, totales
            independientes por asesor y país, BM y GM. No modifica campañas ni
            datos originales de Meta.
          </p>
          {preparedBusy && (
            <p role="status">Preparando tu histórico privado…</p>
          )}
          {!receipt && !preparedBusy && (
            <>
              <label>
                Archivo preparado para la plataforma (opcional si abriste el
                enlace privado)
                <input
                  type="file"
                  accept=".json,application/json"
                  disabled={busy || preparedBusy || !options}
                  onChange={async (e) => {
                    const selected = e.currentTarget.files?.[0];
                    if (!selected || !options) return;
                    resetPreview();
                    try {
                      if (selected.size > 1800000)
                        throw Error(
                          "Divide el archivo: máximo 1,8 MB por carga.",
                        );
                      const f = JSON.parse(
                        await selected.text(),
                      ) as HistoryFile;
                      if (
                        f.version !== 1 ||
                        !Array.isArray(f.diplomas) ||
                        !Array.isArray(f.advisors) ||
                        !Array.isArray(f.totals) ||
                        !Array.isArray(f.manual)
                      )
                        throw Error(
                          "Usa el archivo de importación preparado, no el Excel original.",
                        );
                      setChoices(initialChoices(f, options));
                      setFile(f);
                    } catch (e) {
                      setFile(null);
                      setChoices(null);
                      setError(
                        e instanceof Error ? e.message : "Archivo no válido.",
                      );
                    }
                  }}
                />
              </label>
              {file && choices && options && (
                <>
                  <p>
                    <strong>{file.source.title}</strong> · Ventas{" "}
                    {file.source.salesSince} — {file.source.salesUntil};
                    marketing {file.source.marketingSince} —{" "}
                    {file.source.marketingUntil}.
                  </p>
                  <div className="history-import-targets">
                    {(
                      [
                        ["inventoryListId", "INVENTORY", "Lista de diplomados"],
                        ["advisorListId", "ADVISORS", "Asesores"],
                        ["totalsListId", "TOTALS", "Por totales de día"],
                      ] as const
                    ).map(([key, kind, label]) => (
                      <label key={key}>
                        {label}
                        <select
                          value={choices[key]}
                          disabled={busy}
                          onChange={(e) => {
                            setChoices({
                              ...choices,
                              [key]: e.target.value,
                              ...(key === "advisorListId"
                                ? { people: {} }
                                : {}),
                            });
                            resetPreview();
                          }}
                        >
                          <option value="">Elige una pestaña</option>
                          {options.sheets
                            .filter((s) => s.kind === kind)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <details open>
                    <summary>Hojas de destino por país</summary>
                    <div className="history-import-targets">
                      {choices.tables.map((c) => (
                        <label key={c.country}>
                          {countryName(c.country)}
                          <select
                            value={c.tableId ?? ""}
                            disabled={busy}
                            onChange={(e) => {
                              setChoices({
                                ...choices,
                                tables: choices.tables.map((t) =>
                                  t.country === c.country
                                    ? { ...t, tableId: e.target.value || null }
                                    : t,
                                ),
                                aliases: {},
                              });
                              resetPreview();
                            }}
                          >
                            <option value="">
                              Crear hoja {countryName(c.country)}
                            </option>
                            {options.tables.map((t) => (
                              <option value={t.id} key={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </details>
                  <details open>
                    <summary>Equivalencias de asesores</summary>
                    <p>
                      Relaciona los nombres completos del archivo con los
                      asesores que ya tienes para evitar duplicados por
                      abreviaturas.
                    </p>
                    <div className="history-import-targets">
                      {[...new Set(file.advisors.map((r) => r.name))].map(
                        (name) => {
                          const key = categoryKey(name),
                            people = options.people.filter(
                              (p) => p.sheetId === choices.advisorListId,
                            ),
                            exact = people.find(
                              (p) => categoryKey(p.name) === key,
                            );
                          return (
                            <label key={key}>
                              {name}
                              <select
                                disabled={busy}
                                value={choices.people[key] ?? ""}
                                onChange={(e) => {
                                  const next = { ...choices.people };
                                  if (e.target.value)
                                    next[key] = e.target.value;
                                  else delete next[key];
                                  setChoices({ ...choices, people: next });
                                  resetPreview();
                                }}
                              >
                                <option value="">
                                  {exact
                                    ? "Usar " + exact.name
                                    : "Crear con este nombre"}
                                </option>
                                {people.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        },
                      )}
                    </div>
                  </details>
                  <details>
                    <summary>
                      Equivalencias de diplomados · revisar nombres abreviados
                    </summary>
                    <p>
                      Elige la ficha existente cuando un nombre abreviado
                      corresponda a un diplomado con título completo. Sin
                      equivalencia ni nombre coincidente se creará una ficha con
                      el nombre del archivo.
                    </p>
                    <div className="history-import-aliases">
                      {aliasRows.map(([key, r]) => {
                        const tableId = choices.tables.find(
                            (t) => t.country === r.country,
                          )?.tableId,
                          aliases = options.aliases.filter(
                            (a) => a.tableId === tableId,
                          ),
                          exact = aliases.find(
                            (a) => categoryKey(a.name) === categoryKey(r.name),
                          );
                        return (
                          <label key={key}>
                            {r.country} · {r.name}
                            <select
                              value={choices.aliases[key] ?? ""}
                              disabled={busy}
                              onChange={(e) => {
                                const next = { ...choices.aliases };
                                if (e.target.value) next[key] = e.target.value;
                                else delete next[key];
                                setChoices({ ...choices, aliases: next });
                                resetPreview();
                              }}
                            >
                              <option value="">
                                {exact
                                  ? "Usar " + exact.name
                                  : "Crear con este nombre"}
                              </option>
                              {aliases.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                  <details>
                    <summary>Notas del archivo</summary>
                    <ul>
                      {file.source.notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </details>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !choices.inventoryListId ||
                      !choices.advisorListId ||
                      !choices.totalsListId
                    }
                    onClick={() => void run(false)}
                  >
                    Revisar archivo
                  </button>
                  {preview && (
                    <section className="history-import-preview">
                      <h3>Vista previa</h3>
                      <p>
                        Diplomados: {preview.summary.diplomaSales} ventas ·
                        Asesores: {preview.summary.advisorSales} · Total por
                        país: {preview.summary.countrySales}. Son vistas
                        independientes, no cantidades para sumar entre sí.
                      </p>
                      <p>
                        {preview.summary.diplomaDays} celdas de diplomados ·{" "}
                        {preview.summary.advisorDays} registros personales ·{" "}
                        {preview.summary.manualCells} celdas BM/GM.
                      </p>
                      <details>
                        <summary>
                          Se crearán {preview.summary.newTables.length} hojas,{" "}
                          {preview.summary.newDiplomas.length} fichas por hoja y{" "}
                          {preview.summary.newAdvisors.length} asesores
                        </summary>
                        <ul>
                          {preview.summary.newTables.map((n: string) => (
                            <li key={n}>Hoja: {n}</li>
                          ))}
                          {preview.summary.newDiplomas.map(
                            (r: any, i: number) => (
                              <li key={i}>
                                {r.country}: {r.name}
                              </li>
                            ),
                          )}
                          {preview.summary.newAdvisors.map((n: string) => (
                            <li key={n}>Asesor: {n}</li>
                          ))}
                        </ul>
                      </details>
                      {!!preview.summary.conflicts.length && (
                        <>
                          <h4>Valores existentes diferentes</h4>
                          <ul>
                            {preview.summary.conflicts.map(
                              (c: any, i: number) => (
                                <li key={i}>
                                  {c.label}: {String(c.old)} → {String(c.next)}
                                  {c.blocked
                                    ? " · Resolver antes en la hoja"
                                    : ""}
                                </li>
                              ),
                            )}
                          </ul>
                          <label>
                            <input
                              type="checkbox"
                              checked={replace}
                              disabled={
                                busy ||
                                preview.summary.conflicts.some(
                                  (c: any) => c.blocked,
                                )
                              }
                              onChange={(e) => setReplace(e.target.checked)}
                            />
                            Reemplazar solo los valores en conflicto de este
                            archivo; conservar copia anterior en el registro de
                            importación.
                          </label>
                        </>
                      )}
                      <p>
                        Las ventas ya atribuidas a personas que coincidan se
                        conservan. Los nuevos datos sin vendedor quedan como «Se
                        desconoce». Fechas, asistencias y campañas actuales no
                        cambian.
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(e) => setReviewed(e.target.checked)}
                          disabled={busy}
                        />
                        Revisé destinos, equivalencias y cantidades de esta
                        carga.
                      </label>
                      <button
                        type="button"
                        className="primary"
                        disabled={
                          busy ||
                          !reviewed ||
                          preview.summary.conflicts.some(
                            (c: any) => c.blocked,
                          ) ||
                          (preview.summary.conflicts.length > 0 && !replace)
                        }
                        onClick={() => void run(true)}
                      >
                        {busy ? "Importando…" : "Confirmar importación"}
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}
          {receipt && (
            <section role="status">
              <h3>
                {receipt.reused
                  ? "Esta carga ya estaba guardada"
                  : "Histórico guardado"}
              </h3>
              <p>
                Registro {receipt.id}. No se sumó una segunda copia de las
                ventas.
              </p>
              <button type="button" onClick={showImported}>
                Ver datos importados
              </button>
            </section>
          )}
          {error && <p role="alert">{error}</p>}
          {busy && (
            <p role="status">Procesando. Mantén esta ventana abierta.</p>
          )}
        </dialog>
      )}
    </>
  );
}
