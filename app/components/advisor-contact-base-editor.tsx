"use client";
import { useEffect, useRef, useState } from "react";
import { financialRequest as api } from "./financial-request";
import { SheetSearchSelect } from "./sheet-search-select";
import { countryOptions } from "../../lib/meta-ads/countries";
import type {
  AdvisorContactBaseReview as Review,
  AdvisorContactBucket as Bucket,
} from "../../lib/meta-ads/advisor-contact-base";
type Entry = { id: number; tableId: string; country: string; text: string };
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
    nextId = useRef(0),
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
          const existing = r.buckets.map((bucket) => ({
            id: nextId.current++,
            tableId: bucket.tableId,
            country: bucket.country,
            text: bucket.quantity === null ? "" : String(bucket.quantity),
          }));
          setRows(
            existing.length
              ? existing
              : [
                  {
                    id: nextId.current++,
                    tableId: r.tables[0]?.id ?? "",
                    country: r.tables[0]?.defaultCountry ?? "",
                    text: "",
                  },
                ],
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [advisorId, advisorListId, day]);
  const total = rows.reduce((n, r) => n + (Number(r.text) || 0), 0);
  const original = new Map(data?.buckets.map((b) => [key(b), b]) ?? []);
  const current = new Map(
    rows.filter((r) => r.text !== "").map((r) => [key(r), r]),
  );
  const changed =
    rows.some(
      (r) => r.text !== "" && Number(r.text) !== original.get(key(r))?.quantity,
    ) ||
    [...original.values()].some(
      (b) => b.quantity !== null && !current.has(key(b)),
    );
  async function save() {
    if (!data || busy || committed) return;
    setError("");
    const filled = rows.filter((r) => r.text !== "");
    if (filled.some((r) => !r.tableId || !r.country)) {
      setError("Selecciona la hoja y el país de cada cantidad.");
      return;
    }
    const chosen = rows.filter((r) => r.tableId && r.country);
    if (new Set(chosen.map(key)).size !== chosen.length) {
      setError(
        "Esta hoja y país ya aparecen. Usa una sola fila por combinación.",
      );
      return;
    }
    if (
      filled.some(
        (r) =>
          !Number.isSafeInteger(Number(r.text)) ||
          Number(r.text) < 0 ||
          Number(r.text) > 100000000,
      )
    ) {
      setError("Escribe cantidades enteras entre 0 y 100.000.000.");
      return;
    }
    setBusy(true);
    try {
      const changes: {
        tableId: string;
        country: string;
        token: string;
        quantity: number | null;
      }[] = [];
      for (const b of original.values()) {
        const row = current.get(key(b)),
          quantity = row ? Number(row.text) : null;
        if (quantity !== b.quantity)
          changes.push({
            tableId: b.tableId,
            country: b.country,
            token: b.token,
            quantity,
          });
      }
      for (const row of filled) {
        if (original.has(key(row))) continue;
        const bucket: Bucket = await api(
          "meta-ads/advisors/contact-base/bucket?" +
            new URLSearchParams({
              advisorId,
              advisorListId,
              day,
              tableId: row.tableId,
              country: row.country,
            }),
        );
        changes.push({
          tableId: row.tableId,
          country: row.country,
          token: bucket.token,
          quantity: Number(row.text),
        });
      }
      if (!changes.length) return;
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
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  function update(id: number, change: Partial<Entry>) {
    setRows((v) => v.map((r) => (r.id === id ? { ...r, ...change } : r)));
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Hoja</th>
                    <th>País</th>
                    <th>BC</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>
                        <SheetSearchSelect
                          label={`Hoja de BC, fila ${i + 1}`}
                          placeholder="Selecciona una hoja"
                          value={r.tableId}
                          disabled={busy || committed}
                          options={data.tables.map((t) => ({
                            value: t.id,
                            label: t.name,
                          }))}
                          onSelect={(id) =>
                            update(r.id, {
                              tableId: id,
                              country:
                                data.tables.find((t) => t.id === id)
                                  ?.defaultCountry ?? "",
                            })
                          }
                        />
                      </td>
                      <td>
                        <SheetSearchSelect
                          label={`País de BC, fila ${i + 1}`}
                          placeholder="Selecciona un país"
                          value={r.country}
                          disabled={busy || committed}
                          options={countryOptions.map((c) => ({
                            value: c.code,
                            label: c.code + " · " + c.name,
                          }))}
                          onSelect={(country) => update(r.id, { country })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100000000"
                          step="1"
                          aria-label={`BC, fila ${i + 1}`}
                          disabled={busy || committed}
                          value={r.text}
                          onChange={(e) =>
                            update(r.id, { text: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={busy || committed}
                          aria-label={`Quitar fila de BC ${i + 1}`}
                          onClick={() =>
                            setRows((v) => v.filter((row) => row.id !== r.id))
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="advisor-contact-base-plus"
              aria-label="Añadir fila de BC"
              disabled={busy || committed || !data.tables.length}
              onClick={() =>
                setRows((v) => [
                  ...v,
                  { id: nextId.current++, tableId: "", country: "", text: "" },
                ])
              }
            >
              +
            </button>
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
                disabled={busy || committed || !changed}
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
