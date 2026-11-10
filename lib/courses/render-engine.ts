import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { classroomSVG } from "./classroom-frame";
import type { Lesson } from "./schema";
export type RenderScene = { speech: Buffer; image?: Buffer };
async function command(bin: string, args: string[], signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let output = "",
      error = "";
    child.stdout.on("data", (b) => {
      output = (output + b).slice(-8192);
    });
    child.stderr.on("data", (b) => {
      error = (error + b).slice(-4096);
    });
    child.on("error", () =>
      reject(
        Error(
          "El servidor no tiene disponible FFmpeg/FFprobe o la tarea se detuvo.",
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            Error(
              "No se pudo procesar el audio o componer el video. Comprueba los recursos de la clase.",
            ),
          ),
    );
  });
}
/** No real-time screen capture: each scene is encoded as fast as the bounded worker allows. */
export async function renderClassroom(
  lesson: Lesson,
  media: RenderScene[],
  resolution: "720p" | "1080p",
  signal: AbortSignal,
  progress: (n: number) => Promise<void>,
) {
  const folder = await mkdtemp(join(tmpdir(), "course-render-"));
  try {
    const width = resolution === "1080p" ? 1920 : 1280,
      height = resolution === "1080p" ? 1080 : 720,
      segments: string[] = [],
      durations: number[] = [];
    for (let i = 0; i < lesson.scenes.length; i++) {
      if (!media[i]?.speech?.length)
        throw Error("Falta la narración de una escena.");
      const audio = join(folder, `audio-${i}`);
      await writeFile(audio, media[i].speech, { mode: 0o600 });
      const duration = Number(
        (
          await command(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration",
              "-of",
              "default=noprint_wrappers=1:nokey=1",
              audio,
            ],
            signal,
          )
        ).trim(),
      );
      if (!Number.isFinite(duration) || duration <= 0 || duration > 600)
        throw Error(
          "Cada escena debe tener audio válido y durar como máximo diez minutos.",
        );
      durations.push(duration);
    }
    if (durations.reduce((a, b) => a + b, 0) > 1200)
      throw Error(
        "Divide esta clase en módulos de hasta veinte minutos para exportar de forma ligera.",
      );
    for (let i = 0; i < lesson.scenes.length; i++) {
      signal.throwIfAborted();
      const output = join(folder, `scene-${i}.mp4`),
        duration = durations[i],
        frames = Math.max(1, Math.ceil(duration * 6));
      const image = media[i].image
        ? "data:image/png;base64," +
          (
            await sharp(media[i].image, { limitInputPixels: 40000000 })
              .rotate()
              .resize({ width: 700, height: 700, fit: "inside" })
              .png()
              .toBuffer()
          ).toString("base64")
        : undefined;
      const child = spawn(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-f",
          "image2pipe",
          "-framerate",
          "6",
          "-i",
          "pipe:0",
          "-i",
          join(folder, `audio-${i}`),
          "-t",
          String(duration),
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "27",
          "-pix_fmt",
          "yuv420p",
          "-r",
          "24",
          "-threads",
          "1",
          "-c:a",
          "aac",
          "-b:a",
          "64k",
          "-movflags",
          "+faststart",
          output,
        ],
        { stdio: ["pipe", "ignore", "pipe"], signal },
      );
      let failure: Error | null = null;
      child.stdin.on("error", () => {
        failure = Error("Se interrumpió la composición del video.");
      });
      child.stderr.resume();
      const finished = new Promise<void>((resolve, reject) => {
        child.on("error", () =>
          reject(Error("No se pudo iniciar la composición en el servidor.")),
        );
        child.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(
                Error("La composición de video no terminó correctamente."),
              ),
        );
      });
      // Attach immediately: process failures must not become unhandled while frames are prepared.
      void finished.catch(() => {});
      try {
        for (let n = 0; n < frames; n++) {
          signal.throwIfAborted();
          if (failure) throw failure;
          const frame = await sharp(
            Buffer.from(
              classroomSVG(
                lesson.scenes[i],
                frames === 1 ? 1 : n / (frames - 1),
                i,
                lesson.scenes.length,
                width,
                height,
                image,
              ),
            ),
          )
            .png()
            .toBuffer();
          if (!child.stdin.write(frame))
            await new Promise<void>((resolve, reject) => {
              const done = () => {
                  cleanup();
                  resolve();
                },
                fail = () => {
                  cleanup();
                  reject(Error("Se detuvo la composición."));
                },
                cleanup = () => {
                  child.stdin.off("drain", done);
                  child.stdin.off("error", fail);
                  child.stdin.off("close", fail);
                };
              child.stdin.once("drain", done);
              child.stdin.once("error", fail);
              child.stdin.once("close", fail);
            });
          if (n % 30 === 0)
            await progress(
              Math.min(
                95,
                Math.floor(((i + n / frames) / lesson.scenes.length) * 95),
              ),
            );
        }
        child.stdin.end();
        await finished;
      } finally {
        if (child.exitCode === null) child.kill("SIGTERM");
      }
      segments.push(output);
    }
    await writeFile(
      join(folder, "list.txt"),
      segments.map((_, i) => `file 'scene-${i}.mp4'`).join("\n"),
      { mode: 0o600 },
    );
    const output = join(folder, "class.mp4");
    await command(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        join(folder, "list.txt"),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        output,
      ],
      signal,
    );
    if ((await stat(output)).size > 64 * 1024 * 1024)
      throw Error(
        "El módulo supera 64 MB. Exporta a 720p o divide el contenido en módulos más cortos.",
      );
    const bytes = await readFile(output);
    await progress(98);
    const duration = Number(
      (
        await command(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            output,
          ],
          signal,
        )
      ).trim(),
    );
    if (!Number.isFinite(duration) || duration <= 0)
      throw Error("No se pudo confirmar la duración del video final.");
    return { bytes, duration };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
