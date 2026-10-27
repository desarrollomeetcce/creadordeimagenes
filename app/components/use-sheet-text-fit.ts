"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
/** One table-level observer: fit displayed text without truncating or changing its value. */
export function useSheetTextFit(ref: RefObject<HTMLTableElement | null>) {
  const schedule = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d");
    if (!context) return;
    const maximums = new WeakMap<HTMLElement, number>();
    let frame = 0,
      active = true;
    const fit = () => {
      frame = 0;
      const updates: { element: HTMLElement; size: string }[] = [];
      table
        .querySelectorAll<HTMLElement>(
          "input.sheet-cell, .sheet-new-row > td > input, .sheet-derived, .sheet-search-trigger > span:first-child, th > .sheet-sort-button, .sheet-date-heading, .sheet-new-row button:not(.sheet-search-trigger)",
        )
        .forEach((element) => {
          if (element.closest(".sheet-search-popover")) return;
          if (!element.clientWidth) return;
          const style = getComputedStyle(element);
          let maximum = maximums.get(element);
          if (maximum === undefined) {
            maximum = parseFloat(style.fontSize);
            maximums.set(element, maximum);
          }
          const text =
            element instanceof HTMLInputElement
              ? element.value || element.placeholder
              : element.textContent || "";
          const width =
            element.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) -
            1;
          if (width <= 0) return;
          context.font = `${style.fontStyle} ${style.fontWeight} ${maximum}px ${style.fontFamily}`;
          const spacing = parseFloat(style.letterSpacing) || 0;
          const measured =
            context.measureText(text).width +
            Math.max(0, text.length - 1) * spacing;
          const size =
            Math.floor(
              Math.min(
                maximum,
                measured ? (maximum * width) / measured : maximum,
              ) * 100,
            ) / 100;
          updates.push({ element, size: `${Math.max(0.1, size)}px` });
        });
      // Read all geometry before writing font sizes, to avoid a layout per cell.
      updates.forEach(({ element, size }) => {
        if (element.style.fontSize !== size) element.style.fontSize = size;
      });
    };
    const request = () => {
      if (active && !frame) frame = requestAnimationFrame(fit);
    };
    schedule.current = request;
    const resize = new ResizeObserver(request),
      mutation = new MutationObserver(request);
    resize.observe(table);
    mutation.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    table.addEventListener("input", request);
    window.addEventListener("resize", request);
    void document.fonts.ready.then(request);
    request();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      table.removeEventListener("input", request);
      window.removeEventListener("resize", request);
      schedule.current = () => {};
    };
  }, [ref]);
  useLayoutEffect(() => {
    schedule.current();
  });
}
