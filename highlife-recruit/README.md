# Highlife Talent

A demo-ready recruitment platform for Highlife's Sri Lanka hiring. It automates the workflow the team was running by hand:

1. **Intake** – paste a job description; Claude turns it into a weighted scorecard with the salary cap and must-haves.
2. **Sourcing** – Exa searches public profiles (LinkedIn and career sites) for Sri Lankan candidates.
3. **Scoring and dedupe** – each new profile is scored 1–5 per criterion with evidence, red flags, an Open to Work flag and a likely-over-cap flag. Anyone already in the tracker is skipped.
4. **Shortlist review** – top matches wait on a pipeline board for one-click approve or reject.
5. **Outreach drafts** – Claude drafts a LinkedIn note and an email. A person copies the note into LinkedIn and sends the email from Gmail. Nothing is sent automatically.
7. **Reporting** – funnel per role, score spread and CSV export.

The app opens seeded with the 45 researched profiles and both scorecards from `Highlife_SriLanka_Shortlist.xlsx` (Business Lending Research & Outreach Specialist and Director, Online Reputation Management).

## Running modes

| Environment variable | Without it | With it |
| --- | --- | --- |
| `EXA_API_KEY` | Sourcing shows a snapshot of real Exa results captured on 24 Nov 2026 | Live Exa people search |
| Claude via Vercel AI Gateway | Rule-based demo scoring and template outreach; JD intake disabled | Claude (`anthropic/claude-opus-5.5`) scoring with reasons, outreach drafts and JD-to-scorecard |
| `ACCESS_CODE` | Site is open to anyone with the link | Browser password prompt (any username, this password) |

Set them in Vercel under Project → Settings → Environment Variables, then redeploy. Never commit keys.

### Claude through Vercel AI Gateway

On Vercel, Claude calls go through AI Gateway using the deployment's own OIDC token, so no API key is stored. Billing is through the Vercel team's AI Gateway credits (Vercel dashboard → AI Gateway). For local dev, run `npx vercel@latest ai-gateway setup` or `vercel env pull` to get a token, or set `AI_GATEWAY_API_KEY`. `ANTHROPIC_API_KEY` still works as a direct fallback when no gateway credential is present. If a Claude call fails, scoring and outreach fall back to the rule-based scorer and template so a demo never breaks.

## Data and guardrails

- Public profile data only. There is no automated LinkedIn scraping or messaging, and no LinkedIn credentials are stored anywhere, because both break LinkedIn's terms and put the account at risk.
- Pipeline state (stages, notes, drafts) is saved in each viewer's browser for the demo. For a shared team tracker, the next step is a database (for example Vercel Postgres or Google Sheets as the store).
- Candidate data stays in Highlife-controlled accounts, in line with Sri Lanka's PDPA.

## Local development

```bash
npm install
cp .env.example .env.local   # optional keys
npm run dev
```

Vercel project root directory: `highlife-recruit`.
