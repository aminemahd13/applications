import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<Response> {
  const path = "/api/v1/credentials/assets";
  const location = req.nextUrl.search ? `${path}${req.nextUrl.search}` : path;
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: location,
    },
  });
}
