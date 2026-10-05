import { NextResponse, type NextRequest } from "next/server";
import { checkBasicAuth } from "@/lib/access";

/** Protects the whole site (pages and /api) when LENDMATCH_ACCESS_CODE is set; a no-op otherwise. */
export function middleware(req: NextRequest) {
  if (checkBasicAuth(req.headers.get("authorization"), process.env.LENDMATCH_ACCESS_CODE)) return NextResponse.next();
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LendMatch", charset="UTF-8"', "cache-control": "no-store" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
