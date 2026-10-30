"use client";
import { useLayoutEffect, useRef } from "react";
/** Pin visible columns in table order, using their rendered widths, including resized columns. */
export function useInventoryPinnedColumns(pinned: string[]) {
  const tableRef = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    if (!pinned.length) {
      table.removeAttribute("data-pin-inventory-bands");
      table.style.removeProperty("--inventory-pin-band-width");
      for (const cell of table.querySelectorAll<HTMLElement>(
        "[data-inventory-pinned]",
      )) {
        cell.removeAttribute("data-inventory-pinned");
        cell.style.removeProperty("--inventory-pin-left");
      }
      return;
    }
    let frame = 0;
    const apply = () => {
      const cols = [
        ...table.querySelectorAll<HTMLTableColElement>("colgroup > col"),
      ];
      const offsets = new Map<string, number>();
      let left = 0;
      for (const col of cols) {
        const key = col.dataset.columnKey ?? "";
        if (pinned.includes(key)) {
          offsets.set(key, left);
          left += col.getBoundingClientRect().width;
        }
      }
      table.toggleAttribute(
        "data-pin-inventory-bands",
        offsets.has(cols[0]?.dataset.columnKey ?? ""),
      );
      if (offsets.has(cols[0]?.dataset.columnKey ?? ""))
        table.style.setProperty(
          "--inventory-pin-band-width",
          `${table.parentElement?.clientWidth ?? 0}px`,
        );
      const update = (cell: HTMLTableCellElement, keys: string[]) => {
        const fixed = keys.length > 0 && keys.every((key) => offsets.has(key));
        cell.toggleAttribute("data-inventory-pinned", fixed);
        if (fixed)
          cell.style.setProperty(
            "--inventory-pin-left",
            `${offsets.get(keys[0])}px`,
          );
        else cell.style.removeProperty("--inventory-pin-left");
      };
      for (const cell of table.querySelectorAll<HTMLTableCellElement>(
        "thead th",
      )) {
        const button = cell.querySelector<HTMLButtonElement>("[data-pin-keys]");
        update(cell, button?.dataset.pinKeys?.split("|") ?? []);
      }
      for (const section of [
        ...table.tBodies,
        ...(table.tFoot ? [table.tFoot] : []),
      ]) {
        for (const row of section.rows) {
          let index = 0;
          for (const cell of row.cells) {
            if (cell.hidden) {
              update(cell, []);
              continue;
            }
            const keys = cols
              .slice(index, index + cell.colSpan)
              .map((col) => col.dataset.columnKey ?? "");
            update(cell, keys);
            index += cell.colSpan;
          }
        }
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    const resize = new ResizeObserver(schedule);
    resize.observe(table);
    if (table.parentElement) resize.observe(table.parentElement);
    for (const col of table.querySelectorAll("col")) resize.observe(col);
    const changes = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches("col,colgroup,tr,td,th,thead,tbody,tfoot") ||
                !!node.querySelector("col,tr,td,th")),
          ),
        )
      )
        schedule();
    });
    changes.observe(table, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
    };
  }, [pinned]);
  return tableRef;
}
