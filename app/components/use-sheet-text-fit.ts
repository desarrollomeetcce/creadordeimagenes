"use client";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
/** One table-level observer: fit displayed text without truncating or changing its value. */
export function useSheetTextFit(
  ref: RefObject<HTMLTableElement | null>,
  selector = "input.sheet-cell, .sheet-new-row > td > input, .sheet-derived, .sheet-search-trigger > span:first-child, th > .sheet-sort-button, .sheet-date-heading, .sheet-new-row button:not(.sheet-search-trigger)",
) {
  const schedule = useRef<() => void>(() => {});
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current !== table) setTable(ref.current);
  });
  useLayoutEffect(() => {
    if (!table) return;
    const canvas = document.createElement("canvas"),
      context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    const maximums = new WeakMap<HTMLElement, number>();
    const rgbaCache = new Map<string, number[]>();
    const rgba = (color: string) => {
      const old = rgbaCache.get(color);
      if (old) return old;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = [...context.getImageData(0, 0, 1, 1).data];
      const result = [
        pixel[0] / 255,
        pixel[1] / 255,
        pixel[2] / 255,
        pixel[3] / 255,
      ];
      rgbaCache.set(color, result);
      return result;
    };
    const foreground = (
      cell: HTMLElement,
      backgrounds: Map<HTMLElement, number[]>,
    ) => {
      const layers: number[][] = [];
      let node: HTMLElement | null = cell;
      while (node) {
        let bg = backgrounds.get(node);
        if (!bg) {
          bg = rgba(getComputedStyle(node).backgroundColor);
          backgrounds.set(node, bg);
        }
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] >= 1) break;
        node = node.parentElement;
      }
      let base = rgba(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--surface")
          .trim() || "#ffffff",
      ).slice(0, 3);
      for (const bg of layers.reverse())
        base = base.map((v, i) => bg[i] * bg[3] + v * (1 - bg[3]));
      const linear = base.map((v) =>
          v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
        ),
        l = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
    };
    let frame = 0,
      active = true;
    const fit = () => {
      frame = 0;
      const backgrounds = new Map<HTMLElement, number[]>();
      const updates: { element: HTMLElement; size: string; ink?: string }[] =
        [];
      table.querySelectorAll<HTMLElement>(selector).forEach((element) => {
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
        const numericCell = element.closest<HTMLElement>(
          "td[data-fill-kind],td[data-metric]",
        );
        updates.push({
          element,
          size: `${Math.max(0.1, size)}px`,
          ink: numericCell ? foreground(element, backgrounds) : undefined,
        });
      });
      // Read all geometry before writing font sizes, to avoid a layout per cell.
      updates.forEach(({ element, size, ink }) => {
        if (element.style.fontSize !== size) element.style.fontSize = size;
        if (ink && element.style.getPropertyValue("--sheet-value-ink") !== ink)
          element.style.setProperty("--sheet-value-ink", ink);
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
    const theme = new MutationObserver(request);
    theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-theme"],
    });
    table.addEventListener("input", request);
    table.addEventListener("focusin", request);
    table.addEventListener("focusout", request);
    window.addEventListener("resize", request);
    void document.fonts.ready.then(request);
    request();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      theme.disconnect();
      table.removeEventListener("input", request);
      table.removeEventListener("focusin", request);
      table.removeEventListener("focusout", request);
      window.removeEventListener("resize", request);
      schedule.current = () => {};
    };
  }, [table, selector]);
  useLayoutEffect(() => {
    schedule.current();
  });
}
