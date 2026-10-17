import { z } from "zod";
import { db } from "./db";
import { ownerOnly } from "./auth";
import { demand } from "./errors";
import { recordActivity } from "./activity";
const short = z.string().trim().min(1).max(180),
  copy = z.string().trim().min(1).max(1500),
  item = z.object({ title: short, text: copy }).strict();
export const siteSections = {
  hero: z
    .object({
      brand: short,
      eyebrow: short,
      title: short,
      text: copy,
      cta: short,
    })
    .strict(),
  benefits: z
    .object({
      enabled: z.boolean(),
      title: short,
      text: copy,
      items: z.array(item).min(1).max(8),
    })
    .strict(),
  features: z
    .object({
      enabled: z.boolean(),
      title: short,
      text: copy,
      items: z.array(item).min(1).max(10),
    })
    .strict(),
  workflow: z
    .object({
      enabled: z.boolean(),
      title: short,
      items: z.array(item).min(1).max(6),
    })
    .strict(),
  testimonials: z
    .object({
      enabled: z.boolean(),
      title: short,
      items: z
        .array(
          z
            .object({
              name: short,
              role: z.string().trim().max(180),
              quote: copy,
            })
            .strict(),
        )
        .max(8),
    })
    .strict(),
  plans: z.object({ enabled: z.boolean(), title: short, text: copy }).strict(),
  faq: z
    .object({
      enabled: z.boolean(),
      title: short,
      items: z
        .array(z.object({ question: short, answer: copy }).strict())
        .min(1)
        .max(12),
    })
    .strict(),
  closing: z
    .object({
      title: short,
      text: copy,
      cta: short,
      contactEmail: z.union([z.email().max(200), z.literal("")]),
    })
    .strict(),
};
export const siteSchema = z.object(siteSections).strict();
export type SiteDocument = z.infer<typeof siteSchema>;
export const defaultSite: SiteDocument = {
  hero: {
    brand: "estudio AI",
    eyebrow: "TU ESTUDIO DE CAMPAÑAS CON INTELIGENCIA ARTIFICIAL",
    title: "De una idea a toda una campaña.",
    text: "Crea afiches para tus productos, organiza sus variaciones y comparte los resultados con tu equipo. Tus instrucciones y tu identidad de marca, en un mismo espacio.",
    cta: "Encuentra tu plan",
  },
  benefits: {
    enabled: true,
    title: "Menos tareas repetidas. Más espacio para tus ideas.",
    text: "Una forma clara de pasar del briefing a imágenes listas para revisar y descargar.",
    items: [
      {
        title: "Una campaña, muchas versiones",
        text: "Define instrucciones compartidas y añade detalles a cada producto sin empezar desde cero.",
      },
      {
        title: "Tu equipo, en el mismo lugar",
        text: "Comparte solo los proyectos y productos que cada persona necesita ver o editar.",
      },
      {
        title: "Tu consumo a la vista",
        text: "Consulta el historial, las reservas y los costes informados. Configura límites antes de generar.",
      },
    ],
  },
  features: {
    enabled: true,
    title: "Todo el recorrido creativo, conectado.",
    text: "Desde la organización de la campaña hasta la descarga de sus imágenes.",
    items: [
      {
        title: "Proyectos y productos",
        text: "Organiza cada campaña en proyectos, productos, subproductos y variaciones.",
      },
      {
        title: "Instrucciones que se reutilizan",
        text: "Combina indicaciones generales, detalles particulares y configuraciones guardadas.",
      },
      {
        title: "Identidad y referencias",
        text: "Adjunta tu material y define el contexto visual de tu marca.",
      },
      {
        title: "Proveedores de IA a elección",
        text: "Conecta proveedores compatibles como OpenAI, Google, fal.ai y Replicate. El acceso depende de tu cuenta y modelo.",
      },
      {
        title: "Revisión y descargas",
        text: "Consulta resultados, prepara nuevas versiones y descarga imágenes individualmente o por selección.",
      },
      {
        title: "Permisos y control",
        text: "Asigna roles, controla accesos y consulta un historial comprensible de las operaciones.",
      },
    ],
  },
  workflow: {
    enabled: true,
    title: "Tu próxima campaña, paso a paso.",
    items: [
      {
        title: "Organiza",
        text: "Crea el proyecto y los productos que vas a comunicar.",
      },
      {
        title: "Da dirección",
        text: "Añade instrucciones, identidad y referencias para cada tema.",
      },
      {
        title: "Genera y revisa",
        text: "Autoriza la generación, revisa las variaciones y ajusta lo necesario.",
      },
      {
        title: "Comparte y descarga",
        text: "Entrega los resultados a tu equipo o prepara tus imágenes para publicar.",
      },
    ],
  },
  testimonials: {
    enabled: false,
    title: "Lo que cuentan nuestros clientes",
    items: [],
  },
  plans: {
    enabled: true,
    title: "Un plan para cada etapa.",
    text: "Elige capacidad mensual para tus campañas. Consulta las condiciones y el presupuesto de IA de cada plan.",
  },
  faq: {
    enabled: true,
    title: "Antes de empezar",
    items: [
      {
        question: "¿Necesito saber programar?",
        answer:
          "Las tareas habituales se realizan desde el panel: proyectos, instrucciones, generación, revisión y descargas.",
      },
      {
        question: "¿Puedo trabajar con otras personas?",
        answer:
          "Sí. Los roles y accesos permiten compartir recursos con usuarios, administradores y observadores.",
      },
      {
        question: "¿Las imágenes y los costes son ilimitados?",
        answer:
          "Cada plan establece sus cuotas y presupuesto. Los modelos, referencias y disponibilidad del proveedor pueden afectar al consumo. Un coste no informado no se presenta como cero.",
      },
      {
        question: "¿El pago se renueva automáticamente?",
        answer:
          "Actualmente las compras tienen una vigencia de 30 días y no se renuevan automáticamente. Las cuotas se cuentan por mes calendario de Lima.",
      },
    ],
  },
  closing: {
    title: "Dale un espacio a tu próxima gran idea.",
    text: "Organiza tu primera campaña y empieza a transformar instrucciones en piezas visuales.",
    cta: "Entrar a mi espacio",
    contactEmail: "",
  },
};
export async function publicSite() {
  const row = await db.siteContent.findUnique({
    where: { id: "public" },
    select: { content: true, revision: true },
  });
  return {
    content: row ? siteSchema.parse(row.content) : defaultSite,
    revision: row?.revision ?? 0,
  };
}
export async function saveSiteSection(
  actor: { id: string; role: string },
  section: string,
  input: unknown,
) {
  ownerOnly(actor);
  demand(Object.hasOwn(siteSections, section), "Sección no disponible.", 404);
  const b = z
    .object({ revision: z.number().int().min(0), value: z.unknown() })
    .strict()
    .parse(input);
  const value = siteSections[section as keyof typeof siteSections].parse(
    b.value,
  );
  if (section === "testimonials") {
    const t = value as SiteDocument["testimonials"];
    demand(
      !t.enabled || t.items.length > 0,
      "Añade al menos un testimonio real antes de mostrar esta sección.",
    );
  }
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
    const u = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, status: true },
    });
    demand(
      u?.role === "OWNER" && u.status === "APPROVED",
      "La autorización cambió.",
      403,
    );
    const old = await tx.siteContent.findUnique({ where: { id: "public" } });
    demand(
      (old?.revision ?? 0) === b.revision,
      "Otra edición cambió la página. Recarga antes de guardar para no sobrescribirla.",
      409,
    );
    const document = siteSchema.parse({
      ...((old?.content as object) ?? defaultSite),
      [section]: value,
    });
    const row = await tx.siteContent.upsert({
      where: { id: "public" },
      create: { id: "public", content: document },
      update: { content: document, revision: { increment: 1 } },
    });
    await recordActivity(tx, {
      data: {
        actorId: actor.id,
        action: "PAGINA_PUBLICA_ACTUALIZADA",
        resourceId: section,
      },
    });
    return { revision: row.revision };
  });
}
