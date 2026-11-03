"use client";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { CurrentUserId } from "./role-guide";
import { categoryKey } from "../../lib/meta-ads/category-paste";
import { countryName } from "../../lib/meta-ads/countries";
import type { HistoryFile } from "../../lib/meta-ads/financial-history-import";
import {
  prepareHistoryChoices,
  historyMatches,
  type HistoryOptions as Options,
  type HistoryChoices as Choices,
} from "../../lib/meta-ads/history-matching";
function initialChoices(f: HistoryFile, options: Options): Choices {
  if (
    f.version !== 1 ||
    !Array.isArray(f.diplomas) ||
    !Array.isArray(f.advisors) ||
    !Array.isArray(f.totals) ||
    !Array.isArray(f.manual)
  )
    throw Error("Usa el archivo histórico preparado.");
  return prepareHistoryChoices(f, options);
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
    [replace, setReplace] = useState(false),
    [createConfirmed, setCreateConfirmed] = useState<string[]>([]),
    [adjusting, setAdjusting] = useState(false);
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
        setCreateConfirmed([]);
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
  const matches = useMemo(
    () =>
      file && choices && options
        ? historyMatches(file, options, choices)
        : null,
    [file, choices, options],
  );
  const pendingDiplomas =
    matches?.diplomas.filter(
      (r) =>
        !r.selected &&
        r.candidates.length > 1 &&
        !createConfirmed.includes(r.key),
    ) ?? [];
  const pendingPeople =
    matches?.people.filter(
      (r) =>
        !r.selected &&
        r.candidates.length > 1 &&
        !createConfirmed.includes("person:" + r.key),
    ) ?? [];
  function reselect(next: Choices) {
    if (!file || !options) return;
    setChoices(prepareHistoryChoices(file, options, next));
    setCreateConfirmed([]);
    resetPreview();
  }
  async function run(commit: boolean) {
    if (
      !file ||
      !choices ||
      flight.current ||
      pendingDiplomas.length ||
      pendingPeople.length
    )
      return;
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
                      setCreateConfirmed([]);
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
                            reselect({
                              ...choices,
                              [key]: e.target.value,
                              ...(key === "advisorListId"
                                ? { people: {} }
                                : {}),
                              ...(key === "inventoryListId"
                                ? { aliases: {}, catalog: {} }
                                : {}),
                            });
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
                  <details>
                    <summary>
                      Hojas de destino por país · {choices.tables.length}{" "}
                      preparadas
                    </summary>
                    <div className="history-import-targets">
                      {choices.tables.map((c) => (
                        <label key={c.country}>
                          {countryName(c.country)}
                          <select
                            value={c.tableId ?? ""}
                            disabled={busy}
                            onChange={(e) => {
                              const keep = (map: Record<string, string>) =>
                                Object.fromEntries(
                                  Object.entries(map).filter(
                                    ([k]) => !k.startsWith(c.country + "|"),
                                  ),
                                );
                              reselect({
                                ...choices,
                                tables: choices.tables.map((t) =>
                                  t.country === c.country
                                    ? { ...t, tableId: e.target.value || null }
                                    : t,
                                ),
                                aliases: keep(choices.aliases),
                                catalog: keep(choices.catalog),
                              });
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
                  {matches && (
                    <>
                      <p className="history-matching-summary" role="status">
                        <strong>
                          Equivalencias preparadas automáticamente
                        </strong>
                        <br />
                        {matches.diplomas.filter((r) => r.selected).length}{" "}
                        diplomados reconocidos ·{" "}
                        {matches.people.filter((r) => r.selected).length}{" "}
                        asesores reconocidos ·{" "}
                        {pendingDiplomas.length + pendingPeople.length} por
                        revisar.
                      </p>
                      {(pendingDiplomas.length > 0 ||
                        pendingPeople.length > 0) && (
                        <section className="history-matching-pending">
                          <h3>Solo estas coincidencias necesitan revisión</h3>
                          <p>
                            Hay varias fichas posibles. Las demás ya están
                            seleccionadas.
                          </p>
                          {pendingDiplomas.map((r) => (
                            <label key={r.key}>
                              {r.country} · {r.source}
                              <select
                                aria-label={
                                  "Resolver " + r.country + " " + r.source
                                }
                                value=""
                                disabled={busy}
                                onChange={(e) => {
                                  if (e.target.value === "__new") {
                                    setCreateConfirmed((v) => [...v, r.key]);
                                    resetPreview();
                                    return;
                                  }
                                  const aliases = { ...choices.aliases },
                                    catalog = { ...choices.catalog };
                                  delete aliases[r.key];
                                  delete catalog[r.key];
                                  const tableId = choices.tables.find(
                                    (t) => t.country === r.country,
                                  )?.tableId;
                                  const local =
                                    e.target.value.startsWith("alias:") &&
                                    options.aliases.find(
                                      (a) =>
                                        a.id === e.target.value.slice(6) &&
                                        a.tableId === tableId,
                                    );
                                  if (local) aliases[r.key] = local.id;
                                  else catalog[r.key] = e.target.value;
                                  setChoices({ ...choices, aliases, catalog });
                                  resetPreview();
                                }}
                              >
                                <option value="">
                                  Elige entre las coincidencias
                                </option>
                                {r.candidates.map((c) => (
                                  <option key={c.ref} value={c.ref}>
                                    {c.name}
                                  </option>
                                ))}
                                <option value="__new">
                                  Crear un diplomado diferente con el nombre de
                                  origen
                                </option>
                              </select>
                            </label>
                          ))}
                          {pendingPeople.map((r) => (
                            <label key={r.key}>
                              {r.source}
                              <select
                                aria-label={"Resolver asesor " + r.source}
                                value=""
                                disabled={busy}
                                onChange={(e) => {
                                  if (e.target.value === "__new") {
                                    setCreateConfirmed((v) => [
                                      ...v,
                                      "person:" + r.key,
                                    ]);
                                    resetPreview();
                                    return;
                                  }
                                  setChoices({
                                    ...choices,
                                    people: {
                                      ...choices.people,
                                      [r.key]: e.target.value,
                                    },
                                  });
                                  resetPreview();
                                }}
                              >
                                <option value="">
                                  Elige entre las coincidencias
                                </option>
                                {r.candidates.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                                <option value="__new">
                                  Crear otra persona con este nombre
                                </option>
                              </select>
                            </label>
                          ))}
                        </section>
                      )}
                      <details>
                        <summary>
                          Ver diplomados reconocidos y nuevos ·{" "}
                          {matches.diplomas.length}
                        </summary>
                        <div className="history-import-mapping-table">
                          <table>
                            <thead>
                              <tr>
                                <th>País</th>
                                <th>Nombre de origen</th>
                                <th>Diplomado de destino</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.diplomas.map((r) => (
                                <tr key={r.key}>
                                  <td>{r.country}</td>
                                  <td>{r.source}</td>
                                  <td>
                                    {r.selected ??
                                      (r.candidates.length > 1 &&
                                      !createConfirmed.includes(r.key)
                                        ? "Por revisar"
                                        : "Nuevo: " + r.source)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                      <details>
                        <summary>
                          Ver asesores reconocidos y nuevos ·{" "}
                          {matches.people.length}
                        </summary>
                        <div className="history-import-mapping-table">
                          <table>
                            <thead>
                              <tr>
                                <th>Nombre de origen</th>
                                <th>Asesor de destino</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.people.map((r) => (
                                <tr key={r.key}>
                                  <td>{r.source}</td>
                                  <td>
                                    {r.selected ??
                                      (r.candidates.length > 1 &&
                                      !createConfirmed.includes(
                                        "person:" + r.key,
                                      )
                                        ? "Por revisar"
                                        : "Nuevo: " + r.source)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                      <details
                        onToggle={(e) => setAdjusting(e.currentTarget.open)}
                      >
                        <summary>
                          Ajustar una equivalencia reconocida (opcional)
                        </summary>
                        {adjusting && (
                          <div className="history-import-targets">
                            {matches.people.map((r) => (
                              <label key={r.key}>
                                {r.source}
                                <select
                                  aria-label={"Asesor de " + r.source}
                                  value={choices.people[r.key] ?? ""}
                                  disabled={busy}
                                  onChange={(e) => {
                                    const people = { ...choices.people };
                                    if (e.target.value)
                                      people[r.key] = e.target.value;
                                    else {
                                      delete people[r.key];
                                      setCreateConfirmed((v) => [
                                        ...v,
                                        "person:" + r.key,
                                      ]);
                                    }
                                    setChoices({ ...choices, people });
                                    resetPreview();
                                  }}
                                >
                                  <option value="">
                                    Crear con este nombre
                                  </option>
                                  {options.people
                                    .filter(
                                      (p) =>
                                        p.sheetId === choices.advisorListId,
                                    )
                                    .map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ))}
                            {matches.diplomas.map((r) => {
                              const tableId = choices.tables.find(
                                (t) => t.country === r.country,
                              )?.tableId;
                              return (
                                <label key={r.key}>
                                  {r.country} · {r.source}
                                  <select
                                    aria-label={
                                      "Diplomado de " +
                                      r.country +
                                      " " +
                                      r.source
                                    }
                                    value={
                                      choices.aliases[r.key]
                                        ? "local:" + choices.aliases[r.key]
                                        : (choices.catalog[r.key] ?? "")
                                    }
                                    disabled={busy}
                                    onChange={(e) => {
                                      const aliases = { ...choices.aliases },
                                        catalog = { ...choices.catalog };
                                      delete aliases[r.key];
                                      delete catalog[r.key];
                                      if (e.target.value.startsWith("local:"))
                                        aliases[r.key] =
                                          e.target.value.slice(6);
                                      else if (e.target.value)
                                        catalog[r.key] = e.target.value;
                                      else
                                        setCreateConfirmed((v) => [
                                          ...v,
                                          r.key,
                                        ]);
                                      setChoices({
                                        ...choices,
                                        aliases,
                                        catalog,
                                      });
                                      resetPreview();
                                    }}
                                  >
                                    <option value="">
                                      Crear con este nombre
                                    </option>
                                    {options.aliases
                                      .filter((a) => a.tableId === tableId)
                                      .map((a) => (
                                        <option
                                          key={"local:" + a.id}
                                          value={"local:" + a.id}
                                        >
                                          {a.name}
                                        </option>
                                      ))}
                                    {options.items
                                      .filter(
                                        (i) =>
                                          i.sheetId === choices.inventoryListId,
                                      )
                                      .map((i) => (
                                        <option
                                          key={"item:" + i.id}
                                          value={"item:" + i.id}
                                        >
                                          {i.name} · catálogo
                                        </option>
                                      ))}
                                    {options.aliases
                                      .filter(
                                        (a) =>
                                          a.inventorySheetId ===
                                            choices.inventoryListId &&
                                          a.tableId !== tableId,
                                      )
                                      .map((a) => (
                                        <option
                                          key={"alias:" + a.id}
                                          value={"alias:" + a.id}
                                        >
                                          {a.name} · catálogo
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </details>
                    </>
                  )}
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
                      pendingDiplomas.length > 0 ||
                      pendingPeople.length > 0 ||
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
