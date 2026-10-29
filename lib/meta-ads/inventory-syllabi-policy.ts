import { z } from "zod";
export const syllabusSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(100),
    scope: z.string().trim().min(1).max(80),
    content: z.string().trim().min(1).max(30000),
    source: z.string().max(200).optional(),
  })
  .strict();
export const syllabiSchema = z
  .array(syllabusSchema)
  .max(50)
  .refine(
    (a) => new Set(a.map((s) => s.id)).size === a.length,
    "Los temarios tienen identificadores repetidos.",
  )
  .refine(
    (a) => a.reduce((n, s) => n + s.content.length, 0) <= 400000,
    "Los temarios de este ítem superan el límite.",
  );
export type InventorySyllabus = z.infer<typeof syllabusSchema>;
export const catalogNameKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
export const catalogPackageSchema = z
  .object({
    format: z.literal("inventario-catalog-v1"),
    targetName: z.string().trim().min(1).max(80),
    categories: z.array(z.string().trim().min(1).max(80)).max(100),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(150),
            primary: z.string().trim().min(1).max(80),
            secondary: z.array(z.string().trim().min(1).max(80)).max(100),
            syllabi: syllabiSchema,
          })
          .strict(),
      )
      .min(1)
      .max(1500),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      new Set(v.items.map((i) => catalogNameKey(i.name))).size !==
      v.items.length
    )
      c.addIssue({
        code: "custom",
        message: "El catálogo contiene inventarios repetidos.",
      });
    if (
      v.items.reduce(
        (n, i) => n + i.syllabi.reduce((a, s) => a + s.content.length, 0),
        0,
      ) > 5000000
    )
      c.addIssue({
        code: "custom",
        message: "El catálogo supera el límite de temarios.",
      });
  });
export type InventoryCatalogPackage = z.infer<typeof catalogPackageSchema>;
