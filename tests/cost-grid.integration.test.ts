import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { fixedCostRoutes } from "../lib/fixed-costs";
test("Spreadsheet writes and income totals are exact, atomic, replay-safe and isolated by period/currency/rights", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
      await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
    ),
    actor = await db.user.findUniqueOrThrow({ where: { id: q.users[0].id } });
  const call = async (path: string, method = "GET", body?: unknown) => {
    const r = await fixedCostRoutes(
      new NextRequest("http://localhost:3078/api/fixed-costs" + path, {
        method,
      }),
      ("fixed-costs" + path.split("?")[0]).split("/"),
      actor,
      async () => body,
    );
    return r.json();
  };
  const sheet = await call("/sheets", "POST", {
    name: "Hoja grid " + randomUUID(),
  });
  const category = "Categoría " + randomUUID();
  await call("/categories", "POST", { name: category });
  assert.equal(
    (await call("/categories", "POST", { name: category.toLowerCase() })).name,
    category,
  );
  const entry = {
    sheetId: sheet.id,
    date: "2027-02-28",
    kind: "FIXED",
    entryType: "EXPENSE",
    concept: "Personal Perú",
    category,
    country: "Perú",
    person: "Persona QA",
    location: "Cieneguilla",
    quantity: 1,
    unitPrice: "30.10",
    amount: "999",
    currency: "PEN",
    paid: false,
    notes: "",
  };
  const bulk = {
    rows: [
      { requestId: randomUUID(), entry },
      {
        requestId: randomUUID(),
        entry: {
          ...entry,
          entryType: "INCOME",
          concept: "Diplomado QA",
          quantity: 3,
          unitPrice: "39.90",
          paid: true,
        },
      },
      {
        requestId: randomUUID(),
        entry: {
          ...entry,
          entryType: "INCOME",
          concept: "Producto USD",
          quantity: 2,
          unitPrice: "10.10",
          currency: "USD",
          paid: true,
        },
      },
    ],
  };
  const saved = await call("/grid", "POST", bulk);
  assert.equal(saved.rows[0].amount, "30.1");
  assert.equal(saved.rows[1].amount, "119.7");
  assert.equal(saved.rows[2].amount, "20.2");
  assert.equal((await call("/grid", "POST", bulk)).rows.length, 3);
  assert.equal(
    await db.fixedCostEntry.count({ where: { sheetId: sheet.id } }),
    3,
  );
  const view = await call(
    "?from=2027-02-01&to=2027-02-28&entryType=INCOME&sheet=" + sheet.id,
  );
  assert.equal(view.total, 2);
  assert.equal(
    view.groups.find(
      (g: any) => g.currency === "PEN" && g.entryType === "INCOME",
    )._sum.amount,
    "119.7",
  );
  assert.equal(
    view.groups.find(
      (g: any) => g.currency === "PEN" && g.entryType === "EXPENSE",
    )._sum.amount,
    "30.1",
  );
  assert.equal(
    (
      await call(
        "?from=2027-01-01&to=2027-01-31&entryType=INCOME&sheet=" + sheet.id,
      )
    ).total,
    0,
  );
  const update = {
    rows: [
      { id: saved.rows[0].id, version: 1, entry: { ...entry, paid: true } },
      {
        id: saved.rows[1].id,
        version: 1,
        entry: { ...bulk.rows[1].entry, quantity: 4 },
      },
    ],
  };
  await call("/grid", "POST", update);
  await call("/grid", "POST", update);
  assert.equal(
    (
      await db.fixedCostEntry.findUniqueOrThrow({
        where: { id: saved.rows[1].id },
      })
    ).amount.toString(),
    "159.6",
  );
  await assert.rejects(
    () =>
      call("/grid", "POST", {
        rows: [
          {
            id: saved.rows[0].id,
            version: 2,
            entry: { ...entry, unitPrice: "99.90", paid: true },
          },
          {
            id: saved.rows[1].id,
            version: 1,
            entry: { ...bulk.rows[1].entry, quantity: 5 },
          },
        ],
      }),
    /no se guardó ninguna/,
  );
  assert.equal(
    (
      await db.fixedCostEntry.findUniqueOrThrow({
        where: { id: saved.rows[0].id },
      })
    ).amount.toString(),
    "30.1",
  );
  await call("/carry", "POST", { month: "2027-03" });
  const carried = await db.fixedCostEntry.findMany({
    where: { sheetId: sheet.id, month: "2027-03" },
  });
  assert.equal(carried.length, 1);
  assert.equal(carried[0].entryType, "EXPENSE");
  assert.equal(carried[0].paid, false);
  assert.equal(carried[0].date, "2027-03-28");
  const observer = await db.user.findUniqueOrThrow({
    where: { id: q.users[2].id },
  });
  await db.fixedCostGrant.upsert({
    where: { userId: observer.id },
    create: { userId: observer.id, permission: "VIEW", createdById: actor.id },
    update: { permission: "VIEW" },
  });
  await assert.rejects(
    () =>
      fixedCostRoutes(
        new NextRequest("http://localhost:3078/api/fixed-costs/grid", {
          method: "POST",
        }),
        ["fixed-costs", "grid"],
        observer,
        async () => bulk,
      ),
    /No tienes acceso/,
  );
  assert(
    (await call("?from=2027-01-01&to=2027-01-31")).categories.includes(
      category,
    ),
  );
  await assert.rejects(
    () => call("?from=2027-12-31&to=2027-01-01"),
    /período válido/,
  );
  await assert.rejects(
    () => call("?from=2026-01-01&to=2027-12-31"),
    /366 días/,
  );
  await db.$disconnect();
  console.log(
    "PASS income qty×price, exact decimals/currencies, atomic bulk CAS, lost reply replay, category reuse, recurring expenses only and read-only grants",
  );
});
