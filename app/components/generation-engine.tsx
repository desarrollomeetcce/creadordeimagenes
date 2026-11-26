"use client";
import { fetchJsonResponse } from "../../lib/http-response";
export async function engineRequest(
  path: string,
  method = "GET",
  data?: unknown,
  options?: { signal?: AbortSignal },
) {
  return fetchJsonResponse("/api/" + path, {
    method,
    signal: options?.signal,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
}
