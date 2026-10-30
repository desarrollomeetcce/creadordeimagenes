"use client";
import { useEffect, useRef, useState } from "react";
import type { TrialDirectory } from "../../lib/meta-ads/inventory-trials";
import { financialRequest as api } from "./financial-request";
import { InventoryTop } from "./inventory-top";
import { EffectivenessHistory } from "./effectiveness-history";
import { countryName } from "../../lib/meta-ads/countries";

/** Reuses the same country-scoped proposal and atomic replacement as Inventory. */
export function InventorySheetReplacement({
  listId,
  tableId,
  country,
  name,
  sheetName,
  since,
  until,
  onChanged,
  onClose,
}: {
  listId: string;
  tableId: string;
  country: string;
  name: string;
  sheetName: string;
  since: string;
  until: string;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [directory, setDirectory] = useState<TrialDirectory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{
    name: string;
    aliasId: string;
  } | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    void api("meta-ads/inventory/trials?" + new URLSearchParams({ listId }))
      .then((data: TrialDirectory) => {
        if (alive) setDirectory(data);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [listId]);
  return (
    <dialog
      ref={dialog}
      className="trial-dialog inventory-group-editor"
      aria-label="Reemplazar diplomado en la hoja"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>Reemplazar diplomado · {countryName(country)}</h2>
        <button
          type="button"
          className="ui-close-button"
          disabled={busy}
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !directory ? (
        <p role="status">Cargando diplomados…</p>
      ) : (
        <InventoryTop
          directory={directory}
          columns={[
            {
              value: tableId + ":" + country,
              label: sheetName + " · " + countryName(country),
            },
          ]}
          initialReplaceName={name}
          onBusyChange={setBusy}
          onChanged={onChanged}
          onDetail={(_column, name, aliasId) => setDetail({ name, aliasId })}
        />
      )}
      {detail && (
        <EffectivenessHistory
          {...detail}
          tableId={tableId}
          country={country}
          initialSince={since}
          initialUntil={until}
          autoOpen
          onClose={() => setDetail(null)}
          onPeriod={() => {}}
        />
      )}
    </dialog>
  );
}
