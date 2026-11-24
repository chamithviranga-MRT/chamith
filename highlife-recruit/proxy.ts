import { NextResponse, type NextRequest } from "next/server";

// Optional site-wide gate. Set ACCESS_CODE in Vercel.
// Ways in:
// 1. Team link: open any page with ?team=<ACCESS_CODE> (or /join/<ACCESS_CODE>). The page loads straight away
//    and a 90-day cookie is set on that same response, so it also works in chat-app browsers that drop redirects.
// 2. Anyone else sees a simple "enter the team code" page. There is no browser username/password prompt.
const COOKIE = "hl_team";
const MAX_AGE = 60 * 60 * 24 * 90;

async function token(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`highlife-team:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function withCookie(res: NextResponse, value: string) {
  res.cookies.set(COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE });
  return res;
}

function codePage(wrong: boolean) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Highlife Talent</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f9;color:#14181f;padding:16px;box-sizing:border-box}
form{background:#fff;border:1px solid #e3e6ea;border-radius:14px;padding:28px;max-width:360px;width:100%;box-sizing:border-box;box-shadow:0 4px 20px rgba(0,0,0,.05)}
h1{font-size:20px;margin:0 0 6px}p{margin:0 0 18px;color:#5b6472;font-size:14px;line-height:1.45}
input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #cfd4da;border-radius:10px;margin-bottom:12px}
button{width:100%;font-size:16px;padding:12px;border:0;border-radius:10px;background:#1f5eff;color:#fff;font-weight:600;cursor:pointer}
.err{color:#b42318;font-size:14px;margin:-4px 0 12px}
@media (prefers-color-scheme:dark){body{background:#0f1217;color:#e8ebf0}form{background:#171b22;border-color:#2a303a}p{color:#9aa3b0}input{background:#0f1217;color:#e8ebf0;border-color:#2a303a}}
</style></head><body><form method="get" action="/">
<h1>Highlife Talent</h1><p>Enter the team code Chamith shared with you. You only need to do this once on each device.</p>
${wrong ? '<div class="err">That code did not match. Check it and try again.</div>' : ""}
<input name="team" placeholder="Team code" autocomplete="off" autocapitalize="off" spellcheck="false" required autofocus>
<button type="submit">Open the platform</button></form></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function proxy(req: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();
  const expected = await token(code);
  const path = req.nextUrl.pathname;

  // /join/<code>: a link with no query string, for chat apps that mangle "?".
  if (path.startsWith("/join/")) {
    const given = decodeURIComponent(path.slice("/join/".length)).trim();
    if (given === code) return withCookie(NextResponse.redirect(new URL("/", req.url)), expected);
    return codePage(true);
  }

  const fromLink = req.nextUrl.searchParams.get("team");
  if (fromLink !== null) {
    // Serve the page directly (no redirect) so the cookie survives in-app browsers.
    if (fromLink.trim() === code) return withCookie(NextResponse.next(), expected);
    if (req.cookies.get(COOKIE)?.value !== expected) return codePage(true);
  }

  if (req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  // Still accept an Authorization header for scripts, but never ask for one.
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === code) return NextResponse.next();
  }

  if (path.startsWith("/api/")) return NextResponse.json({ error: "Team code required. Open the team link again." }, { status: 401 });
  return codePage(false);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/status).*)"] };
