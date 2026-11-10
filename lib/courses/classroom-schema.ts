import { z } from "zod";

export const drawingSchema = z
  .object({
    kind: z.enum([
      "circle",
      "box",
      "arrow",
      "label",
      "person",
      "tree",
      "water",
      "sun",
      "bar",
    ]),
    label: z.string().max(70).default(""),
    x: z.number().min(0).max(900),
    y: z.number().min(0).max(420),
    size: z.number().min(20).max(180).default(80),
    color: z.enum(["teal", "blue", "amber", "purple", "coral"]).default("teal"),
    step: z.number().int().min(0).max(11).default(0),
    motion: z.enum(["reveal", "float", "slide"]).default("reveal"),
  })
  .strict();

export const practiceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("choice"),
      question: z.string().min(1).max(800),
      options: z.array(z.string().min(1).max(300)).min(2).max(5),
      answer: z.number().int().min(0).max(4),
      explanation: z.string().min(1).max(1600),
    })
    .strict()
    .refine(
      (v) => v.answer < v.options.length,
      "La respuesta debe pertenecer a las opciones.",
    ),
  z
    .object({
      kind: z.literal("calculation"),
      question: z.string().min(1).max(800),
      expression: z.string().min(1).max(120),
      explanation: z.string().min(1).max(1600),
    })
    .strict(),
]);

export const classroomInstructions = `
Producción económica de videoclases, no una lista fría de diapositivas:
Cada escena explica un único concepto, muestra un ejemplo trabajado y conecta con la siguiente. La narración desarrolla el porqué, unidades, supuestos, errores frecuentes y comprobación; nunca se limita a leer los pasos. No inventes fuentes, normas vigentes, mediciones, ejecución de software ni duración real.
En animación y cuento incluye al menos tres dibujos coherentes que apoyen la explicación. Usa símbolos matemáticos legibles (×, ÷, √) y ecuaciones simples, sin LaTeX crudo.
En pizarra, divide las transformaciones en pasos pequeños y verbaliza lo que va apareciendo. En código, presenta un programa didáctico y resultados ESPERADOS claramente identificados, no una ejecución verificada. En tablas usa datos de práctica coherentes; no afirmes que es el programa Power BI real.
Para dibujos, matemáticas y animación puedes añadir drawings: hasta 12 objetos por escena. Coordenadas del panel de dibujo: x 0..900, y 0..420, size 20..180. Cada objeto: {kind:circle|box|arrow|label|person|tree|water|sun|bar,label:"breve",x:100,y:100,size:80,color:teal|blue|amber|purple|coral,step:0,motion:reveal|float|slide}. Los pasos empiezan en 0; distribuye objetos sin solaparlos. Son dibujos vectoriales locales y animaciones, no requieren generar clips IA. Elige ilustraciones apropiadas al público, sin infantilizar cursos técnicos.
Incluye practice: de 2 a 6 ejercicios descargables al final del módulo, sin requerir interacción durante el video. Choice: {kind:"choice",question:"...",options:["...","..."],answer:0,explanation:"Resolución razonada"}. Calculation: {kind:"calculation",question:"...",expression:"(12+8)/4",explanation:"Pasos y unidades"}. En calculation expression contiene exclusivamente aritmética numérica + - * / ^ y paréntesis, sin variables, funciones o unidades; el sistema calcula el resultado sin confiar en un número inventado. En choice answer es el índice empezando en 0. Adapta dificultad, vocabulario y práctica a los objetivos del curso. El ejercicio abierto y su solución siguen siendo obligatorios.
`;
