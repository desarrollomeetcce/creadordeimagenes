import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { linkedGeneratorUser } from "@/lib/pulpo-sso";
import { confirmPendingSale, createPendingSale, pendingSales } from "@/lib/meta-ads/pending-sales";

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const schema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  exp: z.number().int(),
  action: z.enum(["list", "create", "confirm"]),
  month: z.string().max(7).optional(),
  table: z.string().max(100).optional(),
  data: z.unknown().optional(),
}).strict();

export async function POST(request: Request) {
  const key = process.env.PULPO_GENERATOR_SSO_KEY;
  const token = request.headers.get("authorization") ?? "";
  const grant = token.length <= 4000 && /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  const denied = () => json({ error: "No se pudo verificar el acceso a Ventas." }, 403);
  if (!grant || !key || !/^[a-f\d]{64}$/i.test(key)) return denied();
  const signature = createHmac("sha256", Buffer.from(key, "hex"))
    .update("pulpo-pending-sales:v1:" + grant[1]).digest("base64url");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(grant[2]))) return denied();
  try {
    const input = schema.parse(JSON.parse(Buffer.from(grant[1], "base64url").toString()));
    const now = Math.floor(Date.now() / 1000);
    if (input.exp <= now || input.exp > now + 35) return denied();
    const linked = linkedGeneratorUser(process.env.PULPO_GENERATOR_LINKS || "", input);
    const user = await db.user.findFirst({
      where: {
        status: "APPROVED",
        archivedAt: null,
        email: { equals: input.email, mode: "insensitive" },
        OR: [
          { pulpoUserId: input.sub },
          ...(linked ? [{ id: linked, pulpoUserId: null }] : []),
        ],
      },
      select: { id: true, role: true },
    });
    if (!user) return denied();
    if (input.action === "create") return json(await createPendingSale(user, input.data), 201);
    if (input.action === "confirm") return json(await confirmPendingSale(user, input.data));
    const filters = new URLSearchParams();
    if (input.month) filters.set("month", input.month);
    if (input.table) filters.set("table", input.table);
    return json(await pendingSales(user, filters));
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json({ error: "Revisa los datos de la venta." }, 400);
    return json({ error: "No se pudo completar la operación en Ventas." }, 500);
  }
}
