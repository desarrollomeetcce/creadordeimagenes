import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import {
  fullProjectFilter,
  categoryFullFilter,
  subproductFilter,
} from "./auth";

type Client = Prisma.TransactionClient;
type Event = {
  id: string;
  actorId: string;
  action: string;
  resourceId?: string | null;
  detail: unknown;
};
type Viewer = { id: string; role: string };
const text = z.string().max(300);
const contextSchema = z.object({
  projectId: text.optional(),
  projectName: text,
  productId: text.optional(),
  productName: text.optional(),
  subproductId: text.optional(),
  subproductName: text.optional(),
});
export type ActivityContext = z.infer<typeof contextSchema>;
const snapshotSchema = z.object({
  v: z.literal(1),
  actorName: text,
  contexts: z.array(contextSchema).max(2000),
});
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter(
          (id): id is string =>
            typeof id === "string" && id.length > 0 && id.length <= 100,
        )
        .slice(0, 2000)
    : [];
const scopeOf = (event: Event) => {
  const a = event.action,
    d = object(event.detail);
  if (
    a.startsWith("PROYECTO_") ||
    a.startsWith("ACCESO_ADMINISTRADORES_") ||
    a === "IDENTIDAD_MARCA_ACTUALIZADA" ||
    a === "IDENTIDAD_MARCA_CARGADA" ||
    a === "REGENERACION_SELECTIVA_AUTORIZADA"
  )
    return "project";
  if (
    a.startsWith("PRODUCTO_") ||
    a === "SUBPRODUCTOS_CREADOS" ||
    a === "GENERACION_MASIVA_AUTORIZADA"
  )
    return "category";
  if (a.startsWith("SUBPRODUCTO_") || a === "REVISION_INSTRUCCIONES_GUARDADA" || a === "GENERACION_AUTORIZADA")
    return "subproduct";
  if (a.startsWith("ACCESO_PROJECT_")) return "project";
  if (a.startsWith("ACCESO_CATEGORY_")) return "category";
  if (a.startsWith("ACCESO_SUBPRODUCT_")) return "subproduct";
  if (
    a.startsWith("AFICHE_") ||
    a === "REGENERACION_AUTORIZADA" ||
    a.startsWith("EDICION_") ||
    a === "VERSION_RESTAURADA" ||
    a.startsWith("BIBLIOTECA_")
  )
    return "variation";
  if (
    [
      "GENERACION_COMPLETADA",
      "PRUEBA_IA_AUTORIZADA",
      "TRABAJO_CANCELADO",
      "TRABAJO_INTERRUMPIDO",
      "TRABAJO_RETIRADO_LISTADO",
      "TRABAJO_RESTAURADO_LISTADO",
    ].includes(a)
  )
    return "job";
  if (a === "LOTE_PENDIENTES_CANCELADOS") return "none";
  if (a.startsWith("LOTE_")) return "batch";
  if (a.startsWith("ADJUNTO_")) return "attachment";
  if (a === "CONFIGURACION_APLICADA")
    return d.scope === "subproduct"
      ? "subproduct"
      : d.scope === "category"
        ? "category"
        : "target";
  if (
    a === "DESCARGA_ZIP" &&
    ["project", "category", "subproduct"].includes(String(d.scope))
  )
    return String(d.scope);
  return "none";
};
const uniqueContexts = (rows: ActivityContext[]) => [
  ...new Map(rows.map((c) => [JSON.stringify(c), c])).values(),
];

// Resolve names in batches, selecting metadata only. Snapshots are preferred by the reader.
export async function resolveActivityContexts(
  client: Client,
  events: Event[],
  viewer?: Viewer,
) {
  if (!events.length) return new Map<string, ActivityContext[]>();
  const groups = new Map<string, Set<string>>();
  const add = (scope: string, id?: string | null) => {
    if (id && scope !== "none") {
      if (!groups.has(scope)) groups.set(scope, new Set());
      groups.get(scope)!.add(id);
    }
  };
  for (const event of events) {
    add(scopeOf(event), event.resourceId);
    const d = object(event.detail);
    if (
      ["project", "category", "subproduct"].includes(String(d.contextScope)) &&
      typeof d.contextResourceId === "string"
    )
      add(String(d.contextScope), d.contextResourceId);
    for (const id of ids(d.jobIds)) add("job", id);
    for (const id of ids(d.variationIds)) add("variation", id);
    for (const id of ids(
      d.subproductIds ??
        (event.action === "SUBPRODUCTOS_ELIMINADOS" ? d.ids : undefined),
    ))
      add("subproduct", id);
  }
  const list = (scope: string) => [...(groups.get(scope) ?? [])];
  if (!groups.size)
    return new Map(events.map((e) => [e.id, [] as ActivityContext[]]));
  const batches = await client.backgroundBatch.findMany({
    where: { id: { in: list("batch") } },
    select: { id: true, jobIds: true },
  });
  for (const batch of batches)
    for (const id of ids(batch.jobIds)) add("job", id);
  const attachments = await client.attachment.findMany({
    where: { id: { in: list("attachment") } },
    select: { id: true, scope: true, resourceId: true },
  });
  for (const a of attachments) add(a.scope, a.resourceId);
  const variations = await client.variation.findMany({
    where: { id: { in: list("variation") } },
    select: { id: true, jobId: true },
  });
  for (const v of variations) add("job", v.jobId);
  const jobs = await client.generationJob.findMany({
    where: { id: { in: list("job") } },
    select: { id: true, projectId: true, subproductId: true },
  });
  for (const job of jobs)
    add(
      job.subproductId ? "subproduct" : "project",
      job.subproductId ?? job.projectId,
    );
  const unrestricted = !viewer || viewer.role === "OWNER";
  const subs = await client.subproduct.findMany({
    where: {
      id: { in: list("subproduct") },
      ...(unrestricted ? {} : subproductFilter(viewer!)),
    },
    select: {
      id: true,
      name: true,
      category: {
        select: {
          id: true,
          name: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });
  const products = await client.category.findMany({
    where: {
      id: { in: [...list("category"), ...list("target")] },
      ...(unrestricted ? {} : categoryFullFilter(viewer!)),
    },
    select: {
      id: true,
      name: true,
      project: { select: { id: true, name: true } },
    },
  });
  const targetSubs = list("target").length
    ? await client.subproduct.findMany({
        where: {
          id: { in: list("target") },
          ...(unrestricted ? {} : subproductFilter(viewer!)),
        },
        select: {
          id: true,
          name: true,
          category: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      })
    : [];
  const projects = await client.project.findMany({
    where: {
      id: { in: list("project") },
      ...(unrestricted ? {} : fullProjectFilter(viewer!)),
    },
    select: { id: true, name: true },
  });
  const contexts = new Map<string, ActivityContext[]>();
  for (const p of projects)
    contexts.set(p.id, [{ projectId: p.id, projectName: p.name }]);
  for (const p of products)
    contexts.set(p.id, [
      {
        projectId: p.project.id,
        projectName: p.project.name,
        productId: p.id,
        productName: p.name,
      },
    ]);
  for (const s of [...subs, ...targetSubs])
    contexts.set(s.id, [
      {
        projectId: s.category.project.id,
        projectName: s.category.project.name,
        productId: s.category.id,
        productName: s.category.name,
        subproductId: s.id,
        subproductName: s.name,
      },
    ]);
  for (const j of jobs)
    contexts.set(
      j.id,
      j.projectId === "connection-test"
        ? [{ projectName: "Prueba de conexión de IA" }]
        : (contexts.get(j.subproductId ?? j.projectId) ?? []),
    );
  for (const v of variations) contexts.set(v.id, contexts.get(v.jobId) ?? []);
  for (const a of attachments)
    contexts.set(a.id, contexts.get(a.resourceId) ?? []);
  for (const b of batches)
    contexts.set(
      b.id,
      uniqueContexts(ids(b.jobIds).flatMap((id) => contexts.get(id) ?? [])),
    );
  return new Map(
    events.map((e) => {
      const d = object(e.detail);
      const extra = [
        ...ids(d.jobIds),
        ...ids(d.variationIds),
        ...ids(
          d.subproductIds ??
            (e.action === "SUBPRODUCTOS_ELIMINADOS" ? d.ids : undefined),
        ),
      ];
      const paths = extra.length
        ? extra.flatMap((id) => contexts.get(id) ?? [])
        : (contexts.get(
            typeof d.contextResourceId === "string"
              ? d.contextResourceId
              : (e.resourceId ?? ""),
          ) ?? []);
      return [e.id, uniqueContexts(paths)];
    }),
  );
}

// Append-only enrichment: original events are never rewritten and request bodies/prompts are never copied.
export async function recordActivity(
  client: Client,
  args: { data: Prisma.AuditEventUncheckedCreateInput },
) {
  const detail = object(args.data.detail);
  const event = {
    id: "new",
    actorId: args.data.actorId,
    action: args.data.action,
    resourceId: args.data.resourceId,
    detail,
  };
  const actor = await client.user.findUnique({
    where: { id: event.actorId },
    select: { name: true },
  });
  const contexts =
    (await resolveActivityContexts(client, [event])).get("new") ?? [];
  return client.auditEvent.create({
    data: {
      ...args.data,
      detail: {
        ...detail,
        _activity: {
          v: 1,
          actorName:
            actor?.name ??
            (event.actorId === "system:maintenance"
              ? "Mantenimiento automático"
              : "Cuenta no disponible"),
          contexts,
          search: summary(event.action, contexts, detail),
        },
      } as Prisma.InputJsonObject,
    },
  });
}

const verbs: Record<string, string> = {
  TRABAJO_RETIRADO_LISTADO: "Retiró una generación del listado",
  TRABAJO_RESTAURADO_LISTADO: "Restauró una generación en el listado",
  PRESUPUESTO_PARTICULAR_ELIMINADO: "Eliminó un límite particular de consumo",
  TRABAJOS_RETIRADOS_LISTADO: "Retiró generaciones del listado",
  TRABAJOS_RESTAURADOS_LISTADO: "Restauró generaciones en el listado",
  COSTE_IA_CONCILIADO: "Registró un coste de IA comprobado",
  INFORME_CONSUMO_PREPARADO: "Preparó un informe de consumo de IA",
  TRABAJOS_CANCELADOS: "Canceló trabajos pendientes y liberó sus reservas",
  LOTE_PENDIENTES_CANCELADOS:
    "Canceló los pendientes del lote y liberó sus reservas",
  MANTENIMIENTO_COMPLETADO:
    "Ejecutó la limpieza de archivos caducados y revisó trabajos interrumpidos",
  INICIO_SESION: "Inició sesión",
  INSTALACION_INICIAL: "Completó la instalación inicial",
  PROYECTO_CREADO: "Creó el proyecto",
  PROYECTO_ACTUALIZADO: "Editó el proyecto",
  PROYECTO_PAPELERA: "Envió el proyecto a la papelera",
  PROYECTO_RESTAURADO: "Restauró el proyecto",
  PRODUCTO_PAPELERA:"Envió el producto a la papelera",
  PRODUCTO_RESTAURADO:"Restauró el producto",
  REVISION_INSTRUCCIONES_GUARDADA:"Guardó la revisión de instrucciones",
  IDENTIDAD_MARCA_CARGADA:"Cargó una identidad de marca",
  PRODUCTO_CREADO: "Creó el producto",
  PRODUCTO_ACTUALIZADO: "Editó las instrucciones o configuración del producto",
  SUBPRODUCTOS_CREADOS: "Creó subproductos",
  SUBPRODUCTO_INICIO_RAPIDO_CREADO: "Creó un subproducto desde inicio rápido",
  SUBPRODUCTO_ACTUALIZADO: "Editó el subproducto",
  SUBPRODUCTOS_ELIMINADOS: "Eliminó subproductos",
  SUBPRODUCTO_RESTAURADO: "Restauró el subproducto",
  GENERACION_AUTORIZADA: "Solicitó generar afiches",
  GENERACION_MASIVA_AUTORIZADA: "Solicitó una generación por lote",
  GENERACION_COMPLETADA: "Generó un afiche",
  REGENERACION_SELECTIVA_AUTORIZADA: "Solicitó regenerar afiches seleccionados",
  EDICION_MANUAL: "Editó un afiche sin IA",
  REGENERACION_AUTORIZADA: "Solicitó regenerar un afiche",
  EDICION_IA: "Editó un afiche con IA",
  EDICION_IA_AUTORIZADA: "Solicitó editar un afiche con IA",
  VERSION_RESTAURADA: "Restauró una versión del afiche",
  AFICHE_DUPLICADO: "Duplicó un afiche",
  AFICHE_PAPELERA: "Envió un afiche a la papelera",
  AFICHE_RESTAURADO: "Restauró un afiche",
  AFICHE_APPROVED: "Aprobó un afiche",
  AFICHE_REJECTED: "Rechazó un afiche",
  AFICHE_PENDING: "Dejó un afiche pendiente de revisión",
  AFICHE_ACTUALIZADO: "Actualizó un afiche",
  IDENTIDAD_MARCA_ACTUALIZADA: "Actualizó la identidad de marca",
  PLAN_PERSONALIZADO_CREADO: "Creó y asignó un plan personalizado",
  PLAN_RETIRADO: "Retiró un plan de nuevas contrataciones",
  SOLICITUD_PRIVACIDAD_ATENDIDA: "Atendió una solicitud de privacidad",
  META_APP_OAUTH_CONFIGURADA: "Configuró la app de Meta para OAuth",
  PAGINA_PUBLICA_ACTUALIZADA: "Actualizó una sección de la página pública",
  PLAN_ASIGNADO: "Asignó un plan a la cuenta",
  PLAN_ACTUALIZADO: "Actualizó un plan y sus cuotas",
  PLAN_PAGADO: "Confirmó el pago y activó el plan",
  PAGO_PRUEBA_CONFIRMADO: "Confirmó un pago de prueba sin activar acceso real",
  PAGO_CONEXION_GUARDADA: "Guardó la configuración de la pasarela de pagos",
  PAGO_CONEXION_ELIMINADA: "Eliminó las credenciales de la pasarela de pagos",
  LIMITES_IA_GUARDADOS: "Actualizó los límites de IA sin modificar modelos",
  PROVEEDOR_IA_GUARDADO: "Guardó la credencial de IA de",
  PROVEEDOR_IA_ELIMINADO: "Eliminó la credencial de IA de",
  CATALOGO_IA_CONSULTADO: "Consultó los modelos de",
  CREDENCIAL_GASTOS_GUARDADA:
    "Guardó la credencial para consultar gastos del proveedor",
  CREDENCIAL_GASTOS_ELIMINADA:
    "Eliminó la credencial para consultar gastos del proveedor",
  TRABAJO_INTERRUMPIDO:
    "El servidor detectó una generación interrumpida; requiere revisar el consumo",
  TRABAJO_CANCELADO: "Canceló una generación pendiente",
  DESCARGA_ZIP: "Descargó afiches en ZIP",
  LOTE_SEGUNDO_PLANO_AUTORIZADO: "Programó un lote en segundo plano",
  LOTE_PAUSA_SOLICITADA: "Solicitó pausar un lote",
  ACCESO_ADMINISTRADORES_ACTIVADO:
    "Habilitó el acceso para todos los administradores",
  ACCESO_ADMINISTRADORES_DESACTIVADO:
    "Desactivó el acceso para todos los administradores",
  CONFIGURACION_GUARDADA: "Guardó una configuración reutilizable",
  CONFIGURACION_APLICADA: "Aplicó una configuración guardada",
  CONFIGURACION_DUPLICADA: "Duplicó una configuración",
  CONFIGURACION_ACTUALIZADA: "Actualizó una configuración",
  CONFIGURACION_ELIMINADA: "Eliminó una configuración",
  CONFIGURACION_COMPARTIDA: "Compartió una configuración",
  ADJUNTO_CARGADO: "Añadió un adjunto",
  ADJUNTO_REEMPLAZADO: "Reemplazó un adjunto",
  ADJUNTO_ELIMINADO: "Eliminó un adjunto",
  BIBLIOTECA_GUARDAR: "Guardó un afiche en la biblioteca",
  BIBLIOTECA_RETIRAR: "Retiró un afiche de la biblioteca",
  CONTRASENA_CAMBIADA: "Cambió su contraseña",
  CONTRASENA_RECUPERADA: "Recuperó su contraseña",
  RECUPERACION_EMITIDA: "Generó un enlace de recuperación",
  RECUPERACION_CORREO_ACEPTADA:
    "Envió al servidor de correo un enlace de recuperación",
  USUARIO_CREADO: "Creó una cuenta",
  USUARIO_ACTUALIZADO: "Actualizó una cuenta",
};
function actionLabel(action: string) {
  if (verbs[action]) return verbs[action];
  if (/^ACCESO_(PROJECT|CATEGORY|SUBPRODUCT)_/.test(action))
    return action.endsWith("REVOCADO")
      ? "Retiró un acceso compartido"
      : "Concedió un acceso compartido";
  return action
    .replaceAll("_", " ")
    .toLocaleLowerCase("es")
    .replace(/^./, (c) => c.toUpperCase());
}
function summary(
  action: string,
  paths: ActivityContext[],
  detail: Record<string, unknown>,
) {
  const p = paths[0],
    name = p?.subproductName ?? p?.productName ?? p?.projectName;
  const parent = p?.subproductName
    ? `${p.projectName} / ${p.productName}`
    : p?.productName
      ? p.projectName
      : "";
  const location = name ? ` «${name}»${parent ? ` (${parent})` : ""}` : "";
  const verb = actionLabel(action),
    count = typeof detail.count === "number" ? detail.count : undefined;
  if (
    [
      "PROVEEDOR_IA_GUARDADO",
      "PROVEEDOR_IA_ELIMINADO",
      "CATALOGO_IA_CONSULTADO",
    ].includes(action)
  ) {
    const names: Record<string, string> = {
      openai: "OpenAI",
      google: "Google Gemini / AI Studio",
      fal: "fal.ai",
      replicate: "Replicate",
    };
    const provider =
      typeof detail.provider === "string"
        ? (names[detail.provider] ?? "un proveedor")
        : "un proveedor";
    return `${verb} ${provider}${count !== undefined ? ` · ${count} modelos compatibles` : ""}.`;
  }
  if (
    action === "SUBPRODUCTOS_CREADOS" &&
    count !== undefined &&
    paths.some((p) => p.subproductName)
  ) {
    const names = paths.flatMap((p) =>
      p.subproductName ? [p.subproductName] : [],
    );
    const preview = names
      .slice(0, 2)
      .map((name) => `«${name}»`)
      .join(", ");
    const parentName = [p?.projectName, p?.productName]
      .filter(Boolean)
      .join(" / ");
    return `Creó ${count} ${count === 1 ? "subproducto" : "subproductos"}: ${preview}${names.length > 2 ? ` y ${names.length - 2} más` : ""}${parentName ? ` (${parentName})` : ""}.`;
  }
  let unit =
    action === "INFORME_CONSUMO_PREPARADO"
      ? "operaciones"
      : action.startsWith("SUBPRODUCTOS_")
        ? "subproductos"
        : action.startsWith("TRABAJOS_") ||
            action === "LOTE_PENDIENTES_CANCELADOS"
          ? "trabajos"
          : "afiches";
  if (count === 1) unit = unit.slice(0, -1);
  const quantity = count !== undefined ? ` · ${count} ${unit}` : "";
  let more = paths.every((p) => p.subproductName)
    ? "subproductos"
    : paths.every((p) => p.productName)
      ? "productos"
      : "proyectos";
  if (paths.length === 2) more = more.slice(0, -1);
  return `${verb}${location}${paths.length > 1 ? ` y ${paths.length - 1} ${more} más` : ""}${quantity}.`;
}
const detailLabels: Record<string, string> = {
  previousActualMicros: "Coste anterior en microUSD",
  actualMicros: "Coste registrado en microUSD",
  reference: "Referencia de comprobación",
  count: "Cantidad registrada",
  version: "Versión del afiche",
  cancelled: "Trabajos pendientes cancelados",
  attachmentsCopied: "Adjuntos copiados",
  expired: "Afiches caducados procesados",
  thumbnails: "Miniaturas retiradas",
  deletedFiles: "Archivos retirados",
  failedFiles: "Borrados por reintentar",
  interrupted: "Trabajos enviados a revisión",
  format: "Formato de descarga",
  role: "Rol asignado",
  status: "Estado asignado",
};

export async function activityHistory(viewer: Viewer, params: URLSearchParams) {
  demand(
    viewer.role !== "OBSERVER",
    "El Historial no está disponible para Observador.",
    403,
  );
  const q = z
      .string()
      .trim()
      .max(200)
      .parse(params.get("q") ?? ""),
    page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1);
  const owner = viewer.role === "OWNER",
    actorFilter = owner
      ? Prisma.sql`TRUE`
      : Prisma.sql`e."actorId"=${viewer.id}`;
  // Only the finite legacy set lacks snapshots. Resolve that set for name searches without rewriting it.
  let legacyMatches: string[] = [];
  if (q) {
    const legacy = await db.$queryRaw<
      Event[]
    >`SELECT e.id,e."actorId",e.action,e."resourceId",e.detail FROM "AuditEvent" e WHERE ${actorFilter} AND COALESCE(e.detail->'_activity'->>'v','') <> '1'`;
    const contexts = await resolveActivityContexts(db, legacy, viewer);
    const query = q.toLocaleLowerCase("es");
    legacyMatches = legacy
      .filter(
        (e) =>
          actionLabel(e.action).toLocaleLowerCase("es").includes(query) ||
          (contexts.get(e.id) ?? []).some((c) =>
            [c.projectName, c.productName, c.subproductName].some((name) =>
              name?.toLocaleLowerCase("es").includes(query),
            ),
          ),
      )
      .map((e) => e.id);
  }
  const escaped = q.replace(/[\\%_]/g, "\\$&"),
    pattern = `%${escaped}%`,
    actionPattern = `%${q
      .toUpperCase()
      .replaceAll(" ", "_")
      .replace(/[\\%_]/g, "\\$&")}%`;
  const condition = q
    ? Prisma.sql`AND (e.action ILIKE ${actionPattern} OR u.name ILIKE ${pattern} OR (e.detail->'_activity')::text ILIKE ${pattern} OR e.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(legacyMatches)}::jsonb)))`
    : Prisma.empty;
  const where = Prisma.sql`FROM "AuditEvent" e LEFT JOIN "User" u ON u.id=e."actorId" WHERE ${actorFilter} ${condition}`;
  const [events, counts] = await db.$transaction(
    [
      db.$queryRaw<
        (Event & { createdAt: Date; currentActorName: string | null })[]
      >`SELECT e.id,e."actorId",e.action,e."resourceId",e.detail,e."createdAt",u.name AS "currentActorName" ${where} ORDER BY e."createdAt" DESC,e.id DESC LIMIT 25 OFFSET ${(page - 1) * 25}`,
      db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${where}`,
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const missing = events.filter(
    (e) => !snapshotSchema.safeParse(object(e.detail)._activity).success,
  );
  const resolved = await resolveActivityContexts(db, missing, viewer);
  return {
    rows: events.map((event) => {
      const detail = object(event.detail),
        snapshot = snapshotSchema.safeParse(detail._activity);
      const contexts = snapshot.success
        ? snapshot.data.contexts
        : (resolved.get(event.id) ?? []);
      const actorName = snapshot.success
        ? snapshot.data.actorName
        : (event.currentActorName ?? "Cuenta no disponible");
      return {
        id: event.id,
        createdAt: event.createdAt,
        actorName,
        action: actionLabel(event.action),
        summary: summary(event.action, contexts, detail),
        contexts,
        contextSource: snapshot.success ? "recorded" : "current",
        note:
          event.action === "SUBPRODUCTOS_CREADOS" &&
          !ids(detail.subproductIds).length
            ? "Este registro antiguo no detalla cuáles subproductos se crearon; no se atribuyen los añadidos posteriormente."
            : event.resourceId && !contexts.length
              ? "Este registro no contiene un ámbito de proyecto identificable o el recurso ya no está disponible para tu cuenta."
              : !snapshot.success && contexts.length
                ? "Los nombres se consultan de los recursos actuales; este registro antiguo no conservó sus nombres originales."
                : null,
        details: Object.entries(detailLabels).flatMap(([key, label]) =>
          typeof detail[key] === "number" || typeof detail[key] === "string"
            ? [{ label, value: String(detail[key]).slice(0, 200) }]
            : [],
        ),
      };
    }),
    total: Number(counts[0].total),
    page,
    pages: Math.max(1, Math.ceil(Number(counts[0].total) / 25)),
  };
}
