"use client";
export async function engineRequest(
  path: string,
  method = "GET",
  data?: unknown,
) {
  const r = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No se pudo completar la operación.");
  return b;
}
