"use client";
import { invalidateGroupDirectories, invalidatesGroupDirectory } from "./inventory-group-directory-cache";
import { fetchJsonResponse } from "../../lib/http-response";
export async function financialRequest(
  path: string,
  method = "GET",
  data?: unknown,
  options?: { signal?: AbortSignal },
) {
  const invalidatesGroups = invalidatesGroupDirectory(path,method);
  if(invalidatesGroups) invalidateGroupDirectories();
  const scope =
    typeof document === "undefined"
      ? null
      : document
          .querySelector("[data-effectiveness-document]")
          ?.getAttribute("data-effectiveness-document");
  try {
  return await fetchJsonResponse(
    "/api/" + path.replace(/^meta-ads\//, "meta-ads/financial/"),
    {
      method,
      signal: options?.signal,
      cache: "no-store",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
        ...(scope ? { "X-Effectiveness-Document": scope } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    },
  );
  } finally {
    if(invalidatesGroups) invalidateGroupDirectories();
  }
}
