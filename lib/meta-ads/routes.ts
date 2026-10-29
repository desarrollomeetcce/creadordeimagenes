import { syllabiSchema } from "./inventory-syllabi-policy";
import { workbookKindSchema } from "./workbook-sheets";
import { salesAllocationsSchema } from "./advisor-sales-plan";
import { assignmentTimingSchema } from "./advisor-attribution";
import { advisorAbsenceSchema } from "./advisor-absence";
import { colorRulesSchema } from "./sheet-colors";
import { NextRequest, NextResponse } from "next/server";
import { isCurrency, syncFxDays } from "./exchange-rates";
import { isCountryCode } from "./countries";
import { z } from "zod";
import { db } from "../db";
import { ownerOnly } from "../auth";
import { demand } from "../errors";
import { recordActivity } from "../activity";
import {
  connectionSelect,
  accountSelect,
  accountWhere,
  access,
  discover,
  refreshConnection,
  saveToken,
  queueSync,
  syncStep,
  type Actor,
} from "./service";
import { dashboard } from "./dashboard";
import { syncProgress } from "./sync-progress";
import { beginOAuth } from "./oauth";
import { beginMarketingOAuth, configureMarketingApp } from "./marketing-oauth";
import { marketingOAuthInfo } from "./marketing-policy";
import { accountActivities } from "./account-activity";
const cfg = z
  .object({
    name: z.string().trim().min(1).max(100),
    transport: z.enum(["API", "MCP"]),
    apiVersion: z
      .string()
      .regex(/^v\d{2}\.0$/)
      .default("v26.0"),
    appId: z
      .string()
      .regex(/^\d{1,40}$/)
      .optional(),
    token: z.string().trim().min(10).max(12000).optional(),
  })
  .strict();
const send = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
function completedAt(state: unknown) {
  const v = (state as { lastRun?: { finishedAt?: unknown } } | null)?.lastRun
    ?.finishedAt;
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
}
export async function metaRoutes(
  req: NextRequest,
  parts: string[],
  actor: Actor,
  body: () => Promise<unknown>,
) {
  const path = parts.slice(1).join("/"),
    method = req.method;
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "status" &&
    parts.length === 4 &&
    method === "POST"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        status: z.enum(["ACTIVE", "PAUSED"]),
        expectedStatus: z.enum(["ACTIVE", "PAUSED"]),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./manage")
      ).setMetaStatus(actor, parts[2], b.status, b.expectedStatus),
    );
  }
  if (path === "my-performance" && method === "GET")
    return send(
      await (
        await import("./advisor-performance")
      ).advisorPerformance(actor, Object.fromEntries(req.nextUrl.searchParams)),
    );
  if (path === "my-performance/settings" && method === "GET")
    return send(
      await (await import("./advisor-performance")).performanceSettings(actor),
    );
  if (path === "my-performance/link" && method === "PUT")
    return send(
      await (
        await import("./advisor-performance")
      ).savePortalLink(actor, await body()),
    );
  if (path === "my-performance/goals" && method === "PUT")
    return send(
      await (
        await import("./advisor-performance")
      ).saveAdvisorGoal(actor, await body()),
    );
  if (path === "my-performance/goals" && method === "DELETE")
    return send(
      await (
        await import("./advisor-performance")
      ).deleteAdvisorGoal(actor, await body()),
    );
  const nameDecisions = z
    .array(
      z
        .object({
          kind: z.enum(["PRIMARY", "SECONDARY", "INVENTORY"]),
          name: z.string().min(1).max(150),
          useName: z.string().min(1).max(150),
        })
        .strict(),
    )
    .max(2000)
    .optional();
  if (path === "inventory/syllabi" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        listId: z.string().min(1).max(100),
        name: z.string().min(1).max(150),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./inventory-syllabi")
      ).readSyllabi(actor, q.listId, q.name),
    );
  }
  if (path === "inventory/syllabi" && method === "PUT") {
    ownerOnly(actor);
    return send(
      await (
        await import("./inventory-syllabi")
      ).saveSyllabi(actor, await body()),
    );
  }
  if (path === "inventory/package/preview" && method === "POST") {
    ownerOnly(actor);
    return send(
      await (
        await import("./inventory-syllabi")
      ).previewCatalogPackage(actor, await body()),
    );
  }
  if (path === "inventory/package/import" && method === "POST") {
    ownerOnly(actor);
    return send(
      await (
        await import("./inventory-syllabi")
      ).importCatalogPackage(actor, await body()),
    );
  }
  if (path === "inventory/import" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        listId: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        decisions: nameDecisions,
        rows: z
          .array(
            z
              .object({
                primary: z.string().max(2000),
                secondary: z.string().max(8200),
                name: z.string().max(150),
                sheets: z.string().max(2000),
                syllabi: syllabiSchema.optional(),
              })
              .strict(),
          )
          .min(1)
          .max(1500),
      })
      .strict()
      .parse(await body());
    return send(
      await (await import("./inventory-import")).importInventory(actor, b),
    );
  }
  if (path === "inventory/file" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        name: z.string().min(1).max(255),
        content: z.string().min(1).max(2700000),
      })
      .strict()
      .parse(await body());
    try {
      return send(
        await (
          await import("./category-file")
        ).parseInventoryFile(b.name, b.content),
      );
    } catch (e) {
      if (e instanceof (await import("../errors")).AppError) throw e;
      throw new (await import("../errors")).AppError(
        "No se pudo leer el archivo. Usa XLSX sin fórmulas o CSV/TSV con Inventario, Categoría principal, Categorías secundarias, Hojas y Temario 1, Temario 2…",
      );
    }
  }
  if (path === "inventory/categories" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({ listId: z.string().min(1).max(100) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./inventory-categories")
      ).inventoryCategories(actor, q.listId),
    );
  }
  if (path === "inventory/categories" && method === "POST") {
    ownerOnly(actor);
    const base = {
      listId: z.string().min(1).max(100),
      revision: z.number().int().nonnegative(),
    };
    const ids = z.array(z.string().min(1).max(100)).min(1).max(1000);
    const b = z
      .discriminatedUnion("action", [
        z
          .object({
            ...base,
            action: z.literal("IMPORT"),
            rows: z
              .array(
                z
                  .object({
                    primary: z.string().max(2000),
                    secondary: z.string().max(8200),
                  })
                  .strict(),
              )
              .min(1)
              .max(500),
            targetIds: ids.optional(),
            decisions: nameDecisions,
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("ASSIGN_LEVEL"),
            ids,
            expectedName: z.string().min(1).max(150),
            kind: z.enum(["PRIMARY", "SECONDARY"]),
            names: z.array(z.string().min(1).max(80)).max(100),
            decisions: nameDecisions,
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("MOVE"),
            ids,
            expectedName: z.string().min(1).max(150),
            categoryId: z.string().min(1).max(100),
            toKind: z.enum(["PRIMARY", "SECONDARY"]),
            decisions: nameDecisions,
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("ASSIGN"),
            ids,
            expectedName: z.string().min(1).max(150),
            categoryIds: z.array(z.string().min(1).max(100)).max(40),
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("ASSIGN_BULK"),
            ids: z.array(z.string().min(1).max(100)).min(1).max(1500),
            kind: z.enum(["PRIMARY", "SECONDARY"]),
            names: z.array(z.string().trim().min(1).max(80)).min(1).max(100),
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("RENAME"),
            categoryId: z.string().min(1).max(100),
            name: z
              .string()
              .trim()
              .min(1)
              .max(80)
              .regex(/^[^,;\n]+$/),
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("DELETE"),
            categoryId: z.string().min(1).max(100),
          })
          .strict(),
        z
          .object({
            ...base,
            action: z.literal("DELETE_MANY"),
            categoryIds: z.array(z.string().min(1).max(100)).min(1).max(1000),
          })
          .strict(),
      ])
      .parse(await body());
    return send(
      await (
        await import("./inventory-categories")
      ).saveInventoryCategories(actor, b),
    );
  }
  if (path === "inventory/categories/file" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        name: z.string().min(1).max(255),
        content: z.string().min(1).max(2700000),
      })
      .strict()
      .parse(await body());
    try {
      return send(
        await (
          await import("./category-file")
        ).parseCategoryFile(b.name, b.content),
      );
    } catch (e) {
      if (e instanceof (await import("../errors")).AppError) throw e;
      throw new (await import("../errors")).AppError(
        "No se pudo leer el archivo. Usa Excel .xlsx sin fórmulas o CSV/TSV con dos columnas válidas.",
      );
    }
  }
  if (path === "inventory/remove-preview" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        listId: z.string().min(1).max(100),
        ids: z.array(z.string().min(1).max(100)).min(1).max(1000),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./inventory-catalog")
      ).previewRemoveInventorySelection(actor, b.listId, b.ids),
    );
  }
  if (path === "inventory/remove" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        listId: z.string().min(1).max(100),
        entries: z
          .array(
            z
              .object({
                id: z.string().min(1).max(100),
                token: z.string().regex(/^[a-f0-9]{64}$/),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./inventory-catalog")
      ).removeInventorySelection(actor, b),
    );
  }
  if (path === "inventory/rename" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        listId: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(150),
        expectedName: z.string().min(1).max(150),
        ids: z.array(z.string().min(1).max(100)).min(1).max(100),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./inventory-catalog")
      ).renameInventoryGroup(actor, b),
    );
  }
  if (
    parts[1] === "aliases" &&
    parts[2] &&
    parts[3] === "delete-preview" &&
    parts.length === 4 &&
    method === "GET"
  )
    return send(
      await (
        await import("./inventory-catalog")
      ).previewRemoveInventory(actor, parts[2]),
    );
  if (
    parts[1] === "aliases" &&
    parts[2] &&
    parts.length === 3 &&
    method === "DELETE"
  ) {
    ownerOnly(actor);
    const b = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./inventory-catalog")
      ).removeInventory(actor, parts[2], b.token),
    );
  }
  if (
    parts[1] === "workbook-sheets" &&
    parts[2] &&
    parts[3] === "delete-preview" &&
    parts.length === 4 &&
    method === "GET"
  )
    return send(
      await (
        await import("./delete-workbook-sheet")
      ).previewDeleteWorkbookSheet(actor, parts[2]),
    );
  if (
    parts[1] === "workbook-sheets" &&
    parts[2] &&
    parts.length === 3 &&
    method === "DELETE"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        confirmedName: z.string().min(1).max(100),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./delete-workbook-sheet")
      ).deleteWorkbookSheet(actor, parts[2], b),
    );
  }
  if (path === "workbook-sheets" && method === "GET")
    return send(
      await (await import("./workbook-sheets")).workbookSheets(actor),
    );
  if (path === "workbook-sheets" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        kind: workbookKindSchema,
        name: z.string().trim().min(1).max(100).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await (await import("./workbook-sheets")).createWorkbookSheet(actor, b),
      201,
    );
  }
  if (
    parts[1] === "workbook-sheets" &&
    parts[2] &&
    parts.length === 3 &&
    method === "PATCH"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        revision: z.number().int().positive(),
        name: z.string().trim().min(1).max(100).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .refine(
        (v) => v.name !== undefined || v.config !== undefined,
        "Indica el cambio de la pestaña.",
      )
      .parse(await body());
    return send(
      await (
        await import("./workbook-sheets")
      ).updateWorkbookSheet(actor, parts[2], b),
    );
  }
  if (path === "effectiveness/colors" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({ tableId: z.string().min(1).max(100) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./effectiveness-colors")
      ).effectivenessColors(actor, q.tableId),
    );
  }
  if (path === "effectiveness/colors" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        rules: colorRulesSchema,
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness-colors")
      ).saveEffectivenessColors(actor, b),
    );
  }
  if (path === "effectiveness/colors/sync" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        revision: z.number().int().nonnegative(),
        sourceTableId: z.string().min(1).max(100),
        sourceRevision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness-colors")
      ).saveEffectivenessColors(actor, b),
    );
  }
  if (
    parts[1] === "alias-tables" &&
    parts[2] &&
    parts[3] === "delete-preview" &&
    parts.length === 4 &&
    method === "GET"
  ) {
    ownerOnly(actor);
    return send(
      await (
        await import("./delete-alias-table")
      ).previewDeleteAliasTable(
        actor,
        z.string().min(1).max(100).parse(parts[2]),
      ),
    );
  }
  if (
    parts[1] === "alias-tables" &&
    parts[2] &&
    parts.length === 3 &&
    method === "DELETE"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        confirmedName: z.string().min(1).max(100),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./delete-alias-table")
      ).deleteAliasTable(actor, z.string().min(1).max(100).parse(parts[2]), b),
    );
  }
  if (path === "advisors" && method === "GET")
    return send(await (await import("./advisors")).advisors(actor));
  if (path === "advisors" && (method === "POST" || method === "PATCH")) {
    ownerOnly(actor);
    const data = await body();
    const b =
      method === "POST"
        ? z
            .object({
              name: z.string().trim().min(1).max(100),
              sheetId: z.string().min(1).max(100).optional(),
            })
            .strict()
            .parse(data)
        : z
            .object({
              name: z.string().trim().min(1).max(100),
              id: z.string().min(1).max(80),
              revision: z.number().int().nonnegative(),
            })
            .strict()
            .parse(data);
    return send(
      await (await import("./advisors")).saveAdvisor(actor, b),
      method === "POST" ? 201 : 200,
    );
  }
  if (
    path === "effectiveness/advisor-sales" &&
    (method === "GET" || method === "POST")
  ) {
    ownerOnly(actor);
    const scope = {
      aliasId: z.string().min(1).max(80),
      country: z.string().refine(isCountryCode),
      day: z.string().date(),
    };
    if (method === "GET") {
      const q = z
        .object(scope)
        .parse(Object.fromEntries(req.nextUrl.searchParams));
      return send(
        await (
          await import("./advisor-sales-approval")
        ).advisorSalesReview(actor, q),
      );
    }
    const b = z
      .object({
        ...scope,
        token: z.string().length(64),
        revision: z.number().int().nonnegative(),
        allocations: salesAllocationsSchema.optional(),
        value: z.union([z.literal("NA"), z.null()]).optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./advisor-sales-approval")
      ).approveAdvisorSales(actor, b),
    );
  }
  if (path === "effectiveness/advisor-review" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        aliasId: z.string().min(1).max(80),
        country: z.string().refine(isCountryCode),
        day: z.string().date(),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./advisors")
      ).assignmentReview(actor, q.aliasId, q.country, q.day),
    );
  }
  if (path === "effectiveness/advisor" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        aliasId: z.string().min(1).max(80),
        country: z.string().refine(isCountryCode, "Elige un país válido."),
        advisorId: z.string().min(1).max(80).nullable(),
        revision: z.number().int().nonnegative(),
        ...assignmentTimingSchema.partial().shape,
      })
      .strict()
      .parse(await body());
    return send(await (await import("./advisors")).assignRowAdvisor(actor, b));
  }
  if (path === "advisors/absence" && method === "PATCH") {
    ownerOnly(actor);
    const b = advisorAbsenceSchema.parse(await body());
    return send(
      await (await import("./advisors")).saveAdvisorAbsence(actor, b),
    );
  }
  if (path === "advisors/attendance" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        advisorId: z.string().min(1).max(80),
        day: z.string().date(),
        status: z.enum(["PRESENT", "ABSENT", "NA"]).nullable(),
        revision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(await body());
    return send(await (await import("./advisors")).saveAttendance(actor, b));
  }
  if (path === "advisors/item-analysis" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        tableId: z.string().min(1).max(100),
        aliasId: z.string().min(1).max(100),
        country: z
          .string()
          .refine((v) => v === "" || isCountryCode(v))
          .optional(),
        since: z.string().date(),
        until: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta31 días.",
    );
    return send(
      await (
        await import("./advisor-item-analysis")
      ).advisorItemAnalysis(actor, q),
    );
  }
  if (path === "advisors/periods" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        tableId: z.string().min(1).max(100),
        advisorId: z.string().min(1).max(80),
        aliasId: z.string().min(1).max(100).optional(),
        country: z
          .string()
          .refine((v) => v === "" || isCountryCode(v))
          .optional(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./advisor-period-history")
      ).advisorPeriodHistory(actor, q),
    );
  }
  if (
    (path === "advisors/sheet" || path === "advisors/detail") &&
    method === "GET"
  ) {
    ownerOnly(actor);
    const q = z
      .object({
        periodId: z.string().min(1).max(100).optional(),
        advisorListId: z.string().min(1).max(100).optional(),
        tableId: z.string().min(1).max(100),
        aliasId: z.string().min(1).max(100).optional(),
        country: z
          .string()
          .refine((v) => v === "" || isCountryCode(v), "País no válido.")
          .optional(),
        advisorId: z.string().min(1).max(80).optional(),
        since: z.string().date(),
        until: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    demand(path !== "advisors/detail" || !!q.advisorId, "Elige un asesor.");
    demand(
      !q.periodId ||
        (path === "advisors/detail" &&
          q.advisorId &&
          q.aliasId &&
          q.country &&
          q.tableId !== "all"),
      "Selecciona la combinación exacta de la asignación.",
    );
    return send(
      await (
        await import("./advisors")
      ).advisorSheet(actor, q.tableId, q.since, q.until, {
        aliasId: q.aliasId,
        country: q.country,
        advisorId: q.advisorId,
        advisorListId: q.advisorListId,
        periodId: q.periodId,
      }),
    );
  }
  if (path === "effectiveness/sync" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({ tableId: z.string().min(1).max(100) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./effectiveness-sync")
      ).effectivenessSyncConfig(actor, q.tableId),
    );
  }
  if (
    (path === "effectiveness/sync" || path === "effectiveness/sync/preview") &&
    method === "POST"
  ) {
    ownerOnly(actor);
    const schema = z
      .object({
        tableId: z.string().min(1).max(100),
        sourceTableId: z.string().min(1).max(100),
        since: z.string().date(),
        until: z.string().date(),
        columns: z
          .array(
            z.enum(["alias", "sales", "budget", "base", "spend", "fixedCost"]),
          )
          .min(1)
          .max(6),
        ...(path === "effectiveness/sync"
          ? { token: z.string().regex(/^[a-f0-9]{64}$/) }
          : {}),
      })
      .strict();
    const b = schema.parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    demand(new Set(b.columns).size === b.columns.length, "Columna repetida.");
    const service = await import("./effectiveness-sync");
    return send(
      path === "effectiveness/sync"
        ? await service.applyEffectivenessSync(actor, {
            ...b,
            token: String(b.token),
          })
        : await service.previewEffectivenessSync(actor, b),
    );
  }
  if (
    path === "manual-base" ||
    path === "manual-base/advisor" ||
    path === "advisor-base"
  ) {
    ownerOnly(actor);
    const {
      manualBaseReview,
      saveManualBase,
      advisorManualBaseReview,
      saveAdvisorManualBase,
    } = await import("./manual-base");
    const country = z
      .string()
      .refine((v) => v === "" || isCountryCode(v), "País inválido.");
    const id = z.string().min(1).max(100),
      day = z.string().date(),
      quantity = z.number().int().min(0).max(100000000);
    const scope = z.object({
      tableId: id,
      country,
      day,
      sheetId: id.optional(),
      currency: z.string().max(10).optional(),
    });
    if ((path === "manual-base" || path === "advisor-base") && method === "GET")
      return send(
        await manualBaseReview(
          actor,
          scope.strict().parse(Object.fromEntries(req.nextUrl.searchParams)),
          path === "advisor-base" ? "BA" : "BM",
        ),
      );
    if (
      (path === "manual-base" || path === "advisor-base") &&
      method === "POST"
    ) {
      const { manualBaseAllocationsSchema } =
        await import("./manual-base-policy");
      const b = scope
        .extend({
          token: z.string().length(64),
          state: z.enum(["VALUE", "EMPTY", "NA"]),
          allocations: manualBaseAllocationsSchema,
        })
        .strict()
        .parse(await body());
      return send(
        await saveManualBase(actor, b, path === "advisor-base" ? "BA" : "BM"),
      );
    }
    if (path === "manual-base/advisor" && method === "GET") {
      const b = z
        .object({
          advisorId: id,
          day,
          tableId: id,
          country: country.optional(),
        })
        .strict()
        .parse(Object.fromEntries(req.nextUrl.searchParams));
      return send(await advisorManualBaseReview(actor, b));
    }
    if (path === "manual-base/advisor" && method === "POST") {
      const b = z
        .object({
          advisorId: id,
          day,
          changes: z
            .array(
              z
                .object({
                  tableId: id,
                  country,
                  token: z.string().length(64),
                  quantity: quantity.nullable(),
                  initialUnassigned: quantity.optional(),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict()
        .parse(await body());
      return send(await saveAdvisorManualBase(actor, b));
    }
  }
  if (path === "effectiveness/totals" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        sheetId: z.string().min(1).max(100).optional(),
        tableId: z.string().min(1).max(100),
        since: z.string().date(),
        until: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    return send(
      await (
        await import("./effectiveness-totals")
      ).effectivenessTotals(actor, q.tableId, q.since, q.until, q.sheetId),
    );
  }
  if (path === "effectiveness/totals" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        sheetId: z.string().min(1).max(100).optional(),
        tableId: z.string().min(1).max(100),
        country: z.string().refine((v) => v === "" || isCountryCode(v)),
        currency: z.string().refine(isCurrency),
        day: z.string().date(),
        metric: z.enum(["baseManual", "totalSpend", "fixedCost"]),
        value: z.union([
          z.literal("NA"),
          z.number().min(0).max(1000000000),
          z.null(),
        ]),
        revision: z.number().int().min(0),
      })
      .strict()
      .parse(await body());
    if (b.metric === "baseManual" && typeof b.value === "number")
      demand(
        Number.isInteger(b.value) && b.value <= 100000000,
        "La base debe ser entera y no mayor de 100000000.",
      );
    return send(
      await (
        await import("./effectiveness-totals")
      ).saveEffectivenessTotal(actor, b),
    );
  }
  if (path === "effectiveness/links" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({ tableId: z.string().min(1).max(100) })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./effectiveness-links")
      ).effectivenessLinkConfig(actor, q.tableId),
    );
  }
  if (
    (path === "effectiveness/links" ||
      path === "effectiveness/links/preview") &&
    method === "POST"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        sourceTableId: z.string().min(1).max(100),
        columns: z
          .array(z.enum(["sales", "budget", "base", "spend", "fixedCost"]))
          .min(1)
          .max(5),
        scope: z.enum(["all", "period"]),
        since: z.string().date(),
        until: z.string().date(),
        ...(path === "effectiveness/links"
          ? { token: z.string().regex(/^[a-f0-9]{64}$/) }
          : {}),
      })
      .strict()
      .parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Revisa un período de hasta 31 días.",
    );
    demand(new Set(b.columns).size === b.columns.length, "Columna repetida.");
    const service = await import("./effectiveness-links");
    return send(
      path.endsWith("/preview")
        ? await service.previewEffectivenessLink(actor, b)
        : await service.createEffectivenessLink(actor, {
            ...b,
            token: String(b.token),
          }),
    );
  }
  if (path === "effectiveness/links/unlink-preview" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({ tableId: z.string().min(1).max(100) })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness-links")
      ).previewUnlinkEffectiveness(actor, b.tableId),
    );
  }
  if (path === "effectiveness/links" && method === "DELETE") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness-links")
      ).unlinkEffectiveness(actor, b),
    );
  }
  if (path === "effectiveness/cells" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        since: z.string().date(),
        until: z.string().date(),
        days: z.array(z.string().date()).min(1).max(31).optional(),
        allActive: z.boolean().optional(),
        metrics: z
          .array(z.enum(["sales", "budget", "base", "spend", "fixedCost"]))
          .min(1)
          .max(5),
        value: z.union([
          z.literal("NA"),
          z.number().min(0).max(1000000000),
          z.null(),
        ]),
        targets: z
          .array(
            z
              .object({
                aliasId: z.string().min(1).max(100),
                country: z.string().refine((v) => v === "" || isCountryCode(v)),
                token: z.string().regex(/^[a-f0-9]{32}$/),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict()
      .parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Elige hasta31 días.",
    );
    demand(new Set(b.metrics).size === b.metrics.length, "Parámetro repetido.");
    if (
      typeof b.value === "number" &&
      b.metrics.some((m) => m === "sales" || m === "base")
    )
      demand(
        Number.isInteger(b.value) && b.value <= 100000000,
        "Las cantidades deben ser enteros entre0 y100000000.",
      );
    return send(
      await (
        await import("./effectiveness-controls")
      ).fillEffectiveness(actor, b),
    );
  }
  if (
    (path === "effectiveness/rows/delete-preview" && method === "POST") ||
    (path === "effectiveness/rows" && method === "DELETE")
  ) {
    ownerOnly(actor);
    const shape = {
      tableId: z.string().min(1).max(100),
      since: z.string().date(),
      until: z.string().date(),
      targets: z
        .array(
          z
            .object({
              aliasId: z.string().min(1).max(100),
              country: z.string().refine((v) => v === "" || isCountryCode(v)),
            })
            .strict(),
        )
        .min(1)
        .max(1000),
    };
    const schema =
      method === "DELETE"
        ? z
            .object({ ...shape, token: z.string().regex(/^[a-f0-9]{64}$/) })
            .strict()
        : z.object(shape).strict();
    const b = schema.parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Elige hasta31 días.",
    );
    const handlers = await import("./delete-effectiveness-rows");
    return send(
      method === "DELETE"
        ? await handlers.deleteEffectivenessRows(
            actor,
            b as typeof b & { token: string },
          )
        : await handlers.previewDeleteEffectivenessRows(actor, b),
    );
  }
  if (path === "effectiveness/states" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        since: z.string().date(),
        until: z.string().date(),
        active: z.boolean(),
        metrics: z
          .array(z.enum(["sales", "budget", "base", "spend", "fixedCost"]))
          .max(5),
        targets: z
          .array(
            z
              .object({
                aliasId: z.string().min(1).max(100),
                country: z.string().refine(isCountryCode),
                revision: z.number().int().min(0),
              })
              .strict(),
          )
          .min(1)
          .max(1000),
      })
      .strict()
      .parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    demand(new Set(b.metrics).size === b.metrics.length, "Parámetro repetido.");
    return send(
      await (
        await import("./effectiveness-controls")
      ).setEffectivenessStates(actor, b),
    );
  }
  if (path === "effectiveness/state" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        aliasId: z.string().min(1).max(100),
        country: z.string().refine(isCountryCode),
        active: z.boolean(),
        revision: z.number().int().min(0),
        since: z.string().date(),
        until: z.string().date(),
        metrics: z
          .array(z.enum(["sales", "budget", "base", "spend", "fixedCost"]))
          .max(5),
      })
      .strict()
      .parse(await body());
    demand(
      b.since <= b.until &&
        (Date.parse(b.until) - Date.parse(b.since)) / 86400000 < 31,
      "Elige hasta31 días.",
    );
    demand(new Set(b.metrics).size === b.metrics.length, "Parámetro repetido.");
    return send(
      await (
        await import("./effectiveness-controls")
      ).setEffectivenessState(actor, b),
    );
  }
  if (path === "effectiveness/detail" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        aliasId: z.string().min(1).max(100),
        country: z.string().refine(isCountryCode),
        since: z.string().date(),
        until: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    return send(
      await (
        await import("./effectiveness-detail")
      ).effectivenessDetail(actor, q),
    );
  }
  if (path === "effectiveness/history" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        aliasId: z.string().min(1).max(100),
        country: z.string().refine(isCountryCode),
        cursor: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (
        await import("./effectiveness-controls")
      ).effectivenessHistory(actor, q.aliasId, q.country, q.cursor),
    );
  }
  if (path === "effectiveness/columns" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        aliasColumnName: z.string().trim().min(1).max(100).optional(),
        country: z
          .string()
          .refine((v) => v === "" || isCountryCode(v))
          .optional(),
        currency: z.string().refine(isCurrency).optional(),
      })
      .strict()
      .parse(await body());
    demand(
      b.aliasColumnName !== undefined ||
        b.country !== undefined ||
        b.currency !== undefined,
      "Indica una columna.",
    );
    return send(
      await (await import("./effectiveness")).setEffectivenessColumns(actor, b),
    );
  }
  if (path === "effectiveness/fx" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({ days: z.array(z.string().date()).min(1).max(31) })
      .strict()
      .parse(await body());
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    demand(
      b.days.every((d) => d <= today && d >= "2024-03-02"),
      "Las tasas corresponden a fechas publicadas desde marzo de 2024, sin fechas futuras.",
    );
    return send(await syncFxDays(actor, [...new Set(b.days)]));
  }
  if (path === "effectiveness/import" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        tableId: z.string().min(1).max(100),
        inventorySheetId: z.string().min(1).max(100).optional(),
        decisions: nameDecisions,
        initialActive: z.boolean().optional(),
        advisorId: z.string().min(1).max(80).optional(),
        advisorTiming: assignmentTimingSchema
          .omit({ cutoffSales: true, token: true })
          .strict()
          .optional(),
        rows: z
          .array(
            z
              .object({
                name: z.string().trim().min(1).max(150),
                country: z.string().refine((v) => v === "" || isCountryCode(v)),
                currency: z.string().refine(isCurrency),
              })
              .strict(),
          )
          .min(1)
          .max(500),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness")
      ).importEffectiveness(
        actor,
        b.tableId,
        b.rows,
        b.advisorId,
        b.advisorTiming,
        b.inventorySheetId,
        b.decisions,
        b.initialActive,
      ),
    );
  }
  if (path === "effectiveness/identity" && method === "PATCH") {
    ownerOnly(actor);
    const country = z.string().refine((v) => v === "" || isCountryCode(v));
    const b = z
      .object({
        aliasId: z.string().min(1).max(100),
        fromCountry: country,
        fromCurrency: z.string().refine(isCurrency),
        country,
        currency: z.string().refine(isCurrency),
        revision: z.number().int().min(0),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./effectiveness")
      ).changeEffectivenessIdentity(actor, b),
    );
  }
  if (path === "effectiveness/totals/product-detail" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        tableId: z.string().min(1).max(100),
        country: z.string().refine((v) => v === "" || isCountryCode(v)),
        currency: z.string().regex(/^([A-Z]{3})?$/),
        since: z.string().date(),
        until: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta31 días por consulta.",
    );
    return send(
      await (
        await import("./totals-product-detail")
      ).totalsProductDetail(actor, q),
    );
  }
  if (path === "effectiveness/totals/daily-detail" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        tableId: z.string().min(1).max(100),
        country: z.string().refine((v) => v === "" || isCountryCode(v)),
        currency: z.string().regex(/^([A-Z]{3})?$/),
        day: z.string().date(),
      })
      .strict()
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    return send(
      await (await import("./totals-daily-detail")).totalsDailyDetail(actor, q),
    );
  }
  if (path === "effectiveness" && method === "GET") {
    ownerOnly(actor);
    const q = z
      .object({
        tableId: z.string().min(1).max(100),
        since: z.string().date(),
        until: z.string().date(),
      })
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    demand(
      q.since <= q.until &&
        (Date.parse(q.until) - Date.parse(q.since)) / 86400000 < 31,
      "Elige hasta 31 días.",
    );
    return send(
      await (
        await import("./effectiveness")
      ).effectiveness(actor, q.tableId, q.since, q.until),
    );
  }
  if (path === "effectiveness" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        aliasId: z.string().min(1).max(100),
        country: z.string().refine((v) => v === "" || isCountryCode(v)),
        currency: z.string().refine(isCurrency),
        day: z.string().date().optional(),
        sales: z.number().int().min(0).max(100000000).nullable().optional(),
        fixedCost: z.number().min(0).max(1000000000).nullable().optional(),
        revision: z.number().int().min(0).optional(),
        rowRevision: z.number().int().min(0).optional(),
      })
      .strict()
      .parse(await body());
    demand(
      !b.day || b.sales !== undefined || b.fixedCost !== undefined,
      "Indica una cifra manual.",
    );
    demand(
      !!b.day || (b.sales === undefined && b.fixedCost === undefined),
      "Indica la fecha para guardar cifras.",
    );
    return send(
      await (await import("./effectiveness")).saveEffectiveness(actor, b),
    );
  }
  if (
    parts[1] === "alias-tables" &&
    parts[2] &&
    parts.length === 3 &&
    method === "PATCH"
  ) {
    ownerOnly(actor);
    const b = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./aliases")
      ).renameAliasTable(actor, parts[2], b.name),
    );
  }
  if (path === "alias-table-options" && method === "GET")
    return send(await (await import("./aliases")).aliasTableOptions(actor));
  if (path === "alias-tables" && method === "GET")
    return send(await (await import("./aliases")).aliasTables(actor));
  if (path === "alias-tables" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({ name: z.string().trim().min(1).max(100) })
      .strict()
      .parse(await body());
    return send(
      await (await import("./aliases")).createAliasTable(actor, b.name),
      201,
    );
  }
  if (path === "aliases" && method === "GET")
    return send(await (await import("./aliases")).aliases(actor));
  if (path === "aliases" && method === "POST") {
    ownerOnly(actor);
    const b = z
      .object({
        name: z.string().trim().min(1).max(150),
        inventorySheetId: z.string().min(1).max(100).optional(),
        tableId: z.string().min(1).max(100).optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./aliases")
      ).saveAlias(actor, b.name, undefined, b.tableId, b.inventorySheetId),
      201,
    );
  }
  if (
    parts[1] === "aliases" &&
    parts[2] &&
    parts.length === 3 &&
    method === "PATCH"
  ) {
    ownerOnly(actor);
    const b = z
      .object({ name: z.string().trim().min(1).max(150) })
      .strict()
      .parse(await body());
    return send(
      await (await import("./aliases")).saveAlias(actor, b.name, parts[2]),
    );
  }
  if (path === "objects/alias" && method === "PATCH") {
    ownerOnly(actor);
    const b = z
      .object({
        objectIds: z
          .array(z.string().regex(/^\d{1,40}$/))
          .min(1)
          .max(100),
        aliasId: z.string().min(1).max(80).nullable(),
        advisorId: z.string().min(1).max(80).nullable().optional(),
        country: z
          .string()
          .refine(isCountryCode, "País no válido.")
          .nullable()
          .optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./aliases")
      ).assignAliases(actor, b.objectIds, b.aliasId, b.country, b.advisorId),
    );
  }
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "alias" &&
    parts.length === 4 &&
    method === "PATCH"
  ) {
    ownerOnly(actor);
    const b = z
      .object({
        aliasId: z.string().max(80).nullable(),
        advisorId: z.string().min(1).max(80).nullable().optional(),
        country: z
          .string()
          .refine(isCountryCode, "País no válido.")
          .nullable()
          .optional(),
      })
      .strict()
      .parse(await body());
    return send(
      await (
        await import("./aliases")
      ).assignAlias(actor, parts[2], b.aliasId, b.country, b.advisorId),
    );
  }
  if (path === "marketing-oauth-config" && method === "GET") {
    ownerOnly(actor);
    return send(marketingOAuthInfo(process.env.APP_ORIGIN));
  }
  if (path === "connections") {
    ownerOnly(actor);
    if (method === "GET")
      return send(
        await db.metaConnection.findMany({
          select: connectionSelect,
          orderBy: { createdAt: "desc" },
        }),
      );
    if (method === "POST") {
      const b = cfg.parse(await body());
      const c = await db.metaConnection.create({
        data: {
          name: b.name,
          transport: b.transport,
          apiVersion: b.apiVersion,
          appId: b.appId,
          ownerId: actor.id,
        },
      });
      if (b.token) await saveToken(c.id, b.token);
      await recordActivity(db, {
        data: {
          actorId: actor.id,
          action: "META_CONEXION_CREADA",
          resourceId: c.id,
          detail: { transport: c.transport },
        },
      });
      return send(
        await db.metaConnection.findUnique({
          where: { id: c.id },
          select: connectionSelect,
        }),
        201,
      );
    }
  }
  if (parts[1] === "connections" && parts[2]) {
    ownerOnly(actor);
    const id = parts[2];
    const c = await db.metaConnection.findUnique({ where: { id } });
    demand(c, "Conexión no encontrada.", 404);
    if (parts[3] === "manage-oauth" && method === "POST") {
      z.object({})
        .strict()
        .parse(await body());
      return beginMarketingOAuth(req, actor, id, true);
    }
    if (parts[3] === "app" && method === "PATCH")
      return send(await configureMarketingApp(actor, id, await body()));
    if (parts[3] === "refresh" && parts.length === 4 && method === "POST") {
      z.object({})
        .strict()
        .parse(await body());
      return send(await refreshConnection(actor, id));
    }
    if (parts[3] === "verify" && method === "POST")
      return send(await discover(actor, id));
    if (parts[3] === "oauth" && method === "POST") {
      if (c.transport === "API") {
        z.object({})
          .strict()
          .parse(await body());
        return beginMarketingOAuth(req, actor, id);
      }
      const b = z
        .object({ clientId: z.string().max(300).optional() })
        .strict()
        .parse(await body());
      return beginOAuth(req, actor, id, b.clientId);
    }
    if (parts[3] === "tools" && method === "GET") return send(c.tools);
    if (method === "PATCH" && !parts[3]) {
      const b = cfg.partial().parse(await body());
      demand(
        !b.appId || b.appId === c.appId || !c.encryptedAppSecret,
        "Cambia el ID y la clave de la app desde Configuración OAuth.",
        409,
      );
      demand(
        !b.transport || b.transport === c.transport,
        "Crea otra conexión para cambiar de tipo.",
      );
      await db.metaConnection.update({
        where: { id },
        data: {
          ...(b.name ? { name: b.name } : {}),
          ...(b.apiVersion ? { apiVersion: b.apiVersion } : {}),
          ...(b.appId ? { appId: b.appId } : {}),
          ownerId: actor.id,
          revision: { increment: 1 },
          verifiedAt: null,
        },
      });
      if (b.token) await saveToken(id, b.token);
      return send({ ok: true });
    }
    if (method === "DELETE" && !parts[3]) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        await tx.metaConnection.update({
          where: { id },
          data: {
            encryptedToken: null,
            encryptedAppSecret: null,
            appSecretConfiguredAt: null,
            tokenExpiresAt: null,
            tokenMask: null,
            verifiedAt: null,
            disconnectedAt: new Date(),
            revision: { increment: 1 },
            tools: [],
          },
        });
        await tx.metaAdAccount.updateMany({
          where: { connectionId: id },
          data: { enabled: false, nextSyncAt: null, schedulerToken: null },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_CONEXION_DESCONECTADA",
            resourceId: id,
          },
        });
      });
      return send({ ok: true });
    }
  }
  if (path === "accounts" && method === "GET") {
    const rows = await db.metaAdAccount.findMany({
      where: accountWhere(actor),
      select: {
        ...accountSelect,
        connection: {
          select: {
            transport: true,
            name: true,
            revision: true,
            verifiedAt: true,
            disconnectedAt: true,
          },
        },
        grants: { where: { userId: actor.id }, select: { canSync: true } },
        ...(actor.role === "OWNER"
          ? {
              sources: {
                select: {
                  connectionId: true,
                  revision: true,
                  connection: {
                    select: {
                      name: true,
                      transport: true,
                      revision: true,
                      disconnectedAt: true,
                      verifiedAt: true,
                    },
                  },
                },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    const [activity, stored, totals] = await Promise.all([
      accountActivities(rows),
      db.metaAdDaily.groupBy({
        by: ["accountId"],
        where: {
          accountId: { in: rows.map((a) => a.id) },
          scope: "7d_click,1d_view|impression",
        },
        _min: { day: true },
        _max: { day: true, updatedAt: true },
      }),
      db.metaAdTotal.groupBy({
        by: ["accountId"],
        where: {
          accountId: { in: rows.map((a) => a.id) },
          scope: "7d_click,1d_view|impression",
        },
        _max: { updatedAt: true },
      }),
    ]);
    const coverage = new Map(
      stored.map((s) => [
        s.accountId,
        { since: s._min.day, until: s._max.day },
      ]),
    );
    const dailyTimes = new Map(
      stored.map((s) => [s.accountId, s._max.updatedAt]),
    );
    const totalTimes = new Map(
      totals.map((s) => [s.accountId, s._max.updatedAt]),
    );
    return send(
      rows.map((a) => ({
        ...a,
        lastDataAt:
          [a.syncedAt, dailyTimes.get(a.id), totalTimes.get(a.id)]
            .filter((v): v is Date => !!v)
            .sort((x, y) => y.valueOf() - x.valueOf())[0] ?? null,
        activity: activity.get(a.id),
        coverage: coverage.get(a.id) ?? null,
        lastCompletedAt: completedAt(a.syncState),
        progress: syncProgress(a),
        syncState: { phase: (a.syncState as { phase?: number }).phase ?? null },
        canSync:
          actor.role === "OWNER" ||
          (actor.role === "ADMIN" && a.grants.some((g) => g.canSync)),
        grants: undefined,
      })),
    );
  }
  if (path === "sync-status" && method === "GET") {
    const ids = [
      ...new Set(
        (req.nextUrl.searchParams.get("accounts") ?? "")
          .split(",")
          .filter(Boolean),
      ),
    ];
    demand(
      ids.length > 0 &&
        ids.length <= 100 &&
        ids.every((id) => /^\d{1,40}$/.test(id)),
      "Selección de cuentas inválida.",
    );
    const rows = await db.metaAdAccount.findMany({
      where: { AND: [accountWhere(actor), { id: { in: ids } }] },
      select: {
        id: true,
        enabled: true,
        syncedAt: true,
        nextSyncAt: true,
        syncError: true,
        syncState: true,
      },
    });
    demand(
      rows.length === ids.length,
      "Hay cuentas no autorizadas en la selección.",
      404,
    );
    return send(
      rows.map((a) => ({
        id: a.id,
        syncedAt: a.syncedAt,
        syncError: a.syncError,
        syncState: { phase: (a.syncState as { phase?: number }).phase ?? null },
        progress: syncProgress(a),
      })),
    );
  }
  if (parts[1] === "accounts" && parts[2]) {
    const id = parts[2];
    const a = await access(actor, id);
    if (parts[3] === "control" && method === "POST") {
      const b = z
        .object({ action: z.enum(["pause", "cancel"]) })
        .strict()
        .parse(await body());
      return send(
        await (await import("./service")).controlSync(actor, id, b.action),
      );
    }
    if (parts[3] === "sync" && method === "POST") {
      const b = z
        .object({
          full: z.boolean().default(false),
          focused: z.boolean().default(false),
          fresh: z.boolean().default(false),
          inventory: z.enum(["all", "recent"]).optional(),
          recentDays: z
            .union([
              z.literal(7),
              z.literal(15),
              z.literal(30),
              z.literal(90),
              z.literal(180),
            ])
            .optional(),
        })
        .strict()
        .parse(await body());
      if (b.full) ownerOnly(actor);
      const result = await queueSync(
        actor,
        id,
        b.full,
        b.recentDays,
        b.focused,
        b.inventory ?? (b.focused ? "all" : "recent"),
        b.fresh,
      );
      // The explicit action checks one page immediately; remaining pages stay durable.
      const advanced = b.focused ? false : await syncStep(id);
      const { startMetaSchedule } = await import("./schedule");
      const scheduled = await startMetaSchedule(id);
      const account = await db.metaAdAccount.findUnique({
        where: { id },
        select: { schedulerRunId: true },
      });
      if (account?.schedulerRunId) {
        try {
          const { getRun } = await import("workflow/api");
          await getRun(account.schedulerRunId).wakeUp();
        } catch {}
      }
      const state = await db.metaAdAccount.findUniqueOrThrow({
        where: { id },
        select: { syncError: true },
      });
      return send(
        { ...result, ...scheduled, advanced, syncError: state.syncError },
        202,
      );
    }
    if (parts[3] === "grants") {
      ownerOnly(actor);
      if (method === "GET")
        return send(
          await db.metaAccountGrant.findMany({
            where: { accountId: id },
            select: { userId: true, canSync: true },
          }),
        );
      if (method === "PUT") {
        const b = z
          .object({
            grants: z
              .array(
                z
                  .object({
                    userId: z.string().min(1).max(100),
                    canSync: z.boolean().default(false),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict()
          .parse(await body());
        demand(
          new Set(b.grants.map((g) => g.userId)).size === b.grants.length,
          "Usuarios repetidos.",
        );
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
          const users = await tx.user.findMany({
            where: {
              id: { in: b.grants.map((g) => g.userId) },
              status: "APPROVED",
            },
          });
          demand(
            users.length === b.grants.length,
            "Hay usuarios no disponibles.",
            409,
          );
          demand(
            b.grants.every(
              (g) =>
                !g.canSync ||
                users.find((u) => u.id === g.userId)?.role === "ADMIN",
            ),
            "Solo ADMIN puede recibir sincronización delegada.",
          );
          await tx.metaAccountGrant.deleteMany({ where: { accountId: id } });
          if (b.grants.length)
            await tx.metaAccountGrant.createMany({
              data: b.grants.map((g) => ({ ...g, accountId: id })),
            });
          await recordActivity(tx, {
            data: {
              actorId: actor.id,
              action: "META_ACCESOS_ACTUALIZADOS",
              resourceId: id,
              detail: { count: b.grants.length },
            },
          });
        });
        return send({ ok: true });
      }
    }
    if (method === "PATCH" && !parts[3]) {
      ownerOnly(actor);
      const b = z
        .object({
          enabled: z.boolean().optional(),
          metric: z
            .enum(["AUTO", "MESSAGES", "LEADS", "PURCHASES", "LINK_CLICKS"])
            .optional(),
          targetCost: z.number().positive().max(1000000).nullable().optional(),
          minResults: z.number().int().min(1).max(10000).optional(),
          intervalMinutes: z.number().int().min(15).max(1440).optional(),
          connectionId: z.string().max(100).optional(),
        })
        .strict()
        .parse(await body());
      if (b.connectionId) {
        const c = await db.metaConnection.findFirst({
          where: {
            id: b.connectionId,
            verifiedAt: { not: null },
            disconnectedAt: null,
          },
        });
        demand(c, "Verifica primero la conexión de destino.", 409);
        const link = await db.metaAccountSource.findUnique({
          where: {
            accountId_connectionId: {
              accountId: id,
              connectionId: b.connectionId,
            },
          },
        });
        demand(
          link && link.revision === c.revision,
          "Esta cuenta todavía no se verificó con la conexión de destino. Pulsa Verificar en esa conexión.",
          409,
        );
      }
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(884411)`;
        await tx.metaAdAccount.update({
          where: { id },
          data: {
            ...b,
            ...(b.connectionId && b.connectionId !== a.connectionId
              ? {
                  syncState: {},
                  syncToken: null,
                  syncLeaseAt: null,
                  schedulerToken: null,
                  schedulerRunId: null,
                  nextSyncAt: new Date(),
                }
              : {}),
            ...(b.enabled === false
              ? { schedulerToken: null, nextSyncAt: null }
              : b.enabled === true
                ? { nextSyncAt: new Date() }
                : {}),
          },
        });
        await recordActivity(tx, {
          data: {
            actorId: actor.id,
            action: "META_CUENTA_CONFIGURADA",
            resourceId: id,
            detail: { enabled: b.enabled },
          },
        });
      });
      if (b.enabled || (b.connectionId && a.enabled))
        await (await import("./schedule")).startMetaSchedule(id);
      return send({ ok: true });
    }
  }
  if (
    parts[1] === "recommendations" &&
    /^\d{1,40}$/.test(parts[2] ?? "") &&
    parts[3] === "data" &&
    parts.length === 4
  ) {
    if (method === "GET")
      return send(
        await (
          await import("./recommendations/source")
        ).sourceStatus(actor, parts[2]),
      );
    if (method === "POST") {
      const b = z
        .object({ action: z.enum(["start", "continue", "restart"]) })
        .strict()
        .parse(await body());
      return send(
        await (
          await import("./recommendations/source")
        ).refreshSource(actor, parts[2], b.action),
      );
    }
  }
  if (path === "recommendations/rules" && method === "GET")
    return send(
      await (await import("./recommendations/service")).getRules(actor),
    );
  if (path === "recommendations/rules" && method === "PUT")
    return send(
      await (
        await import("./recommendations/service")
      ).saveRules(actor, await body()),
    );
  if (path === "recommendations" && method === "GET")
    return send(
      await (
        await import("./recommendations/service")
      ).campaignList(actor, req.nextUrl.searchParams),
    );
  if (
    parts[1] === "recommendations" &&
    /^\d{1,40}$/.test(parts[2] ?? "") &&
    parts.length === 3 &&
    method === "GET"
  )
    return send(
      await (
        await import("./recommendations/service")
      ).campaignAnalysis(
        actor,
        parts[2],
        req.nextUrl.searchParams.get("refresh") === "1",
        req.nextUrl.searchParams.get("mode") === "day" ? "day" : "night",
      ),
    );
  if (path === "dashboard" && method === "GET")
    return send(await dashboard(actor, req.nextUrl.searchParams));
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "thumbnail" &&
    method === "GET"
  )
    return (await import("./thumbnail")).metaThumbnail(actor, parts[2]);
  if (
    parts[1] === "objects" &&
    parts[2] &&
    parts[3] === "daily" &&
    method === "GET"
  ) {
    const obj = await db.metaAdObject.findUnique({ where: { id: parts[2] } });
    demand(obj, "Anuncio no disponible.", 404);
    const a = await access(actor, obj.accountId);
    const { localDay } = await import("./analytics");
    const { dailyRange } = await import("./daily-range");
    const today = localDay(a.timezone);
    const rows = await db.metaAdDaily.findMany({
      where: {
        objectId: obj.id,
        accountId: a.id,
        scope: "7d_click,1d_view|impression",
        day: dailyRange(req.nextUrl.searchParams, today),
      },
      select: {
        day: true,
        spend: true,
        impressions: true,
        clicks: true,
        actions: true,
      },
      orderBy: { day: "asc" },
      take: 10001,
    });
    demand(
      rows.length <= 10000,
      "Hay demasiados días guardados. Acota el periodo en el calendario.",
    );
    return send(rows);
  }
  if (path === "objects" && method === "GET") {
    const allowed = await db.metaAdAccount.findMany({
      where: accountWhere(actor),
      select: { id: true, selectionSince: true, syncState: true },
    });
    const ids = (req.nextUrl.searchParams.get("accounts") ?? "")
      .split(",")
      .filter(Boolean);
    demand(
      ids.every((id) => allowed.some((a) => a.id === id)),
      "Cuenta no autorizada.",
      404,
    );
    return send(
      await db.metaAdObject.findMany({
        where: {
          accountId: { in: ids.length ? ids : allowed.map((a) => a.id) },
          level: { in: ["campaign", "adset"] },
          AND: [
            {
              OR: allowed
                .filter((a) => !ids.length || ids.includes(a.id))
                .map((a) => {
                  const started =
                    (a.syncState as { plan?: string; started?: string })
                      .plan === "focus"
                      ? (a.syncState as { started?: string }).started
                      : undefined;
                  const cutoff =
                    a.selectionSince ?? (started ? new Date(started) : null);
                  return {
                    accountId: a.id,
                    ...(cutoff ? { selectedAt: { gte: cutoff } } : {}),
                  };
                }),
            },
          ],
        },
        select: {
          id: true,
          name: true,
          accountId: true,
          campaignId: true,
          level: true,
        },
        orderBy: { name: "asc" },
        take: 10000,
      }),
    );
  }
  if (path === "directory" && method === "GET") {
    ownerOnly(actor);
    return send(
      await db.user.findMany({
        where: { status: "APPROVED" },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
    );
  }
  return send({ error: "Operación Meta Ads no disponible." }, 404);
}
