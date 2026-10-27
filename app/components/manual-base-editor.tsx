"use client";
import { useEffect, useRef, useState } from "react";
import { engineRequest as api } from "./generation-engine";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryOptions } from "../../lib/meta-ads/countries";
import { notifyAdvisorSalesChanged } from "./advisor-sales-events";
import type {
  ManualBaseReview,
  ManualBaseScope,
} from "../../lib/meta-ads/manual-base";
type Table = { id: string; name: string };
type Entry = { id: number; advisorId: string | null; quantity: string };
type CountryEntry = {
  id: number;
  tableId: string;
  country: string;
  quantity: string;
  review?: ManualBaseReview;
  initialUnassigned: string;
  error?: string;
};
type Context =
  | { kind: "total"; scope: ManualBaseScope }
  | {
      kind: "advisor";
      advisorId: string;
      name: string;
      day: string;
      tableId: string;
      country: string;
    };
const amount = (text: string) =>
  /^\d+$/.test(text) &&
  Number.isSafeInteger(Number(text)) &&
  Number(text) <= 100000000;
export function ManualBaseEditor({
  context,
  metric = "BM",
  tables,
  onClose,
  onChanged,
}: {
  context: Context;
  metric?: "BM" | "BA";
  tables: Table[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const displayMetric = metric === "BA" ? "BC" : "BM";
  const baseName = metric === "BA" ? "Base por contactar" : "Base manual";
  const endpoint = metric === "BA" ? "advisor-base" : "manual-base";
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false),
    nextId = useRef(1),
    autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [review, setReview] = useState<ManualBaseReview | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [countries, setCountries] = useState<CountryEntry[]>([]),
    [removed, setRemoved] = useState<ManualBaseReview[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false),
    [reload, setReload] = useState(0);
  const day = context.kind === "total" ? context.scope.day : context.day;
  const latest = useRef({ review, entries, countries, removed });
  latest.current = { review, entries, countries, removed };
  const lastSaved = useRef("");
  const dirty = useRef(false);
  const autoPaused = useRef(false);
  const signature = () =>
    JSON.stringify(
      context.kind === "total"
        ? latest.current.entries.map((r) => [r.advisorId, r.quantity])
        : [
            latest.current.countries.map((r) => [
              r.tableId,
              r.country,
              r.quantity,
              r.initialUnassigned,
            ]),
            latest.current.removed.map((r) => [r.tableId, r.country]),
          ],
    );
  const newCountry = (): CountryEntry => ({
    id: nextId.current++,
    tableId:
      context.kind === "advisor" && context.tableId !== "all"
        ? context.tableId
        : tables.length === 1
          ? tables[0].id
          : "",
    country: context.kind === "advisor" ? context.country : "",
    quantity: "",
    initialUnassigned: "0",
  });
  const contextKey = JSON.stringify([context, metric]);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    setSaved(false);
    dirty.current = false;
    autoPaused.current = false;
    lastSaved.current = "";
    const request =
      context.kind === "total"
        ? "meta-ads/" +
          endpoint +
          "?" +
          new URLSearchParams(
            Object.entries(context.scope).filter(
              ([, v]) => v !== undefined,
            ) as [string, string][],
          )
        : "meta-ads/manual-base/advisor?" +
          new URLSearchParams({
            advisorId: context.advisorId,
            day,
            tableId: context.tableId,
            country: context.country,
          });
    void api(request)
      .then((v) => {
        if (!active) return;
        if (context.kind === "total") {
          setReview(v);
          setEntries(
            v.allocations.length
              ? v.allocations.map(
                  (r: { advisorId: string | null; quantity: number }) => ({
                    ...r,
                    id: nextId.current++,
                    quantity: String(r.quantity),
                  }),
                )
              : [{ id: nextId.current++, advisorId: "__choose", quantity: "" }],
          );
        } else {
          setCountries(
            v.buckets.length
              ? v.buckets.map((r: ManualBaseReview) => ({
                  id: nextId.current++,
                  tableId: r.tableId,
                  country: r.country,
                  quantity: String(
                    r.allocations.find(
                      (a) => a.advisorId === context.advisorId,
                    )!.quantity,
                  ),
                  review: r,
                  initialUnassigned: "0",
                }))
              : [newCountry()],
          );
          setRemoved([]);
        }
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
  }, [contextKey, reload]);
  const valid = () => {
    const current = latest.current;
    if (loading) return false;
    if (context.kind === "total")
      return (
        !!current.review &&
        current.entries.length > 0 &&
        current.entries.every(
          (r) => r.advisorId !== "__choose" && amount(r.quantity),
        ) &&
        new Set(current.entries.map((r) => r.advisorId)).size ===
          current.entries.length &&
        current.entries.reduce((n, r) => n + Number(r.quantity), 0) <=
          1000000000
      );
    return (
      (current.countries.length > 0 || current.removed.length > 0) &&
      current.countries.every(
        (r) =>
          !!r.review &&
          !r.error &&
          amount(r.quantity) &&
          (!r.review.legacy.length ||
            r.review.exists ||
            amount(r.initialUnassigned)),
      ) &&
      new Set(
        current.countries.map((r) => JSON.stringify([r.tableId, r.country])),
      ).size === current.countries.length
    );
  };
  const save = async (close = false, state?: "EMPTY" | "NA") => {
    if (pending.current) return;
    if (!state && !valid()) {
      if (close)
        setMessage(
          "Selecciona hoja, país o asesor y completa cantidades enteras no negativas; evita filas repetidas.",
        );
      return;
    }
    if (!state && lastSaved.current === signature()) {
      if (close) onClose();
      return;
    }
    if (autoTimer.current) clearTimeout(autoTimer.current);
    pending.current = true;
    setBusy(true);
    setMessage("");
    let committed = false;
    const current = latest.current;
    try {
      if (context.kind === "total") {
        const v: ManualBaseReview = await api("meta-ads/" + endpoint, "POST", {
          ...context.scope,
          token: current.review!.token,
          state: state ?? "VALUE",
          allocations: state
            ? []
            : current.entries.map((r) => ({
                advisorId: r.advisorId,
                quantity: Number(r.quantity),
              })),
        });
        committed = true;
        latest.current.review = v;
        setReview(v);
        if (state) {
          setEntries([]);
          latest.current.entries = [];
        }
      } else {
        const changes = [
          ...current.countries.map((r) => ({
            tableId: r.tableId,
            country: r.country,
            token: r.review!.token,
            quantity: Number(r.quantity),
            ...(!r.review!.exists && r.review!.legacy.length
              ? { initialUnassigned: Number(r.initialUnassigned) }
              : {}),
          })),
          ...current.removed
            .filter(
              (r) =>
                !current.countries.some(
                  (c) => c.tableId === r.tableId && c.country === r.country,
                ),
            )
            .map((r) => ({
              tableId: r.tableId,
              country: r.country,
              token: r.token,
              quantity: null,
            })),
        ];
        const result: { buckets: ManualBaseReview[] } = await api(
          "meta-ads/manual-base/advisor",
          "POST",
          { advisorId: context.advisorId, day, changes },
        );
        committed = true;
        const updated = current.countries.map((r) => ({
          ...r,
          review:
            result.buckets.find(
              (b) => b.tableId === r.tableId && b.country === r.country,
            ) ?? r.review,
        }));
        setCountries(updated);
        latest.current.countries = updated;
        setRemoved([]);
        latest.current.removed = [];
      }
      lastSaved.current = signature();
      setSaved(true);
      dirty.current = false;
      autoPaused.current = false;
      notifyAdvisorSalesChanged();
      await onChanged();
      if (close) onClose();
    } catch (e) {
      autoPaused.current = true;
      const status =
        typeof e === "object" && e !== null && "status" in e
          ? Number(e.status)
          : 0;
      setMessage(
        (committed
          ? "La base quedó guardada, pero no se pudo actualizar la vista. "
          : status >= 400 && status < 500
            ? "No se pudo guardar. "
            : "No se confirmó el guardado. El borrador se conserva; pulsa Actualizar reparto para consultar los datos antes de continuar. ") +
          (e instanceof Error ? e.message : ""),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const schedule = () => {
    if (!dirty.current || autoPaused.current) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLInputElement &&
        focused.type === "number" &&
        dialog.current?.contains(focused)
      )
        return;
      void save();
    }, 250);
  };
  const close = () => {
    if (busy) return;
    if (dirty.current && valid() && !autoPaused.current) {
      void save(true);
      return;
    }
    onClose();
  };
  const total =
    context.kind === "total"
      ? entries.reduce(
          (n, r) => n + (amount(r.quantity) ? Number(r.quantity) : 0),
          0,
        )
      : countries.reduce(
          (n, r) => n + (amount(r.quantity) ? Number(r.quantity) : 0),
          0,
        );
  const draftKnown =
    context.kind === "total"
      ? entries.some((r) => amount(r.quantity))
      : countries.some((r) => amount(r.quantity));
  const changePair = (id: number, tableId: string, country: string) => {
    const old = countries.find((r) => r.id === id)!;
    if (
      old.review?.exists &&
      old.review.allocations.some(
        (a) => context.kind === "advisor" && a.advisorId === context.advisorId,
      )
    )
      setRemoved((v) => [
        ...v.filter(
          (r) => r.tableId !== old.tableId || r.country !== old.country,
        ),
        old.review!,
      ]);
    setCountries((v) =>
      v.map((r) =>
        r.id === id
          ? {
              ...r,
              tableId,
              country,
              review: undefined,
              error: undefined,
              initialUnassigned: "0",
            }
          : r,
      ),
    );
    setSaved(false);
    dirty.current = true;
  };
  return (
    <dialog
      ref={dialog}
      className="meta-detail manual-base-editor"
      aria-busy={busy}
      aria-label={`Repartir ${baseName.toLowerCase()}`}
      onFocusCapture={(e) => {
        if (
          e.target instanceof HTMLInputElement &&
          e.target.type === "number" &&
          autoTimer.current
        )
          clearTimeout(autoTimer.current);
      }}
      onChangeCapture={(e) => {
        if (
          e.target instanceof HTMLInputElement &&
          e.target.type === "number" &&
          autoTimer.current
        )
          clearTimeout(autoTimer.current);
      }}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <header className="row">
        <h2>
          {context.kind === "total"
            ? metric === "BA"
              ? "Base por contactar (BC)"
              : "Base manual por asesor"
            : `${baseName} de ${context.name}`}
        </h2>
        <button
          className="ui-close-button"
          type="button"
          disabled={busy}
          onClick={close}
        >
          Cerrar
        </button>
      </header>
      <p>
        {day}
        {context.kind === "total"
          ? ` · ${review?.tableName ?? ""} · ${context.scope.country || "Sin país"}`
          : " · reparto por hoja y país"}
      </p>
      <p className="hint">
        Cantidades absolutas: para pasar de 300 a 500, escribe 500. Totales y
        Asesores comparten estos registros. {displayMetric} cuenta datos, sin
        conversión de moneda; es distinta de B de Meta Ads, de{" "}
        {metric === "BA" ? "BM" : "BC"} y de las ventas V. Las cantidades sin
        asesor no se atribuyen a ninguna persona.
      </p>
      {context.kind === "advisor" && context.country && (
        <p className="hint">
          Editando únicamente el país {context.country}. Los demás países se
          conservan.
        </p>
      )}
      {loading && <p role="status">Cargando reparto…</p>}
      {message && (
        <p className="sheet-message" role="alert">
          {message}
        </p>
      )}
      {!loading && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
        >
          {context.kind === "total" && review ? (
            <>
              <div className="manual-base-entries">
                {entries.map((entry) => (
                  <div className="manual-base-line" key={entry.id}>
                    <SheetSearchSelect
                      label={`Asesor de ${displayMetric} ${entry.id}`}
                      value={entry.advisorId ?? "__unassigned"}
                      placeholder="Seleccionar asesor"
                      disabled={busy}
                      options={[
                        {
                          value: "__unassigned",
                          label: "Sin asesor / pendiente de distribuir",
                        },
                        ...review.advisors.map((a) => ({
                          value: a.id,
                          label: a.label,
                        })),
                      ]}
                      onSelect={(id) => {
                        setEntries((v) =>
                          v.map((r) =>
                            r.id === entry.id
                              ? {
                                  ...r,
                                  advisorId: id === "__unassigned" ? null : id,
                                }
                              : r,
                          ),
                        );
                        setSaved(false);
                        dirty.current = true;
                      }}
                    />
                    <label>
                      Datos {displayMetric}
                      <input
                        aria-label={`Cantidad ${displayMetric} ${entry.id}`}
                        type="number"
                        min="0"
                        max="100000000"
                        step="1"
                        value={entry.quantity}
                        disabled={busy}
                        onChange={(e) => {
                          setEntries((v) =>
                            v.map((r) =>
                              r.id === entry.id
                                ? { ...r, quantity: e.target.value }
                                : r,
                            ),
                          );
                          setSaved(false);
                          dirty.current = true;
                        }}
                        onBlur={schedule}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Quitar reparto ${displayMetric} ${entry.id}`}
                      onClick={() => {
                        setEntries((v) => v.filter((r) => r.id !== entry.id));
                        setSaved(false);
                        dirty.current = true;
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEntries((v) => [
                    ...v,
                    {
                      id: nextId.current++,
                      advisorId: "__choose",
                      quantity: "",
                    },
                  ]);
                  setSaved(false);
                  dirty.current = true;
                }}
              >
                + Asesor
              </button>
              {!!review.legacy.length && (
                <details>
                  <summary>
                    Importes anteriores conservados como referencia
                  </summary>
                  <p className="hint">
                    El reparto compartido reemplaza su visualización en BM. No
                    se suman entre sí ni se asignan automáticamente. Ajusta «Sin
                    asesor» al repartir un importe previo.
                  </p>
                  {review.legacy.map((r) => (
                    <p key={r.sheetId + ":" + r.currency}>
                      {r.sheetName} · {r.currency || "Sin moneda"}:{" "}
                      {r.value === "NA" ? "N.A." : r.value}
                    </p>
                  ))}
                </details>
              )}
            </>
          ) : context.kind === "advisor" ? (
            <>
              {countries.map((entry) => (
                <AdvisorCountryLine
                  key={entry.id}
                  row={entry}
                  day={day}
                  advisorId={context.advisorId}
                  tables={tables.filter(
                    (t) =>
                      context.tableId === "all" || t.id === context.tableId,
                  )}
                  fixedCountry={context.country}
                  disabled={busy}
                  onPair={(tableId, country) =>
                    changePair(entry.id, tableId, country)
                  }
                  onReview={(review, error) =>
                    setCountries((v) =>
                      v.map((r) =>
                        r.id === entry.id
                          ? {
                              ...r,
                              review,
                              error,
                              quantity:
                                r.quantity ||
                                String(
                                  review?.allocations.find(
                                    (a) => a.advisorId === context.advisorId,
                                  )?.quantity ?? "",
                                ),
                              initialUnassigned: !review?.exists
                                ? String(
                                    review?.allocations.find(
                                      (a) => a.advisorId === null,
                                    )?.quantity ?? 0,
                                  )
                                : "0",
                            }
                          : r,
                      ),
                    )
                  }
                  onAmount={(quantity) => {
                    setCountries((v) =>
                      v.map((r) =>
                        r.id === entry.id ? { ...r, quantity } : r,
                      ),
                    );
                    setSaved(false);
                    dirty.current = true;
                  }}
                  onUnassigned={(initialUnassigned) => {
                    setCountries((v) =>
                      v.map((r) =>
                        r.id === entry.id ? { ...r, initialUnassigned } : r,
                      ),
                    );
                    setSaved(false);
                    dirty.current = true;
                  }}
                  onBlur={schedule}
                  onRemove={() => {
                    if (entry.review?.exists)
                      setRemoved((v) => [
                        ...v.filter(
                          (r) =>
                            r.tableId !== entry.tableId ||
                            r.country !== entry.country,
                        ),
                        entry.review!,
                      ]);
                    setCountries((v) => v.filter((r) => r.id !== entry.id));
                    setSaved(false);
                    dirty.current = true;
                  }}
                />
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCountries((v) => [...v, newCountry()]);
                  setSaved(false);
                  dirty.current = true;
                }}
              >
                + Hoja y país
              </button>
            </>
          ) : null}
          <div className="manual-base-total">
            <span>
              {context.kind === "total"
                ? `Total ${displayMetric} del día`
                : `BM de ${context.name} en esta selección`}
            </span>
            <strong>
              {draftKnown
                ? total.toLocaleString("es-PE")
                : context.kind === "total" && review?.state === "NA"
                  ? "N.A."
                  : "—"}
            </strong>
            <small>
              {busy
                ? `Guardando ${displayMetric}…`
                : saved
                  ? "Guardado"
                  : "Se guarda al salir de la cantidad o al pulsar Guardar"}
            </small>
          </div>
          <footer className="row">
            <button
              type="submit"
              className="primary"
              disabled={busy || !valid()}
            >
              Guardar y cerrar
            </button>
            <button
              type="button"
              disabled={busy || !valid()}
              onClick={() => void save()}
            >
              Guardar
            </button>
            {context.kind === "total" && (
              <>
                <button
                  type="button"
                  disabled={busy || !review}
                  onClick={() => void save(false, "EMPTY")}
                >
                  Dejar sin dato
                </button>
                <button
                  type="button"
                  disabled={busy || !review}
                  onClick={() => void save(false, "NA")}
                >
                  Marcar N.A.
                </button>
              </>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setReload((v) => v + 1)}
            >
              Actualizar reparto
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
function AdvisorCountryLine({
  row,
  day,
  advisorId,
  tables,
  fixedCountry,
  disabled,
  onPair,
  onReview,
  onAmount,
  onUnassigned,
  onBlur,
  onRemove,
}: {
  row: CountryEntry;
  day: string;
  advisorId: string;
  tables: Table[];
  fixedCountry: string;
  disabled: boolean;
  onPair: (t: string, c: string) => void;
  onReview: (r?: ManualBaseReview, error?: string) => void;
  onAmount: (v: string) => void;
  onUnassigned: (v: string) => void;
  onBlur: () => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    if (!row.tableId || row.review) return;
    let active = true;
    void api(
      "meta-ads/manual-base?" +
        new URLSearchParams({
          tableId: row.tableId,
          country: row.country,
          day,
        }),
    )
      .then((r) => {
        if (active) onReview(r);
      })
      .catch((e) => {
        if (active) onReview(undefined, e.message);
      });
    return () => {
      active = false;
    };
  }, [row.tableId, row.country, day]);
  const others = row.review?.exists
    ? row.review.allocations
        .filter((a) => a.advisorId !== advisorId)
        .reduce((n, a) => n + a.quantity, 0)
    : row.review?.legacy.length && amount(row.initialUnassigned)
      ? Number(row.initialUnassigned)
      : 0;
  const projected =
    row.review && amount(row.quantity) ? others + Number(row.quantity) : null;
  return (
    <fieldset className="manual-base-country">
      <legend>Hoja y país</legend>
      <div className="manual-base-line">
        <SheetSearchSelect
          label={`Hoja BM ${row.id}`}
          value={row.tableId}
          placeholder="Seleccionar hoja"
          options={tables.map((t) => ({ value: t.id, label: t.name }))}
          disabled={disabled}
          onSelect={(id) => onPair(id, row.country)}
        />
        <SheetSearchSelect
          label={`País BM ${row.id}`}
          value={row.country}
          options={[
            { value: "", label: "Sin país" },
            ...countryOptions.map((c) => ({
              value: c.code,
              label: c.code + " · " + c.name,
            })),
          ]}
          disabled={disabled || !!fixedCountry}
          onSelect={(c) => onPair(row.tableId, c)}
        />
        <label>
          Datos BM
          <input
            type="number"
            aria-label={`Cantidad BM país ${row.id}`}
            min="0"
            max="100000000"
            step="1"
            disabled={disabled || !row.review}
            value={row.quantity}
            onChange={(e) => onAmount(e.target.value)}
            onBlur={onBlur}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          aria-label={`Quitar país BM ${row.id}`}
        >
          ×
        </button>
      </div>
      {row.error && <p role="alert">{row.error}</p>}
      {projected !== null && (
        <small className="manual-base-country-total">
          Total BM de esta hoja y país:{" "}
          <strong>{projected.toLocaleString("es-PE")}</strong>. Incluye otros
          asesores y datos sin distribuir.
        </small>
      )}
      {row.review && !row.review.exists && !!row.review.legacy.length && (
        <label>
          Importe previo a conservar sin asesor
          <input
            type="number"
            aria-label={`BM previa sin asesor ${row.id}`}
            min="0"
            step="1"
            value={row.initialUnassigned}
            disabled={disabled}
            onChange={(e) => onUnassigned(e.target.value)}
            onBlur={onBlur}
          />
          <small>
            Estos datos todavía no pertenecen a un asesor. Revisa el importe
            para evitar contarlos también en tu cantidad.
          </small>
        </label>
      )}
      {!!row.review?.exists && (
        <small>Se mantienen las cantidades de los demás asesores.</small>
      )}
      {!!row.review?.legacy.length && (
        <details>
          <summary>BM anteriores conservadas como referencia</summary>
          <p className="hint">
            No se suman entre sí. Si tu cantidad ya forma parte de una base
            anterior, ajusta el importe sin asesor para no repetir esos datos.
          </p>
          {row.review.legacy.map((r) => (
            <p key={r.sheetId + ":" + r.currency}>
              {r.sheetName} · {r.currency || "Sin moneda"}:{" "}
              {r.value === "NA" ? "N.A." : r.value}
              {!row.review!.exists && typeof r.value === "number" && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onUnassigned(String(r.value))}
                >
                  Conservar sin asesor
                </button>
              )}
            </p>
          ))}
        </details>
      )}
    </fieldset>
  );
}
