"use client";
import { useSyncExternalStore } from "react";
import { performancePeriod } from "../../lib/performance-period";

const queryEvent = "pulpo-workspace-query";
function subscribe(listener: () => void) {
  window.addEventListener(queryEvent, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(queryEvent, listener);
    window.removeEventListener("popstate", listener);
  };
}
function read() { return window.location.search; }
function serverRead() { return ""; }

export function useWorkspaceQuery() {
  return new URLSearchParams(useSyncExternalStore(subscribe, read, serverRead));
}

export function setWorkspaceQuery(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  if (url.href === window.location.href) return;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(queryEvent));
}

export function usePerformancePeriod() {
  const query = useWorkspaceQuery();
  const period = performancePeriod(query.get("from"), query.get("to"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return period && period.to <= today ? period : null;
}

export function setPerformancePeriod(from?: string, to?: string) {
  const period = performancePeriod(from, to);
  setWorkspaceQuery({ from: period?.from ?? null, to: period?.to ?? null });
}
