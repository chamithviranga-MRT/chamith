import { NextResponse, type NextRequest } from "next/server";

// Optional site-wide gate. Set ACCESS_CODE in Vercel.
// Ways in:
// 1. Team link: open any page with ?team=<ACCESS_CODE> once. A 90-day cookie is set and the code is removed from the URL.
// 2. Browser password prompt: any username, ACCESS_CODE as the password.
const COOKIE = "hl_team";

async function token(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`highlife-team:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();
  const expected = await token(code);

  const fromLink = req.nextUrl.searchParams.get("team");
  if (fromLink !== null) {
    if (fromLink === code) {
      const clean = req.nextUrl.clone();
      clean.searchParams.delete("team");
      const res = NextResponse.redirect(clean);
      res.cookies.set(COOKIE, expected, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
      return res;
    }
  }

  if (req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const pass = decoded.slice(decoded.indexOf(":") + 1);
    if (pass === code) return NextResponse.next();
  }
  return new NextResponse("Access code required. Ask Chamith for the team link.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Highlife Talent"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/status).*)"] };
