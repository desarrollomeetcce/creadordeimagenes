import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
    const user = await db.user.create({
      data: {
        email: "seller-" + suffix + "@example.test",
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
      await createPendingSale(actor, sale);
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
      await Promise.all([
        confirmPendingSale(actor, { id: sale.id }),
        confirmPendingSale(actor, { id: sale.id }),
      ]);
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
      await db.$disconnect();
    }
  },
);
