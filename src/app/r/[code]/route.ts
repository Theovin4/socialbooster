import { NextResponse } from "next/server";
import { normalizeReferralCode } from "@/lib/acquisition";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: input } = await params;
  const code = normalizeReferralCode(input);
  const destination = new URL("/register", process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin);
  if (code) destination.searchParams.set("ref", code);
  return NextResponse.redirect(destination, 302);
}
