import { styleLabels, type CourseSettings } from "./schema";
export const audienceLabels: Record<CourseSettings["audience"], string> = {
  adults: "Adultos",
  professionals: "Profesionales y técnicos",
  children: "Niños",
  adolescents: "Adolescentes",
  families: "Padres y familias",
  other: "Otro público",
};
export const courseGroups = [
  {
    id: "children",
    title: "Cursos para niños y adolescentes",
    create: "Crear curso para niños y adolescentes",
    icon: "✦",
    description: "Descubrir, practicar y aprender según su edad.",
  },
  {
    id: "adults",
    title: "Cursos para adultos",
    create: "Crear curso para adultos",
    icon: "◈",
    description: "Formación general, técnica y profesional.",
  },
  {
    id: "families",
    title: "Cursos para padres y familias",
    create: "Crear curso para padres y familias",
    icon: "♡",
    description: "Orientación y herramientas para acompañar.",
  },
  {
    id: "other",
    title: "Cursos para otros",
    create: "Crear curso para otros",
    icon: "✧",
    description: "Define un público personalizado para tu programa.",
  },
] as const;
export type CourseGroupId =
  (typeof courseGroups)[number]["id"] | `custom:${string}`;
export function courseGroup(
  s: Pick<CourseSettings, "libraryGroup" | "audience">,
) {
  return (
    (s.libraryGroup as CourseGroupId | undefined) ??
    (s.audience === "children" || s.audience === "adolescents"
      ? "children"
      : s.audience === "families"
        ? "families"
        : s.audience === "other"
          ? "other"
          : "adults")
  );
}
export function teachingDirection(s: CourseSettings, style = s.style) {
  return [
    "Dirección educativa obligatoria:",
    "Destinatario real: " +
      audienceLabels[s.audience] +
      ". Detalle/edad: " +
      (s.audienceDetail || "no especificado; no inventar una edad exacta") +
      ".",
    "La carpeta es solo organización. El público objetivo seleccionado determina vocabulario, ejemplos, ritmo y complejidad; un cuento, una animación o un profesor dinámico NO implican contenido infantil.",
    s.audience === "families"
      ? "Habla a padres y familiares adultos; hablar sobre niños no convierte a los niños en destinatarios."
      : s.audience === "professionals" || s.audience === "adults"
        ? "Respeta el nivel adulto/profesional. Evita infantilizar el lenguaje aunque el estilo sea ilustrado o dinámico."
        : s.audience === "children" || s.audience === "adolescents"
          ? "Adecúa explicación y ejemplos a la edad indicada. Distingue niños de adolescentes; no supongas que tienen el mismo desarrollo."
          : "Usa el detalle del público para definir los destinatarios; no lo sustituyas por otro público.",
    "Nivel: " +
      s.level +
      "; enfoque: " +
      s.approach +
      "; idioma: " +
      s.language +
      ".",
    "Estilo visual: " +
      (styleLabels[style] ?? style) +
      ". No cambia el destinatario ni el nivel.",
    s.voiceMode === "teacher"
      ? "Narración del profesor en primera persona: explica, guía y acompaña como docente; el tono no cambia la audiencia."
      : "Voz en off: narrador fuera de pantalla, sin necesidad de mostrar una persona hablando.",
    "Tono del profesor/narrador: " + s.tone + ".",
    "Minutos por módulo son un objetivo editorial, nunca duración verificada. El prompt del curso aporta el tema y los ejemplos; si contradice público o nivel seleccionados, conserva la selección explícita y adapta los ejemplos.",
  ].join("\n");
}
export function courseVisualPrompt(
  s: CourseSettings,
  scene: { kind: string; title: string; narration: string },
  brief: string,
  video = false,
) {
  return (
    teachingDirection(s, scene.kind as CourseSettings["style"]) +
    "\n" +
    (scene.kind === "animation"
      ? "Animación educativa original con dibujos, acciones visuales y transiciones que explican el concepto; continuidad de personajes y ambiente. "
      : scene.kind === "presenter"
        ? "Profesor original en pantalla, explicando con gestos y recursos visuales. Personalidad y vestuario apropiados al público y tema; no imitar personas reales ni personajes de canales. "
        : "Escena educativa visual apropiada al estilo seleccionado. ") +
    (video
      ? "El montaje añadirá la narración por separado; no generar diálogo, música ni rótulos. No depender de sincronización labial. "
      : "Ilustración sin texto. ") +
    "\nTema: " +
    scene.title +
    "\nGuion de referencia: " +
    scene.narration +
    "\nInstrucciones visuales: " +
    brief
  );
}
