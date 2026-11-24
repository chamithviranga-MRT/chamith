import { NextResponse, type NextRequest } from "next/server";

// Optional site-wide password. Set ACCESS_CODE in Vercel; any username works.
export function proxy(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === code) return NextResponse.next();
  }
  return new NextResponse("Access code required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Highlife Talent"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/status).*)"] };
