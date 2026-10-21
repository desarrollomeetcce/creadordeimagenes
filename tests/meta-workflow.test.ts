import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";

const exclusive = process.env.DATABASE_URL?.includes(
  "/library_organization_test?host=/workspace/work/pgdata",
);
test(
  "Meta Workflow local: ejecución durable sin navegador y rechazo previo a cualquier acceso externo",
  { skip: !exclusive },
  async () => {
    const owner = await db.user.findFirstOrThrow({
      where: { role: "OWNER", status: "APPROVED" },
    });
    const c = await db.metaConnection.create({
      data: {
        ownerId: owner.id,
        name: "Workflow sin autorización · sintético",
        transport: "API",
        verifiedAt: new Date(),
      },
    });
    const id = String(Date.now()) + "88";
    await db.metaAdAccount.create({
      data: {
        id,
        connectionId: c.id,
        name: "Sin autorización",
        currency: "PEN",
        timezone: "America/Lima",
        enabled: true,
        nextSyncAt: new Date(),
      },
    });
    try {
      const root = process.env.TEST_APP_URL ?? "http://localhost:3074";
      const login = await fetch(root + "/api/auth/login", {
        method: "POST",
        headers: { Origin: root, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: owner.email,
          password: "Prueba-segura-0123456789",
        }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const start = await fetch(root + `/api/meta-ads/accounts/${id}/sync`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: root,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(start.status, 202);
      assert.equal((await start.json()).scheduled, true);
      let result;
      for (let i = 0; i < 80; i++) {
        result = await db.metaAdAccount.findUniqueOrThrow({ where: { id } });
        if (result.syncError) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      assert(result?.schedulerRunId);
      assert(result.syncError?.includes("desconectada"));
      assert.equal(result.syncedAt, null);
      assert.equal(await db.metaAdDaily.count({ where: { accountId: id } }), 0);
      const { getRun } = await import("workflow/api");
      await db.metaAdAccount.update({
        where: { id },
        data: { enabled: false, schedulerToken: null, nextSyncAt: null },
      });
      await getRun(result.schedulerRunId).wakeUp();
    } finally {
      await db.metaAdAccount.updateMany({
        where: { id },
        data: { enabled: false, schedulerToken: null, nextSyncAt: null },
      });
      await db.$disconnect();
    }
  },
);
