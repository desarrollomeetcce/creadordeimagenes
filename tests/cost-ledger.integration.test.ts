import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { fixedCostRoutes } from "../lib/fixed-costs";
test("Ledger canonical catalogs, cross-sheet totals, bonus, CAS and current permissions", async () => {
  assert(/studio_columns_qa_\d+/.test(process.env.DATABASE_URL ?? ""));
  const q = JSON.parse(
    await readFile("/workspace/work/studio-columns-fixture.json", "utf8"),
  );
  const owner = await db.user.findUniqueOrThrow({
    where: { id: q.users[0].id },
  });
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    actor = owner,
  ) => {
    const res = await fixedCostRoutes(
      new NextRequest("http://localhost:3078/api/fixed-costs" + path, {
        method,
      }),
      ("fixed-costs" + path.split("?")[0]).split("/"),
      actor,
      async () => body,
    );
    return res.json();
  };
  const suffix = randomUUID(),
    name = "Tecnología " + suffix;
  await call("/options", "POST", {
    kind: "PROJECT",
    names: [name, "TECNOLOGIA " + suffix],
  });
  await call("/options", "POST", {
    kind: "UNIT",
    names: ["Asesores", "Servicios"],
  });
  assert.equal(
    await db.fixedCostOption.count({
      where: { kind: "PROJECT", name: { contains: suffix } },
    }),
    1,
  );
  const s1 = await call("/sheets", "POST", { name: "Asesores " + suffix });
  const s2 = await call("/sheets", "POST", { name: "Servicios " + suffix });
  const entry = {
    sheetId: s1.id,
    date: "2027-03-01",
    kind: "FIXED",
    entryType: "EXPENSE",
    concept: "Asesor QA",
    project: "tecnologia " + suffix,
    unit: "ASESORES",
    country: "Perú",
    unitPrice: "10.10",
    amount: "999",
    quantity: 1,
    bonus: "0.20",
    currency: "USD",
    targetCurrency: "PEN",
    conversionRate: "3.75",
    paid: false,
  };
  const input = {
    rows: [
      { requestId: randomUUID(), entry },
      {
        requestId: randomUUID(),
        entry: {
          ...entry,
          sheetId: s2.id,
          unit: "Servicios",
          unitPrice: "20.10",
          bonus: "1.00",
        },
      },
    ],
  };
  const created = await call("/grid", "POST", input);
  assert.equal(created.rows.length, 2);
  assert.equal(created.rows[0].project, name);
  assert.equal(created.rows[0].unit, "Asesores");
  assert.equal(created.rows[0].amount, "10.1");
  assert.equal(created.rows[0].bonus, "0.2");
  await call("/grid", "POST", input);
  assert.equal(await db.fixedCostEntry.count({ where: { project: name } }), 2);
  const params =
    "?from=2027-03-01&to=2027-03-01&project=" + encodeURIComponent(name);
  const all = await call(params);
  assert.equal(all.total, 2);
  assert.equal(
    all.groups.find((g: any) => g.currency === "USD")._sum.amount,
    "30.2",
  );
  assert.equal(
    all.groups.find((g: any) => g.currency === "USD")._sum.bonus,
    "1.2",
  );
  assert.equal((await call(params + "&unit=Asesores")).total, 1);
  assert.equal((await call(params + "&sheet=" + s2.id)).total, 1);
  assert.equal((await call(params + "&country=Colombia")).total, 0);
  await assert.rejects(
    call("/grid", "POST", {
      rows: [
        {
          requestId: randomUUID(),
          entry: { ...entry, project: "Not in catalog" },
        },
      ],
    }),
    /Registra primero/,
  );
  const row = created.rows[0];
  await call("/grid", "POST", {
    rows: [
      {
        id: row.id,
        version: row.version,
        entry: { ...entry, concept: "Updated" },
      },
    ],
  });
  await assert.rejects(
    call("/grid", "POST", {
      rows: [
        {
          id: row.id,
          version: row.version,
          entry: { ...entry, concept: "Stale" },
        },
      ],
    }),
    /cambió/,
  );
  const observer = await db.user.findUniqueOrThrow({
    where: { id: q.users[2].id },
  });
  await db.fixedCostGrant.upsert({
    where: { userId: observer.id },
    create: { userId: observer.id, permission: "VIEW", createdById: owner.id },
    update: { permission: "VIEW" },
  });
  await assert.rejects(
    call(
      "/options",
      "POST",
      { kind: "PROJECT", names: ["No permission"] },
      observer,
    ),
    /No tienes acceso/,
  );
  await call("/sheets/initialize", "POST", {});
  const sheets = (await call(params)).sheets.map((s: any) => s.name);
  for (const n of ["Asesores", "Servicios", "Tecnología", "Impuestos"])
    assert(sheets.includes(n));
  console.log(
    "PASS catalogs canonical and bounded; cross-sheet filters/totals without duplication; exact bonus; version fences and Observer read-only",
  );
  await db.$disconnect();
});
