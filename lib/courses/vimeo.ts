import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { demand } from "../errors";
import { encryptKey, decryptKey, maskKey } from "../crypto";
import { load } from "../storage";
import { courseOwner, courseTransactionOwner } from "./service";
import { providerJSON } from "../providers/http";
import { classroomAccess } from "./render-jobs";
type Actor = { id: string; role: string };
const context = "courses:vimeo";
const safeConnection = {
  generation: true,
  maskedToken: true,
  accountName: true,
  accountUri: true,
  verifiedAt: true,
  revision: true,
} as const;
const publicUpload = {
  id: true,
  renderId: true,
  status: true,
  remoteUri: true,
  uploadedBytes: true,
  totalBytes: true,
  error: true,
} as const;
export function vimeoUploadURL(raw: string) {
  const u = new URL(raw);
  demand(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "vimeo.com" || u.hostname.endsWith(".vimeo.com")),
    "Vimeo devolvió una dirección de subida no permitida.",
    502,
  );
  return u.href;
}
async function api(token: string, path: string, body?: unknown) {
  return providerJSON(
    "vimeo",
    "https://api.vimeo.com" + path,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/vnd.vimeo.*+json;version=3.4",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    },
    1000000,
  );
}
export async function vimeoConnection(u: Actor) {
  await courseOwner(u);
  return {
    connection: await db.aICourseVimeoConnection.findUnique({
      where: { id: "global" },
      select: safeConnection,
    }),
  };
}
export async function saveVimeo(u: Actor, input: unknown) {
  await courseOwner(u);
  const b = z
    .object({
      token: z
        .string()
        .trim()
        .min(20)
        .max(1000)
        .regex(/^[A-Za-z0-9._~-]+$/),
      revision: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  const me = await api(b.token, "/me?fields=uri,name");
  demand(
    typeof me.name === "string" &&
      typeof me.uri === "string" &&
      /^\/users\/\d+$/.test(me.uri),
    "No se pudo verificar la cuenta Vimeo.",
    502,
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const old = await tx.aICourseVimeoConnection.findUnique({
      where: { id: "global" },
    });
    demand(
      (old?.revision ?? 0) === b.revision,
      "La conexión cambió. Actualiza antes de guardar.",
      409,
    );
    const data = {
      encryptedToken: encryptKey(b.token, context),
      maskedToken: maskKey(b.token),
      accountUri: me.uri,
      accountName: me.name.slice(0, 200),
      verifiedAt: new Date(),
    };
    await tx.aICourseVimeoConnection.upsert({
      where: { id: "global" },
      create: { id: "global", generation: randomUUID(), ...data },
      update: { ...data, revision: { increment: 1 } },
    });
  });
  return vimeoConnection(u);
}
export async function deleteVimeo(u: Actor) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    demand(
      !(await tx.aICourseVimeoUpload.count({
        where: { status: { in: ["PENDING", "CREATING", "UPLOADING"] } },
      })),
      "Espera o detén los envíos antes de desconectar Vimeo.",
      409,
    );
    await tx.aICourseVimeoConnection.deleteMany({ where: { id: "global" } });
  });
  return { ok: true };
}
export async function uploads(u: Actor, courseId: string, moduleId: string) {
  await classroomAccess(u, courseId, moduleId);
  return {
    uploads: await db.aICourseVimeoUpload.findMany({
      where: { render: { moduleId } },
      select: publicUpload,
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  };
}
export async function queueVimeo(
  u: Actor,
  courseId: string,
  moduleId: string,
  input: unknown,
) {
  await classroomAccess(u, courseId, moduleId);
  const b = z
    .object({
      requestId: z.uuid(),
      renderId: z.string().min(1).max(100),
      connectionRevision: z.number().int(),
      connectionGeneration: z.uuid(),
    })
    .strict()
    .parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const render = await tx.aICourseRender.findFirst({
      where: {
        id: b.renderId,
        moduleId,
        status: "COMPLETED",
        module: { courseId, course: { archivedAt: null } },
      },
      include: { module: true },
    });
    demand(
      render && render.revision === render.module.revision,
      "Exporta primero la versión actual de la clase.",
      409,
    );
    const connection = await tx.aICourseVimeoConnection.findUnique({
      where: { id: "global" },
    });
    demand(connection, "Conecta tu cuenta Vimeo.", 409);
    demand(
      connection.revision === b.connectionRevision &&
        connection.generation === b.connectionGeneration,
      "Cambió la cuenta Vimeo. Actualiza antes de enviar.",
      409,
    );
    demand(
      !(await tx.aICourseTask.count({
        where: {
          courseId,
          status: { in: ["PENDING", "RUNNING", "RENDERING"] },
        },
      })),
      "Espera a que terminen las solicitudes de contenido antes de enviar a Vimeo.",
      409,
    );
    const requestId = u.id + ":" + b.requestId,
      old = await tx.aICourseVimeoUpload.findUnique({ where: { requestId } });
    if (old) {
      demand(
        old.renderId === render.id,
        "La solicitud pertenece a otro video.",
        409,
      );
      return {
        upload: await tx.aICourseVimeoUpload.findUnique({
          where: { id: old.id },
          select: publicUpload,
        }),
      };
    }
    const previous = await tx.aICourseVimeoUpload.findFirst({
      where: {
        renderId: render.id,
        credentialGeneration: connection.generation,
        credentialRevision: connection.revision,
        status: {
          in: [
            "PENDING",
            "CREATING",
            "UPLOADING",
            "COMPLETED",
            "PAUSED",
            "NEEDS_REVIEW",
          ],
        },
      },
      select: publicUpload,
    });
    if (previous) return { upload: previous };
    return {
      upload: await tx.aICourseVimeoUpload.create({
        data: {
          renderId: render.id,
          actorId: u.id,
          requestId,
          credentialRevision: connection.revision,
          credentialGeneration: connection.generation,
        },
        select: publicUpload,
      }),
    };
  });
}
export async function resumeVimeo(
  u: Actor,
  courseId: string,
  moduleId: string,
  id: string,
) {
  await classroomAccess(u, courseId, moduleId);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    const old = await tx.aICourseVimeoUpload.findFirst({
        where: { id, render: { moduleId } },
      }),
      c = await tx.aICourseVimeoConnection.findUnique({
        where: { id: "global" },
      });
    demand(
      old?.remoteUri &&
        old.uploadURL &&
        old.status === "PAUSED" &&
        c?.revision === old.credentialRevision &&
        c.generation === old.credentialGeneration,
      "Este envío necesita revisión en Vimeo o cambió la conexión.",
      409,
    );
    return {
      upload: await tx.aICourseVimeoUpload.update({
        where: { id },
        data: { status: "PENDING", error: null, leaseToken: null },
        select: publicUpload,
      }),
    };
  });
}
export async function cancelVimeo(
  u: Actor,
  courseId: string,
  moduleId: string,
  id: string,
) {
  await classroomAccess(u, courseId, moduleId);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
    await courseTransactionOwner(tx, u);
    await tx.aICourseVimeoUpload.updateMany({
      where: {
        id,
        render: { moduleId },
        status: {
          in: ["PENDING", "CREATING", "UPLOADING", "PAUSED", "NEEDS_REVIEW"],
        },
      },
      data: {
        status: "CANCELLED",
        error:
          "Envío detenido. Si el video ya existe en Vimeo, se conserva allí.",
      },
    });
  });
  return { ok: true };
}
export async function processOneVimeo() {
  if (
    !(await db.aICourseVimeoUpload.findFirst({
      where: { status: { in: ["PENDING", "CREATING", "UPLOADING"] } },
      select: { id: true },
    }))
  )
    return false;
  const token = randomUUID(),
    job = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893129)`;
      await tx.aICourseVimeoUpload.updateMany({
        where: {
          status: "CREATING",
          heartbeatAt: { lt: new Date(Date.now() - 5 * 60000) },
        },
        data: {
          status: "NEEDS_REVIEW",
          error:
            "No se confirmó la creación. Revisa tu cuenta Vimeo antes de crear otro video.",
        },
      });
      await tx.aICourseVimeoUpload.updateMany({
        where: {
          status: "UPLOADING",
          heartbeatAt: { lt: new Date(Date.now() - 5 * 60000) },
        },
        data: {
          status: "PAUSED",
          error:
            "Envío interrumpido. Reintentar continuará el archivo existente.",
        },
      });
      if (
        await tx.aICourseVimeoUpload.count({
          where: { status: { in: ["CREATING", "UPLOADING"] } },
        })
      )
        return null;
      const next = await tx.aICourseVimeoUpload.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      });
      if (!next) return null;
      return tx.aICourseVimeoUpload.update({
        where: { id: next.id },
        data: {
          status: next.remoteUri ? "UPLOADING" : "CREATING",
          leaseToken: token,
          heartbeatAt: new Date(),
        },
      });
    });
  if (!job) return false;
  let remoteUri = job.remoteUri;
  try {
    const check = async () => {
      await courseOwner({ id: job.actorId, role: "OWNER" });
      const j = await db.aICourseVimeoUpload.findFirst({
          where: {
            id: job.id,
            leaseToken: token,
            status: { in: ["CREATING", "UPLOADING"] },
            render: { module: { course: { archivedAt: null } } },
          },
        }),
        c = await db.aICourseVimeoConnection.findUnique({
          where: { id: "global" },
        });
      demand(
        j &&
          c &&
          c.revision === job.credentialRevision &&
          c.generation === job.credentialGeneration,
        "El permiso o la conexión cambió.",
        409,
      );
      await db.aICourseVimeoUpload.update({
        where: { id: job.id },
        data: { heartbeatAt: new Date() },
      });
      return decryptKey(c.encryptedToken, context);
    };
    const key = await check(),
      render = await db.aICourseRender.findUniqueOrThrow({
        where: { id: job.renderId },
        include: { module: true },
      });
    demand(
      render.revision === render.module.revision,
      "La clase cambió. Exporta la versión actual.",
      409,
    );
    const asset = await db.aICourseAsset.findUnique({
      where: { id: render.assetId ?? "" },
    });
    demand(
      asset &&
        asset.moduleId === render.moduleId &&
        asset.revision === render.revision,
      "Video no disponible.",
      404,
    );
    const bytes = await load(asset.path);
    let url = job.uploadURL;
    if (!remoteUri) {
      const r = await api(key, "/me/videos", {
        upload: { approach: "tus", size: bytes.length },
        name: render.module.title,
        privacy: { view: "nobody" },
      });
      demand(
        typeof r.uri === "string" &&
          /^\/videos\/\d+$/.test(r.uri) &&
          typeof r.upload?.upload_link === "string",
        "Vimeo no confirmó el video. Revisa la cuenta antes de repetir.",
        502,
      );
      remoteUri = r.uri;
      url = vimeoUploadURL(r.upload.upload_link);
      await db.aICourseVimeoUpload.update({
        where: { id: job.id },
        data: {
          remoteUri,
          uploadURL: url,
          totalBytes: bytes.length,
          status: "UPLOADING",
          heartbeatAt: new Date(),
        },
      });
    }
    demand(url, "Falta la dirección de subida.", 409);
    url = vimeoUploadURL(url);
    await check();
    const head = await fetch(url, {
      method: "HEAD",
      headers: { "Tus-Resumable": "1.0.0" },
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    demand(head.ok, "No se pudo consultar el progreso de subida.", 502);
    let offset = Number(head.headers.get("Upload-Offset"));
    demand(
      head.headers.has("Upload-Offset") &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        offset <= bytes.length,
      "Vimeo devolvió un progreso inválido.",
      502,
    );
    while (offset < bytes.length) {
      await check();
      const chunk = bytes.subarray(
        offset,
        Math.min(bytes.length, offset + 5 * 1024 * 1024),
      );
      const r = await fetch(url, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: new Uint8Array(chunk),
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
      demand(
        r.ok,
        "La subida se interrumpió. Reintenta para continuar el mismo video.",
        502,
      );
      const next = Number(r.headers.get("Upload-Offset"));
      demand(
        r.headers.has("Upload-Offset") && next === offset + chunk.length,
        "Vimeo no confirmó el bloque completo.",
        502,
      );
      offset = next;
      await db.aICourseVimeoUpload.update({
        where: { id: job.id },
        data: {
          uploadedBytes: offset,
          totalBytes: bytes.length,
          heartbeatAt: new Date(),
        },
      });
    }
    await check();
    const verified = await api(key, remoteUri + "?fields=uri,upload.status");
    demand(
      verified.uri === remoteUri && verified.upload?.status === "complete",
      "El archivo fue transferido; Vimeo aún no confirmó la recepción. Reintenta para consultar el mismo video.",
      502,
    );
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(893127)`;
      await courseTransactionOwner(tx, { id: job.actorId, role: "OWNER" });
      const connection = await tx.aICourseVimeoConnection.findUnique({
        where: { id: "global" },
      });
      demand(
        connection?.generation === job.credentialGeneration &&
          connection.revision === job.credentialRevision,
        "La conexión cambió.",
        409,
      );
      const fresh = await tx.aICourseVimeoUpload.findFirst({
        where: {
          id: job.id,
          leaseToken: token,
          status: "UPLOADING",
          render: {
            module: { revision: render.revision, course: { archivedAt: null } },
          },
        },
      });
      demand(fresh, "El envío dejó de estar vigente.", 409);
      await tx.aICourseVimeoUpload.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          uploadURL: null,
          error: null,
          leaseToken: null,
        },
      });
    });
  } catch {
    const persisted = await db.aICourseVimeoUpload.findUnique({
      where: { id: job.id },
      select: { remoteUri: true, uploadURL: true },
    });
    const canResume = !!persisted?.remoteUri && !!persisted.uploadURL;
    await db.aICourseVimeoUpload.updateMany({
      where: {
        id: job.id,
        leaseToken: token,
        status: { in: ["CREATING", "UPLOADING"] },
      },
      data: {
        status: canResume ? "PAUSED" : "NEEDS_REVIEW",
        ...(remoteUri ? { remoteUri } : {}),
        error: canResume
          ? "El envío requiere continuar o revisar permisos. Reintentar conserva el mismo video."
          : "No se confirmó la creación del video. Revisa Vimeo y los permisos upload antes de crear otro.",
        leaseToken: null,
      },
    });
  }
  return true;
}
