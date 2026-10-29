"use client";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent,
} from "react";
const interactive =
  "input,textarea,select,button,a,[contenteditable=true],[role=combobox]";
export function horizontalSheetKey(
  event: KeyboardEvent<HTMLElement>,
  scroller: HTMLElement | null,
) {
  if (
    !scroller ||
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    !(event.key === "ArrowLeft" || event.key === "ArrowRight")
  )
    return;
  if ((event.target as HTMLElement).closest(interactive)) return;
  if (scroller.scrollWidth <= scroller.clientWidth) return;
  event.preventDefault();
  scroller.scrollBy({
    left:
      (event.key === "ArrowRight" ? 1 : -1) *
      Math.max(80, Math.round(scroller.clientWidth * 0.16)),
    behavior: "auto",
  });
}
export function SheetHorizontalNavigation({
  target,
}: {
  target: RefObject<HTMLDivElement | null>;
}) {
  const [scroll, setScroll] = useState({ left: 0, max: 0 }),
    frame = useRef(0);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const update = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() =>
        setScroll({
          left: element.scrollLeft,
          max: Math.max(0, element.scrollWidth - element.clientWidth),
        }),
      );
    };
    const observer = new ResizeObserver(update),
      mutation = new MutationObserver(() => {
        if (element.firstElementChild)
          observer.observe(element.firstElementChild);
        update();
      });
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    mutation.observe(element, { childList: true });
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      mutation.disconnect();
      cancelAnimationFrame(frame.current);
      element.removeEventListener("scroll", update);
    };
  }, [target]);
  if (scroll.max < 1) return null;
  const move = (sign: number) => {
    const e = target.current;
    if (e)
      e.scrollBy({
        left: sign * Math.max(160, Math.round(e.clientWidth * 0.7)),
        behavior: "auto",
      });
  };
  return (
    <div
      className="sheet-horizontal-navigation"
      role="group"
      aria-label="Desplazamiento horizontal de la hoja"
      tabIndex={0}
      onKeyDown={(e) => horizontalSheetKey(e, target.current)}
      title="Haz clic aquí y usa las flechas izquierda y derecha"
    >
      <button
        type="button"
        aria-label="Desplazar tabla a la izquierda"
        disabled={scroll.left <= 0}
        onClick={() => move(-1)}
      >
        ←
      </button>
      <input
        type="range"
        min={0}
        max={scroll.max}
        step={1}
        value={Math.min(scroll.left, scroll.max)}
        aria-label="Posición horizontal de la tabla"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const el = target.current;
            if (el)
              el.scrollBy({
                left:
                  (e.key === "ArrowRight" ? 1 : -1) *
                  Math.max(80, Math.round(el.clientWidth * 0.16)),
                behavior: "auto",
              });
          }
        }}
        onChange={(e) => {
          if (target.current)
            target.current.scrollLeft = Number(e.target.value);
        }}
      />
      <button
        type="button"
        aria-label="Desplazar tabla a la derecha"
        disabled={scroll.left >= scroll.max - 1}
        onClick={() => move(1)}
      >
        →
      </button>
      <small>← →</small>
    </div>
  );
}
