/** A single HTTP byte range for browser video playback; callers authorize the resource first. */
export function videoResponse(
  bytes: Buffer,
  mime: string,
  range: string | null,
  id: string,
  download = false,
) {
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="recurso_${id}.${mime === "video/quicktime" ? "mov" : "mp4"}"`,
  };
  let start = 0,
    end = bytes.length - 1;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2]))
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
      });
    if (!m[1]) start = Math.max(0, bytes.length - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(end, Number(m[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start > end ||
      start >= bytes.length
    )
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
      });
    headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
  }
  const body = bytes.subarray(start, end + 1);
  headers["Content-Length"] = String(body.length);
  return new Response(new Uint8Array(body), {
    status: range ? 206 : 200,
    headers,
  });
}
