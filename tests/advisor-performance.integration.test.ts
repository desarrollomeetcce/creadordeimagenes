import test from "node:test";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { db } from "../lib/db";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";
const root = process.env.TEST_APP_URL ?? "http://localhost:3074";
class Client {
  cookie = "";
  async call(path: string, method = "GET", body?: unknown) {
    const r = await fetch(root + "/api/" + path, {
      method,
      headers: {
        Cookie: this.cookie,
        ...(method !== "GET"
          ? { Origin: root, "Content-Type": "application/json" }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const c = r.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    return { status: r.status, body: await r.json() };
  }
}
test("Mi desempeño: vinculación segura, bases canónicas, objetivos y aislamiento por cuenta", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test"),
    "Usar exclusivamente base sintética",
  );
  const tag = randomUUID(),
    password = "Prueba-segura-0123456789",
    hash = await argon2.hash(password),
    today = localDay("America/Lima"),
    yesterday = shiftDay(today, -1);
  const owner = await db.user.create({
      data: {
        name: "Portal owner " + tag,
        email: `portal-owner-${tag}@example.test`,
        passwordHash: hash,
        role: "OWNER",
        status: "APPROVED",
      },
    }),
    user = await db.user.create({
      data: {
        name: "Portal Ana " + tag,
        email: `portal-ana-${tag}@example.test`,
        passwordHash: hash,
        status: "APPROVED",
      },
    }),
    other = await db.user.create({
      data: {
        name: "Portal Don " + tag,
        email: `portal-don-${tag}@example.test`,
        passwordHash: hash,
        status: "APPROVED",
      },
    });
  const team = await db.metaEffectivenessSheet.create({
      data: { kind: "ADVISORS", name: "Portal equipo " + tag },
    }),
    ana = await db.metaAdvisor.create({
      data: { name: "Portal Ana " + tag, sheetId: team.id },
    }),
    don = await db.metaAdvisor.create({
      data: { name: "Portal Don " + tag, sheetId: team.id },
    });
  const table = await db.metaAliasTable.create({
      data: { name: "Portal hoja " + tag, defaultCountry: "PE" },
    }),
    table2 = await db.metaAliasTable.create({
      data: { name: "Portal segunda " + tag, defaultCountry: "CO" },
    });
  for (const [source, country, ownSales, bm, bc] of [
    [table, "PE", 2, 100, 40],
    [table2, "CO", 1, 50, 20],
  ] as const) {
    const alias = await db.metaAlias.create({
        data: { name: "Portal curso " + source.id, tableId: source.id },
      }),
      row = await db.metaEffectivenessRow.create({
        data: { aliasId: alias.id, country, currency: "", advisorId: don.id },
      });
    for (const day of [today, yesterday]) {
      const dailySales = ownSales + (day === yesterday ? 1 : 0);
      const dailyBM = day === yesterday ? (country === "PE" ? 238 : 120) : bm;
      await db.metaEffectivenessDay.create({
        data: {
          rowId: row.id,
          day,
          sales: dailySales + 8,
          salesOverridden: true,
        },
      });
      await db.metaAdvisorSalesApproval.create({
        data: {
          rowId: row.id,
          day,
          salesTotal: dailySales + 8,
          allocations: [
            { advisorId: ana.id, sales: dailySales },
            { advisorId: don.id, sales: 8 },
          ],
          basis: { events: [], activeAdvisorId: don.id },
          actorId: owner.id,
        },
      });
      await db.metaManualBaseDay.create({
        data: {
          tableId: source.id,
          country,
          day,
          allocations: [
            { advisorId: ana.id, quantity: dailyBM },
            { advisorId: don.id, quantity: 999 },
          ],
        },
      });
      await db.metaAdvisorBaseDay.create({
        data: {
          tableId: source.id,
          country,
          day,
          allocations: [
            { advisorId: ana.id, quantity: bc },
            { advisorId: don.id, quantity: 888 },
          ],
        },
      });
    }
  }
  const oc = new Client(),
    uc = new Client(),
    dc = new Client();
  for (const [c, u] of [
    [oc, owner],
    [uc, user],
    [dc, other],
  ] as const)
    assert.equal(
      (await c.call("auth/login", "POST", { email: u.email, password })).status,
      200,
    );
  const path = "meta-ads/my-performance",
    query = `?since=${yesterday}&until=${today}`;
  await t.test(
    "anonymous/unlinked users cannot read; only OWNER lists accounts or writes",
    async () => {
      assert.equal((await new Client().call(path)).status, 401);
      assert.equal((await uc.call(path)).status, 403);
      assert.equal((await uc.call(path + "/settings")).status, 403);
      assert.equal(
        (
          await uc.call(path + "/link", "PUT", {
            advisorId: ana.id,
            userId: user.id,
            revision: 0,
          })
        ).status,
        403,
      );
      assert.equal((await uc.call(path + "/goals", "PUT", {})).status, 403);
    },
  );
  await t.test(
    "unique explicit account binding and optimistic revisions",
    async () => {
      assert.equal(
        (
          await oc.call(path + "/link", "PUT", {
            advisorId: ana.id,
            userId: user.id,
            revision: 0,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await oc.call(path + "/link", "PUT", {
            advisorId: don.id,
            userId: user.id,
            revision: 0,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await oc.call(path + "/link", "PUT", {
            advisorId: ana.id,
            userId: user.id,
            revision: 0,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await oc.call(path + "/link", "PUT", {
            advisorId: don.id,
            userId: other.id,
            revision: 0,
          })
        ).status,
        200,
      );
      assert.equal((await uc.call("auth/me")).body.advisorLinked, true);
    },
  );
  await t.test(
    "same canonical sales and manual bases as owner; no other advisor data, dates Lima",
    async () => {
      const a = await uc.call(path + query),
        o = await oc.call(path + query + "&advisorId=" + ana.id),
        d = await dc.call(path + query);
      assert.equal(a.status, 200);
      assert.deepEqual(a.body, o.body);
      assert.equal(a.body.person.id, ana.id);
      assert.equal(a.body.today.day, today);
      assert.equal(a.body.today.sales, 3);
      assert.equal(a.body.today.base, 60);
      assert.equal(a.body.today.percent, 5);
      assert.equal(a.body.today.previousPercent, (5 / 60) * 100);
      assert.equal(a.body.today.previousDay, yesterday);
      assert.equal(a.body.yesterday.previousPercent, null);
      assert.equal(a.body.history.length, 2);
      assert.equal(a.body.yesterday.sales, 5);
      assert.equal(a.body.yesterday.base, 358);
      assert.equal(a.body.yesterday.percent, (5 / 358) * 100);
      assert.equal(d.body.today.sales, 16);
      assert(!JSON.stringify(a.body).includes(don.id));
      assert(!JSON.stringify(a.body).includes(don.name));
      assert(!("assignmentHistory" in a.body));
      assert.equal(
        (await uc.call(path + query + "&advisorId=" + don.id)).status,
        403,
      );
      assert.equal(
        (
          await uc.call(
            "meta-ads/advisors/detail?" +
              new URLSearchParams({
                tableId: "all",
                advisorId: ana.id,
                since: yesterday,
                until: today,
              }),
          )
        ).status,
        403,
      );
      assert.equal(
        (await uc.call(path + "?since=2020-01-01&until=2026-01-01")).status,
        400,
      );
    },
  );
  await t.test(
    "zero and missing bases remain distinct; no division by zero",
    async () => {
      const keys = {
        tableId_country_day: { tableId: table.id, country: "PE", day: today },
      };
      const keys2 = {
        tableId_country_day: { tableId: table2.id, country: "CO", day: today },
      };
      const old1 = await db.metaAdvisorBaseDay.findUniqueOrThrow({
          where: keys,
        }),
        old2 = await db.metaAdvisorBaseDay.findUniqueOrThrow({ where: keys2 });
      for (const where of [keys, keys2])
        await db.metaAdvisorBaseDay.update({
          where,
          data: { allocations: [{ advisorId: ana.id, quantity: 0 }] },
        });
      let r = await uc.call(path + query);
      assert.equal(r.body.today.base, 0);
      assert.equal(r.body.today.percent, null);
      for (const where of [keys, keys2])
        await db.metaAdvisorBaseDay.update({
          where,
          data: { state: "EMPTY", allocations: [] },
        });
      r = await uc.call(path + query);
      assert.equal(r.body.today.base, null);
      assert.equal(r.body.today.percent, null);
      await db.metaAdvisorBaseDay.update({
        where: keys,
        data: { state: old1.state, allocations: old1.allocations! },
      });
      await db.metaAdvisorBaseDay.update({
        where: keys2,
        data: { state: old2.state, allocations: old2.allocations! },
      });
    },
  );
  let goal: any;
  await t.test(
    "owner defines separate BC/BM percentages; reject overlap/invalid/stale targets",
    async () => {
      const b = {
        advisorId: ana.id,
        basis: "BC",
        since: yesterday,
        until: today,
        percent: 4,
        salesTarget: 5,
        revision: 0,
      };
      let r = await oc.call(path + "/goals", "PUT", b);
      assert.equal(r.status, 200);
      goal = r.body;
      assert.equal((await oc.call(path + "/goals", "PUT", b)).status, 409);
      assert.equal(
        (
          await oc.call(path + "/goals", "PUT", {
            ...b,
            basis: "BM",
            percent: 3,
          })
        ).status,
        200,
      );
      assert.equal(
        (await oc.call(path + "/goals", "PUT", { ...b, percent: 101 })).status,
        400,
      );
      assert.equal(
        (
          await oc.call(path + "/goals", "PUT", {
            ...b,
            id: goal.id,
            revision: 0,
          })
        ).status,
        409,
      );
      r = await uc.call(path + query);
      assert.equal(r.body.today.goal.percent, 4);
      assert.equal(r.body.yesterday.goal.percent, 3);
      assert.equal((await dc.call(path + query)).body.goals.length, 0);
      assert.equal(
        (
          await uc.call(path + "/goals", "DELETE", {
            id: goal.id,
            revision: goal.revision,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await oc.call(path + "/goals", "PUT", {
            ...b,
            id: goal.id,
            revision: 1,
            percent: 6,
          })
        ).status,
        200,
      );
      assert.equal(
        (await oc.call(path + "/goals", "DELETE", { id: goal.id, revision: 1 }))
          .status,
        409,
      );
    },
  );
  await t.test(
    "revocation removes access and login landing flag without touching sales",
    async () => {
      const before = await db.metaEffectivenessDay.findMany({
        where: { row: { alias: { tableId: { in: [table.id, table2.id] } } } },
      });
      assert.equal(
        (
          await oc.call(path + "/link", "PUT", {
            advisorId: ana.id,
            userId: null,
            revision: 1,
          })
        ).status,
        200,
      );
      assert.equal((await uc.call(path + query)).status, 403);
      assert.equal((await uc.call("auth/me")).body.advisorLinked, false);
      assert.deepEqual(
        await db.metaEffectivenessDay.findMany({
          where: { row: { alias: { tableId: { in: [table.id, table2.id] } } } },
        }),
        before,
      );
    },
  );
  if (process.env.PERFORMANCE_FIXTURE_OUTPUT)
    await writeFile(
      process.env.PERFORMANCE_FIXTURE_OUTPUT,
      JSON.stringify(
        { owner, user, other, ana, don, table, table2, today, yesterday },
        (key, value) => (key === "passwordHash" ? undefined : value),
      ),
    );
  await db.$disconnect();
});
