import { resourcePlanSchema, defaultResources } from "./resources";
import { z } from "zod";
export const styles = [
  "slides",
  "whiteboard",
  "code",
  "spreadsheet",
  "story",
  "animation",
  "presenter",
] as const;
export const styleLabels: Record<string, string> = {
  slides: "Diapositivas",
  whiteboard: "Pizarra paso a paso",
  code: "Código en pantalla",
  spreadsheet: "Tablas y datos",
  story: "Cuento ilustrado",
  animation: "Animación educativa",
  presenter: "Profesor en pantalla · video IA",
  "per-module": "Se decidirá en cada módulo",
};
export const settingsSchema = z
  .object({
    resources: resourcePlanSchema.default(defaultResources),
    promoScope: z.enum(["none", "course", "modules"]).default("none"),
    promoSeconds: z.number().int().min(15).max(90).default(30),
    promoCTA: z
      .string()
      .trim()
      .max(300)
      .default("Conoce el programa e inscríbete."),
    mixStyles: z.boolean().default(false),
    audience: z
      .enum([
        "adults",
        "professionals",
        "children",
        "adolescents",
        "families",
        "other",
      ])
      .default("professionals"),
    libraryGroup: z
      .union([
        z.enum(["children", "adults", "families", "other"]),
        z.string().regex(/^custom:[a-f0-9-]{36}$/),
      ])
      .optional(),
    voiceMode: z.enum(["voiceover", "teacher"]).default("voiceover"),
    audienceDetail: z.string().trim().max(200).default(""),
    level: z.enum(["basic", "intermediate", "advanced"]).default("basic"),
    approach: z.enum(["theory", "practice", "mixed"]).default("mixed"),
    style: z.enum([...styles, "per-module"]).default("slides"),
    language: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .default("Español latinoamericano"),
    moduleCount: z.number().int().min(1).max(100).default(6),
    minutes: z.number().int().min(1).max(60).default(10),
    provider: z
      .enum(["openai", "gemini", "anthropic", "mistral"])
      .default("openai"),
    model: z.string().trim().max(150).default(""),
    imageProvider: z.enum(["openai", "gemini", "fal"]).default("openai"),
    imageQuality: z.enum(["low", "medium", "high"]).default("low"),
    videoProvider: z.enum(["gemini", "fal"]).default("gemini"),
    videoModel: z.string().max(150).default(""),
    videoResolution: z.string().max(30).default("720p"),
    videoDuration: z.number().int().min(3).max(20).default(6),
    videoAspect: z.enum(["16:9", "9:16"]).default("16:9"),
    exportAspect: z.enum(["16:9", "9:16"]).default("16:9"),
    exportResolution: z.enum(["720p", "1080p"]).default("720p"),
    voiceSpeed: z.number().min(0.5).max(2).default(1),
    imageModel: z.string().max(150).default(""),
    voiceProvider: z
      .enum(["openai", "gemini", "elevenlabs", "cartesia"])
      .default("elevenlabs"),
    voiceId: z.string().max(150).default(""),
    voiceModel: z.string().max(150).default(""),
    tone: z.string().max(300).default("Claro, cercano y profesional"),
  })
  .strict();
export type CourseSettings = z.infer<typeof settingsSchema>;
export const courseInput = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z
    .enum(["course", "diploma", "program", "workshop", "seminar"])
    .default("course"),
  description: z.string().trim().max(1000).default(""),
  prompt: z.string().trim().max(20000).default(""),
  settings: settingsSchema,
});
export const moduleInput = z.object({
  title: z.string().trim().min(1).max(200),
  brief: z.string().max(12000).default(""),
  minutes: z.number().int().min(1).max(60).default(10),
  style: z.enum([...styles, "inherit"]).default("inherit"),
  mixStyles: z.boolean().nullable().default(null),
});
export const sceneSchema = z
  .object({
    title: z.string().min(1).max(180),
    kind: z.enum(styles),
    narration: z.string().min(1).max(4000),
    steps: z.array(z.string().max(600)).min(1).max(12),
    code: z.string().max(6000).default(""),
    columns: z.array(z.string().max(80)).max(8).default([]),
    rows: z
      .array(z.array(z.string().max(160)).max(8))
      .max(12)
      .default([]),
    illustrationPrompt: z.string().max(1500).default(""),
  })
  .strict();
export const lessonSchema = z
  .object({
    objectives: z.array(z.string().max(400)).min(1).max(12),
    scenes: z.array(sceneSchema).min(1).max(16),
    exercise: z.string().max(10000),
    solution: z.string().max(10000),
    references: z.array(z.string().max(500)).max(15).default([]),
  })
  .strict();
export type Lesson = z.infer<typeof lessonSchema>;
export const outlineSchema = z
  .object({ modules: z.array(moduleInput).min(1).max(200) })
  .strict();
export const materialInput = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum([
    "guide",
    "book",
    "workshop",
    "exam",
    "slides",
    "bibliography",
    "infographic",
  ]),
  instructions: z.string().max(8000).default(""),
});
export const materialOutput = z
  .object({
    sections: z
      .array(
        z.object({ title: z.string().max(200), body: z.string().max(16000) }),
      )
      .min(1)
      .max(30),
    answerKey: z.string().max(16000).default(""),
  })
  .strict();
export function parseGenerated<T>(raw: string, schema: z.ZodType<T>): T {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  return schema.parse(JSON.parse(text));
}
