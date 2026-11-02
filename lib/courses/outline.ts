import { demand } from "../errors";
export function parseCourseOutline(text: string) {
  demand(
    text.trim().length > 0 && text.length <= 30000,
    "Pega un temario de hasta 30 000 caracteres.",
  );
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const heading =
    /^(?:\d+[.)]\s*)?(?:m[oó]dulo|unidad|tema|paso)\s*(?:\d+|[IVXLCDM]+)\s*[:.\-–)]?\s*/i;
  const hasHeadings = lines.some((l) => heading.test(l));
  const modules: { title: string; brief: string }[] = [];
  for (const line of lines) {
    if (hasHeadings && !heading.test(line) && modules.length) {
      modules[modules.length - 1].brief +=
        (modules[modules.length - 1].brief ? "\n" : "") + line;
      continue;
    }
    if (hasHeadings && !heading.test(line)) continue;
    const title = line
      .replace(heading, "")
      .replace(/^(?:[-*•]|\d+[.)\-])\s*/, "")
      .trim();
    demand(
      title.length > 0 && title.length <= 200,
      "Cada título debe tener entre 1 y 200 caracteres.",
    );
    modules.push({ title, brief: "" });
  }
  demand(
    modules.length > 0 && modules.length <= 200,
    "El temario debe contener entre 1 y 200 módulos.",
  );
  demand(
    modules.every((m) => m.brief.length <= 12000),
    "La descripción de un módulo supera los 12 000 caracteres.",
  );
  return modules;
}
