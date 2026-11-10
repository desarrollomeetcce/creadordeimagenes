import test from "node:test";
import assert from "node:assert/strict";
import { calculate, dataSummary } from "../lib/courses/classroom";
import { lessonSchema } from "../lib/courses/schema";
import { classroomSVG, teachingFrame } from "../lib/courses/classroom-frame";
import { lessonDocument, documentHTML } from "../lib/courses/exports";
import { vimeoUploadURL } from "../lib/courses/vimeo";
test("Pizarra: aritmética verificable sin código, precedencia y errores explícitos", () => {
  for (const [expression, expected] of [
    ["(12+8)/4", 5],
    ["2^3^2", 512],
    ["-2^2", -4],
    ["2^-2", 0.25],
    [".5+1.25", 1.75],
    ["2*-3", -6],
  ] as const)
    assert.equal(calculate(expression), expected);
  for (const text of [
    "process.exit()",
    "1/0",
    "2**3",
    "NaN",
    "Infinity",
    "1..2",
    "2(3)",
    "2^1001",
    "(".repeat(40) + "1" + ")".repeat(40),
    "-".repeat(40) + "1",
  ])
    assert.throws(() => calculate(text));
  assert.deepEqual(dataSummary([["1"], [""], ["N.A."], ["3"]], 0), {
    count: 2,
    sum: 4,
    average: 2,
  });
});
test("Clase: dibujos acotados, animación progresiva y solucionarios separados", () => {
  const lesson = lessonSchema.parse({
    objectives: ["Resolver"],
    scenes: [
      {
        kind: "whiteboard",
        title: "<script>no</script>",
        narration: "Explicación",
        steps: ["2 + 3 = 5", "Verificar"],
        drawings: [{ kind: "person", x: 100, y: 80, motion: "float" }],
      },
    ],
    exercise: "Practica",
    solution: "Solución",
    practice: [
      {
        kind: "calculation",
        question: "Suma",
        expression: "2+3",
        explanation: "Dos más tres",
      },
      {
        kind: "choice",
        question: "Elige",
        options: ["A", "B"],
        answer: 1,
        explanation: "B",
      },
    ],
  });
  const svg = classroomSVG(lesson.scenes[0], 0.8);
  assert(!svg.includes("<script>"));
  assert(svg.includes("&lt;script&gt;"));
  assert.notDeepEqual(
    teachingFrame(lesson.scenes[0], 0.1),
    teachingFrame(lesson.scenes[0], 0.9),
  );
  const doc = lessonDocument("Práctica", lesson);
  assert(doc.answerKey?.includes("Ejercicio 1: 5"));
  assert(!documentHTML(doc).includes("Dos más tres"));
  assert(documentHTML(doc, true).includes("Dos más tres"));
  assert.throws(() =>
    lessonSchema.parse({
      ...lesson,
      practice: [
        {
          kind: "choice",
          question: "x",
          options: ["A", "B"],
          answer: 4,
          explanation: "x",
        },
      ],
    }),
  );
  assert.throws(() =>
    lessonSchema.parse({
      ...lesson,
      scenes: [
        { ...lesson.scenes[0], drawings: [{ kind: "person", x: 5000, y: 0 }] },
      ],
    }),
  );
});
test("Vimeo: subida solo por HTTPS al dominio esperado, sin credenciales ni hosts alternativos", () => {
  assert.equal(
    vimeoUploadURL("https://files.tus.vimeo.com/upload/123"),
    "https://files.tus.vimeo.com/upload/123",
  );
  for (const url of [
    "http://vimeo.com/a",
    "https://vimeo.com.evil.test/a",
    "https://evil.test/a",
    "https://token@vimeo.com/a",
    "https://vimeo.com:444/a",
  ])
    assert.throws(() => vimeoUploadURL(url));
});
