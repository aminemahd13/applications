import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const target = new URL("/api/v1/credentials/assets", req.url);
  target.search = req.nextUrl.search;
  return NextResponse.redirect(target);
}
