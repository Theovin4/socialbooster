import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const app = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  return NextResponse.redirect(`${app}/dashboard/wallet?payment=unavailable`);
}
