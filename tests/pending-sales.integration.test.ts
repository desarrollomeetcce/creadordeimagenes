import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { POST as messagingSales } from "../app/api/pulpo/pending-sales/route";
import { NextRequest } from "next/server";
import { metaRoutes } from "../lib/meta-ads/routes";
import { db } from "../lib/db";
import {
  confirmPendingSale,
  createPendingSale,
  pendingSales,
} from "../lib/meta-ads/pending-sales";
import {
  advisorPeriodSignals,
  addAdvisorPeriodNote,
  periodSignal,
} from "../lib/meta-ads/advisor-period-signals";
import { localDay, shiftDay } from "../lib/meta-ads/analytics";

test("critical signals require sufficient confirmed observation", () => {
  const zero = { sales: 0, partial: false, na: false };
  assert.equal(
    periodSignal([zero, zero, { ...zero, partial: true }]),
    "insufficient",
  );
  assert.equal(periodSignal([zero, zero, zero]), "critical");
  assert.equal(periodSignal([{ ...zero, sales: 1 }]), "active");
});

test(
  "pending payment creates one attributed sale and personal reports expose signals only",
  {
    skip: process.env.RUN_PENDING_SALES_QA !== "1",
  },
  async () => {
    assert.match(
      process.env.DATABASE_URL ?? "",
      /127\.0\.0\.1:5432\/pulpo_pending_sales_qa\b/,
    );
    const suffix = randomUUID();
    const previousKey = process.env.PULPO_GENERATOR_SSO_KEY;
    const signingKey = "62".repeat(32);
    process.env.PULPO_GENERATOR_SSO_KEY = signingKey;
    const request = (action: string, data: unknown, email: string, sub = suffix) => {
      const token = Buffer.from(JSON.stringify({ sub, email, action, data, exp: Math.floor(Date.now() / 1000) + 20 })).toString("base64url");
      const signature = createHmac("sha256", Buffer.from(signingKey, "hex"))
        .update("pulpo-pending-sales:v1:" + token).digest("base64url");
      return messagingSales(new Request("https://generator.agenciamagneto.org/api/pulpo/pending-sales", {
        method: "POST", headers: { Authorization: `Bearer ${token}.${signature}` },
      }));
    };
    const user = await db.user.create({
      data: {
        email: "seller-" + suffix + "@example.test",
        pulpoUserId: suffix,
        name: "Owner QA",
        role: "OWNER",
        status: "APPROVED",
        passwordHash: "fixture",
      },
    });
    const portalUser = await db.user.create({
      data: {
        email: "advisor-" + suffix + "@example.test",
        name: "Asesor QA",
        role: "ADVISOR",
        status: "APPROVED",
        passwordHash: "fixture",
      },
    });
    const sheet = await db.metaEffectivenessSheet.create({
      data: { kind: "ADVISORS", name: "Asesores " + suffix },
    });
    const inventory = await db.metaEffectivenessSheet.create({
      data: { kind: "INVENTORY", name: "Inventario " + suffix },
    });
    const advisor = await db.metaAdvisor.create({
      data: { name: "Ana", sheetId: sheet.id },
    });
    await db.metaAdvisorPortal.create({
      data: { advisorId: advisor.id, userId: portalUser.id },
    });
    const table = await db.metaAliasTable.create({
      data: { name: "Uruguay " + suffix, defaultCountry: "UY" },
    });
    const alias = await db.metaAlias.create({
      data: {
        name: "Diplomado " + suffix,
        tableId: table.id,
        inventorySheetId: inventory.id,
      },
    });
    const row = await db.metaEffectivenessRow.create({
      data: {
        aliasId: alias.id,
        country: "UY",
        currency: "",
        displayCurrency: "UYU",
        advisorId: advisor.id,
      },
    });
    const day = shiftDay(localDay("America/Lima"), -1);
    await db.metaEffectivenessDay.create({
      data: { rowId: row.id, day, sales: 3, salesOverridden: true },
    });
    const sale = {
      id: randomUUID(),
      tableId: table.id,
      aliasId: alias.id,
      advisorId: advisor.id,
      day,
      country: "UY",
      customer: "María Castro",
    };
    const actor = { id: user.id, role: user.role };
    const personal = { id: portalUser.id, role: portalUser.role };
    try {
      const denied = await request("create", sale, user.email, randomUUID());
      assert.equal(denied.status, 403);
      const created = await request("create", sale, user.email);
      assert.equal(created.status, 201, await created.text());
      await createPendingSale(actor, sale);
      assert.equal(
        (
          await db.metaEffectivenessDay.findUniqueOrThrow({
            where: { rowId_day: { rowId: row.id, day } },
          })
        ).sales,
        3,
      );
      assert.equal(
        (
          await pendingSales(
            actor,
            new URLSearchParams({ month: day.slice(0, 7) }),
          )
        ).rows.filter((r) => r.id === sale.id).length,
        1,
      );
      await assert.rejects(
        confirmPendingSale(personal, { id: sale.id }),
        /compartid|permiso|acceso/i,
      );
      const [confirmed] = await Promise.all([
        request("confirm", { id: sale.id }, user.email),
        confirmPendingSale(actor, { id: sale.id }),
      ]);
      assert.equal(confirmed.status, 200, await confirmed.text());
      assert.equal(
        (
          await db.metaEffectivenessDay.findUniqueOrThrow({
            where: { rowId_day: { rowId: row.id, day } },
          })
        ).sales,
        4,
      );
      const approved = await db.metaAdvisorSalesApproval.findUniqueOrThrow({
        where: { rowId_day: { rowId: row.id, day } },
      });
      assert.deepEqual(approved.allocations, [
        { advisorId: advisor.id, sales: 4 },
      ]);
      assert.equal(
        (
          await pendingSales(
            actor,
            new URLSearchParams({ month: day.slice(0, 7) }),
          )
        ).rows.some((r) => r.id === sale.id),
        false,
      );
      await addAdvisorPeriodNote(personal, {
        id: randomUUID(),
        since: day,
        until: day,
        day,
        aliasId: alias.id,
        tableId: table.id,
        country: "UY",
        body: "Piden opciones de horario.",
      });
      const result = await advisorPeriodSignals(personal, {
        since: day,
        until: day,
      });
      const item = result.items.find((item) => item.aliasId === alias.id);
      assert.equal(item?.signal, "active");
      assert.equal(item?.notes[0]?.body, "Piden opciones de horario.");
      assert.equal(Object.hasOwn(item!, "days"), false);
      assert.equal(item?.sales, null);
      await assert.rejects(
        metaRoutes(
          new NextRequest("http://localhost/api/meta-ads/my-performance"),
          ["meta-ads", "my-performance"],
          personal,
          async () => null,
        ),
        /Solo OWNER o Supervisor/,
      );
      assert.equal(
        (
          await advisorPeriodSignals(actor, {
            since: day,
            until: day,
            advisorId: advisor.id,
          })
        ).items.find((value) => value.aliasId === alias.id)?.notes[0]?.body,
        "Piden opciones de horario.",
      );
    } finally {
      if (previousKey === undefined) delete process.env.PULPO_GENERATOR_SSO_KEY;
      else process.env.PULPO_GENERATOR_SSO_KEY = previousKey;
      await db.$disconnect();
    }
  },
);
