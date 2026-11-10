import { numericCell } from "./classroom";
import type { Lesson } from "./schema";
type Scene = Lesson["scenes"][number];
type Mark = {
  kind: "box" | "circle" | "line" | "text";
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  text?: string;
  color: string;
  size?: number;
  bold?: boolean;
  mono?: boolean;
  stroke?: boolean;
};
const palette = {
  teal: "#24bfa0",
  blue: "#5b9de8",
  amber: "#f6bd58",
  purple: "#aa8ce8",
  coral: "#ef8790",
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function teachingFrame(
  scene: Scene,
  progress: number,
  index = 0,
  total = 1,
  hasImage = false,
): Mark[] {
  const p = Math.max(0, Math.min(1, progress)),
    marks: Mark[] = [],
    board = scene.kind === "whiteboard",
    code = scene.kind === "code",
    data = scene.kind === "spreadsheet",
    animated = scene.kind === "animation" || scene.kind === "story",
    dark = board || code;
  const ink = dark ? "#ecf4ef" : "#20394e",
    muted = dark ? "#a6c9be" : "#637c90",
    bg = board
      ? "#113e37"
      : code
        ? "#132235"
        : animated
          ? "#fff8eb"
          : "#f4f7fb";
  const box = (x: number, y: number, w: number, h: number, color: string) =>
    marks.push({ kind: "box", x, y, w, h, color });
  const line = (x: number, y: number, w: number, h: number, color: string) =>
    marks.push({ kind: "line", x, y, w, h, color });
  const circle = (x: number, y: number, r: number, color: string) =>
    marks.push({ kind: "circle", x, y, r, color });
  const text = (
    x: number,
    y: number,
    value: string,
    size = 24,
    color = ink,
    bold = false,
    mono = false,
  ) => marks.push({ kind: "text", x, y, text: value, size, color, bold, mono });
  function lines(
    value: string,
    x: number,
    y: number,
    width: number,
    size = 24,
    color = ink,
    max = 3,
  ) {
    const length = Math.max(8, Math.floor(width / (size * 0.57)));
    let row = "",
      n = 0;
    for (const word of value.split(/\s+/)) {
      if ((row + word).length > length && row) {
        text(x, y + n * size * 1.45, row, size, color);
        row = "";
        if (++n >= max) return;
      }
      row += (row ? " " : "") + word;
    }
    if (n < max) text(x, y + n * size * 1.45, row, size, color);
  }
  box(0, 0, 1280, 720, bg);
  box(0, 0, 9, 720, palette.teal);
  text(
    48,
    40,
    `${String(index + 1).padStart(2, "0")} / ${total}   ·   AULA`,
    16,
    muted,
    true,
  );
  lines(scene.title, 48, 92, 1160, 32, ink, 2);
  const shown = Math.min(
      scene.steps.length - 1,
      Math.floor(p * scene.steps.length),
    ),
    step = scene.steps[shown] ?? "";
  if (code) {
    box(40, 150, 1200, 445, "#1c2d43");
    box(40, 150, 1200, 36, "#263d54");
    circle(62, 168, 5, "#ef8790");
    circle(80, 168, 5, "#f6bd58");
    circle(98, 168, 5, "#24bfa0");
    text(124, 174, "ejemplo.py  ·  demostración de código", 15, "#b4c9dd");
    const visible = scene.code.slice(0, Math.floor(scene.code.length * p)),
      rows = visible.split("\n"),
      start = Math.max(0, rows.length - 15);
    rows.slice(start, start + 15).forEach((row, i) => {
      text(58, 214 + i * 24, String(start + i + 1), 16, "#6f8ca9", false, true);
      text(102, 214 + i * 24, row.slice(0, 91), 19, "#c6eddf", false, true);
    });
    lines(step, 48, 633, 1160, 23, ink, 2);
    text(
      48,
      690,
      "Ejemplo para revisar · no es una ejecución de Python",
      14,
      muted,
    );
  } else if (data && scene.columns.length) {
    const cw = 740 / scene.columns.length;
    box(40, 150, 1200, 430, "#ffffff");
    text(60, 178, "LABORATORIO DE DATOS", 15, "#637c90", true);
    [scene.columns, ...scene.rows].slice(0, 10).forEach((row, r) =>
      row.forEach((cell, c) => {
        box(
          55 + c * cw,
          195 + r * 33,
          cw - 2,
          31,
          r === 0
            ? "#226f70"
            : r === shown + 1
              ? "#def4e9"
              : r % 2
                ? "#eef3f8"
                : "#ffffff",
        );
        text(
          62 + c * cw,
          217 + r * 33,
          cell.slice(0, Math.max(5, Math.floor(cw / 10))),
          17,
          r === 0 ? "#ffffff" : "#20394e",
        );
      }),
    );
    const numeric = scene.rows.slice(0, 7).map((r) => {
        const n = numericCell(r[r.length - 1] ?? "");
        return n ?? 0;
      }),
      scale = Math.max(1, ...numeric.map(Math.abs));
    numeric.forEach((v, i) => {
      const h = (Math.abs(v) / scale) * 210;
      box(830 + i * 51, 465 - h, 32, h, palette.teal);
      text(830 + i * 51, 488, String(i + 1), 14, muted);
    });
    text(836, 538, "Simulador educativo", 17, muted);
    lines(step, 48, 625, 1160, 24, ink, 2);
  } else {
    const hasDrawing = hasImage || !!scene.drawings?.length,
      tw = hasDrawing ? 590 : 1120;
    for (let i = Math.max(0, shown - 3), row = 0; i <= shown; i++, row++) {
      const fraction = Math.max(0, Math.min(1, p * scene.steps.length - i)),
        value = board
          ? scene.steps[i].slice(
              0,
              Math.floor(scene.steps[i].length * fraction),
            )
          : scene.steps[i];
      circle(
        63,
        184 + row * 105,
        13,
        i === shown ? palette.amber : palette.teal,
      );
      text(58, 190 + row * 105, String(i + 1), 15, "#153e37", true);
      lines(
        value,
        92,
        190 + row * 105,
        tw - 35,
        25,
        i === shown && dark ? "#fff1ae" : ink,
        3,
      );
    }
    if (hasDrawing) {
      if (!dark) box(735, 155, 505, 440, "#ffffff");
      for (const d of scene.drawings ?? []) {
        const local = Math.max(0, Math.min(1, p * scene.steps.length - d.step));
        if (local <= 0) continue;
        const motion = d.motion === "slide" ? (1 - local) * 25 : 0,
          bob = d.motion === "float" ? Math.sin(p * Math.PI * 4) * 5 : 0;
        const size = d.size * 0.85,
          x = Math.min(1220 - size, 775 + d.x * 0.44 - motion),
          y = Math.min(540 - size, 200 + d.y * 0.65 + bob),
          c = palette[d.color];
        if (d.kind === "person") {
          circle(x, y, size * 0.24, "#34475a");
          circle(x, y + size * 0.07, size * 0.21, "#edc5a3");
          circle(x - size * 0.07, y + size * 0.05, size * 0.025, "#34475a");
          circle(x + size * 0.07, y + size * 0.05, size * 0.025, "#34475a");
          line(x - size * 0.05, y + size * 0.16, size * 0.1, 0, "#b67c64");
          box(x - size * 0.22, y + size * 0.31, size * 0.44, size * 0.4, c);
          circle(x - size * 0.17, y + size * 0.34, size * 0.1, c);
          circle(x + size * 0.17, y + size * 0.34, size * 0.1, c);
          line(
            x - size * 0.25,
            y + size * 0.36,
            -size * 0.18,
            size * 0.23,
            "#edc5a3",
          );
          line(
            x + size * 0.25,
            y + size * 0.36,
            size * 0.22,
            -size * (0.1 + Math.sin(p * Math.PI * 4) * 0.1),
            "#edc5a3",
          );
          line(
            x - size * 0.1,
            y + size * 0.72,
            -size * 0.05,
            size * 0.32,
            "#34475a",
          );
          line(
            x + size * 0.1,
            y + size * 0.72,
            size * 0.05,
            size * 0.32,
            "#34475a",
          );
        } else if (d.kind === "tree") {
          box(x - 5, y + size * 0.4, 10, size * 0.6, "#b38c63");
          circle(x - size * 0.21, y + size * 0.38, size * 0.3, c);
          circle(x + size * 0.21, y + size * 0.38, size * 0.3, c);
          circle(x, y + size * 0.12, size * 0.32, c);
        } else if (d.kind === "sun") {
          circle(x, y, size * 0.3, "#f6bd58");
          for (let n = 0; n < 8; n++) {
            const a = (n * Math.PI) / 4;
            line(
              x + Math.cos(a) * size * 0.4,
              y + Math.sin(a) * size * 0.4,
              Math.cos(a) * size * 0.2,
              Math.sin(a) * size * 0.2,
              "#f6bd58",
            );
          }
        } else if (d.kind === "water") {
          for (let n = 0; n < 3; n++)
            for (let segment = 0; segment < 6; segment++) {
              const a = Math.sin(segment + p * Math.PI * 2) * 4;
              const b = Math.sin(segment + 1 + p * Math.PI * 2) * 4;
              line(
                x + (segment * size) / 6,
                y + n * 13 + a,
                size / 6,
                b - a,
                "#5b9de8",
              );
            }
        } else if (d.kind === "arrow") {
          line(x, y, size * local, 0, c);
          line(x + size * local, y, -12, -8, c);
          line(x + size * local, y, -12, 8, c);
        } else if (d.kind === "circle") circle(x, y, size * 0.5 * local, c);
        else if (d.kind !== "label")
          box(x, y, size, d.kind === "bar" ? size * local : size * 0.65, c);
        if (d.label)
          lines(
            d.label,
            x - 15,
            y + (d.kind === "label" ? 0 : size + 25),
            Math.min(220, 1230 - x),
            18,
            dark ? "#e5f6ed" : "#355267",
            2,
          );
      }
    }
    if (board) {
      text(48, 640, "Piensa el siguiente paso antes de continuar.", 17, muted);
    }
  }
  box(48, 704, 1180, 4, dark ? "#3b5b5c" : "#dee5ee");
  box(48, 704, 1180 * p, 4, palette.teal);
  return marks;
}
export function classroomSVG(
  scene: Scene,
  p: number,
  index = 0,
  total = 1,
  width = 1280,
  height = 720,
  image?: string,
) {
  const marks = teachingFrame(scene, p, index, total, !!image)
    .map((m) => {
      const base = `fill="${m.color}"`;
      if (m.kind === "box")
        return `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="3" ${base}/>`;
      if (m.kind === "circle")
        return `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" ${base}/>`;
      if (m.kind === "line")
        return `<line x1="${m.x}" y1="${m.y}" x2="${m.x + (m.w ?? 0)}" y2="${m.y + (m.h ?? 0)}" stroke="${m.color}" stroke-width="4" stroke-linecap="round"/>`;
      return `<text x="${m.x}" y="${m.y}" font-family="${m.mono ? "DejaVu Sans Mono" : "DejaVu Sans"},sans-serif" font-size="${m.size}" font-weight="${m.bold ? 700 : 400}" ${base}>${esc(m.text ?? "")}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1280 720">${marks}${image ? `<image href="${image}" x="760" y="180" width="450" height="400" preserveAspectRatio="xMidYMid meet"/>` : ""}</svg>`;
}
export function paintClassroom(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  p: number,
  index: number,
  total: number,
  image?: HTMLImageElement,
) {
  const portrait = ctx.canvas.height > ctx.canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#122437";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const scale = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    0,
    portrait ? (ctx.canvas.height - 720 * scale) / 2 : 0,
  );
  for (const m of teachingFrame(scene, p, index, total, !!image)) {
    ctx.fillStyle = m.color;
    if (m.kind === "box") ctx.fillRect(m.x, m.y, m.w!, m.h!);
    else if (m.kind === "circle") {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r!, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === "line") {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.w!, m.y + m.h!);
      ctx.stroke();
    } else {
      ctx.font = `${m.bold ? "700" : "400"} ${m.size}px ${m.mono ? "monospace" : "sans-serif"}`;
      ctx.fillText(m.text ?? "", m.x, m.y);
    }
  }
  if (image) {
    const s = Math.min(450 / image.width, 400 / image.height);
    ctx.drawImage(image, 760, 180, image.width * s, image.height * s);
  }
}
