"use client";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";

export function InventoryImportMenu({
  disabled,
  icon,
  onFile,
  onCatalog,
  triggerRef,
}: {
  disabled: boolean;
  icon: ReactNode;
  onFile: () => void;
  onCatalog: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const id = useId(),
    menu = useRef<HTMLDivElement>(null),
    trigger = triggerRef;
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 8 });
  const choose = (action: () => void) => {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
    action();
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        popoverTarget={id}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Importar inventario"
        title="Importar Excel, CSV o un catálogo JSON preparado"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(r.left, innerWidth - 328)),
            top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 230)),
          });
        }}
      >
        {icon} Importar inventario <span aria-hidden="true">⌄</span>
      </button>
      <div
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        aria-label="Formato para importar inventario"
        className="inventory-import-menu"
        style={position}
        onToggle={(e) => {
          setOpen(e.newState === "open");
          if (e.newState === "open")
            menu.current
              ?.querySelector<HTMLButtonElement>("button")
              ?.focus({ preventScroll: true });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            menu.current?.hidePopover();
            trigger.current?.focus();
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          e.preventDefault();
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
          ]?.focus();
        }}
      >
        <strong>¿Qué archivo vas a importar?</strong>
        <button type="button" role="menuitem" onClick={() => choose(onFile)}>
          <span>Excel, CSV o texto</span>
          <small>Revisa los datos y añádelos al inventario abierto.</small>
        </button>
        <button type="button" role="menuitem" onClick={() => choose(onCatalog)}>
          <span>Catálogo preparado · JSON</span>
          <small>
            Incluye categorías y temarios. Usa la lista indicada en el archivo.
          </small>
        </button>
      </div>
    </>
  );
}
