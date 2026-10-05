# Running LendMatch in-house (internal use only)

Use this guide instead of `DEPLOY.md` when the tool must be available to your staff only. Nothing here uses Vercel, Netlify or any hosted database: it runs on a server you control, with one command.

## What "in-house" means in this setup

- The app and its database run as two containers on **your own server** (docker compose).
- **Nothing is published to the internet.** The app listens on the server's own address (`127.0.0.1`) unless you choose otherwise, and the database has no network port at all: only the app container can reach it.
- **An access code is mandatory.** The app refuses to start without `LENDMATCH_ACCESS_CODE`, so you cannot deploy it open by accident.
- You decide who can reach it: SSH tunnel, company network/VPN, or an SSO gateway (step 7).

## What still leaves your network

| What | Goes to | When | How to keep it in-house |
|---|---|---|---|
| The borrower description typed in the chat (SSN, bank-account and ID patterns are redacted before anything is stored or sent) | Anthropic API | Only if `ANTHROPIC_API_KEY` is set | Leave the key unset: the app runs in **offline mode** (simple pattern matching and verified templates), and nothing about borrowers leaves your network. For Claude inside your own cloud account (for example through your cloud provider's private endpoint), a small code change is needed; it is not built. |
| Lender website addresses, plus generic search phrases such as "equipment financing fair credit" (no names, amounts or locations) | Firecrawl (cloud service) | Research, `cache:warm` | Borrower details are never sent. Set `LENDMATCH_DISCOVERY=off` to send no profile-derived phrases at all. The Firecrawl software can be self-hosted so scraping also stays on your network; that is not wired up here. |
| Chats (redacted), profiles, research reports | Your PostgreSQL volume on your server | Always | Back it up (below) and decide a retention policy. |

Check your own agreements with Anthropic and Firecrawl for how they handle data; this guide does not describe their terms.

## Setup (Linux server with Docker)

You need a Linux machine (a small virtual machine is enough to start) with **Docker Engine and the Compose plugin** installed (docs.docker.com/engine/install), and the code on it.

1. **Get the code on the server.** `git clone <your repository URL> lendmatch && cd lendmatch` (check out the branch that contains LendMatch).
2. **Create the settings file.**
   ```bash
   cp docker/internal.env.example .env
   chmod 600 .env
   ```
   Open `.env` and fill in `POSTGRES_PASSWORD` (letters and digits only) and `LENDMATCH_ACCESS_CODE` (a long passphrase). Add the API keys you want to use (see the table above). Leave `LENDMATCH_BIND=127.0.0.1` for now.
3. **Build and start.** `docker compose up -d --build`. The first build takes several minutes. The database tables are created automatically on start.
4. **Load data.** Either free starter data (real lender pages read on 2026-10-05, expiring 2026-10-12):
   `docker compose exec app npm run cache:import`
   or fresh data from the web (uses Firecrawl credits, about 830 for all 25 lenders):
   `docker compose exec app npm run cache:warm`
5. **Check it.** `docker compose ps` should show both services `healthy`. From your own computer, open a tunnel and the site:
   ```bash
   ssh -L 3000:127.0.0.1:3000 you@the-server     # leave running
   # then open http://localhost:3000 in your browser: any username, password = LENDMATCH_ACCESS_CODE
   ```
6. **Try it.** Paste this example ("I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. I want an $80,000 loan to expand into a second location, ideally repaid over 5 years."), then press **Confirm & research**, export a PDF, press **Delete my data**.
7. **Let staff in.** Pick one:
   - **SSH tunnel** (step 5): good for a handful of people, no network changes.
   - **Company network / VPN, plain address:** set `LENDMATCH_BIND` to the server's internal IP (for example `10.0.0.12`) and `docker compose up -d`. The site is then reachable only from networks that can route to that address. This is unencrypted HTTP, so prefer the next option.
   - **Reverse proxy with HTTPS on an internal name** (recommended): keep `LENDMATCH_BIND=127.0.0.1` and put a proxy in front. With Caddy:
     ```
     lendmatch.corp.example {
         tls internal                      # or your company certificate
         reverse_proxy 127.0.0.1:3000 {
             flush_interval -1             # research streams progress; do not buffer it
         }
     }
     ```
     With nginx, use `proxy_buffering off;` and `proxy_read_timeout 600s;` for the same reason.
   - **Single sign-on:** put the site behind your SSO gateway (for example oauth2-proxy, Azure AD Application Proxy, Cloudflare Access). The access code stays as a second lock. The app itself does not record who signed in (see "Limits").
8. **Firewall.** Allow the chosen port only from the staff network. Never open the database port; the stack does not publish it.

## Running it

| Task | Command |
|---|---|
| Update to a new version | `git pull && docker compose up -d --build` (database changes apply automatically) |
| Logs | `docker compose logs -f app` |
| Refresh lender data weekly | cron: `0 6 * * 1  cd /opt/lendmatch && docker compose exec -T app npm run cache:warm` |
| Back up the database | `docker compose exec -T db pg_dump -U lendmatch lendmatch \| gzip > lendmatch-$(date +%F).sql.gz` (schedule it daily, copy it off the server) |
| Restore into an empty database | `gunzip -c lendmatch-DATE.sql.gz \| docker compose exec -T db psql -U lendmatch lendmatch` |
| Change the access code | edit `.env`, then `docker compose up -d` |
| Install security updates to the image | `docker compose build --pull && docker compose up -d` |
| Stop (data kept) | `docker compose down` |
| **Delete everything including the database** | `docker compose down -v` |

Cached lender data expires after 7 days; run the weekly refresh so research does not have to read lenders live while someone waits.

## Security checklist

- Long access code; HTTPS (proxy) on any shared network; firewall limited to the staff network.
- `.env` readable only by the account that runs docker (`chmod 600`), never committed.
- Keep Anthropic and Firecrawl spending limits on, even internally.
- The rate limiter keeps its counts in memory, which is correct for this single-server setup (it would not be on several servers).
- Rebuild regularly with `--pull` to pick up operating-system and Node security fixes.

## Limits you should know about

- **No individual user accounts.** Everyone shares the access code, and each browser gets an anonymous session. There is no record of which employee ran what. If you need that for audit, the next step is to read the signed-in user from your SSO gateway and store it; ask for it.
- **No automatic retention.** Chats and reports stay until the person presses "Delete my data" or you delete the database volume. If policy needs automatic expiry, ask for a purge job.
- **The advice is informational.** Rankings rest on lender web pages the tool can read; many show "Not published" for rates. Treat it as research support, not a decision engine.

## What was tested, and what was not

Tested here, with the real Docker image: the image builds; `docker compose up` starts both services healthy; the database tables are created automatically on first start; the app is reachable only on `127.0.0.1` and the database publishes no port; the site answers 401 without the access code and 200 with it; `/api/health` answers without a password (it reveals only ok or not); a real browser session returns 10 results with PDF and DOCX export and "Delete my data"; data survives `docker compose down` and `up`; the container refuses to start without an access code.

Not tested: the default slim base image's package-install step (this environment blocks the Debian mirrors; the build here used the full Node image, which does not need it and which you can select with `BASE_IMAGE` too), HTTPS proxies, SSO gateways, backup restore on a real server, and first-build time on your hardware. Expect to adjust small things on first deployment.
