"use client";
import { useEffect, useState } from "react";
/** Observe headers, not every row. Off-screen countries keep one cheap placeholder cell. */
export function useInventoryCountryViewport(columns: string[], mode: string) {
  const stamp = columns.join("|");
  const [state, setState] = useState<{ stamp: string; columns: string[] }>({
    stamp: "",
    columns: [],
  });
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".inventory-table-scroll");
    if (!root) return;
    const headers = [
      ...root.querySelectorAll<HTMLElement>(
        "th.inventory-country-heading[data-country-block]",
      ),
    ];
    if (!headers.length) return;
    const visible = new Set<string>();
    const publish = () => {
      const next = columns.filter((c) => visible.has(c));
      setState((previous) =>
        previous.stamp === stamp &&
        previous.columns.join("|") === next.join("|")
          ? previous
          : { stamp, columns: next },
      );
    };
    if (typeof IntersectionObserver === "undefined") {
      setState({ stamp, columns });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const code = (entry.target as HTMLElement).dataset.countryBlock!;
          if (entry.isIntersecting) visible.add(code);
          else visible.delete(code);
        }
        publish();
      },
      { root, rootMargin: "0px 160px 0px 160px", threshold: 0 },
    );
    headers.forEach((header) => observer.observe(header));
    return () => observer.disconnect();
  }, [stamp, mode]);
  return state.stamp === stamp && state.columns.length
    ? state.columns
    : columns.slice(0, 2);
}
