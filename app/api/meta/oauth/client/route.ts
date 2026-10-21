import { NextResponse } from "next/server";
import { oauthClientMetadata } from "@/lib/meta-ads/oauth-policy";
export const dynamic = "force-dynamic";
// Public client metadata, deliberately contains no credentials or user data.
export function GET() {
  if (!process.env.APP_ORIGIN)
    return NextResponse.json({ error: "Falta APP_ORIGIN." }, { status: 503 });
  return NextResponse.json(oauthClientMetadata(process.env.APP_ORIGIN), {
    headers: { "Cache-Control": "no-store" },
  });
}
