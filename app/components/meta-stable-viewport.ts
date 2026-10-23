"use client";
import { useRef, type SyntheticEvent } from "react";
// Reserve only enough result height to keep the current viewport physically valid
// while a filter temporarily replaces a long result list with a loading/empty state.
export function useMetaStableViewport() {
  const ref = useRef<HTMLElement>(null);
  const preserve = (event: SyntheticEvent) => {
    const target = event.target;
    if (
      !(target instanceof Element) ||
      target.closest("dialog") ||
      !target.closest(
        ".meta-main-filters,.meta-result-controls,.meta-search-row,.meta-account-pins,.meta-recommendations>header,.meta-source-fetch",
      )
    )
      return;
    const root = ref.current;
    if (!root) return;
    // A mode switch can also remove controls above the results. Reserve the
    // enclosing section so that those changes cannot shrink the document below
    // the viewport, even before the result region gets its new position.
    const rootTop = root.getBoundingClientRect().top + window.scrollY;
    root.style.minHeight = `${Math.max(0, window.scrollY + window.innerHeight - rootTop + 24)}px`;
    const region = ref.current?.querySelector<HTMLElement>(
      "[data-meta-result-region]",
    );
    if (!region) return;
    const absoluteTop = region.getBoundingClientRect().top + window.scrollY;
    region.style.minHeight = `${Math.max(0, window.scrollY + window.innerHeight - absoluteTop + 24)}px`;
  };
  return { ref, onClickCapture: preserve, onChangeCapture: preserve };
}
