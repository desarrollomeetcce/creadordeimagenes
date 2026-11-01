import { NextRequest, NextResponse } from "next/server";
import { actor, rateLimit } from "@/lib/auth";
import { courseOwner } from "@/lib/courses/service";
import { cloneVoice } from "@/lib/courses/providers";
import { AppError, demand } from "@/lib/errors";
import { maxUploadBytes } from "@/lib/storage";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  try {
    demand(
      req.headers.get("origin") ===
        (process.env.APP_ORIGIN ?? "http://localhost:3000"),
      "Origen no autorizado.",
      403,
    );
    const u = await actor();
    await courseOwner(u);
    await rateLimit("courses:clone:" + u.id, 4);
    const max = maxUploadBytes();
    demand(
      Number(req.headers.get("content-length") ?? 0) <= max,
      "El audio supera el límite de subida.",
      413,
    );
    const reader = req.body?.getReader();
    demand(reader, "Falta el audio.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new AppError("El audio supera el límite de subida.", 413);
      }
      chunks.push(value);
    }
    const form = await new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": req.headers.get("content-type") ?? "" },
      body: Buffer.concat(chunks),
    }).formData();
    demand(
      form.get("consent") === "yes",
      "Confirma que es tu voz o tienes autorización expresa para clonarla.",
    );
    const file = form.get("file"),
      name = String(form.get("name") ?? "").trim();
    demand(
      file instanceof File &&
        file.size > 0 &&
        file.size <= max &&
        /^audio\/(mpeg|mp3|wav|x-wav|mp4|webm|ogg)$/.test(file.type),
      "Selecciona un audio compatible.",
    );
    demand(
      name.length > 0 && name.length <= 100,
      "Escribe un nombre de hasta 100 caracteres.",
    );
    const result = await cloneVoice(name, file);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AppError ? e.message : "No se pudo procesar la voz.",
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
