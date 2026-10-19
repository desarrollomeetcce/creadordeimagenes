import {dismissedOrderIds} from "./order-dismissal";
import {libraryImageVisibility} from "./library-visibility";
import { emptyStoppedSubproducts } from "./order-visibility";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { demand } from "./errors";
import {
  projectFilter,
  categoryFilter,
  subproductFilter,
  resourceAccess,
  ownerOnly,
  rateLimit,
} from "./auth";
import { hierarchyScope, dateRange } from "./hierarchy-filters";
import { accessibleVariation } from "./versions";
import { recordActivity } from "./activity";
import { load, store, remove, fileStream } from "./storage";
type Actor = { id: string; role: string };
type Node = { id: string; name: string; parentId: string | null; kind: string };
const ids = z.array(z.string().min(1).max(120)).min(1).max(200);
const send = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function libraryTree(user: Actor): Promise<Node[]> {
  const [projects, products, subs, folders] = await Promise.all([
    db.project.findMany({
      where: { ...projectFilter(user), deletedAt: null },
      select: { id: true, name: true },
    }),
    db.category.findMany({
      where: categoryFilter(user),
      select: { id: true, name: true, projectId: true },
    }),
    db.subproduct.findMany({
      where: subproductFilter(user),
      select: { id: true, name: true, categoryId: true },
    }),
    db.libraryFolder.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        parentId: true,
        anchorScope: true,
        anchorId: true,
      },
    }),
  ]);
  const hiddenSubs = await emptyStoppedSubproducts(subs.map(sub=>sub.id));
  return [
    {id:"loose:root",name:"Archivos sin carpeta",parentId:null,kind:"loose"},
    ...projects.map((p) => ({
      id: "project:" + p.id,
      name: p.name,
      parentId: null,
      kind: "project",
    })),
    ...products.map((p) => ({
      id: "product:" + p.id,
      name: p.name,
      parentId: "project:" + p.projectId,
      kind: "product",
    })),
    ...subs.filter(sub=>!hiddenSubs.has(sub.id)).map((p) => ({
      id: "subproduct:" + p.id,
      name: p.name,
      parentId: "product:" + p.categoryId,
      kind: "subproduct",
    })),
    ...(user.role === "OWNER"
      ? [
          {
            id: "tests:connection-test",
            name: "Pruebas",
            parentId: null,
            kind: "tests",
          },
        ]
      : []),
    ...folders.map((f) => ({
      id: "folder:" + f.id,
      name: f.name,
      parentId: f.parentId
        ? "folder:" + f.parentId
        : f.anchorScope
          ? f.anchorScope + ":" + f.anchorId
          : null,
      kind: "folder",
    })),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
async function destination(user: Actor, key: string | null) {
  if (!key || key === "root" || key === "loose:root")
    return { parentId: null, anchorScope: null, anchorId: null };
  const [kind, id] = key.split(":");
  demand(id, "Carpeta no válida.");
  if (kind === "folder") {
    const folder = await db.libraryFolder.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    demand(folder, "Carpeta no disponible.", 404);
    return { parentId: id, anchorScope: null, anchorId: null };
  }
  demand(
    ["project", "product", "subproduct", "tests"].includes(kind),
    "Destino no válido.",
  );
  if (kind === "tests") ownerOnly(user);
  else
    await resourceAccess(
      user,
      kind === "product" ? "category" : (kind as "project" | "subproduct"),
      id,
      "VIEW",
    );
  return { parentId: null, anchorScope: kind, anchorId: id };
}
export async function explorerData(user: Actor, params: URLSearchParams) {
  const scope = await hierarchyScope(user, params),
    dates = dateRange(params);
  const folder = params.get("folder") ?? "";
  if (folder) await destination(user, folder);
  const foldersOnly = !folder && !["project","product","subproduct"].some(key=>params.get(key));
  const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1),
    limit = z.coerce
      .number()
      .refine((v) => [25, 50, 100].includes(v))
      .parse(params.get("limit") ?? 25);
  const review = z
      .enum(["all", "approved", "pending"])
      .parse(params.get("review") ?? "all"),
    order = z.enum(["newest", "oldest"]).parse(params.get("order") ?? "newest"),
    kind = z
      .enum(["all", "images", "documents"])
      .parse(params.get("kind") ?? "all");
  const personal = folder.startsWith("folder:") ? folder.slice(7) : null;
  const where: Prisma.VariationWhereInput = {
    ...(kind === "documents" ? { id: "" } : {}),
    ...(review === "approved"
      ? { reviewStatus: "APPROVED" }
      : review === "pending"
        ? { reviewStatus: "PENDING" }
        : {}),
    AND: [
      libraryImageVisibility(user),
      { job: scope.where },
      {
        job:
          user.role === "OWNER"
            ? {
                OR: [
                  scope.access ?? { id: "" },
                  { projectId: "connection-test" },
                ],
              }
            : (scope.access ?? { id: "" }),
      },
    ],
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
    ...(personal?{libraryItems:{some:{userId:user.id,folderId:personal}}}:{}),
  };
  if(foldersOnly)where.id="";
  if(folder==="loose:root")where.libraryItems={some:{userId:user.id,folderId:null}};
  const documentWhere = {
    userId: user.id,
    folderId: personal,
    ...((!personal && folder && folder!=="loose:root") || kind === "images" || foldersOnly ? { id: "" } : {}),
    ...(Object.keys(dates).length ? { createdAt: dates } : {}),
  };
  const dismissed=await dismissedOrderIds(user.id);
  const pendingWhere:Prisma.GenerationJobWhereInput={
    status:{in:["PENDING","RUNNING","FAILED","UNCERTAIN"]},variation:null,
    NOT:dismissed.map(id=>({snapshot:{path:["orderId"],equals:id}})),
    snapshot:{path:["orderId"],string_starts_with:""},
    AND:[scope.where,user.role==="OWNER"?{OR:[scope.access??{id:""},{projectId:"connection-test"}]}:(scope.access??{id:""})],
    ...(user.role==="OWNER"?{}:{actorId:user.id}),
    ...(Object.keys(dates).length?{createdAt:dates}:{}),
    ...(personal||foldersOnly||folder==="loose:root"||kind==="documents"||review==="approved"||user.role==="OBSERVER"?{id:""}:{}),
  };
  const slotsWhere:Prisma.GenerationJobWhereInput={OR:[{variation:where},pendingWhere]};
  const [total, slots, documents, tree, counts, documentCount,inflightTotal] =
    await Promise.all([
      db.variation.count({where}),
      db.generationJob.findMany({where:slotsWhere,skip:(page-1)*limit,take:limit,orderBy:[{createdAt:order==="oldest"?"asc":"desc"},{id:"asc"}],select:{
        id:true,status:true,createdAt:true,subproductId:true,
        variation:{select:{id:true,revision:true,reviewStatus:true,createdAt:true,model:true,subproduct:{select:{id:true,name:true,category:{select:{id:true,name:true,project:{select:{id:true,name:true}}}}}},job:{select:{id:true,projectId:true,actorId:true}},libraryItems:{where:{userId:user.id},select:{folderId:true}}}},
      }}),
      db.libraryDocument.findMany({
        where: documentWhere,
        select: {
          id: true,
          name: true,
          mime: true,
          size: true,
          createdAt: true,
        },
        take: limit,
        skip: (page - 1) * limit,
        orderBy: [
          { createdAt: order === "oldest" ? "asc" : "desc" },
          { id: "asc" },
        ],
      }),
      libraryTree(user),
      db.generationJob.groupBy({
        by: ["status"],
        where: {
          AND: [
            scope.where,
            user.role === "OWNER"
              ? {
                  OR: [
                    scope.access ?? { id: "" },
                    { projectId: "connection-test" },
                  ],
                }
              : (scope.access ?? { id: "" }),
          ],
          ...(Object.keys(dates).length ? { createdAt: dates } : {}),
        },
        _count: true,
      }),
      db.libraryDocument.count({ where: documentWhere }),
      db.generationJob.count({where:pendingWhere}),
    ]);
  const items=slots.flatMap(slot=>slot.variation?[slot.variation]:[]);
  const costs =
    user.role === "OBSERVER"
      ? []
      : await db.usageLedger.findMany({
          where: { jobId: { in: items.map((v) => v.job.id) } },
          select: { jobId: true, actualMicros: true },
        });
  const costMap = new Map(
    costs.map((c) => [c.jobId, c.actualMicros?.toString() ?? null]),
  );
  let orders = personal || foldersOnly || folder==="loose:root"
    ? []
    : await (
        await import("./generation-orders")
      ).libraryOrders(user, {
        AND: [
          scope.where,
          user.role === "OWNER"
            ? {
                OR: [
                  scope.access ?? { id: "" },
                  { projectId: "connection-test" },
                ],
              }
            : (scope.access ?? { id: "" }),
        ],
        ...(Object.keys(dates).length ? { createdAt: dates } : {}),
      });
  if(!personal&&!foldersOnly&&folder!=="loose:root"&&slots.some(slot=>!slot.variation&&!orders.some(order=>order.jobs.some(job=>job.id===slot.id)))){
    const extra=await (await import("./generation-orders")).libraryOrders(user,{id:{in:slots.filter(slot=>!slot.variation).map(slot=>slot.id)},AND:[scope.where,user.role==="OWNER"?{OR:[scope.access??{id:""},{projectId:"connection-test"}]}:(scope.access??{id:""})]});
    orders=[...new Map([...orders,...extra].map(order=>[order.id,order])).values()];
  }
  const pendingSubs=await db.subproduct.findMany({where:{id:{in:slots.filter(slot=>!slot.variation).flatMap(slot=>slot.subproductId?[slot.subproductId]:[])},...subproductFilter(user)},select:{id:true,name:true,category:{select:{id:true,name:true,project:{select:{id:true,name:true}}}}}});
  const inflight=slots.filter(slot=>!slot.variation).map(slot=>({id:slot.id,status:slot.status,createdAt:slot.createdAt,subproduct:pendingSubs.find(sub=>sub.id===slot.subproductId)??null,orderId:orders.find(order=>order.jobs.some(job=>job.id===slot.id))?.id??null}));

  return {
    orders,
    foldersOnly,
    inflight,
    inflightTotal,
    entries:slots.map(slot=>({kind:slot.variation?"image":"pending",id:slot.variation?.id??slot.id})),
    tree,
    items: items.map((v) => ({
      ...v,
      ...(user.role !== "OBSERVER"
        ? { actualMicros: costMap.get(v.job.id) ?? null }
        : {}),
      canEdit: user.role !== "OBSERVER",
      canApprove:
        user.role !== "OBSERVER" &&
        (user.role === "OWNER" || v.job.actorId === user.id),
    })),
    documents,
    total,
    page,
    pages: Math.max(
      1,
      Math.ceil((total+inflightTotal) / limit),
      Math.ceil(documentCount / limit),
    ),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
  };
}
export async function explorerRoutes(
  req: NextRequest,
  parts: string[],
  user: Actor,
  body: () => Promise<unknown>,
) {
  if (parts[1] === "tree" && req.method === "GET")
    return send(await libraryTree(user));
  if (parts[1] === "explorer" && req.method === "GET")
    return send(await explorerData(user, req.nextUrl.searchParams));
  if (parts[1] === "folder-actions" && req.method === "POST") {
    demand(
      user.role !== "OBSERVER",
      "Observador solo puede ver y descargar.",
      403,
    );
    const b = z
      .object({
        action: z.enum(["create", "move", "delete", "rename"]),
        ids: ids.optional(),
        destination: z.string().max(150).nullable().optional(),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .strict()
      .parse(await body());
    const dest = await destination(user, b.destination ?? null);
    return send(
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
        if (b.action === "create") {
          demand(b.name, "Escribe el nombre.");
          return tx.libraryFolder.create({
            data: { userId: user.id, name: b.name, ...dest },
          });
        }
        demand(b.ids?.length, "Selecciona carpetas.");
        const all = await tx.libraryFolder.findMany({
            where: { userId: user.id },
          }),
          selection = [...new Set(b.ids)];
        demand(
          selection.every((id) => all.some((f) => f.id === id)),
          "Una carpeta no está disponible.",
          404,
        );
        if (b.action === "rename") {
          demand(
            selection.length === 1 && b.name,
            "Elige una carpeta e introduce un nombre.",
          );
          await tx.libraryFolder.update({
            where: { id: selection[0] },
            data: { name: b.name },
          });
        }
        if (b.action === "move") {
          let cursor = dest.parentId;
          const visited = new Set<string>();
          while (cursor) {
            demand(
              !selection.includes(cursor),
              "No puedes mover una carpeta dentro de sí misma o de una descendiente.",
            );
            demand(
              !visited.has(cursor),
              "La estructura contiene un ciclo.",
              409,
            );
            visited.add(cursor);
            cursor = all.find((f) => f.id === cursor)?.parentId ?? null;
          }
          // Moving selected parents carries their descendants; do not flatten selected children.
          const roots = selection.filter((id) => {
            let p = all.find((f) => f.id === id)?.parentId;
            while (p) {
              if (selection.includes(p)) return false;
              p = all.find((f) => f.id === p)?.parentId;
            }
            return true;
          });
          await tx.libraryFolder.updateMany({
            where: { id: { in: roots }, userId: user.id },
            data: dest,
          });
        }
        if (b.action === "delete") {
          const descendants = new Set(selection);
          let changed = true;
          while (changed) {
            changed = false;
            for (const f of all)
              if (
                f.parentId &&
                descendants.has(f.parentId) &&
                !descendants.has(f.id)
              ) {
                descendants.add(f.id);
                changed = true;
              }
          }
          const deleted = [...descendants];
          // Keep images/documents in the root; deleting an organizational folder never destroys originals.
          await tx.libraryItem.updateMany({
            where: { userId: user.id, folderId: { in: deleted } },
            data: { folderId: null },
          });
          await tx.libraryDocument.updateMany({
            where: { userId: user.id, folderId: { in: deleted } },
            data: { folderId: null },
          });
          await tx.libraryFolder.updateMany({
            where: { userId: user.id, id: { in: deleted } },
            data: { parentId: null },
          });
          await tx.libraryFolder.deleteMany({
            where: { userId: user.id, id: { in: deleted } },
          });
        }
        await recordActivity(tx, {
          data: {
            actorId: user.id,
            action: "BIBLIOTECA_CARPETAS_" + b.action.toUpperCase(),
            detail: { count: selection.length },
          },
        });
        return { ok: true };
      }),
    );
  }
  if (parts[1] === "item-actions" && req.method === "POST") {
    demand(
      user.role !== "OBSERVER",
      "Observador solo puede ver y descargar.",
      403,
    );
    const b = z
      .object({
        action: z.enum(["move", "remove"]),
        ids,
        folderId: z.string().nullable().optional(),
      })
      .strict()
      .parse(await body());
    if (b.folderId) await destination(user, "folder:" + b.folderId);
    for (const id of b.ids) await accessibleVariation(user, id, "VIEW");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(428281)`;
      for (const id of [...new Set(b.ids)]) {
        await tx.$queryRaw`SELECT id FROM "Variation" WHERE id=${id} FOR UPDATE`;
        if (b.action === "move")
          await tx.libraryItem.upsert({
            where: { userId_variationId: { userId: user.id, variationId: id } },
            create: {
              userId: user.id,
              variationId: id,
              folderId: b.folderId ?? null,
            },
            update: { folderId: b.folderId ?? null },
          });
        else {
          await tx.libraryExclusion.upsert({
            where: { userId_variationId: { userId: user.id, variationId: id } },
            create: { userId: user.id, variationId: id },
            update: {},
          });
          await tx.libraryItem.deleteMany({
            where: { userId: user.id, variationId: id },
          });
        }
        if (b.action === "move")
          await tx.libraryExclusion.deleteMany({
            where: { userId: user.id, variationId: id },
          });
        await tx.variation.update({
          where: { id },
          data: {
            permanent:
              (await tx.libraryItem.count({ where: { variationId: id } })) > 0,
          },
        });
      }
      await recordActivity(tx, {
        data: {
          actorId: user.id,
          action: "BIBLIOTECA_SELECCION_" + b.action.toUpperCase(),
          detail: { count: b.ids.length },
        },
      });
    });
    return send({ ok: true });
  }
  if (parts[1] === "documents") {
    if (parts[2]) {
      const d = await db.libraryDocument.findFirst({
        where: { id: parts[2], userId: user.id },
      });
      demand(d, "Archivo no disponible.", 404);
      if (req.method === "GET")
        return new Response(fileStream(await load(d.path)), {
          headers: {
            "Content-Type": d.mime,
            "Content-Disposition":
              "attachment; filename*=UTF-8''" + encodeURIComponent(d.name),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      if (req.method === "DELETE") {
        demand(
          user.role !== "OBSERVER",
          "Observador solo puede ver y descargar.",
          403,
        );
        await db.libraryDocument.delete({ where: { id: d.id } });
        await remove(d.path);
        return send({ ok: true });
      }
      if (req.method === "PATCH") {
        const b = z
          .object({ folderId: z.string().nullable() })
          .strict()
          .parse(await body());
        if (b.folderId) await destination(user, "folder:" + b.folderId);
        await db.libraryDocument.update({ where: { id: d.id }, data: b });
        return send({ ok: true });
      }
    } else if (req.method === "POST") {
      demand(
        user.role !== "OBSERVER",
        "Observador solo puede ver y descargar.",
        403,
      );
      await rateLimit("library-upload:" + user.id, 30);
      demand(
        Number(req.headers.get("content-length") ?? 0) <= 3100000,
        "El archivo supera el máximo de 3 MB.",
        413,
      );
      const reader = req.body?.getReader(),
        chunks: Uint8Array[] = [];
      let bytesRead = 0;
      demand(reader, "Elige un archivo.");
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytesRead += chunk.value.byteLength;
        if (bytesRead > 3100000) {
          await reader.cancel();
          demand(false, "El archivo supera el máximo de 3 MB.", 413);
        }
        chunks.push(chunk.value);
      }
      const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
          headers: { "Content-Type": req.headers.get("content-type") ?? "" },
        }).formData(),
        file = form.get("file"),
        folderId = String(form.get("folderId") ?? "") || null;
      demand(
        file instanceof File && file.size > 0 && file.size <= 3000000,
        "Elige un archivo de hasta 3 MB.",
        413,
      );
      const allowed = [
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
        "image/webp",
      ];
      demand(
        allowed.includes(file.type),
        "Utiliza PDF, TXT, CSV, DOCX, PNG, JPG o WEBP.",
      );
      if (folderId) await destination(user, "folder:" + folderId);
      const path = await store(Buffer.from(await file.arrayBuffer()));
      try {
        return send(
          await db.libraryDocument.create({
            data: {
              userId: user.id,
              folderId,
              name: file.name.slice(0, 200),
              mime: file.type,
              path,
              size: file.size,
            },
          }),
          201,
        );
      } catch (e) {
        await remove(path);
        throw e;
      }
    }
  }
  return null;
}
