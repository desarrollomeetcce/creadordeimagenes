"use client";
import { fetchJsonResponse } from "../../lib/http-response";
export async function engineRequest(
  path: string,
  method = "GET",
  data?: unknown,
) {
  return fetchJsonResponse("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
}
