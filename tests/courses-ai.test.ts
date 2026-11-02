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

import {
  courseGroup,
  teachingDirection,
  courseVisualPrompt,
} from "../lib/courses/teaching";
import {
  publicReferenceURL,
  publicReferenceAddress,
  webReferenceText,
} from "../lib/courses/reference-web";
test("Cursos: carpetas organizativas no sustituyen al público y las selecciones previas conservan su grupo", () => {
  assert.equal(
    courseGroup(settingsSchema.parse({ audience: "children" })),
    "children",
  );
  assert.equal(
    courseGroup(settingsSchema.parse({ audience: "adolescents" })),
    "children",
  );
  assert.equal(
    courseGroup(settingsSchema.parse({ audience: "families" })),
    "families",
  );
  assert.equal(
    courseGroup(settingsSchema.parse({ audience: "other" })),
    "other",
  );
  assert.equal(
    courseGroup(
      settingsSchema.parse({ libraryGroup: "other", audience: "children" }),
    ),
    "other",
  );
  assert.equal(
    courseGroup(settingsSchema.parse({ audience: "professionals" })),
    "adults",
  );
  assert.equal(
    courseGroup(
      settingsSchema.parse({ libraryGroup: "families", audience: "children" }),
    ),
    "families",
  );
});
test("Cursos: cuento y animación mantienen nivel adulto; voz y profesor reciben destinatario y tono", () => {
  const s = settingsSchema.parse({
    audience: "professionals",
    audienceDetail: "Ingenieros civiles",
    style: "animation",
    voiceMode: "teacher",
    tone: "Dinámico y preciso",
    level: "advanced",
  });
  const direction = teachingDirection(s);
  assert.match(direction, /Ingenieros civiles/);
  assert.match(direction, /Evita infantilizar/);
  assert.match(direction, /advanced/);
  assert.match(direction, /primera persona/);
  assert.match(direction, /Dinámico y preciso/);
  const prompt = courseVisualPrompt(
    s,
    { kind: "presenter", title: "Puentes", narration: "Analizamos las cargas" },
    "Mostrar diagrama",
    true,
  );
  assert.match(prompt, /Profesor original en pantalla/);
  assert.match(prompt, /no generar diálogo/i);
  assert.match(prompt, /sincronización labial/);
  assert.match(prompt, /Ingenieros civiles/);
  assert.match(
    teachingDirection(
      settingsSchema.parse({ audience: "families", style: "story" }),
    ),
    /Habla a padres y familiares adultos/,
  );
  assert.match(
    teachingDirection(
      settingsSchema.parse({
        audience: "adolescents",
        audienceDetail: "14 a 16 años",
      }),
    ),
    /14 a 16 años/,
  );
});
test("Referencias web: rechaza redes internas, credenciales y protocolos no permitidos", () => {
  for (const url of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://localhost",
    "https://host.internal",
    "https://example.com:8443",
  ])
    assert.throws(() => publicReferenceURL(url));
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.2",
    "172.18.0.4",
    "100.64.0.1",
    "::1",
  ])
    assert.equal(publicReferenceAddress(ip), false);
  assert.equal(publicReferenceAddress("8.8.8.8"), true);
  assert.equal(
    publicReferenceURL("https://example.org/document#p2").href,
    "https://example.org/document",
  );
  assert.equal(
    webReferenceText(
      "<header>Menú</header><script>secreto()</script><p>Aprender &amp; practicar</p>",
    ),
    "Aprender & practicar",
  );
});
