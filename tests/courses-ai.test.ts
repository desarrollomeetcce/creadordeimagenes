import test from "node:test";
import assert from "node:assert/strict";
import {
  courseInput,
  settingsSchema,
  lessonSchema,
  parseGenerated,
} from "../lib/courses/schema";
import {
  documentHTML,
  documentDOCX,
  documentPPTX,
  csv,
} from "../lib/courses/exports";
import JSZip from "jszip";
test("Cursos: configuraciones y escenas conservan pasos independientes y límites", () => {
  const s = settingsSchema.parse({});
  assert.equal(s.approach, "mixed");
  assert.equal(s.audience, "professionals");
  assert.equal(s.model, "");
  assert.throws(() => settingsSchema.parse({ moduleCount: 100 }));
  assert.throws(() => settingsSchema.parse({ provider: "unknown" }));
  assert.throws(() =>
    courseInput.parse({ title: "", prompt: "x", settings: {} }),
  );
  const lesson = parseGenerated(
    "```json\n" +
      JSON.stringify({
        objectives: ["Sumar"],
        scenes: [
          {
            title: "Suma",
            kind: "whiteboard",
            narration: "Sumamos dos y cinco.",
            steps: ["2 + 5", "2 + 3 + 2", "7"],
          },
        ],
        exercise: "Resuelve",
        solution: "7",
      }) +
      "\n```",
    lessonSchema,
  );
  assert.deepEqual(lesson.scenes[0].steps, ["2 + 5", "2 + 3 + 2", "7"]);
  assert.equal(lesson.scenes[0].code, "");
  assert.throws(() => parseGenerated('{"objectives":[]}', lessonSchema));
});
test("Cursos: HTML escapa contenido IA, no filtra solucionarios por defecto y CSV evita fórmulas", () => {
  const doc = {
    title: "<script>alert(1)</script>",
    sections: [
      { title: "<img src=x>", body: "<svg onload=alert(1)>\nContenido" },
    ],
    answerKey: "SECRETO_DOCENTE",
  };
  const html = documentHTML(doc);
  assert(!html.includes("<script>"));
  assert(!html.includes("<img"));
  assert(!html.includes("SECRETO_DOCENTE"));
  assert(html.includes("&lt;svg"));
  assert(documentHTML(doc, true).includes("SECRETO_DOCENTE"));
  assert.match(csv(["A"], [['=HYPERLINK("x")'], ["+123"]]), /"'=HYPERLINK/);
});
test("Cursos: Word exporta un paquete editable válido sin ejecutar HTML ni incluir respuestas", async () => {
  const zip = await JSZip.loadAsync(
    await documentDOCX({
      title: "Práctica",
      sections: [
        { title: "Pregunta", body: "2 + 5 =\n<script>texto</script>" },
      ],
      answerKey: "CLAVE7",
    }),
  );
  const xml = await zip.file("word/document.xml")!.async("string");
  assert(xml.includes("2 + 5"));
  assert(!xml.includes("<script>"));
  assert(!xml.includes("CLAVE7"));
  assert(zip.file("[Content_Types].xml"));
  assert(zip.file("_rels/.rels"));
});

test("Cursos: PowerPoint contiene relaciones y diapositivas editables", async () => {
  const zip = await JSZip.loadAsync(
    await documentPPTX({
      title: "Curso",
      sections: [{ title: "Sumas", body: "2 + 5\nResultado: 7" }],
    }),
  );
  assert(zip.file("ppt/presentation.xml"));
  assert(zip.file("ppt/slideMasters/slideMaster1.xml"));
  assert(zip.file("ppt/slideLayouts/slideLayout1.xml"));
  assert(zip.file("ppt/theme/theme1.xml"));
  const slide = await zip.file("ppt/slides/slide2.xml")!.async("string");
  assert(slide.includes("Resultado: 7"));
  assert(slide.includes("Sumas"));
});
