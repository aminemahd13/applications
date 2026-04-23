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
  const path = `/api/v1/credentials/qr/${encodeURIComponent(token)}`;
  const location = req.nextUrl.search ? `${path}${req.nextUrl.search}` : path;
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: location,
    },
  });
}
