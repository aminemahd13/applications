import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { token } = await context.params;
  const target = new URL(
    `/api/v1/credentials/qr/${encodeURIComponent(token)}`,
    req.url,
  );
  target.search = req.nextUrl.search;
  return NextResponse.redirect(target);
}
