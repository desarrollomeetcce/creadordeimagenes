export const maxResourceFileBytes = 1024 * 1024 * 1024;
export const uploadChunkBytes = 2 * 1024 * 1024;
export const smallResourceFileBytes = 3000000;
export function resourceFilename(value: string) {
  return value.split(/[\\/]/).pop()?.trim().slice(0, 200) ?? "";
}
export function largeFileMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        webp: "image/webp",
        pdf: "application/pdf",
        txt: "text/plain",
        csv: "text/csv",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      } as Record<string, string>
    )[ext ?? ""] ?? null
  );
}
export function expectedChunkBytes(size: number, index: number) {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > maxResourceFileBytes ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Math.ceil(size / uploadChunkBytes)
  )
    return 0;
  return Math.min(uploadChunkBytes, size - index * uploadChunkBytes);
}
