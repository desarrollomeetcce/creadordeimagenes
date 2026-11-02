"use client";
import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/courses/schema";
type Asset = { id: string; revision: number; scene: number; kind: string };
const assetURL = (id: string) =>
  "/api/courses-ai/assets/" + encodeURIComponent(id);
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  line: number,
  maxLines = 8,
) {
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let row = "";
    for (const word of paragraph.split(" ")) {
      if (ctx.measureText(row + word).width > width && row) {
        ctx.fillText(row, x, y);
        y += line;
        if (++lines >= maxLines) return y;
        row = "";
      }
      row += word + " ";
    }
    ctx.fillText(row, x, y);
    y += line;
    if (++lines >= maxLines) break;
  }
  return y;
}
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Lesson["scenes"][number],
  progress: number,
  number: number,
  total: number,
  image?: HTMLImageElement,
  clip?: HTMLVideoElement,
) {
  ctx.setTransform(
    ctx.canvas.width / 1280,
    0,
    0,
    ctx.canvas.height / 720,
    0,
    0,
  );
  if (clip && clip.readyState >= 2) {
    ctx.fillStyle = "#142032";
    ctx.fillRect(0, 0, 1280, 720);
    const scale = Math.min(1280 / clip.videoWidth, 720 / clip.videoHeight);
    ctx.drawImage(
      clip,
      (1280 - clip.videoWidth * scale) / 2,
      (720 - clip.videoHeight * scale) / 2,
      clip.videoWidth * scale,
      clip.videoHeight * scale,
    );
    ctx.fillStyle = "#101926c9";
    ctx.fillRect(0, 0, 1280, 90);
    ctx.fillRect(0, 580, 1280, 140);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px sans-serif";
    wrap(ctx, scene.title, 40, 54, 1200, 32, 1);
    ctx.font = "23px sans-serif";
    wrap(
      ctx,
      scene.steps[
        Math.min(
          scene.steps.length - 1,
          Math.floor(progress * scene.steps.length),
        )
      ] ?? "",
      40,
      624,
      1200,
      30,
      2,
    );
    ctx.fillStyle = "#9070d6";
    ctx.fillRect(0, 712, 1280 * Math.min(1, progress), 8);
    return;
  }
  const w = 1280,
    h = 720,
    p = Math.max(0, Math.min(1, progress)),
    dark = ["whiteboard", "code"].includes(scene.kind),
    story = scene.kind === "story" || scene.kind === "animation",
    animation = scene.kind === "animation";
  ctx.fillStyle =
    scene.kind === "whiteboard"
      ? "#123c36"
      : scene.kind === "code"
        ? "#152032"
        : story
          ? "#fff4df"
          : "#f6f7fc";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dark ? "#5ee0c0" : "#7961d6";
  ctx.fillRect(0, 0, 12, h);
  ctx.font = "600 20px sans-serif";
  ctx.fillStyle = dark ? "#a7d7d2" : "#665383";
  ctx.fillText(
    "CURSOS IA   /   " + String(number + 1).padStart(2, "0") + " · " + total,
    56,
    49,
  );
  ctx.fillStyle = dark ? "#ffffff" : "#202d46";
  ctx.font = "bold 38px sans-serif";
  wrap(ctx, scene.title, 56, 105, 1160, 44, 2);
  const shown = Math.min(
    scene.steps.length,
    Math.floor(p * scene.steps.length) + 1,
  );
  let y = 200;
  const hasVisual = !!image || scene.kind === "story";
  const textWidth = hasVisual ? 630 : 1140;
  if (scene.kind === "code" && scene.code) {
    ctx.fillStyle = "#26364d";
    ctx.fillRect(48, 167, 1184, 380);
    ctx.font = "20px monospace";
    ctx.fillStyle = "#b2efdd";
    const code = scene.code.slice(
      0,
      Math.max(1, Math.floor(scene.code.length * p)),
    );
    const lines = code.split("\n");
    const start = Math.max(0, lines.length - 15);
    for (let i = start; i < lines.length; i++)
      ctx.fillText(lines[i].slice(0, 91), 74, 199 + (i - start) * 23);
    ctx.fillStyle = "#d5dff2";
    ctx.font = "23px sans-serif";
    wrap(ctx, scene.steps[Math.max(0, shown - 1)] ?? "", 56, 592, 1140, 29, 3);
  } else if (scene.kind === "spreadsheet" && scene.columns.length) {
    const cols = scene.columns.length,
      cw = 1160 / cols;
    ctx.font = "18px sans-serif";
    for (const [r, row] of [scene.columns, ...scene.rows].slice(0, 9).entries())
      for (let c = 0; c < cols; c++) {
        const active = r === Math.floor(p * Math.min(8, scene.rows.length)) + 1;
        ctx.fillStyle =
          r === 0
            ? "#356d81"
            : active
              ? "#d4f4e6"
              : r % 2
                ? "#ffffff"
                : "#eaf0f7";
        ctx.fillRect(56 + c * cw, 174 + r * 36, cw - 2, 34);
        ctx.fillStyle = r === 0 ? "#fff" : "#20334a";
        ctx.fillText(
          String(row[c] ?? "").slice(0, Math.max(5, Math.floor(cw / 10))),
          62 + c * cw,
          198 + r * 36,
        );
      }
    ctx.fillStyle = "#22314c";
    ctx.font = "24px sans-serif";
    wrap(ctx, scene.steps[Math.max(0, shown - 1)] ?? "", 56, 568, 1140, 32, 3);
  } else {
    const size = scene.steps.length > 7 ? 23 : 29,
      line = scene.steps.length > 7 ? 29 : 36;
    ctx.font =
      (scene.kind === "whiteboard" ? "" : "500 ") +
      size +
      "px " +
      (scene.kind === "whiteboard" ? "cursive" : "sans-serif");
    for (let i = Math.max(0, shown - 6); i < shown; i++) {
      const stepProgress = Math.max(0, Math.min(1, p * scene.steps.length - i));
      const text =
        scene.kind === "whiteboard"
          ? scene.steps[i].slice(
              0,
              Math.max(1, Math.floor(scene.steps[i].length * stepProgress)),
            )
          : scene.steps[i];
      ctx.fillStyle = dark
        ? i === shown - 1
          ? "#fff4ac"
          : "#d4f3e8"
        : "#25344f";
      y = wrap(ctx, i + 1 + ". " + text, 56, y, textWidth, line, 2) + 18;
      if (y > 580) break;
    }
    if (image) {
      const ratio = Math.min(490 / image.width, 425 / image.height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(730, 170, 500, 440);
      ctx.clip();
      if (animation) {
        const zoom = 1 + p * 0.12;
        ctx.translate(980, 390);
        ctx.scale(zoom, zoom);
        ctx.translate(-980 + Math.sin(p * Math.PI) * 12, -390);
      }
      ctx.drawImage(image, 740, 190, image.width * ratio, image.height * ratio);
      ctx.restore();
    } else if (story) {
      ctx.fillStyle = "#eadbfa";
      ctx.beginPath();
      ctx.arc(
        986,
        353 + (animation ? Math.sin(p * Math.PI * 4) * 12 : 0),
        160,
        0,
        2 * Math.PI,
      );
      ctx.fill();
      ctx.fillStyle = "#ffcc78";
      ctx.fillRect(872, 315, 108, 145);
      ctx.fillStyle = "#8bc8da";
      ctx.fillRect(980, 315, 108, 145);
      ctx.strokeStyle = "#744d9e";
      ctx.lineWidth = 5;
      ctx.strokeRect(872, 315, 216, 145);
      ctx.beginPath();
      ctx.moveTo(980, 315);
      ctx.lineTo(980, 460);
      ctx.stroke();
      ctx.font = "bold 54px sans-serif";
      ctx.fillStyle = "#744d9e";
      ctx.fillText("✦", 958, 283);
    }
  }
  if (scene.kind === "presenter") {
    ctx.fillStyle = "#594388";
    ctx.font = "18px sans-serif";
    ctx.fillText(
      "Vista previa del guion · genera el video para ver al profesor",
      56,
      650,
    );
  } else if (animation) {
    ctx.fillStyle = "#594388";
    ctx.font = "18px sans-serif";
    ctx.fillText(
      image
        ? "Ilustración con movimiento · narración por separado"
        : "Vista previa · añade una ilustración o una escena de video",
      56,
      650,
    );
  }
  ctx.fillStyle = dark ? "#264c49" : "#e3e1f0";
  ctx.fillRect(56, 682, 1168, 6);
  ctx.fillStyle = dark ? "#5ee0c0" : "#8e70df";
  ctx.fillRect(56, 682, 1168 * p, 6);
}
async function loadClip(id: string) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = assetURL(id);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeAttribute("src");
      video.load();
      reject(Error("No se pudo cargar el clip de video."));
    }, 30000);
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve();
    };
    video.onerror = () => {
      clearTimeout(timer);
      reject(Error("No se pudo leer el clip de video."));
    };
  });
  return video;
}
export function CoursePlayer({
  lesson,
  assets,
  revision,
  title,
  resolution = "720p",
}: {
  lesson: Lesson;
  assets: Asset[];
  revision: number;
  title: string;
  resolution?: "720p" | "1080p";
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    stop = useRef(false),
    alive = useRef(true),
    audioContext = useRef<AudioContext | null>(null),
    [scene, setScene] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const currentAssets = assets.filter((a) => a.revision === revision);
  const narrated = lesson.scenes.every((_, i) =>
    currentAssets.some((a) => a.kind === "SPEECH" && a.scene === i),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
      void audioContext.current?.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (busy) return;
    let active = true;
    const draw = async () => {
      const va = currentAssets.find(
        (a) => a.kind === "VIDEO" && a.scene === scene,
      );
      let clip: HTMLVideoElement | undefined;
      if (va) clip = await loadClip(va.id).catch(() => undefined);
      const a = currentAssets.find(
        (a) => a.kind === "IMAGE" && a.scene === scene,
      );
      let image: HTMLImageElement | undefined;
      if (a) {
        image = new Image();
        image.src = assetURL(a.id);
        await image.decode().catch(() => {});
        if (!image.naturalWidth) image = undefined;
      }
      if (active && canvas.current) {
        const ctx = canvas.current.getContext("2d");
        if (ctx)
          drawScene(
            ctx,
            lesson.scenes[scene],
            1,
            scene,
            lesson.scenes.length,
            image,
            clip,
          );
      }
      if (clip) {
        clip.pause();
        clip.removeAttribute("src");
        clip.load();
      }
    };
    void draw();
    return () => {
      active = false;
    };
  }, [scene, busy, lesson, assets, revision]);
  async function play(exporting: boolean) {
    if (busy) return;
    stop.current = false;
    setError("");
    setBusy(true);
    setMessage(
      exporting
        ? "Exportando video; mantén esta ventana visible…"
        : "Reproduciendo…",
    );
    let activeClip: HTMLVideoElement | null = null;
    let ctxAudio: AudioContext | null = null,
      recorder: MediaRecorder | null = null,
      stream: MediaStream | null = null,
      blobURL: string | null = null;
    try {
      const cv = canvas.current!,
        ctx = cv.getContext("2d")!;
      ctxAudio = new AudioContext();
      audioContext.current = ctxAudio;
      await ctxAudio.resume();
      const dest = ctxAudio.createMediaStreamDestination();
      const chunks: Blob[] = [];
      let ended: Promise<void> = Promise.resolve();
      let mime = "";
      if (exporting) {
        if (!narrated)
          throw Error("Genera primero la narración de todas las escenas.");
        mime =
          [
            "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
          ].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
        if (!mime || !cv.captureStream)
          throw Error(
            "Este navegador no admite exportación de video. Usa Chrome o Edge actualizado.",
          );
        stream = cv.captureStream(24);
        dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: resolution === "1080p" ? 4000000 : 1800000,
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        ended = new Promise<void>((resolve, reject) => {
          recorder!.onstop = () => resolve();
          recorder!.onerror = () =>
            reject(Error("La grabación se interrumpió."));
        });
        recorder.start(1000);
      }
      for (
        let i = exporting ? 0 : scene;
        i < lesson.scenes.length && !stop.current;
        i++
      ) {
        setScene(i);
        const s = lesson.scenes[i],
          a = currentAssets.find((a) => a.kind === "SPEECH" && a.scene === i),
          ia = currentAssets.find((a) => a.kind === "IMAGE" && a.scene === i);
        let image: HTMLImageElement | undefined;
        if (ia) {
          image = new Image();
          image.src = assetURL(ia.id);
          await image.decode().catch(() => {});
          if (!image.naturalWidth) image = undefined;
        }
        const videoAsset = currentAssets.find(
          (a) => a.scene === i && a.kind === "VIDEO",
        );
        const clip = videoAsset ? await loadClip(videoAsset.id) : undefined;
        activeClip = clip ?? null;
        let buffer: AudioBuffer | null = null,
          source: AudioBufferSourceNode | null = null;
        if (a) {
          const r = await fetch(assetURL(a.id), {
            signal: AbortSignal.timeout(30000),
          });
          if (!r.ok) throw Error("No se pudo cargar una narración.");
          buffer = await ctxAudio.decodeAudioData(await r.arrayBuffer());
        }
        if (stop.current) break;
        const duration =
          buffer?.duration ?? Math.max(5, Math.min(18, s.steps.length * 3));
        if (buffer) {
          source = ctxAudio.createBufferSource();
          source.buffer = buffer;
          source.connect(dest);
          source.connect(ctxAudio.destination);
          source.start();
        }
        if (clip) await clip.play();
        const start = ctxAudio.currentTime;
        await new Promise<void>((resolve) => {
          const frame = () => {
            if (stop.current || !alive.current) {
              resolve();
              return;
            }
            const p = (ctxAudio!.currentTime - start) / duration;
            drawScene(ctx, s, p, i, lesson.scenes.length, image, clip);
            if (p >= 1) resolve();
            else requestAnimationFrame(frame);
          };
          frame();
        });
        source?.stop();
        source?.disconnect();
        if (clip) {
          clip.pause();
          clip.removeAttribute("src");
          clip.load();
          activeClip = null;
        }
      }
      if (recorder && recorder.state !== "inactive") recorder.stop();
      await ended;
      if (exporting && !stop.current) {
        const blob = new Blob(chunks, { type: mime });
        blobURL = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobURL;
        link.download =
          title + "." + (mime.startsWith("video/mp4") ? "mp4" : "webm");
        link.click();
        setMessage("Video exportado.");
      } else
        setMessage(
          stop.current ? "Reproducción detenida." : "Reproducción terminada.",
        );
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "No se pudo reproducir.");
    } finally {
      if (activeClip) {
        activeClip.pause();
        activeClip.removeAttribute("src");
        activeClip.load();
      }
      if (recorder?.state === "recording") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (ctxAudio && ctxAudio.state !== "closed")
        await ctxAudio.close().catch(() => {});
      audioContext.current = null;
      if (blobURL) {
        const url = blobURL;
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="course-player">
      <canvas
        ref={canvas}
        width={resolution === "1080p" ? 1920 : 1280}
        height={resolution === "1080p" ? 1080 : 720}
        aria-label={"Presentación: " + lesson.scenes[scene].title}
      />
      <div className="course-toolbar">
        <button
          type="button"
          disabled={busy || scene === 0}
          onClick={() => setScene(scene - 1)}
        >
          ←
        </button>
        <span>
          Escena {scene + 1} / {lesson.scenes.length}
        </span>
        <button
          type="button"
          disabled={busy || scene === lesson.scenes.length - 1}
          onClick={() => setScene(scene + 1)}
        >
          →
        </button>
        <button type="button" disabled={busy} onClick={() => void play(false)}>
          ▶ Reproducir
        </button>
        <button
          type="button"
          disabled={busy || !narrated}
          onClick={() => void play(true)}
        >
          ↓ Exportar video
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              stop.current = true;
            }}
          >
            Detener
          </button>
        )}
      </div>
      <p className="muted">
        {narrated
          ? "Video con voz y revelado progresivo. Exportación local en MP4 o WebM según tu navegador."
          : "Vista previa sin narración en las escenas pendientes. Genera la voz antes de exportar video."}
      </p>
      <p role="status">{message}</p>
      {error && (
        <p role="alert" className="course-error">
          {error}
        </p>
      )}
      <details>
        <summary>Texto accesible de la escena</summary>
        <p>{lesson.scenes[scene].narration}</p>
        <ol>
          {lesson.scenes[scene].steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
