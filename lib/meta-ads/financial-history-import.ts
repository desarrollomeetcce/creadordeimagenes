import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { demand } from "../errors";
import { ownerOnly } from "../auth";
import { recordActivity } from "../activity";
import { historyName } from "./history-matching";
import { categoryKey } from "./category-paste";
import { countryName, isCountryCode } from "./countries";
import { assertUnlinkedColumns } from "./column-link-policy";
const day = z.string().date(),
  name = z.string().trim().min(1).max(150),
  country = z.string().refine(isCountryCode),
  amount = z.number().finite().min(0).max(100000000),
  sales = amount.int();
export const historyFileSchema = z
  .object({
    version: z.literal(1),
    source: z
      .object({
        url: z.string().url().max(2000),
        title: name,
        salesSince: day,
        salesUntil: day,
        marketingSince: day,
        marketingUntil: day,
        notes: z.array(z.string().max(500)).max(30),
      })
      .strict(),
    diplomas: z
      .array(
        z.object({ name, country, day, sales, administrator: name }).strict(),
      )
      .max(15000),
    advisors: z
      .array(z.object({ name, country, day, sales }).strict())
      .max(15000),
    totals: z.array(z.object({ country, day, sales }).strict()).max(5000),
    manual: z
      .array(
        z
          .object({
            country,
            day,
            metric: z.enum(["baseManual", "totalSpend"]),
            value: amount,
            currency: z.literal("PEN"),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict()
  .superRefine((v, c) => {
    for (const key of ["diplomas", "advisors", "totals"] as const)
      for (const r of v[key])
        if (r.day < v.source.salesSince || r.day > v.source.salesUntil)
          c.addIssue({
            code: "custom",
            message: "Venta fuera del período declarado.",
          });
    for (const r of v.manual) {
      if (r.day < v.source.marketingSince || r.day > v.source.marketingUntil)
        c.addIssue({
          code: "custom",
          message: "BM/GM fuera del período declarado.",
        });
      if (r.metric === "baseManual" && !Number.isInteger(r.value))
        c.addIssue({ code: "custom", message: "BM debe ser entero." });
    }
    for (const a of [
      [v.source.salesSince, v.source.salesUntil],
      [v.source.marketingSince, v.source.marketingUntil],
    ])
      if (a[0] > a[1] || (Date.parse(a[1]) - Date.parse(a[0])) / 86400000 > 366)
        c.addIssue({
          code: "custom",
          message: "Período inválido; máximo un año por carga.",
        });
    const unique = (rows: unknown[], key: (r: any) => string) => {
      if (new Set(rows.map(key)).size !== rows.length)
        c.addIssue({
          code: "custom",
          message: "Hay filas repetidas sin consolidar.",
        });
    };
    unique(v.diplomas, (r) =>
      JSON.stringify([categoryKey(r.name), r.country, r.day]),
    );
    unique(v.advisors, (r) =>
      JSON.stringify([categoryKey(r.name), r.country, r.day]),
    );
    unique(v.totals, (r) => JSON.stringify([r.country, r.day]));
    unique(v.manual, (r) => JSON.stringify([r.country, r.day, r.metric]));
    const sums = new Map<string, number>();
    for (const r of v.advisors) {
      const k = r.country + "|" + r.day;
      sums.set(k, (sums.get(k) ?? 0) + r.sales);
    }
    for (const r of v.totals)
      if ((sums.get(r.country + "|" + r.day) ?? 0) !== r.sales)
        c.addIssue({
          code: "custom",
          message:
            "Total de país no coincide con los totales de asesores del archivo.",
        });
  });
export type HistoryFile = z.infer<typeof historyFileSchema>;
const choicesSchema = z
  .object({
    inventoryListId: name,
    advisorListId: name,
    totalsListId: name,
    tables: z
      .array(
        z.object({ country, tableId: z.string().max(100).nullable() }).strict(),
      )
      .min(1)
      .max(100),
    aliases: z.record(z.string(), z.string()).default({}),
    people: z.record(z.string(), z.string()).default({}),
    catalog: z.record(z.string(), z.string()).default({}),
  })
  .strict();
const inputSchema = z
  .object({
    file: historyFileSchema,
    choices: choicesSchema,
    token: z.string().optional(),
    replaceConflicts: z.boolean().default(false),
    repairMissing: z.boolean().default(false),
  })
  .strict();
type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
const requestDigest = (b: z.infer<typeof inputSchema>) =>
  hash({
    file: b.file,
    choices: {
      ...Object.fromEntries(
        Object.entries(b.choices).filter(
          ([k, v]) => k !== "catalog" || Object.keys(v as object).length > 0,
        ),
      ),
      tables: [...b.choices.tables].sort((a, b) =>
        a.country.localeCompare(b.country),
      ),
    },
  });
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const json = (x: unknown) =>
  JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;
async function authorized(u: Actor, tx: Tx | typeof db = db) {
  ownerOnly(u);
  demand(
    await tx.user.findFirst({
      where: { id: u.id, role: "OWNER", status: "APPROVED", archivedAt: null },
    }),
    "Acceso OWNER vigente requerido.",
    403,
  );
}
export async function preparedHistoryImport(u: Actor, raw: unknown) {
  await authorized(u);
  const { key } = z
    .object({ key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .strict()
    .parse(raw);
  const [{ preparedHistory }, { unsealHistory }] = await Promise.all([
    import("./prepared-history.sealed"),
    import("./sealed-history"),
  ]);
  return historyFileSchema.parse(unsealHistory(preparedHistory, key));
}
export async function historyImportOptions(u: Actor) {
  await authorized(u);
  const [tables, sheets, aliases] = await Promise.all([
    db.metaAliasTable.findMany({
      select: {
        id: true,
        name: true,
        defaultCountry: true,
        defaultCurrency: true,
      },
      orderBy: { name: "asc" },
    }),
    db.metaEffectivenessSheet.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, kind: true },
      orderBy: { createdAt: "asc" },
    }),
    db.metaAlias.findMany({
      select: { id: true, name: true, tableId: true, inventorySheetId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const people = await db.metaAdvisor.findMany({
    where: { sheet: { archivedAt: null } },
    select: { id: true, name: true, sheetId: true },
    orderBy: { name: "asc" },
  });
  const items = await db.metaInventoryItem.findMany({
    where: { sheet: { archivedAt: null } },
    select: { id: true, name: true, sheetId: true },
    orderBy: { name: "asc" },
  });
  return { tables, sheets, aliases, people, items };
}
async function plan(tx: Tx, u: Actor, raw: unknown) {
  await authorized(u, tx);
  const b = inputSchema.parse(raw),
    f = b.file,
    choices = b.choices;
  const countries = [
    ...new Set(
      [...f.diplomas, ...f.advisors, ...f.totals, ...f.manual].map(
        (r) => r.country,
      ),
    ),
  ].sort();
  demand(countries.length > 0, "El archivo no contiene datos.");
  demand(
    new Set(choices.tables.map((r) => r.country)).size === countries.length &&
      countries.every((c) => choices.tables.some((r) => r.country === c)),
    "Revisa la hoja de destino de cada país.",
  );
  const [sheets, tables, aliases, people, items] = await Promise.all([
    tx.metaEffectivenessSheet.findMany({
      where: {
        id: {
          in: [
            choices.inventoryListId,
            choices.advisorListId,
            choices.totalsListId,
          ],
        },
        archivedAt: null,
      },
    }),
    tx.metaAliasTable.findMany({ orderBy: { id: "asc" } }),
    tx.metaAlias.findMany({
      where: {
        tableId: {
          in: choices.tables.flatMap((r) => (r.tableId ? [r.tableId] : [])),
        },
      },
      orderBy: { id: "asc" },
    }),
    tx.metaAdvisor.findMany({
      where: { sheetId: choices.advisorListId },
      orderBy: { id: "asc" },
    }),
    tx.metaInventoryItem.findMany({
      where: { sheetId: choices.inventoryListId },
      orderBy: { id: "asc" },
    }),
  ]);
  for (const [id, kind] of [
    [choices.inventoryListId, "INVENTORY"],
    [choices.advisorListId, "ADVISORS"],
    [choices.totalsListId, "TOTALS"],
  ])
    demand(
      sheets.some((s) => s.id === id && s.kind === kind),
      "Pestaña de destino no disponible.",
      409,
    );
  const target = new Map<string, string>();
  for (const c of choices.tables) {
    if (c.tableId)
      demand(
        tables.some((t) => t.id === c.tableId),
        "Hoja de país no disponible.",
        409,
      );
    else
      demand(
        !tables.some(
          (t) => categoryKey(t.name) === categoryKey(countryName(c.country)),
        ),
        "Ya existe una hoja con el nombre del país. Selecciónala como destino.",
        409,
      );
    target.set(c.country, c.tableId ?? "new:" + c.country);
  }
  const first =
      f.source.salesSince < f.source.marketingSince
        ? f.source.salesSince
        : f.source.marketingSince,
    last =
      f.source.salesUntil > f.source.marketingUntil
        ? f.source.salesUntil
        : f.source.marketingUntil,
    ids = [...target.values()].filter((id) => !id.startsWith("new:"));
  const [rows, days, approvals, historical, totals, bases] = await Promise.all([
    tx.metaEffectivenessRow.findMany({
      where: {
        aliasId: { in: aliases.map((a) => a.id) },
        legacy: false,
        currency: "",
      },
      orderBy: { id: "asc" },
    }),
    tx.metaEffectivenessDay.findMany({
      where: {
        row: { aliasId: { in: aliases.map((a) => a.id) } },
        day: { gte: first, lte: last },
      },
      orderBy: [{ rowId: "asc" }, { day: "asc" }],
    }),
    tx.metaAdvisorSalesApproval.findMany({
      where: {
        row: { aliasId: { in: aliases.map((a) => a.id) } },
        day: { gte: first, lte: last },
      },
      orderBy: [{ rowId: "asc" }, { day: "asc" }],
    }),
    tx.metaHistoricalAdvisorSale.findMany({
      where: {
        advisorId: { in: people.map((p) => p.id) },
        day: { gte: first, lte: last },
      },
      orderBy: [{ advisorId: "asc" }, { country: "asc" }, { day: "asc" }],
    }),
    tx.metaEffectivenessTotalDay.findMany({
      where: {
        sheetId: choices.totalsListId,
        tableId: { in: ids },
        day: { gte: first, lte: last },
      },
      orderBy: [
        { tableId: "asc" },
        { country: "asc" },
        { currency: "asc" },
        { day: "asc" },
      ],
    }),
    tx.metaManualBaseDay.findMany({
      where: { tableId: { in: ids }, day: { gte: first, lte: last } },
      orderBy: [{ tableId: "asc" }, { country: "asc" }, { day: "asc" }],
    }),
  ]);
  const catalogAliases = Object.values(choices.catalog).some((id) =>
    id.startsWith("alias:"),
  )
    ? await tx.metaAlias.findMany({
        where: { inventorySheetId: choices.inventoryListId },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      })
    : [];
  const catalogName = (ref: string) => {
    const found = ref.startsWith("item:")
      ? items.find((i) => i.id === ref.slice(5))
      : ref.startsWith("alias:")
        ? catalogAliases.find((a) => a.id === ref.slice(6))
        : undefined;
    demand(
      found,
      "La ficha de catálogo elegida ya no pertenece al inventario.",
      409,
    );
    return found.name;
  };
  const aliasByKey = new Map<string, (typeof aliases)[number]>(),
    conflicts: {
      label: string;
      old: unknown;
      next: unknown;
      blocked: boolean;
    }[] = [],
    usedOverrides = new Set<string>();
  const freshAliases = new Map<
    string,
    { name: string; country: string; table: string }
  >();
  for (const r of f.diplomas) {
    const k = r.country + "|" + categoryKey(r.name);
    if (aliasByKey.has(k) || freshAliases.has(k)) continue;
    const selected = choices.aliases[k],
      catalogRef = choices.catalog[k];
    demand(
      !(selected && catalogRef),
      "Elige una sola equivalencia por diplomado.",
    );
    const canonicalName = catalogRef ? catalogName(catalogRef) : r.name;
    if (catalogRef) usedOverrides.add(k);
    let a = selected
      ? aliases.find(
          (a) => a.id === selected && a.tableId === target.get(r.country),
        )
      : undefined;
    if (selected) {
      demand(
        a,
        "La equivalencia de un diplomado ya no pertenece a su hoja.",
        409,
      );
      usedOverrides.add(k);
    } else {
      const matches = aliases.filter(
        (a) =>
          a.tableId === target.get(r.country) &&
          (catalogRef
            ? historyName(a.name) === historyName(canonicalName)
            : categoryKey(a.name) === categoryKey(canonicalName)),
      );
      demand(
        matches.length < 2,
        "Hay nombres equivalentes en la hoja. Elige el diplomado de destino.",
        409,
      );
      a = matches[0];
    }
    if (a) aliasByKey.set(k, a);
    else
      freshAliases.set(k, {
        name: canonicalName,
        country: r.country,
        table: target.get(r.country)!,
      });
  }
  demand(
    [...Object.keys(choices.aliases), ...Object.keys(choices.catalog)].every(
      (k) => usedOverrides.has(k),
    ),
    "Hay equivalencias ajenas al archivo.",
  );
  const resolved = new Map<string, HistoryFile["diplomas"][number]>();
  for (const r of f.diplomas) {
    const a = aliasByKey.get(r.country + "|" + categoryKey(r.name)),
      key = JSON.stringify([
        a?.id ??
          r.country +
            "|" +
            categoryKey(
              freshAliases.get(r.country + "|" + categoryKey(r.name))!.name,
            ),
        r.country,
        r.day,
      ]);
    const prev = resolved.get(key);
    if (prev) {
      prev.sales += r.sales;
      demand(
        prev.sales <= 2147483647,
        "La suma de ventas supera la capacidad de la celda.",
      );
    } else resolved.set(key, { ...r });
  }
  const resolvedDiplomas = [...resolved.values()];
  demand(
    (await tx.metaAlias.count()) +
      new Set(
        [...freshAliases.values()].map(
          (a) => a.table + "|" + categoryKey(a.name),
        ),
      ).size <=
      1500,
    "El catálogo supera 1500 fichas; divide o vincula las equivalencias.",
  );
  const rowFor = (r: { country: string; name: string }) => {
    const a = aliasByKey.get(r.country + "|" + categoryKey(r.name));
    return a
      ? rows.find((x) => x.aliasId === a.id && x.country === r.country)
      : undefined;
  };
  for (const r of resolvedDiplomas) {
    const row = rowFor(r),
      d = row
        ? days.find((d) => d.rowId === row.id && d.day === r.day)
        : undefined;
    if (
      d &&
      ((d.annotations as any)?.sales?.value === "NA" ||
        (d.sales !== null && d.sales !== r.sales))
    ) {
      const approval = approvals.find(
          (a) => a.rowId === d.rowId && a.day === d.day,
        ),
        attributed =
          Array.isArray(approval?.allocations) &&
          (approval.allocations as any[]).some(
            (a) => a.advisorId && a.sales > 0,
          );
      conflicts.push({
        label: `${r.name} ${r.country} ${r.day} V`,
        old: d.sales,
        next: r.sales,
        blocked: !!attributed,
      });
    }
  }
  for (const r of f.manual) {
    if (r.metric === "baseManual") {
      const old = bases.find(
        (x) =>
          x.tableId === target.get(r.country) &&
          x.country === r.country &&
          x.day === r.day,
      );
      if (old) {
        const a = old.allocations as any[],
          n =
            old.state === "VALUE"
              ? a.reduce((s, x) => s + x.quantity, 0)
              : null;
        if (n !== r.value)
          conflicts.push({
            label: `BM ${r.country} ${r.day}`,
            old: n,
            next: r.value,
            blocked: a.some((a) => a.advisorId && a.quantity > 0),
          });
      }
    } else {
      const old = totals.find(
          (x) =>
            x.tableId === target.get(r.country) &&
            x.country === r.country &&
            x.currency === "PEN" &&
            x.day === r.day,
        ),
        n = (old?.values as any)?.totalSpend;
      if (n !== undefined && n !== r.value)
        conflicts.push({
          label: `GM ${r.country} ${r.day}`,
          old: n,
          next: r.value,
          blocked: false,
        });
    }
  }
  for (const r of f.totals) {
    const old = totals.find(
        (x) =>
          x.tableId === target.get(r.country) &&
          x.country === r.country &&
          x.currency === "PEN" &&
          x.day === r.day,
      ),
      n = (old?.values as any)?.historicalSales;
    if (n !== undefined && n !== r.sales)
      conflicts.push({
        label: `V total ${r.country} ${r.day}`,
        old: n,
        next: r.sales,
        blocked: false,
      });
  }
  for (const id of ids) {
    const dates = [
      ...new Set(
        f.diplomas
          .filter((r) => target.get(r.country) === id)
          .map((r) => r.day),
      ),
    ];
    if (dates.length) await assertUnlinkedColumns(tx, id, ["sales"], dates);
  }
  const memberships = await tx.metaEffectivenessSheet.findMany({
    where: { id: { in: [...new Set(aliases.map((a) => a.inventorySheetId))] } },
    select: { id: true, revision: true, config: true },
    orderBy: { id: "asc" },
  });
  const before = {
    rows,
    days,
    approvals,
    historical,
    totals,
    bases,
    memberships,
  };
  const digest = requestDigest(b),
    token = hash({
      digest,
      before,
      tables,
      aliases,
      people,
      items,
      catalogAliases,
      sheets: sheets.map((s) => ({
        id: s.id,
        revision: s.revision,
        categoryRevision: s.categoryRevision,
      })),
    });
  const personNames = [
    ...new Map(f.advisors.map((r) => [categoryKey(r.name), r.name])).values(),
  ];
  const personFor = (name: string) => {
    const id = choices.people[categoryKey(name)];
    if (id) {
      const person = people.find((p) => p.id === id);
      demand(
        person,
        "La equivalencia de un asesor no pertenece a la lista elegida.",
        409,
      );
      return person;
    }
    const found = people.filter(
      (p) => categoryKey(p.name) === categoryKey(name),
    );
    demand(
      found.length < 2,
      "Hay asesores con nombre equivalente; elige su equivalencia.",
      409,
    );
    return found[0];
  };
  demand(
    Object.keys(choices.people).every((k) =>
      personNames.some((n) => categoryKey(n) === k),
    ),
    "Hay equivalencias de personas ajenas al archivo.",
  );
  for (const name of personNames) personFor(name);
  demand(
    people.length + personNames.filter((n) => !personFor(n)).length <= 1000,
    "La lista supera 1000 asesores.",
  );
  const resolvedPeople = new Map<string, HistoryFile["advisors"][number]>();
  for (const r of f.advisors) {
    const id = personFor(r.name)?.id ?? categoryKey(r.name),
      key = JSON.stringify([id, r.country, r.day]);
    const old = resolvedPeople.get(key);
    if (old) {
      old.sales += r.sales;
      demand(
        old.sales <= 2147483647,
        "La suma personal supera la capacidad de la celda.",
      );
    } else resolvedPeople.set(key, { ...r });
  }
  const resolvedAdvisors = [...resolvedPeople.values()];
  for (const r of resolvedAdvisors) {
    const person = personFor(r.name),
      old = person
        ? historical.find(
            (h) =>
              h.advisorId === person.id &&
              h.country === r.country &&
              h.day === r.day,
          )
        : undefined;
    if (old && old.sales !== r.sales)
      conflicts.push({
        label: `${r.name} ${r.country} ${r.day} histórico`,
        old: old.sales,
        next: r.sales,
        blocked: false,
      });
  }

  const missingDiploma = (r: (typeof resolvedDiplomas)[number]) => {
    const row = rowFor(r);
    if (!row) return true;
    const d = days.find((d) => d.rowId === row.id && d.day === r.day);
    return (
      d?.sales == null &&
      !(d?.annotations as any)?.sales &&
      !approvals.some((a) => a.rowId === row.id && a.day === r.day)
    );
  };
  const missingAdvisor = (r: (typeof resolvedAdvisors)[number]) => {
    const person = personFor(r.name);
    return (
      !person ||
      !historical.some(
        (h) =>
          h.advisorId === person.id &&
          h.country === r.country &&
          h.day === r.day,
      )
    );
  };
  const oldTotal = (r: { country: string; day: string }) =>
    totals.find(
      (t) =>
        t.tableId === target.get(r.country) &&
        t.country === r.country &&
        t.currency === "PEN" &&
        t.day === r.day,
    );
  const missingTotal = (r: { country: string; day: string }, metric: string) =>
    !Object.hasOwn((oldTotal(r)?.values as object) ?? {}, metric);
  const missingManual = (r: HistoryFile["manual"][number]) =>
    r.metric === "baseManual"
      ? !bases.some(
          (b) =>
            b.tableId === target.get(r.country) &&
            b.country === r.country &&
            b.day === r.day,
        )
      : missingTotal(r, r.metric);
  const summary = {
    source: f.source,
    recovery: b.repairMissing
      ? {
          diplomaCells: resolvedDiplomas.filter(missingDiploma).length,
          advisorCells: resolvedAdvisors.filter(missingAdvisor).length,
          countryCells: f.totals.filter((r) =>
            missingTotal(r, "historicalSales"),
          ).length,
          manualCells: f.manual.filter(missingManual).length,
          preservedDifferences: conflicts.length,
        }
      : null,
    diplomaSales: f.diplomas.reduce((n, r) => n + r.sales, 0),
    advisorSales: f.advisors.reduce((n, r) => n + r.sales, 0),
    countrySales: f.totals.reduce((n, r) => n + r.sales, 0),
    diplomaDays: resolvedDiplomas.length,
    sourceDiplomaDays: f.diplomas.length,
    restoredRows: rows.filter(
      (r) => r.hidden && resolvedDiplomas.some((d) => rowFor(d)?.id === r.id),
    ).length,
    advisorDays: resolvedAdvisors.length,
    sourceAdvisorDays: f.advisors.length,
    countryDays: f.totals.length,
    manualCells: f.manual.length,
    newTables: choices.tables
      .filter((r) => !r.tableId)
      .map((r) => countryName(r.country)),
    newDiplomas: [
      ...new Map(
        [...freshAliases.values()].map((a) => [
          a.table + "|" + categoryKey(a.name),
          a,
        ]),
      ).values(),
    ],
    newAdvisors: personNames.filter((n) => !personFor(n)),
    conflicts,
  };
  const resolvedFingerprint = (
    materializedAliases?: Map<string, string>,
    materializedPeople?: Map<string, string>,
  ) =>
    hash({
      file: f,
      lists: [
        choices.inventoryListId,
        choices.advisorListId,
        choices.totalsListId,
      ],
      tables: [...target].sort(),
      diplomas: [
        ...new Map(
          f.diplomas.map((r) => {
            const k = r.country + "|" + categoryKey(r.name);
            return [
              k,
              materializedAliases?.get(k) ??
                aliasByKey.get(k)?.id ??
                "new:" +
                  r.country +
                  ":" +
                  categoryKey(freshAliases.get(k)!.name),
            ];
          }),
        ).entries(),
      ].sort(),
      people: personNames
        .map((n) => [
          categoryKey(n),
          materializedPeople?.get(categoryKey(n)) ??
            personFor(n)?.id ??
            "new:" + categoryKey(n),
        ])
        .sort(),
    });
  return {
    resolvedFingerprint,
    missingDiploma,
    missingAdvisor,
    missingTotal,
    missingManual,
    b,
    f,
    choices,
    before,
    digest,
    token,
    summary,
    target,
    aliasByKey,
    freshAliases,
    people,
    items,
    personNames,
    rowFor,
    resolvedDiplomas,
    resolvedAdvisors,
    personFor,
  };
}
export async function previewHistoryImport(u: Actor, raw: unknown) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      await authorized(u, tx);
      const b = inputSchema.parse(raw),
        digest = requestDigest(b),
        old = await tx.metaFinancialHistoryImport.findUnique({
          where: { digest },
          select: { id: true, summary: true },
        });
      if (old && !b.repairMissing)
        return {
          token: "",
          summary: old.summary as unknown as Awaited<
            ReturnType<typeof plan>
          >["summary"],
          previous: old,
        };
      const p = await plan(tx, u, raw);
      const previous = await tx.metaFinancialHistoryImport.findFirst({
        where: {
          summary: {
            path: ["resolvedFingerprint"],
            equals: p.resolvedFingerprint(),
          },
        },
        select: { id: true, summary: true },
      });
      if (previous && !b.repairMissing)
        return {
          token: "",
          summary: previous.summary as unknown as typeof p.summary,
          previous,
        };
      return { token: p.token, summary: p.summary, previous: null };
    },
    { timeout: 60000 },
  );
}
export async function commitHistoryImport(u: Actor, raw: unknown) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
      await authorized(u, tx);
      const b = inputSchema.parse(raw),
        digest = b.repairMissing
          ? hash({ recovery: requestDigest(b), token: b.token ?? "" })
          : requestDigest(b),
        old = await tx.metaFinancialHistoryImport.findUnique({
          where: { digest },
          select: { id: true, summary: true },
        });
      if (old) return { ...old, reused: true };
      const p = await plan(tx, u, raw);
      const previous = await tx.metaFinancialHistoryImport.findFirst({
        where: {
          summary: {
            path: ["resolvedFingerprint"],
            equals: p.resolvedFingerprint(),
          },
        },
        select: { id: true, summary: true },
      });
      if (previous && !b.repairMissing) return { ...previous, reused: true };
      demand(
        p.b.token === p.token,
        "Los datos de destino cambiaron. Revisa una nueva vista previa.",
        409,
      );
      demand(
        b.repairMissing || !p.summary.conflicts.some((c) => c.blocked),
        "Hay cantidades ya atribuidas a personas; resuelve esos conflictos en la hoja antes de importar.",
        409,
      );
      demand(
        b.repairMissing || !p.summary.conflicts.length || p.b.replaceConflicts,
        "Hay valores existentes diferentes. Revisa los conflictos antes de reemplazarlos.",
        409,
      );
      const batch = await tx.metaFinancialHistoryImport.create({
        data: {
          digest,
          actorId: u.id,
          source: json(p.f.source),
          payload: json({ file: p.f, choices: p.choices }),
          before: json(p.before),
          summary: json(p.summary),
        },
      });
      for (const c of p.choices.tables)
        if (!c.tableId) {
          const t = await tx.metaAliasTable.create({
            data: {
              name: countryName(c.country),
              defaultCountry: c.country,
              defaultCurrency: "PEN",
            },
          });
          p.target.set(c.country, t.id);
        }
      const aliases = new Map([...p.aliasByKey].map(([k, a]) => [k, a.id]));
      const itemNames = new Set(p.items.map((i) => categoryKey(i.name)));
      const createdAliases = new Map<string, string>();
      for (const [key, a] of p.freshAliases) {
        const canonical = p.target.get(a.country)! + "|" + categoryKey(a.name);
        if (createdAliases.has(canonical)) {
          const aliasId = createdAliases.get(canonical)!;
          aliases.set(key, aliasId);
          await tx.metaEffectivenessState.upsert({
            where: { aliasId_country: { aliasId, country: a.country } },
            create: { aliasId, country: a.country, active: false },
            update: {},
          });
          continue;
        }
        if (!itemNames.has(categoryKey(a.name))) {
          await tx.metaInventoryItem.create({
            data: { sheetId: p.choices.inventoryListId, name: a.name },
          });
          itemNames.add(categoryKey(a.name));
        }
        const alias = await tx.metaAlias.create({
          data: {
            tableId: p.target.get(a.country)!,
            inventorySheetId: p.choices.inventoryListId,
            name: a.name,
          },
        });
        aliases.set(key, alias.id);
        createdAliases.set(canonical, alias.id);
        await tx.metaEffectivenessState.create({
          data: { aliasId: alias.id, country: a.country, active: false },
        });
      }
      const personMap = new Map<string, string>();
      for (const name of p.personNames) {
        const old = p.personFor(name);
        if (old) personMap.set(categoryKey(name), old.id);
        else {
          const created = await tx.metaAdvisor.create({
            data: { sheetId: p.choices.advisorListId, name },
          });
          personMap.set(categoryKey(name), created.id);
        }
      }
      const rowMap = new Map(
        p.before.rows.map((r) => [r.aliasId + "|" + r.country, r]),
      );
      const groupedMemberships = new Map<string, string[]>();
      for (const a of p.aliasByKey.values()) {
        const ids = groupedMemberships.get(a.inventorySheetId) ?? [];
        if (!ids.includes(a.id)) ids.push(a.id);
        groupedMemberships.set(a.inventorySheetId, ids);
      }
      for (const [listId, ids] of groupedMemberships)
        await (
          await import("./inventory-membership")
        ).setInventoryMembership(tx, listId, ids, false, false);
      for (const r of p.resolvedDiplomas) {
        const aliasId = aliases.get(r.country + "|" + categoryKey(r.name))!,
          k = aliasId + "|" + r.country;
        let row = rowMap.get(k);
        if (!row) {
          row = await tx.metaEffectivenessRow.create({
            data: {
              aliasId,
              country: r.country,
              currency: "",
              displayCurrency: "PEN",
            },
          });
          rowMap.set(k, row);
        }
        if (row.hidden) {
          row = await tx.metaEffectivenessRow.update({
            where: { id: row.id },
            data: { hidden: false, revision: { increment: 1 } },
          });
          rowMap.set(k, row);
        }
        if (b.repairMissing && !p.missingDiploma(r)) continue;
        const d = p.before.days.find(
          (d) => d.rowId === row!.id && d.day === r.day,
        );
        const savedApproval = p.before.approvals.find(
          (a) => a.rowId === row!.id && a.day === r.day,
        );
        if (
          d?.sales === r.sales &&
          savedApproval &&
          !(d.annotations as any)?.sales
        )
          continue;
        const annotations = {
          ...((d?.annotations as Record<string, Prisma.JsonValue>) ?? {}),
        };
        delete annotations.sales;
        await tx.metaEffectivenessDay.upsert({
          where: { rowId_day: { rowId: row.id, day: r.day } },
          create: {
            rowId: row.id,
            day: r.day,
            sales: r.sales,
            salesOverridden: true,
            annotations,
          },
          update: {
            sales: r.sales,
            salesOverridden: true,
            annotations,
            revision: { increment: 1 },
          },
        });
        await tx.metaAdvisorSalesApproval.upsert({
          where: { rowId_day: { rowId: row.id, day: r.day } },
          create: {
            rowId: row.id,
            day: r.day,
            salesTotal: r.sales,
            allocations: [{ advisorId: null, sales: r.sales }],
            basis: { events: [], activeAdvisorId: null },
            actorId: u.id,
          },
          update: {
            salesTotal: r.sales,
            allocations: [{ advisorId: null, sales: r.sales }],
            basis: { events: [], activeAdvisorId: null },
            actorId: u.id,
            revision: { increment: 1 },
            approvedAt: new Date(),
          },
        });
      }
      const freshHistory: Prisma.MetaHistoricalAdvisorSaleCreateManyInput[] =
        [];
      for (const r of p.resolvedAdvisors) {
        if (b.repairMissing && !p.missingAdvisor(r)) continue;
        const advisorId = personMap.get(categoryKey(r.name))!,
          old = p.before.historical.find(
            (h) =>
              h.advisorId === advisorId &&
              h.country === r.country &&
              h.day === r.day,
          );
        if (!old)
          freshHistory.push({
            advisorId,
            country: r.country,
            day: r.day,
            sales: r.sales,
            importId: batch.id,
          });
        else if (old.sales !== r.sales)
          await tx.metaHistoricalAdvisorSale.update({
            where: {
              advisorId_country_day: {
                advisorId,
                country: r.country,
                day: r.day,
              },
            },
            data: { sales: r.sales, importId: batch.id },
          });
      }
      for (let i = 0; i < freshHistory.length; i += 1000)
        await tx.metaHistoricalAdvisorSale.createMany({
          data: freshHistory.slice(i, i + 1000),
        });
      const totalCells = new Map<
        string,
        {
          tableId: string;
          country: string;
          day: string;
          values: Record<string, Prisma.JsonValue>;
        }
      >();
      const totalCell = (country: string, day: string) => {
        const tableId = p.target.get(country)!,
          k = tableId + "|" + country + "|" + day;
        if (!totalCells.has(k)) {
          const old = p.before.totals.find(
            (t) =>
              t.tableId === tableId &&
              t.country === country &&
              t.day === day &&
              t.currency === "PEN",
          );
          totalCells.set(k, {
            tableId,
            country,
            day,
            values: {
              ...((old?.values as Record<string, Prisma.JsonValue>) ?? {}),
            },
          });
        }
        return totalCells.get(k)!;
      };
      for (const r of p.f.totals) {
        if (b.repairMissing && !p.missingTotal(r, "historicalSales")) continue;
        const cell = totalCell(r.country, r.day);
        cell.values.historicalSales = r.sales;
        cell.values.historicalSalesImport = batch.id;
      }
      for (const r of p.f.manual) {
        if (b.repairMissing && !p.missingManual(r)) continue;
        if (r.metric === "baseManual") {
          const tableId = p.target.get(r.country)!,
            old = p.before.bases.find(
              (b) =>
                b.tableId === tableId &&
                b.country === r.country &&
                b.day === r.day,
            );
          const n =
            old?.state === "VALUE"
              ? (old.allocations as any[]).reduce((s, a) => s + a.quantity, 0)
              : null;
          if (n === r.value) continue;
          await tx.metaManualBaseDay.upsert({
            where: {
              tableId_country_day: { tableId, country: r.country, day: r.day },
            },
            create: {
              tableId,
              country: r.country,
              day: r.day,
              state: "VALUE",
              allocations: [{ advisorId: null, quantity: r.value }],
            },
            update: {
              state: "VALUE",
              allocations: [{ advisorId: null, quantity: r.value }],
              revision: { increment: 1 },
            },
          });
        } else totalCell(r.country, r.day).values.totalSpend = r.value;
      }
      for (const c of totalCells.values())
        await tx.metaEffectivenessTotalDay.upsert({
          where: {
            sheetId_tableId_country_currency_day: {
              sheetId: p.choices.totalsListId,
              tableId: c.tableId,
              country: c.country,
              currency: "PEN",
              day: c.day,
            },
          },
          create: {
            sheetId: p.choices.totalsListId,
            tableId: c.tableId,
            country: c.country,
            currency: "PEN",
            day: c.day,
            values: c.values,
          },
          update: { values: c.values, revision: { increment: 1 } },
        });
      if (p.freshAliases.size)
        await tx.metaEffectivenessSheet.update({
          where: { id: p.choices.inventoryListId },
          data: { categoryRevision: { increment: 1 } },
        });
      await recordActivity(tx, {
        data: {
          actorId: u.id,
          action: b.repairMissing
            ? "EFECTIVIDAD_RECUPERAR_HISTORICO"
            : "EFECTIVIDAD_IMPORTAR_HISTORICO",
          resourceId: batch.id,
          detail: {
            digest: p.digest,
            diplomaDays: p.f.diplomas.length,
            advisorDays: p.f.advisors.length,
            countryDays: p.f.totals.length,
            manualCells: p.f.manual.length,
          },
        },
      });
      const finalSummary = {
        ...p.summary,
        tableIds: [...new Set(p.target.values())],
        resolvedFingerprint: p.resolvedFingerprint(aliases, personMap),
      };
      await tx.metaFinancialHistoryImport.update({
        where: { id: batch.id },
        data: { summary: json(finalSummary) },
      });
      return {
        id: batch.id,
        summary: finalSummary,
        reused: false,
        tableIds: finalSummary.tableIds,
      };
    },
    { timeout: 120000 },
  );
}
