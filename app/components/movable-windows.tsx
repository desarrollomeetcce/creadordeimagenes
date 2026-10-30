"use client";
import { useEffect } from "react";

/** Presentation only. Native dialogs/popovers keep their own form, close and focus behavior. */
export function MovableWindows() {
  useEffect(() => {
    type WindowState = {
      style: string | null;
      header: HTMLElement;
      title: string | null;
      tab: string | null;
      shortcuts: string | null;
      observer: ResizeObserver;
    };
    let alive = true;
    const windows = new Map<HTMLElement, WindowState>();
    let drag: {
      popup: HTMLElement;
      header: HTMLElement;
      pointer: number;
      x: number;
      y: number;
      left: number;
      top: number;
      moved: boolean;
    } | null = null;
    const isOpen = (el: HTMLElement) =>
      el.matches("dialog[open], [popover]:popover-open") &&
      !el.matches(
        ".expandable-panel.inline, .financial-table-window[data-table-window-mode=inline]",
      );
    const isExpanded = (el: HTMLElement) =>
      el.dataset.expanded === "true" ||
      el.matches(".fullscreen,.is-fullscreen");
    const setPosition = (el: HTMLElement, left: number, top: number) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(
        8,
        Math.min(left, innerWidth - Math.min(r.width, innerWidth - 16) - 8),
      );
      const minHeight = Math.min(
        r.height,
        Math.max(160, parseFloat(getComputedStyle(el).minHeight) || 0),
        innerHeight - 16,
      );
      const y = Math.max(8, Math.min(top, innerHeight - minHeight - 8));
      Object.assign(el.style, {
        position: "fixed",
        inset: "auto",
        margin: "0",
        transform: "none",
        translate: "none",
        width: Math.min(r.width, innerWidth - 16) + "px",
        maxWidth: "calc(100vw - 16px)",
        left: x + "px",
        top: y + "px",
        maxHeight: `calc(100dvh - ${y + 8}px)`,
      });
      el.dataset.windowMoved = "true";
    };
    const fit = (el: HTMLElement) => {
      if (!isOpen(el) || isExpanded(el)) return;
      const r = el.getBoundingClientRect();
      if (
        r.left < 7 ||
        r.top < 7 ||
        r.right > innerWidth - 7 ||
        r.bottom > innerHeight - 7
      )
        setPosition(el, r.left, r.top);
    };
    const restore = (el: HTMLElement) => {
      const state = windows.get(el);
      if (!state) return;
      if (state.style === null) el.removeAttribute("style");
      else el.setAttribute("style", state.style);
      delete el.dataset.windowMoved;
    };
    const release = () => {
      if (!drag) return;
      delete drag.header.dataset.windowDragging;
      try {
        if (drag.header.hasPointerCapture(drag.pointer))
          drag.header.releasePointerCapture(drag.pointer);
      } catch {}
      drag = null;
    };
    const remove = (el: HTMLElement) => {
      const state = windows.get(el);
      if (!state) return;
      if (drag?.popup === el) release();
      restore(el);
      state.observer.disconnect();
      for (const [key, value] of [
        ["title", state.title],
        ["tabindex", state.tab],
        ["aria-keyshortcuts", state.shortcuts],
      ] as const) {
        if (value === null) state.header.removeAttribute(key);
        else state.header.setAttribute(key, value);
      }
      delete state.header.dataset.floatingWindowHeader;
      windows.delete(el);
    };
    const prepare = (el: HTMLElement, retry = 0) => {
      if (
        !alive ||
        !isOpen(el) ||
        windows.has(el) ||
        el.matches(
          ".sheet-search-popover,.date-popover,.inventory-multi-popover,.inventory-campaign-popover,[role=listbox],[role=menu]",
        )
      )
        return;
      // Menus/search lists/calendar dropdowns have no window header and remain ordinary controls.
      const header = el.querySelector<HTMLElement>(
        ":scope > header, :scope > .detail-sticky-header, [data-table-window-handle], .detail-sticky-header, :scope > h2, :scope > form > header, .image-preview-bar, .editor-window-bar, .attachment-library-header, .instruction-editor-heading, .expandable-panel-bar",
      );
      if (!header) {
        if (retry < 3) requestAnimationFrame(() => prepare(el, retry + 1));
        return;
      }
      const observer = new ResizeObserver(() => {
        if (!el.isConnected || !isOpen(el)) remove(el);
        else fit(el);
      });
      windows.set(el, {
        style: el.getAttribute("style"),
        header,
        title: header.getAttribute("title"),
        tab: header.getAttribute("tabindex"),
        shortcuts: header.getAttribute("aria-keyshortcuts"),
        observer,
      });
      header.dataset.floatingWindowHeader = "true";
      header.title =
        "Arrastra esta cabecera para mover la ventana. También puedes enfocar aquí y usar Alt + flechas.";
      if (!header.hasAttribute("tabindex")) header.tabIndex = 0;
      header.setAttribute(
        "aria-keyshortcuts",
        "Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight",
      );
      observer.observe(el);
      fit(el);
    };
    const toggle = (event: Event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.matches("dialog,[popover]"))
        return;
      if ((event as ToggleEvent).newState === "closed") {
        remove(el);
        return;
      }
      requestAnimationFrame(() => {
        if (!isOpen(el)) remove(el);
        else prepare(el);
      });
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const popup = target.closest<HTMLElement>(
        "dialog[open], [popover]:popover-open",
      );
      if (!popup || !isOpen(popup) || isExpanded(popup)) return;
      prepare(popup);
      const state = windows.get(popup);
      if (
        !state ||
        !state.header.contains(target) ||
        target.closest(
          "button,a,input,select,textarea,label,summary,[role=button],[role=combobox],[role=slider],[contenteditable]:not([contenteditable=false]),.sheet-column-resizer",
        )
      )
        return;
      const r = popup.getBoundingClientRect();
      drag = {
        popup,
        header: state.header,
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: r.left,
        top: r.top,
        moved: false,
      };
      state.header.focus({ preventScroll: true });
      state.header.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      drag.header.dataset.windowDragging = "true";
      event.preventDefault();
      setPosition(drag.popup, drag.left + dx, drag.top + dy);
    };
    const pointerUp = (event: PointerEvent) => {
      if (drag?.pointer === event.pointerId) release();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!event.altKey || !event.key.startsWith("Arrow")) return;
      const header = event.target;
      if (
        !(header instanceof HTMLElement) ||
        !header.hasAttribute("data-floating-window-header")
      )
        return;
      const popup = header.closest<HTMLElement>(
        "dialog[open], [popover]:popover-open",
      );
      if (!popup || !isOpen(popup) || isExpanded(popup)) return;
      event.preventDefault();
      const r = popup.getBoundingClientRect(),
        step = event.shiftKey ? 50 : 20;
      setPosition(
        popup,
        r.left +
          (event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0),
        r.top +
          (event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0),
      );
    };
    const clicked = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button) return;
      if (
        button.matches(".detail-expand-button,[data-window-size-control]") ||
        /Maximizar|Restaurar|Ampliar|Pantalla completa|Reducir ventana|Volver a la página|Abrir ventana amplia/.test(
          button.textContent ?? "",
        )
      ) {
        const popup = button.closest<HTMLElement>(
          "dialog[open], [popover]:popover-open",
        );
        if (popup) restore(popup);
      }
    };
    const resized = () => {
      for (const el of windows.keys()) {
        if (!el.isConnected) {
          remove(el);
          continue;
        }
        fit(el);
      }
    };
    document.addEventListener("toggle", toggle, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerUp, true);
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("click", clicked, true);
    window.addEventListener("resize", resized);
    for (const el of document.querySelectorAll<HTMLElement>(
      "dialog[open],[popover]:popover-open",
    ))
      prepare(el);
    return () => {
      alive = false;
      release();
      for (const el of windows.keys()) remove(el);
      document.removeEventListener("toggle", toggle, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerUp, true);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("click", clicked, true);
      window.removeEventListener("resize", resized);
    };
  }, []);
  return null;
}
