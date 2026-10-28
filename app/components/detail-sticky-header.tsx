"use client";
import { useEffect, useRef, type ReactNode } from "react";
/** Keep report controls visible and expose their actual height for section jumps. */
export function DetailStickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = ref.current,
      report = header?.parentElement;
    if (!header || !report) return;
    const measure = () =>
      report.style.setProperty(
        "--detail-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      report.style.removeProperty("--detail-header-height");
    };
  }, []);
  return (
    <div ref={ref} className="detail-sticky-header">
      {children}
    </div>
  );
}
