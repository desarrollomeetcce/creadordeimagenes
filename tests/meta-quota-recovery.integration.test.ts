import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import {
  recoverMetaQuota,
  quotaHooks,
  quotaUntil,
} from "../lib/meta-ads/quota";
import { MetaGraphError } from "../lib/meta-ads/graph-error";
test("Recuperación explícita acotada de pausas internas compartidas", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const scope = "qa-recover-" + randomUUID(),
    keys = [scope, "provider:" + scope, "recovery:" + scope];
  const reset = async () => {
    await db.metaApiQuota.deleteMany({ where: { scope: { in: keys } } });
    await db.metaApiQuota.create({
      data: {
        scope,
        blockedUntil: new Date(Date.now() + 8 * 3600000),
        lastLimitedAt: new Date(Date.now() - 3600000),
        failures: 5,
      },
    });
  };
  const recover = () => db.$transaction((tx) => recoverMetaQuota(tx, scope));
  try {
    await t.test(
      "Permite comprobar espera interna de ocho horas sin borrar contador",
      async () => {
        await reset();
        assert(await quotaUntil(scope));
        assert.equal(await recover(), null);
        assert.equal(await quotaUntil(scope), null);
        assert.equal(
          (await db.metaApiQuota.findUniqueOrThrow({ where: { scope } }))
            .failures,
          5,
        );
        await quotaHooks(scope, false).beforeRead();
      },
    );
    await t.test(
      "Nueva limitación no permite repetir recuperación en quince minutos",
      async () => {
        await db.metaApiQuota.update({
          where: { scope },
          data: { blockedUntil: new Date(Date.now() + 3600000) },
        });
        const a = await recover();
        assert(a && a.valueOf() > Date.now() + 14 * 60000);
        assert(await quotaUntil(scope));
      },
    );
    await t.test(
      "Cuota recién recibida espera al menos un minuto antes de comprobar",
      async () => {
        await reset();
        await db.metaApiQuota.update({
          where: { scope },
          data: { lastLimitedAt: new Date() },
        });
        const a = await recover();
        assert(a && a.valueOf() > Date.now() + 50000);
        assert(await quotaUntil(scope));
      },
    );
    await t.test(
      "Retry-After del proveedor se conserva y nunca se libera por recuperación",
      async () => {
        await reset();
        const e = new MetaGraphError(
          429,
          { error: { code: 4, message: "synthetic quota" } },
          "synthetic",
          { version: "v26.0", endpoint: "test", fields: "id" },
        );
        await quotaHooks(scope, false).limited(e, 2 * 3600000);
        const before = await quotaUntil(scope);
        const a = await recover();
        assert(a && a.valueOf() > Date.now() + 119 * 60000);
        assert.equal((await quotaUntil(scope))?.valueOf(), before?.valueOf());
        await assert.rejects(
          () => quotaHooks(scope, false).beforeRead(),
          /limitó/,
        );
      },
    );
    await t.test(
      "Recuperar cuota ajena no cambia el plazo de este ámbito",
      async () => {
        const before = await quotaUntil(scope);
        assert.equal(
          await db.$transaction((tx) =>
            recoverMetaQuota(tx, "qa-unrelated-" + randomUUID()),
          ),
          null,
        );
        assert.equal((await quotaUntil(scope))?.valueOf(), before?.valueOf());
      },
    );
  } finally {
    await db.metaApiQuota.deleteMany({ where: { scope: { in: keys } } });
    await db.$disconnect();
  }
});
