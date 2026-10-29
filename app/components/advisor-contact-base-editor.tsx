"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryOptions } from "../../lib/meta-ads/countries";
import type {
  AdvisorContactBaseReview as Review,
  AdvisorContactBucket as Bucket,
} from "../../lib/meta-ads/advisor-contact-base";
type Entry = { bucket: Bucket; text: string };
const key = (b: { tableId: string; country: string }) =>
  JSON.stringify([b.tableId, b.country]);
export function AdvisorContactBaseEditor({
  advisorId,
  advisorListId,
  name,
  day,
  onClose,
  onSaved,
}: {
  advisorId: string;
  advisorListId: string;
  name: string;
  day: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<Review | null>(null),
    [rows, setRows] = useState<Entry[]>([]),
    [removed, setRemoved] = useState<Bucket[]>([]),
    [tableId, setTableId] = useState(""),
    [country, setCountry] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [committed, setCommitted] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    api(
      "meta-ads/advisors/contact-base?" +
        new URLSearchParams({ advisorId, advisorListId, day }),
    )
      .then((r: Review) => {
        if (active) {
          setData(r);
          setRows(
            r.buckets.map((bucket) => ({
              bucket,
              text: bucket.quantity === null ? "" : String(bucket.quantity),
            })),
          );
          setTableId(r.tables[0]?.id ?? "");
          setCountry(r.tables[0]?.defaultCountry ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [advisorId, advisorListId, day]);
  const dirty = rows.filter(
      (r) => (r.text === "" ? null : Number(r.text)) !== r.bucket.quantity,
    ),
    total = rows.reduce(
      (n, r) => n + (r.text === "" ? 0 : Number(r.text) || 0),
      0,
    );
  async function add() {
    setError("");
    if (
      rows.some(
        (r) => r.bucket.tableId === tableId && r.bucket.country === country,
      )
    ) {
      setError("Esta hoja y país ya aparecen. Edita su cantidad en la tabla.");
      return;
    }
    setBusy(true);
    try {
      const bucket: Bucket = await api(
        "meta-ads/advisors/contact-base/bucket?" +
          new URLSearchParams({
            advisorId,
            advisorListId,
            day,
            tableId,
            country,
          }),
      );
      setRows((v) => [
        ...v,
        {
          bucket,
          text: bucket.quantity === null ? "" : String(bucket.quantity),
        },
      ]);
      setRemoved((v) => v.filter((b) => key(b) !== key(bucket)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo añadir la hoja.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="meta-detail advisor-contact-base-editor"
      aria-label={"BC de " + name}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header className="row">
        <div>
          <h2>Base por contactar · {name}</h2>
          <p>{day} · Lima</p>
        </div>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Cerrar base por contactar"
        >
          ×
        </button>
      </header>
      <p>
        Indica la base de este asesor en cada hoja y país. Totales recibe la
        suma automáticamente.
      </p>
      {data && (
        <>
          <div className="advisor-contact-base-add">
            <label>
              Hoja
              <SheetSearchSelect
                label="Hoja para BC"
                value={tableId}
                disabled={busy || committed}
                options={data.tables.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                onSelect={(id) => {
                  setTableId(id);
                  setCountry(
                    data.tables.find((t) => t.id === id)?.defaultCountry ?? "",
                  );
                }}
              />
            </label>
            <label>
              País
              <SheetSearchSelect
                label="País para BC"
                value={country}
                disabled={busy || committed}
                options={countryOptions.map((c) => ({
                  value: c.code,
                  label: c.code + " · " + c.name,
                }))}
                onSelect={setCountry}
              />
            </label>
            <button
              type="button"
              disabled={busy || committed || !tableId || !country}
              onClick={() => void add()}
            >
              + Hoja y país
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              const changes = [
                ...dirty.map((r) => ({
                  tableId: r.bucket.tableId,
                  country: r.bucket.country,
                  token: r.bucket.token,
                  quantity: r.text === "" ? null : Number(r.text),
                })),
                ...removed.map((b) => ({
                  tableId: b.tableId,
                  country: b.country,
                  token: b.token,
                  quantity: null,
                })),
              ];
              if (
                changes.some(
                  (c) =>
                    c.quantity !== null &&
                    (!Number.isSafeInteger(c.quantity) ||
                      c.quantity < 0 ||
                      c.quantity > 100000000),
                )
              ) {
                setError("Escribe cantidades enteras entre 0 y 100.000.000.");
                return;
              }
              setBusy(true);
              void (async () => {
                try {
                  await api("meta-ads/advisors/contact-base", "POST", {
                    advisorId,
                    advisorListId,
                    day,
                    changes,
                  });
                  setCommitted(true);
                  await onSaved();
                  onClose();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "No se pudo guardar.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hoja</th>
                    <th>País</th>
                    <th>BC de {name}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={key(r.bucket)}>
                      <th>
                        {r.bucket.tableName}
                        {r.bucket.state === "NA" && (
                          <small>
                            Anterior: N.A. Una cantidad registrada reemplaza
                            N.A. en este bloque.
                          </small>
                        )}
                      </th>
                      <td>{r.bucket.country}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100000000"
                          step="1"
                          aria-label={
                            "BC " + r.bucket.tableName + " " + r.bucket.country
                          }
                          disabled={busy || committed}
                          value={r.text}
                          onChange={(e) =>
                            setRows((v) =>
                              v.map((entry, n) =>
                                n === i
                                  ? { ...entry, text: e.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={busy || committed}
                          aria-label={
                            "Quitar BC de " +
                            r.bucket.tableName +
                            " " +
                            r.bucket.country
                          }
                          onClick={() => {
                            setRows((v) => v.filter((_, n) => n !== i));
                            if (r.bucket.quantity !== null)
                              setRemoved((v) => [...v, r.bucket]);
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p>Añade una hoja y país para registrar su base.</p>
            )}
            <p className="hint">
              0 es una cantidad registrada. Vaciar o quitar una línea retira
              solo la cantidad de este asesor; conserva las de los demás.
            </p>
            <div className="advisor-contact-base-total">
              <span>Total de este asesor · {day}</span>
              <strong>{total.toLocaleString("es-PE")}</strong>
            </div>
            <footer className="row">
              <button type="button" disabled={busy} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="primary"
                disabled={
                  busy || committed || (!dirty.length && !removed.length)
                }
              >
                {busy ? "Guardando…" : "Guardar BC"}
              </button>
            </footer>
          </form>
        </>
      )}
      {!data && !error && <p role="status">Cargando base por hoja…</p>}
      {error && (
        <p role="alert" className="notice error">
          {committed
            ? "BC se guardó. Actualiza la vista para ver los cambios."
            : error}
        </p>
      )}
    </dialog>
  );
}
