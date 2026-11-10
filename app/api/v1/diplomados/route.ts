import { diplomaAPI } from "@/lib/diploma-api";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return diplomaAPI(req);
}
