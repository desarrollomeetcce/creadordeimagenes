"use client";
import { useEffect, type RefObject } from "react";
/** Presentation only: the financial API independently checks every write and document scope. */
export function useFinancialReadOnly(
  ref: RefObject<HTMLElement | null>,
  readOnly: boolean,
) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !readOnly) return;
    const originals = new Map<
      HTMLElement,
      { disabled?: boolean; readOnly?: boolean }
    >();
    const mutate =
      /^(\+|×$|✎|Guardar|Eliminar|Borrar (?!filtros)|Asignar|Importar|Cargar|Pegar|Crear|Añadir|Agregar|Cambiar|Renombrar|Editar|Vincular|Desvincular|Sincronizar|Restablecer|Colores de|Resaltar columnas|Quitar selección)/i;
    const apply = () => {
      for (const el of root.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement
      >(
        "input.sheet-cell,.sheet-new-row input,tbody input:not([type=search]),dialog textarea,dialog input:not([type=search]):not([type=date])",
      )) {
        if (!originals.has(el))
          originals.set(el, { disabled: el.disabled, readOnly: el.readOnly });
        if (el.type === "checkbox") {
          el.dataset.financialBlocked = "true";
          if (!el.disabled) el.disabled = true;
        } else if (!el.readOnly) el.readOnly = true;
      }
      for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
        const text = button.textContent?.trim() ?? "",
          label = button.getAttribute("aria-label") ?? text;
        const picker = button.closest(
          ".sheet-search-popover,.inventory-multi-popover,.meta-date-dialog,.calendar-grid",
        );
        const detail =
          /detalle|hist[oó]rico|historial|ver temario/i.test(label) ||
          (!!button.closest(".inventory-syllabus-chip") && !/×|✎/.test(text));
        const row = !!button.closest("tbody");
        const blocked =
          (!picker && mutate.test(label)) ||
          /^\+/.test(text) ||
          (!!button.closest(
            ".inventory-category-chips,.inventory-sheet-chip",
          ) &&
            row) ||
          button.classList.contains("sheet-add-tab") ||
          button.classList.contains("inventory-add-syllabus") ||
          (row && /^(×|✎)$/.test(text));
        if (blocked || (row && !picker && !detail)) {
          if (!originals.has(button))
            originals.set(button, { disabled: button.disabled });
          if (!button.disabled) button.disabled = true;
          if (blocked) button.dataset.financialBlocked = "true";
          else button.dataset.financialStatic = "true";
        }
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "readonly"],
    });
    const context = (e: Event) => e.stopPropagation();
    root.addEventListener("contextmenu", context, true);
    return () => {
      observer.disconnect();
      root.removeEventListener("contextmenu", context, true);
      for (const [el, old] of originals) {
        delete el.dataset.financialBlocked;
        delete el.dataset.financialStatic;
        if ("disabled" in el)
          (el as HTMLButtonElement).disabled = old.disabled ?? false;
        if ("readOnly" in el)
          (el as HTMLInputElement).readOnly = old.readOnly ?? false;
      }
    };
  }, [ref, readOnly]);
}
