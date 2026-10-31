import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "../lib/db";
import { metaRoutes } from "../lib/meta-ads/routes";
import { advisorSheet, assignmentReview } from "../lib/meta-ads/advisors";
import { effectiveness } from "../lib/meta-ads/effectiveness";
import { limaDay } from "../lib/meta-ads/advisor-attribution";
test("Apoyo temporal, supervisión y titular definitivo: ventas independientes, base única, límites e histórico Meta", async (t) => {
  assert(
    process.env.DATABASE_URL?.includes("library_organization_test") &&
      process.env.DATABASE_URL.includes("/workspace/work/pgdata"),
  );
  const tag = randomUUID(),
    today = limaDay(),
    past = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10),
    users = await Promise.all(
      ["OWNER", "USER", "OBSERVER"].map((role: any, i) =>
        db.user.create({
          data: {
            name: "Soporte QA",
            email: `support-${i}-${tag}@example.test`,
            role,
            status: "APPROVED",
            passwordHash: "synthetic",
          },
        }),
      ),
    ),
    [owner, editor, viewer] = users;
  const list = await db.metaEffectivenessSheet.create({
      data: { kind: "ADVISORS", name: "Apoyo " + tag },
    }),
    people = await Promise.all(
      ["Ana", "Francesca"].map((name) =>
        db.metaAdvisor.create({
          data: { sheetId: list.id, name: name + " " + tag },
        }),
      ),
    ),
    [ana, francesca] = people,
    table = await db.metaAliasTable.create({
      data: {
        name: "Apoyo " + tag,
        defaultCountry: "PE",
        defaultCurrency: "PEN",
      },
    }),
    alias = await db.metaAlias.create({
      data: { tableId: table.id, name: "Monitoreo " + tag },
    }),
    other = await db.metaAlias.create({
      data: { tableId: table.id, name: "Otra fila " + tag },
    });
  const row = await db.metaEffectivenessRow.create({
    data: {
      aliasId: alias.id,
      country: "PE",
      currency: "",
      displayCurrency: "PEN",
      advisorId: ana.id,
      days: {
        create: [
          {
            day: past,
            sales: 6,
            salesOverridden: true,
            annotations: { budget: { value: 20, currency: "PEN" } },
          },
          { day: today, sales: 6, salesOverridden: true },
        ],
      },
    },
  });
  const connection = await db.metaConnection.create({
      data: {
        ownerId: owner.id,
        name: "QA",
        transport: "API",
        verifiedAt: new Date(),
      },
    }),
    account = await db.metaAdAccount.create({
      data: {
        id: Date.now() + "405",
        name: "QA",
        connectionId: connection.id,
        currency: "PEN",
        timezone: "America/Lima",
      },
    }),
    campaign = await db.metaAdObject.create({
      data: {
        id: account.id + "01",
        accountId: account.id,
        level: "campaign",
        name: "Monitoreo",
        aliasId: alias.id,
        aliasCountry: "PE",
        advisorId: ana.id,
      },
    });
  await db.metaAdDaily.createMany({
    data: [past, today].map((day) => ({
      accountId: account.id,
      objectId: campaign.id,
      day,
      scope: "7d_click,1d_view|impression",
      spend: 30,
      actions: { "onsite_conversion.messaging_conversation_started_7d": 300 },
    })),
  });
  await db.metaAdvisorAssignment.create({
    data: {
      aliasId: alias.id,
      country: "PE",
      advisorId: ana.id,
      effectiveAt: new Date(today + "T00:00:00-05:00"),
      mode: "DAY",
    },
  });
  for (const day of [past, today])
    await db.metaAdvisorSalesApproval.create({
      data: {
        rowId: row.id,
        day,
        actorId: owner.id,
        salesTotal: 6,
        allocations: [
          { advisorId: ana.id, sales: 2 },
          { advisorId: francesca.id, sales: 4 },
        ],
        basis: { events: [], activeAdvisorId: ana.id },
      },
    });
  const call = async (actor: any, path: string, method: string, body: any) => {
    const r = await metaRoutes(
      new NextRequest("http://localhost/api/meta-ads/financial/" + path, {
        method,
        headers: { "x-effectiveness-document": "ALL" },
      }),
      ["meta-ads", "financial", ...path.split("/")],
      actor,
      async () => body,
    );
    assert(r);
    return r.json();
  };
  const latest = () =>
    db.metaEffectivenessRow.findUniqueOrThrow({ where: { id: row.id } });
  const supports: string[] = [];
  try {
    await db.effectivenessGrant.createMany({
      data: [
        {
          userId: editor.id,
          scope: "ALL",
          permission: "EDIT",
          grantedById: owner.id,
        },
        {
          userId: viewer.id,
          scope: "ALL",
          permission: "VIEW",
          grantedById: owner.id,
        },
      ],
    });
    await t.test(
      "Supervisión comercial permite ventas sin elevar cuenta ni cambiar Meta Ads",
      async () => {
        await call(editor, "advisors", "PATCH", {
          id: francesca.id,
          name: francesca.name,
          revision: 0,
          commercialRole: "SUPERVISOR",
        });
        assert.equal(
          (
            await db.metaAdvisor.findUniqueOrThrow({
              where: { id: francesca.id },
            })
          ).commercialRole,
          "SUPERVISOR",
        );
        assert.equal(
          (await db.user.findUniqueOrThrow({ where: { id: editor.id } })).role,
          "USER",
        );
      },
    );
    await t.test(
      "Apoyo de hoy conserva titular, B/G y todos los repartos manuales",
      async () => {
        const result = await call(
          editor,
          "effectiveness/advisor-support",
          "POST",
          {
            aliasId: alias.id,
            country: "PE",
            advisorId: francesca.id,
            revision: (await latest()).revision,
            since: today,
            until: today,
          },
        );
        supports.push(result.supportId);
        assert.equal((await latest()).advisorId, ana.id);
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId: alias.id },
          }),
          1,
        );
        const data = await advisorSheet(owner, table.id, today, today, {
            advisorListId: list.id,
            country: "PE",
          }),
          a = data.rows.find((p) => p.id === ana.id)!.days[today],
          f = data.rows.find((p) => p.id === francesca.id)!.days[today];
        assert.equal(a.sales, 2);
        assert.equal(f.sales, 4);
        assert.equal(a.financial?.base, 300);
        assert.equal(a.financial?.currencies[0].spend, 30);
        assert.equal(f.financial?.base, null);
        assert.equal(f.financial?.currencies[0].spend, null);
        assert.equal(
          data.rows.reduce(
            (n, p) => n + (p.days[today].financial?.base ?? 0),
            0,
          ),
          300,
        );
        const review = await assignmentReview(owner, alias.id, "PE", today);
        assert.equal(review.supports[0].commercialRole, "SUPERVISOR");
      },
    );
    await t.test(
      "VIEW, revisión antigua, fechas inválidas y apoyo repetido no escriben",
      async () => {
        const b = {
          aliasId: alias.id,
          country: "PE",
          advisorId: francesca.id,
          revision: (await latest()).revision,
          since: today,
          until: today,
        };
        await assert.rejects(
          call(viewer, "effectiveness/advisor-support", "POST", b),
          (e: any) => e.status === 403,
        );
        await assert.rejects(
          call(editor, "effectiveness/advisor-support", "POST", {
            ...b,
            revision: 0,
          }),
          (e: any) => e.status === 409,
        );
        await assert.rejects(
          call(editor, "effectiveness/advisor-support", "POST", b),
          (e: any) => e.status === 409,
        );
        await assert.rejects(
          call(editor, "effectiveness/advisor-support", "POST", {
            ...b,
            since: today,
            until: past,
          }),
        );
        assert.equal(
          await db.metaAdvisorSupport.count({ where: { aliasId: alias.id } }),
          1,
        );
      },
    );
    await t.test(
      "Finalizar conserva historial; lote incompleto revierte todos los apoyos",
      async () => {
        const support = await db.metaAdvisorSupport.findUniqueOrThrow({
          where: { id: supports[0] },
        });
        await call(editor, "effectiveness/advisor-support", "PATCH", {
          aliasId: alias.id,
          country: "PE",
          supportId: support.id,
          revision: support.revision,
        });
        assert(
          (
            await db.metaAdvisorSupport.findUniqueOrThrow({
              where: { id: support.id },
            })
          ).cancelledAt,
        );
        assert.equal((await latest()).advisorId, ana.id);
        await assert.rejects(
          call(editor, "effectiveness/advisors/batch", "PATCH", {
            tableId: table.id,
            advisorId: francesca.id,
            assignmentKind: "TEMPORARY",
            day: today,
            until: today,
            mode: "DAY",
            targets: [
              {
                aliasId: alias.id,
                country: "PE",
                revision: (await latest()).revision,
              },
              { aliasId: other.id, country: "PE", revision: 0 },
            ],
          }),
        );
        assert.equal(
          await db.metaAdvisorSupport.count({ where: { aliasId: alias.id } }),
          1,
        );
      },
    );
    await t.test(
      "El apoyo vence por fecha sin trasladar base ni borrar el registro",
      async () => {
        const expired = await call(
          owner,
          "effectiveness/advisor-support",
          "POST",
          {
            aliasId: alias.id,
            country: "PE",
            advisorId: francesca.id,
            revision: (await latest()).revision,
            since: past,
            until: past,
          },
        );
        const sheet = await effectiveness(owner, table.id, today, today);
        assert(
          !sheet.rows
            .find((r) => r.aliasId === alias.id)
            ?.supports?.some((s) => s.id === expired.supportId),
        );
        assert.equal(
          (
            await db.metaAdvisorSupport.findUniqueOrThrow({
              where: { id: expired.supportId },
            })
          ).cancelledAt,
          null,
        );
        assert.equal((await latest()).advisorId, ana.id);
      },
    );
    await t.test(
      "Inicio Meta editable no altera ventas ni fechas de titular",
      async () => {
        await call(editor, "effectiveness/advisor", "PATCH", {
          aliasId: alias.id,
          country: "PE",
          advisorId: ana.id,
          revision: (await latest()).revision,
          metaHistoryMode: "ASSIGNMENT",
        });
        let data = await advisorSheet(owner, table.id, past, past, {
          advisorId: ana.id,
          country: "PE",
        });
        assert.equal(data.rows[0].days[past].financial?.base, null);
        assert.equal(data.rows[0].days[past].sales, 2);
        await call(editor, "effectiveness/advisor", "PATCH", {
          aliasId: alias.id,
          country: "PE",
          advisorId: ana.id,
          revision: (await latest()).revision,
          metaHistoryMode: "CUSTOM",
          metaHistorySince: past,
        });
        data = await advisorSheet(owner, table.id, past, past, {
          advisorId: ana.id,
          country: "PE",
        });
        assert.equal(data.rows[0].days[past].financial?.base, 300);
        assert.equal(
          await db.metaAdvisorAssignment.count({
            where: { aliasId: alias.id },
          }),
          1,
        );
      },
    );
    await t.test(
      "Definitivo cambia titular, cierra apoyo activo y mantiene Meta Ads y ventas",
      async () => {
        const r = await call(editor, "effectiveness/advisor-support", "POST", {
          aliasId: alias.id,
          country: "PE",
          advisorId: francesca.id,
          revision: (await latest()).revision,
          since: today,
          until: today,
        });
        supports.push(r.supportId);
        await call(editor, "effectiveness/advisor", "PATCH", {
          aliasId: alias.id,
          country: "PE",
          advisorId: francesca.id,
          revision: (await latest()).revision,
          day: today,
          mode: "DAY",
        });
        assert.equal((await latest()).advisorId, francesca.id);
        assert(
          (
            await db.metaAdvisorSupport.findUniqueOrThrow({
              where: { id: r.supportId },
            })
          ).cancelledAt,
        );
        const oldAna = await advisorSheet(owner, table.id, past, past, {
          advisorId: ana.id,
          country: "PE",
        });
        const oldFrancesca = await advisorSheet(owner, table.id, past, past, {
          advisorId: francesca.id,
          country: "PE",
        });
        assert.equal(oldAna.rows[0].days[past].financial?.base, 300);
        assert.equal(oldFrancesca.rows[0].days[past].financial?.base, null);
        assert.equal(
          (
            await db.metaAdObject.findUniqueOrThrow({
              where: { id: campaign.id },
            })
          ).advisorId,
          ana.id,
        );
        assert.equal(
          await db.metaAdDaily.count({ where: { accountId: account.id } }),
          2,
        );
        const approvals = await db.metaAdvisorSalesApproval.findMany({
          where: { rowId: row.id },
        });
        assert(
          approvals.every((a) =>
            JSON.stringify(a.allocations).includes('"sales":4'),
          ),
        );
      },
    );
  } finally {
    await db.metaAdvisorSupport.deleteMany({
      where: { aliasId: { in: [alias.id, other.id] } },
    });
    await db.metaAdAccount.delete({ where: { id: account.id } });
    await db.metaConnection.delete({ where: { id: connection.id } });
    await db.metaEffectivenessRow.deleteMany({
      where: { aliasId: { in: [alias.id, other.id] } },
    });
    await db.metaAlias.deleteMany({
      where: { id: { in: [alias.id, other.id] } },
    });
    await db.metaAliasTable.delete({ where: { id: table.id } });
    await db.metaAdvisor.deleteMany({
      where: { id: { in: people.map((p) => p.id) } },
    });
    await db.metaEffectivenessSheet.delete({ where: { id: list.id } });
    await db.effectivenessGrant.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: users.map((u) => u.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    await db.$disconnect();
  }
});
