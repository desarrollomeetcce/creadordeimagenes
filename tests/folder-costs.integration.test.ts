import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { fixedCostRoutes } from "../lib/fixed-costs";
import { scopedMembers } from "../lib/project-members";
import { personalFolderMembers } from "../lib/personal-folder-members";
import {
  personalFolders,
  delegatedImageIds,
  personalFolderAccess,
  personalDocumentAccess,
} from "../lib/personal-folder-access";
import { projectAccess, tokenHash } from "../lib/auth";
import {
  libraryTree,
  explorerData,
  explorerRoutes,
} from "../lib/library-explorer";
test("private costs, exact summaries, recurring idempotence, current grants and full folder inheritance", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  await db.fixedCostEntry.deleteMany();
  await db.fixedCostSheet.deleteMany();
  await db.fixedCostGrant.deleteMany();
  const prefix = "fc-" + randomUUID(),
    actors: any[] = [];
  for (const role of ["OWNER", "OWNER", "ADMIN", "USER", "OBSERVER"]) {
    const id = prefix + "-" + actors.length,
      session = randomUUID();
    const u = await db.user.create({
      data: {
        id,
        name: "QA " + role,
        email: id + "@example.test",
        passwordHash: "test-only",
        role: role as any,
        status: "APPROVED",
      },
    });
    await db.session.create({
      data: {
        id: tokenHash(session),
        userId: id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    actors.push({ ...u, session });
  }
  const [owner, otherOwner, admin, user, observer] = actors;
  const call = async (actor: any, path = "", method = "GET", b?: unknown) => {
    const req = new NextRequest(
      "http://localhost:3078/api/fixed-costs" + path,
      { method },
    );
    const r = await fixedCostRoutes(
      req,
      ("fixed-costs" + path.split("?")[0]).split("/"),
      actor,
      async () => b,
    );
    return await r.json();
  };
  await assert.rejects(() => call(admin, "?month=2026-11"), /No tienes acceso/);
  const empty = await call(otherOwner, "?month=2026-11");
  assert.equal(empty.total, 0);
  assert.equal(await db.fixedCostSheet.count(), 0);
  await call(owner, "/sheets/initialize", "POST", {});
  let data = await call(owner, "?month=2026-11");
  assert.equal(data.sheets.length, 6);
  const sheetId = data.sheets[0].id,
    entry = {
      sheetId,
      date: "2026-11-06",
      kind: "FIXED",
      concept: "Pago mensual QA",
      category: "Personal",
      country: "Colombia",
      location: "Tumbes",
      person: "QA",
      amount: "100.10",
      currency: "PEN",
      paid: false,
      notes: "",
    },
    requestId = randomUUID();
  const row = await call(owner, "/entries", "POST", { requestId, entry });
  const twice = await call(owner, "/entries", "POST", { requestId, entry });
  assert.equal(twice.id, row.id);
  await assert.rejects(
    () =>
      call(owner, "/entries", "POST", {
        requestId,
        entry: { ...entry, amount: "100.20" },
      }),
    /otros datos/,
  );
  await call(owner, "/entries", "POST", {
    requestId: randomUUID(),
    entry: {
      ...entry,
      concept: "Gasto del día",
      kind: "VARIABLE",
      amount: "0.20",
      paid: true,
    },
  });
  await call(owner, "/entries", "POST", {
    requestId: randomUUID(),
    entry: {
      ...entry,
      concept: "USD separado",
      currency: "USD",
      amount: "25",
      paid: true,
    },
  });
  data = await call(otherOwner, "?month=2026-11");
  assert.equal(data.total, 3);
  assert.equal(
    data.groups.find((g: any) => g.currency === "PEN" && !g.paid)._sum.amount,
    "100.1",
  );
  assert.equal(
    data.groups.find((g: any) => g.currency === "PEN" && g.paid)._sum.amount,
    "0.2",
  );
  assert.equal(
    data.groups.find((g: any) => g.currency === "USD")._sum.amount,
    "25",
  );
  assert.equal((await call(owner, "?month=2026-11&country=Perú")).total, 0);
  assert.equal(
    (
      await call(
        owner,
        "?month=2026-11&country=Colombia&kind=VARIABLE&paid=yes",
      )
    ).total,
    1,
  );
  const carry = await call(owner, "/carry", "POST", { month: "2026-12" });
  assert.equal(carry.copied, 2);
  assert.equal(
    (await call(owner, "/carry", "POST", { month: "2026-12" })).copied,
    0,
  );
  data = await call(owner, "?month=2026-12");
  assert(data.rows.every((r: any) => !r.paid));
  assert.equal((await call(owner, "?month=2026-11")).total, 3);
  await call(owner, "/sharing", "POST", {
    email: admin.email,
    permission: "EDIT",
  });
  await call(admin, "/entries/" + row.id, "PATCH", {
    version: row.version,
    entry: { ...entry, paid: true },
  });
  await assert.rejects(
    () =>
      call(owner, "/entries/" + row.id, "PATCH", {
        version: row.version,
        entry,
      }),
    /otra ventana/,
  );
  await call(owner, "/sharing/" + admin.id, "DELETE");
  await assert.rejects(() => call(admin, "?month=2026-11"), /No tienes acceso/);
  await call(owner, "/sharing", "POST", {
    email: observer.email,
    permission: "VIEW",
  });
  assert.equal((await call(observer, "?month=2026-11")).canEdit, false);
  await assert.rejects(
    () =>
      call(observer, "/entries", "POST", { requestId: randomUUID(), entry }),
    /No tienes acceso/,
  );
  await db.user.update({
    where: { id: observer.id },
    data: { status: "SUSPENDED" },
  });
  await assert.rejects(() => call(observer, "?month=2026-11"), /habilitada/);
  await db.user.update({
    where: { id: observer.id },
    data: { status: "APPROVED" },
  });
  console.log(
    "PASS OWNER-only costs, second OWNER, three currencies/groups, daily variables, no GET writes, optimistic conflicts, recurring/month idempotence and grant revocation",
  );
  const project = await db.project.create({
      data: { name: "QA compartir", ownerId: owner.id },
    }),
    category = await db.category.create({
      data: {
        name: "COLOMBIA QA",
        projectId: project.id,
        createdById: admin.id,
      },
    }),
    sibling = await db.category.create({
      data: {
        name: "Privado QA",
        projectId: project.id,
        createdById: owner.id,
      },
    }),
    sub = await db.subproduct.create({
      data: {
        name: "Diplomado QA",
        categoryId: category.id,
        createdById: admin.id,
      },
    });
  const share = async (
    actor: any,
    scope: any,
    id: string,
    method = "GET",
    body?: unknown,
    member?: string,
  ) => {
    const r = await scopedMembers(
      new NextRequest("http://localhost:3078/api/test", { method }),
      scope,
      id,
      member,
      actor,
      async () => body,
    );
    return r.json();
  };
  await share(admin, "category", category.id, "POST", { email: user.email });
  assert(
    (await libraryTree(user)).some((n) => n.id === "subproduct:" + sub.id),
  );
  assert(
    !(await libraryTree(user)).some((n) => n.id === "product:" + sibling.id),
  );
  await projectAccess(user, project.id, "NAVIGATE");
  await assert.rejects(() => projectAccess(user, project.id, "EDIT"));
  await assert.rejects(() =>
    share(admin, "project", project.id, "PATCH", { allUsers: true }),
  );
  await share(owner, "project", project.id, "PATCH", { allUsers: true });
  const future = await db.user.create({
    data: {
      id: prefix + "-future",
      name: "Futuro QA",
      email: prefix + "-future@example.test",
      passwordHash: "test",
      role: "USER",
      status: "APPROVED",
    },
  });
  actors.push(future);
  assert(
    (await libraryTree(future)).some((n) => n.id === "product:" + sibling.id),
  );
  await share(owner, "project", project.id, "PATCH", { allUsers: false });
  assert(
    !(await libraryTree(future)).some((n) => n.id === "project:" + project.id),
  );
  const folder = await db.libraryFolder.create({
      data: { name: "Personal de ADMIN QA", userId: admin.id },
    }),
    child = await db.libraryFolder.create({
      data: { name: "Hija QA", userId: admin.id, parentId: folder.id },
    }),
    ownPrivate = await db.libraryFolder.create({
      data: { name: "Personal privada OWNER QA", userId: owner.id },
    });
  const folderShare = async (
    actor: any,
    id: string,
    method = "GET",
    body?: unknown,
    member?: string,
  ) => {
    const r = await personalFolderMembers(
      new NextRequest("http://localhost:3078/api/test", { method }),
      id,
      member,
      actor,
      async () => body,
    );
    return r.json();
  };
  assert((await personalFolders(otherOwner)).some((f) => f.id === folder.id));
  assert(!(await personalFolders(admin)).some((f) => f.id === ownPrivate.id));
  await folderShare(admin, folder.id, "POST", { email: user.email });
  assert((await personalFolders(user)).some((f) => f.id === child.id));
  const futureChild = await db.libraryFolder.create({
    data: { name: "Hija futura QA", userId: admin.id, parentId: folder.id },
  });
  assert((await personalFolders(user)).some((f) => f.id === futureChild.id));
  await assert.rejects(() => personalFolderAccess(user, folder.id, true));
  await folderShare(admin, folder.id, "PATCH", { allUsers: true });
  assert((await personalFolders(future)).some((f) => f.id === child.id));
  await folderShare(admin, folder.id, "PATCH", { allUsers: false });
  await folderShare(admin, folder.id, "DELETE", undefined, user.id);
  assert(!(await personalFolders(user)).some((f) => f.id === child.id));
  // Native anchors inherit full rights, not ancestors shown only for navigation.
  const anchored = await db.libraryFolder.create({
      data: {
        name: "Ancla país QA",
        userId: owner.id,
        anchorScope: "product",
        anchorId: category.id,
      },
    }),
    rootAnchored = await db.libraryFolder.create({
      data: {
        name: "Ancla privada QA",
        userId: owner.id,
        anchorScope: "project",
        anchorId: project.id,
      },
    });
  assert((await personalFolders(user)).some((f) => f.id === anchored.id));
  assert(!(await personalFolders(user)).some((f) => f.id === rootAnchored.id));
  const q = JSON.parse(
    await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
  );
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: q.projectId, userId: admin.id } },
    create: { projectId: q.projectId, userId: admin.id },
    update: {},
  });
  const variation = await db.variation.findFirstOrThrow({
    where: { job: { projectId: q.projectId } },
  });
  await db.variation.update({
    where: { id: variation.id },
    data: { reviewStatus: "APPROVED" },
  });
  await db.libraryImageCopy.create({
    data: {
      userId: admin.id,
      variationId: variation.id,
      destinationKey: "folder:" + folder.id,
    },
  });
  await folderShare(admin, folder.id, "POST", { email: user.email });
  assert((await delegatedImageIds(user)).includes(variation.id));
  const explorer = await explorerData(
    user,
    new URLSearchParams({ folder: "folder:" + folder.id }),
  );
  assert(
    explorer.items.some(
      (v) => v.id === variation.id && !v.canEdit && v.job.id === "",
    ),
  );
  await db.projectMember.delete({
    where: { projectId_userId: { projectId: q.projectId, userId: admin.id } },
  });
  assert(!(await delegatedImageIds(user)).includes(variation.id));
  await personalDocumentAccess(user, {
    userId: admin.id,
    folderId: child.id,
    destinationKey: null,
  });
  await assert.rejects(() =>
    personalDocumentAccess(future, {
      userId: admin.id,
      folderId: child.id,
      destinationKey: null,
    }),
  );
  await assert.rejects(() =>
    personalDocumentAccess(user, {
      userId: admin.id,
      folderId: child.id,
      destinationKey: "folder:" + ownPrivate.id,
    }),
  );
  const { store } = await import("../lib/storage");
  const bytes = Buffer.from("QA documento compartido"),
    path = await store(bytes);
  const sharedDoc = await db.libraryDocument.create({
    data: {
      userId: admin.id,
      folderId: child.id,
      name: "QA ACL compartido.txt",
      mime: "text/plain",
      path,
      size: bytes.length,
    },
  });
  const nativeDoc = await db.libraryDocument.create({
    data: {
      userId: owner.id,
      destinationKey: "product:" + category.id,
      name: "QA ACL país.txt",
      mime: "text/plain",
      path,
      size: bytes.length,
    },
  });
  const privateDoc = await db.libraryDocument.create({
    data: {
      userId: owner.id,
      destinationKey: "project:" + project.id,
      name: "QA ACL privado.txt",
      mime: "text/plain",
      path,
      size: bytes.length,
    },
  });
  const searched = await explorerData(
    user,
    new URLSearchParams({ q: "QA ACL" }),
  );
  assert(searched.documents.some((d) => d.id === sharedDoc.id));
  assert(searched.documents.some((d) => d.id === nativeDoc.id));
  assert(!searched.documents.some((d) => d.id === privateDoc.id));
  const docResponse = await explorerRoutes(
    new NextRequest(
      "http://localhost:3078/api/library/documents/" + sharedDoc.id,
    ),
    ["library", "documents", sharedDoc.id],
    user,
    async () => ({}),
  );
  assert.equal(await docResponse!.text(), "QA documento compartido");
  await assert.rejects(() =>
    explorerRoutes(
      new NextRequest(
        "http://localhost:3078/api/library/documents/" + privateDoc.id,
      ),
      ["library", "documents", privateDoc.id],
      user,
      async () => ({}),
    ),
  );
  console.log(
    "PASS document bytes and search respect personal/native grants; navigation ancestor never exposes private root documents",
  );
  console.log(
    "PASS folders OWNER visibility, creator management, specific/all/future users and descendants, navigation-only anchors, shared image read without edit/private source fields, source revocation and document destination precedence",
  );
  await writeFile(
    "/workspace/work/folder-cost-fixture.json",
    JSON.stringify({
      actors,
      project,
      category,
      sub,
      folder,
      child,
      ownPrivate,
      variationId: variation.id,
      sheetId,
    }),
    { mode: 0o600 },
  );
  await db.$disconnect();
});
