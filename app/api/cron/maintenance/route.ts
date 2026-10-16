import { NextRequest, NextResponse } from "next/server";
import { equalSecret } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { cronConfigured, runMaintenance } from "@/lib/maintenance";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const send = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!cronConfigured())
    return send(
      {
        error:
          "La limpieza programada todavía no tiene una clave de autorización configurada.",
      },
      503,
    );
  if (
    !equalSecret(
      req.headers.get("authorization") ?? "",
      "Bearer " + process.env.CRON_SECRET,
    )
  )
    return send({ error: "Programador no autorizado." }, 401);
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production")
    return send(
      { error: "La limpieza programada solo se ejecuta en producción." },
      403,
    );
  try {
    return send(await runMaintenance("CRON"));
  } catch (error) {
    return send(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo ejecutar el mantenimiento.",
      },
      error instanceof AppError ? error.status : 503,
    );
  }
}
