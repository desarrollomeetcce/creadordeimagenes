"use client";
import { fetchJsonResponse } from "../../lib/http-response";
export async function financialRequest(
  path: string,
  method = "GET",
  data?: unknown,
) {
  const scope =
    typeof document === "undefined"
      ? null
      : document
          .querySelector("[data-effectiveness-document]")
          ?.getAttribute("data-effectiveness-document");
  return fetchJsonResponse(
    "/api/" + path.replace(/^meta-ads\//, "meta-ads/financial/"),
    {
      method,
      cache: "no-store",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(scope ? { "X-Effectiveness-Document": scope } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    },
  );
}
