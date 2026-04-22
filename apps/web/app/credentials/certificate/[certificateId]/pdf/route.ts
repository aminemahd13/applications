import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    certificateId: string;
  }>;
};

export async function GET(
  req: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const { certificateId } = await context.params;
  const target = new URL(
    `/api/v1/credentials/certificate/${encodeURIComponent(certificateId)}/pdf`,
    req.url,
  );
  target.search = req.nextUrl.search;
  return NextResponse.redirect(target);
}
