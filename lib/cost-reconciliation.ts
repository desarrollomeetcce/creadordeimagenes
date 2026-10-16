import { z } from "zod";
import { db } from "./db";
import { demand } from "./errors";
import { recordActivity } from "./activity";
import { parseUsdMicros } from "./usage-format";
const micros = z
  .string()
  .regex(/^\d{1,19}$/)
  .nullable();
const schema = z
  .object({
    amountUsd: z.string().max(16),
    reference: z
      .string()
      .trim()
      .min(3)
      .max(120)
      .refine(
        (v) => !/\b(?:sk-|AIza)[A-Za-z0-9_-]{12,}/.test(v),
        "La referencia no puede contener una clave API.",
      ),
    confirmed: z.literal(true),
    expectedActualMicros: micros,
    expectedConfirmationId: z.string().min(1).max(100).nullable(),
  })
  .strict();
export async function reconcileCost(
  actor: { id: string; role: string },
  id: string,
  input: unknown,
) {
  demand(
    actor.role === "OWNER",
    "Solo OWNER puede registrar costes comprobados.",
    403,
  );
  const b = schema.parse(input);
  const amount = parseUsdMicros(b.amountUsd);
  demand(
    amount !== null,
    "Introduce un importe en USD sin separador de miles y con hasta seis decimales. Cero solo si lo comprobaste en el proveedor.",
  );
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(728291)`;
      const account = await tx.user.findUnique({
        where: { id: actor.id },
        select: { role: true, status: true },
      });
      demand(
        account?.role === "OWNER" && account.status === "APPROVED",
        "Tu cuenta ya no tiene autorización OWNER.",
        403,
      );
      const row = await tx.usageLedger.findUnique({ where: { id } });
      demand(row, "Operación de consumo no encontrada.", 404);
      const job = await tx.generationJob.findUnique({
        where: { id: row.jobId },
        select: { status: true },
      });
      demand(
        job &&
          !["PENDING", "RUNNING"].includes(job.status) &&
          ["CONSUMED_ESTIMATE", "UNCERTAIN", "RELEASED"].includes(row.status),
        "Espera a que termine el trabajo antes de registrar su coste.",
        409,
      );
      const previous = await tx.auditEvent.findFirst({
        where: { action: "COSTE_IA_CONCILIADO", resourceId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
      demand(
        (row.actualMicros === null ? null : String(row.actualMicros)) ===
          b.expectedActualMicros &&
          (previous?.id ?? null) === b.expectedConfirmationId,
        "El coste cambió en otra sesión. Actualiza el informe antes de guardar.",
        409,
      );
      await tx.usageLedger.update({
        where: { id },
        data: { actualMicros: amount },
      });
      const confirmation = await recordActivity(tx, {
        data: {
          actorId: actor.id,
          action: "COSTE_IA_CONCILIADO",
          resourceId: id,
          detail: {
            previousActualMicros:
              row.actualMicros === null
                ? "No informado"
                : String(row.actualMicros),
            actualMicros: String(amount),
            reference: b.reference,
            jobIds: [row.jobId],
          },
        },
      });
      return { actualMicros: String(amount), confirmationId: confirmation.id };
    },
    { timeout: 20000 },
  );
}
