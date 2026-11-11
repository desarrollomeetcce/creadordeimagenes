export async function downloadArchive(
  input: unknown,
  filename = "afiches.zip",
  endpoint = "/api/exports",
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      (await response.json()).error ?? "No se pudo preparar la descarga.",
    );
  const url = URL.createObjectURL(await response.blob()),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
