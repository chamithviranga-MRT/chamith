# Deploying LendMatch

> **Internal use only?** Do not use this guide. It puts the tool on the public internet. Follow [`INTERNAL.md`](INTERNAL.md) instead: your own server, access code required, nothing published.

Two ways to put LendMatch online. Pick one:

| | **A. Share the demo** | **B. Run the full app** |
|---|---|---|
| What people get | The real UI on a frozen snapshot of real lender data | Live research, Claude extraction and reasoning, your own cache |
| Needs | A static host (free) | Vercel + Neon Postgres + Anthropic key + Firecrawl key |
| Time | ~5 minutes | ~45 minutes the first time |
| Ongoing cost | None | Hosting + API usage (see "What it costs") |
| Risk | None: no keys, no database, no user data leaves the browser | Public site that spends your API credits: read "Before you open it to the public" |

Start with A to show people something today; do B when you want it live.

---

## A. Share the demo (one HTML file)

`docs/lendmatch-demo.html` is a complete, self-contained copy of the platform (about 2 MB). It needs no server.

1. Get the file: on GitHub open `docs/lendmatch-demo.html` and download it (or use the copy you were sent).
2. Put it alone in a new folder and rename it **`index.html`**.
3. Publish the folder with any static host. The easiest:
   - **Netlify Drop**: sign in at app.netlify.com, open *Drop*, drag the folder onto the page. You get a `https://<name>.netlify.app` link in seconds.
   - **GitHub Pages**: *Settings, Pages*, deploy from a branch and the folder holding the file (a private repo needs a paid GitHub plan for this).
   - **Cloudflare Pages**: *Workers & Pages, Create, Pages, Upload assets*.
4. Open the link and paste this example: "I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. I want an $80,000 loan to expand into a second location, ideally repaid over 5 years."

Things to know:
- The banner at the top shows how old the data snapshot is. After 7 days it says the data is older than the 7-day limit and should be treated as illustrative. That is deliberate.
- Anyone with the link can open it. It contains only public lender information and stores nothing.
- To refresh it with new data, run the research in the full app, then `npm run build && npm run demo:snapshot && npm run demo:build` and re-upload `docs/lendmatch-demo.html`.

---

## B. Run the full app (Vercel + Neon)

Why this combination: Next.js runs best on Vercel; Neon is a free managed Postgres. Both have free tiers. Any host that runs Node 20+ and Postgres also works (see the end).

### 0. Before you start
- A **GitHub** account with this repository (you have it).
- Accounts, all free to open: **Vercel**, **Neon**, **Anthropic Console** (console.anthropic.com), **Firecrawl**.
- A computer with **Node 20+** and **git** (only for steps 2 and 3).

### 1. Get the code onto `main`
LendMatch currently lives on the PR branch. `main` holds an unrelated page (`index.html`, "IRONROOT ATHLETIC") that Vercel ignores for a Next.js app.
1. Open pull request #8 on GitHub. Press **Ready for review**, then **Merge pull request**.
2. Every later push to `main` redeploys automatically.

### 2. Create the database (Neon)
1. neon.com: **Create project**. Pick the region closest to your users (for US users, AWS us-east-1 / N. Virginia).
2. On the project page open **Connect**. You need **two** connection strings:
   - **Pooled** (turn *Connection pooling* ON): the host contains `-pooler`. The app uses this one.
   - **Direct** (turn it OFF): used once, to create the tables.
3. Save both. Add these to the pooled string (keep what Neon already put after `?`):
   `&pgbouncer=true&connect_timeout=15`
   Result, for example:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15`

Why two: Prisma's migrations cannot run through the pooler, but a serverless app needs the pooler so it does not run out of database connections.

### 3. Create the tables and load starter data (your computer)
```bash
git clone https://github.com/<you>/<repo>.git && cd <repo>
npm ci

# create the tables (use the DIRECT string)
DATABASE_URL="<direct string>" npx prisma migrate deploy
#   expect: "2 migrations found ... All migrations have been successfully applied."

# starter data, so your first test costs nothing (use the DIRECT string)
DATABASE_URL="<direct string>" npm run cache:import
#   expect: "Imported 18 lenders and 53 products ... They expire 2026-10-12."
```
The starter data is real lender data read on 2026-10-05 and, like all cached data, expires after 7 days. After that the app treats it as expired and a research run re-reads those lenders live, which costs credits and time. Fill the cache with fresh data using step 7.

### 4. Get your API keys
- **Anthropic**: Console, *API keys*, create one. Then *Limits*, set a **monthly spend limit** before you do anything else.
- **Firecrawl**: dashboard, copy the API key. See "What it costs" for the plan size.

Without an Anthropic key the app still runs, in a reduced "offline extraction" mode.

### 5. Deploy on Vercel
1. vercel.com: **Add New, Project**, import the GitHub repository.
2. Framework preset: **Next.js** (detected automatically). Leave build settings as they are. Node 20+ is the default.
3. Add **Environment Variables**:

| Name | Value |
|---|---|
| `DATABASE_URL` | the **pooled** string from step 2 |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `FIRECRAWL_API_KEY` | your Firecrawl key |
| `LENDMATCH_ACCESS_CODE` | a password you choose; the whole site asks for it (**keep this on until you have read the checklist below**) |
| `LENDMATCH_MAX_LENDERS` | optional, default 40; lower it to cap research time and cost |
| `LENDMATCH_DISCOVERY` | optional; `off` stops the app looking for lenders beyond the 25 in the registry (saves credits) |

4. **Deploy**. Then *Settings, Functions*: set the **Function Region** to the one nearest your Neon region (for us-east-1, `iad1`) and redeploy.

### 6. Check it works
Open the Vercel URL. Your browser asks for a username and password: any username, password = `LENDMATCH_ACCESS_CODE`. Then:
1. Paste this example ("I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. I want an $80,000 loan to expand into a second location, ideally repaid over 5 years."), then press **Confirm & research**: you should see 10 results.
2. Press **Export PDF** and **Export DOCX**.
3. Press **Delete my data**.
4. In Vercel, *Logs*: look for errors.

### 7. Keep the lender data fresh
Cached lender data expires after 7 days. When it has expired, the next research run re-reads every lender it needs inside that one request. With many lenders this can approach the function time limit (300 seconds). So warm the cache on a schedule instead, from your computer:
```bash
DATABASE_URL="<direct string>" FIRECRAWL_API_KEY="<key>" npm run cache:warm
```
It reads the registry lenders, spends credits only for lenders that are not already cached, and prints what it did. Run it weekly. (It can also be scheduled with a GitHub Action or a cron job; ask and it can be added.)

### 8. Updating later
- Code changes: merge to `main`; Vercel deploys it.
- Database changes (a new file in `prisma/migrations`): run `DATABASE_URL="<direct string>" npx prisma migrate deploy` **before** merging.
- To change a setting: Vercel, *Settings, Environment Variables*, then redeploy.

---

## What it costs

- **Neon**: free tier is enough to start.
- **Vercel**: the free Hobby plan is meant for personal, non-commercial use; a business should use Pro. Check their current terms and pricing.
- **Anthropic**: pay per use. Set the spend limit, then measure the real cost per research run in the Console after a few test runs.
- **Firecrawl**: the main fixed cost. Reading one lender costs roughly 30 credits; the full 25-lender registry is about 830 credits per refresh. Cost scales with the **number of lenders and how often you refresh them**, not with the number of users, because every user shares the same cache. Pick a plan that covers one full refresh per week, plus headroom.

## Before you open it to the public

The site calls paid APIs on every research run, so a public link can be used to spend your money.
1. Keep `LENDMATCH_ACCESS_CODE` on while you pilot. It protects the pages and every `/api` route.
2. Keep the spend limits on Anthropic and Firecrawl.
3. The built-in rate limiter lives in each server instance's memory. On a serverless host it is **not** a real limit. Before removing the access code, add a shared one (for example a Redis-backed limiter).
4. Legal and compliance: the app is informational only and says so. Before launch, have someone review lenders' site terms, your privacy notice (the app stores the chat text with sensitive numbers redacted, and offers delete), and whether your use needs financial-services disclosures.
5. Add a custom domain in Vercel, *Settings, Domains*.

## Troubleshooting

| You see | Likely cause and fix |
|---|---|
| Banner "Could not reach the server" | `DATABASE_URL` is wrong, or you used the direct string in Vercel. Use the pooled one. Neon's free tier sleeps when idle: reload once. |
| `P1001` or a timeout in step 3 | You used the pooled string for the migration. Use the direct one. |
| "prepared statement ... already exists" | The pooled string is missing `&pgbouncer=true`. |
| Research stops after ~300 s | Too many lenders to read in one request: run `npm run cache:warm`, lower `LENDMATCH_MAX_LENDERS`, or move to Vercel Pro (limit 800 s). |
| "The cached lender data has expired" | Run `npm run cache:warm`. |
| Everything returns 401 | Wrong access code. |
| PDF export fails | The PDF fonts are included in the build by `next.config.ts` (`outputFileTracingIncludes`). If you changed that file, restore it. |

## Using another host (Railway, Render, Fly.io)

A host that runs a long-lived Node process avoids the function time limits. Create a Postgres database there, set the same environment variables, build with `npm ci && npm run build`, start with `npm start`, and run `npx prisma migrate deploy` once against the database. Not tested here.

## What was tested and what was not

Tested: a full rehearsal on an empty database, the same sequence as above (migrate, import, production build behind the access code, a real browser session with 10 results, PDF and DOCX export, delete my data). Not tested: Vercel and Neon themselves (no access to your accounts from here). The function time limits and the Neon pooling advice come from the vendors' documentation as summarised by a web search; screen labels may have changed.
