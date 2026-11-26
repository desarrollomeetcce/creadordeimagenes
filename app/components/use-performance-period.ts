"use client";
import { useSyncExternalStore } from "react";
import { performancePeriod } from "../../lib/performance-period";

const periodEvent = "pulpo-performance-period";
function subscribe(listener: () => void) {
  window.addEventListener(periodEvent, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(periodEvent, listener);
    window.removeEventListener("popstate", listener);
  };
}
function read() { return window.location.search; }
function serverRead() { return ""; }

export function usePerformancePeriod() {
  const query = new URLSearchParams(useSyncExternalStore(subscribe, read, serverRead));
  const period = performancePeriod(query.get("from"), query.get("to"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return period && period.to <= today ? period : null;
}

export function setPerformancePeriod(from?: string, to?: string) {
  const period = performancePeriod(from, to);
  const url = new URL(window.location.href);
  if (period) {
    url.searchParams.set("from", period.from);
    url.searchParams.set("to", period.to);
  } else {
    url.searchParams.delete("from");
    url.searchParams.delete("to");
  }
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(periodEvent));
}
