"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { Candidate, Role, SourcedProfile, Stage } from "@/lib/types";
import { FUNNEL, STAGES, normaliseLinkedIn, weightedScore } from "@/lib/types";

type Tab = "overview" | "roles" | "sourcing" | "pipeline" | "outreach" | "reports";
type Store = ReturnType<typeof useStore>;
interface Status { exa: boolean; claude: boolean; model: string }

const TABS: { id: Tab; label: string; step: string }[] = [
  { id: "overview", label: "Overview", step: "" },
  { id: "roles", label: "Roles & scorecards", step: "1" },
  { id: "sourcing", label: "Sourcing", step: "2–3" },
  { id: "pipeline", label: "Shortlist & pipeline", step: "4" },
  { id: "outreach", label: "Outreach drafts", step: "5" },
  { id: "reports", label: "Reports", step: "7" },
];

const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function shortRole(r?: Role) {
  if (!r) return "";
  if (r.id === "lending") return "Lending";
  if (r.id === "director") return "ORM Director";
  return r.title.split(/[ ,]+/).slice(0, 2).join(" ");
}

function scoreClass(n: number) {
  return n >= 80 ? "score hi" : n >= 65 ? "score mid" : "score lo";
}

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<Status | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);

  const open = store.state.candidates.find((c) => c.id === openId) ?? null;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">H</div>
          <div>
            <div className="brand-name">Highlife Talent</div>
            <div className="brand-sub">Sri Lanka hiring engine</div>
          </div>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "nav active" : "nav"} onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); window.scrollTo({ top: 0 }); }}>
              {t.step && <span className="step">{t.step}</span>}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <StatusPill label="Exa sourcing" on={status?.exa} />
          <StatusPill label="Claude scoring" on={status?.claude} />
          <button className="link" onClick={() => confirmReset(store)}>Reset demo data</button>
        </div>
      </aside>

      <main className="main">
        {tab === "overview" && <Overview store={store} go={setTab} open={setOpenId} />}
        {tab === "roles" && <Roles store={store} status={status} />}
        {tab === "sourcing" && <Sourcing store={store} status={status} open={setOpenId} />}
        {tab === "pipeline" && <Pipeline store={store} open={setOpenId} />}
        {tab === "outreach" && <Outreach store={store} open={setOpenId} />}
        {tab === "reports" && <Reports store={store} />}
      </main>

      {open && <Drawer c={open} store={store} close={() => setOpenId(null)} goOutreach={() => { setOpenId(null); setTab("outreach"); }} />}
    </div>
  );
}

function confirmReset(store: Store) {
  if (window.confirm("Reset all demo data back to the original 45 researched profiles?")) store.reset();
}

function StatusPill({ label, on }: { label: string; on?: boolean }) {
  return (
    <div className="pill-row">
      <span className={on ? "dot on" : "dot"} />
      <span>{label}</span>
      <span className="muted">{on === undefined ? "…" : on ? "Live" : "Demo"}</span>
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="head-actions">{children}</div>
    </header>
  );
}

function RolePicker({ roles, value, onChange, all }: { roles: Role[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {all && <option value="all">All roles</option>}
      {roles.map((r) => (
        <option key={r.id} value={r.id}>{r.title}</option>
      ))}
    </select>
  );
}

function Flags({ c }: { c: Candidate }) {
  return (
    <span className="flags">
      {c.openToWork && <span className="tag green">Open to Work</span>}
      {c.overCap && <span className="tag red">Likely over cap</span>}
    </span>
  );
}

/* ---------------- Overview ---------------- */

const WORKFLOW = [
  { n: 1, t: "Intake", d: "JD becomes a weighted scorecard with the salary cap and must-haves.", tool: "Claude" },
  { n: 2, t: "Sourcing", d: "Search public LinkedIn and career sites for Sri Lankan profiles.", tool: "Exa" },
  { n: 3, t: "Scoring & dedupe", d: "Score each profile with evidence; flag Open to Work and over-cap; skip duplicates.", tool: "Claude" },
  { n: 4, t: "Shortlist review", d: "Top matches wait for your one-click approve or reject.", tool: "You" },
  { n: 5, t: "Outreach", d: "Personal LinkedIn note and email drafted; a person sends it.", tool: "Claude + you" },
  { n: 6, t: "Screening", d: "Replies get a booking link and a short screening form.", tool: "Calendar / Forms" },
  { n: 7, t: "Reporting", d: "Weekly funnel: sourced to offer, per role.", tool: "This app" },
];

function Overview({ store, go, open }: { store: Store; go: (t: Tab) => void; open: (id: string) => void }) {
  const { roles, candidates, activity } = store.state;
  const awaiting = candidates.filter((c) => c.stage === "shortlisted").sort((a, b) => b.score - a.score);
  return (
    <>
      <Header title="Recruitment overview" sub="Two live roles, sourced from public profiles in Sri Lanka. A person approves every outreach." />
      <section className="kpis">
        {roles.map((r) => {
          const list = candidates.filter((c) => c.roleId === r.id);
          return (
            <div className="card kpi-card" key={r.id}>
              <div className="kpi-role">{r.title}</div>
              <div className="muted small">Cap LKR {r.salaryCapLkr.toLocaleString()} / month · {r.hours}</div>
              <div className="kpi-grid">
                <Kpi n={list.filter((c) => c.stage !== "rejected").length} l="In tracker" />
                <Kpi n={list.filter((c) => c.stage === "shortlisted").length} l="Awaiting approval" />
                <Kpi n={list.filter((c) => ["approved", "contacted", "replied", "interview", "offer"].includes(c.stage)).length} l="In outreach" />
                <Kpi n={list.filter((c) => c.openToWork).length} l="Open to Work" />
              </div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>How the workflow runs</h2>
          <span className="muted small">Steps 1–5 and 7 are live in this demo</span>
        </div>
        <div className="flow">
          {WORKFLOW.map((w) => (
            <div className="flow-step" key={w.n}>
              <div className="flow-n">{w.n}</div>
              <div className="flow-t">{w.t}</div>
              <div className="flow-d">{w.d}</div>
              <div className="tag">{w.tool}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="two">
        <section className="card">
          <div className="card-head">
            <h2>Waiting for your decision</h2>
            <button className="btn ghost" onClick={() => go("pipeline")}>Open pipeline</button>
          </div>
          {awaiting.length === 0 && <p className="muted">Nothing waiting. Run a sourcing search to find more.</p>}
          <ul className="list">
            {awaiting.slice(0, 8).map((c) => (
              <li key={c.id} onClick={() => open(c.id)}>
                <span className={scoreClass(c.score)}>{c.score}</span>
                <div className="grow">
                  <div className="strong">{c.name}</div>
                  <div className="muted small">{c.title} · {c.company}</div>
                </div>
                <Flags c={c} />
                <div className="muted small role-chip">{shortRole(roles.find((r) => r.id === c.roleId))}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h2>Recent activity</h2></div>
          <ul className="activity">
            {activity.slice(0, 10).map((a, i) => (
              <li key={i}><span className="muted small">{fmtDate(a.at)}</span> {a.text}</li>
            ))}
          </ul>
          <div className="guard">
            <strong>Guardrails.</strong> Public profile data only. LinkedIn messages are sent by a person, never by the system, to respect LinkedIn&apos;s terms. Candidate data stays in Highlife&apos;s own accounts (Sri Lanka PDPA).
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({ n, l }: { n: number; l: string }) {
  return (
    <div className="kpi">
      <div className="kpi-n">{n}</div>
      <div className="kpi-l">{l}</div>
    </div>
  );
}

/* ---------------- Roles ---------------- */

function Roles({ store, status }: { store: Store; status: Status | null }) {
  const [showNew, setShowNew] = useState(false);
  return (
    <>
      <Header title="Roles & scorecards" sub="Each role has a weighted scorecard. Every profile is scored 1–5 on each criterion; the total is out of 100.">
        <button className="btn" onClick={() => setShowNew((v) => !v)}>{showNew ? "Close" : "New role from a JD"}</button>
      </Header>
      {showNew && <NewRole store={store} status={status} done={() => setShowNew(false)} />}
      {store.state.roles.map((r) => (
        <section className="card" key={r.id}>
          <div className="card-head">
            <div>
              <h2>{r.title}</h2>
              <div className="muted small">{r.team} · {r.location} · {r.hours} · Cap LKR {r.salaryCapLkr.toLocaleString()} / month</div>
            </div>
          </div>
          <p>{r.summary}</p>
          <div className="chips">{r.mustHaves.map((m) => <span key={m} className="tag">{m}</span>)}</div>
          <table className="table">
            <thead>
              <tr><th>Criterion</th><th style={{ width: 160 }}>Weight</th><th>Score 1</th><th>Score 3</th><th>Score 5</th></tr>
            </thead>
            <tbody>
              {r.criteria.map((c) => (
                <tr key={c.key}>
                  <td><div className="strong">{c.label}</div><div className="muted small">{c.meaning}</div></td>
                  <td><div className="bar"><div style={{ width: `${c.weight * 3}%` }} /></div><span className="small">{c.weight}%</span></td>
                  <td className="small">{c.s1}</td><td className="small">{c.s3}</td><td className="small">{c.s5}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

function NewRole({ store, status, done }: { store: Store; status: Status | null; done: () => void }) {
  const [jd, setJd] = useState("");
  const [cap, setCap] = useState("400000");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<Role | null>(null);

  async function run() {
    setBusy(true); setErr(""); setPreview(null);
    try {
      const res = await fetch("/api/scorecard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jd, salaryCapLkr: Number(cap) }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const s = json.scorecard;
      setPreview({
        id: `role-${Date.now()}`, title: s.title, team: s.team, hours: s.hours, location: "Sri Lanka (remote)",
        salaryCapLkr: Number(cap) || s.suggestedSalaryCapLkr || 0, summary: s.summary, mustHaves: s.mustHaves,
        searchQueries: s.searchQueries, criteria: s.criteria,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card accent">
      <h2>Turn a job description into a scorecard</h2>
      {!status?.claude && <p className="note">Needs Claude. Turn on Vercel AI Gateway for this project (or add AI_GATEWAY_API_KEY) to switch this on.</p>}
      <textarea rows={8} placeholder="Paste the full job description here" value={jd} onChange={(e) => setJd(e.target.value)} />
      <div className="row">
        <label>Monthly salary cap (LKR) <input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" /></label>
        <button className="btn" disabled={busy || !status?.claude} onClick={run}>{busy ? "Building scorecard…" : "Build scorecard"}</button>
      </div>
      {err && <p className="error">{err}</p>}
      {preview && (
        <div className="preview">
          <h3>{preview.title}</h3>
          <p className="small">{preview.summary}</p>
          <ul className="small">{preview.criteria.map((c) => <li key={c.key}>{c.label} – {c.weight}%</li>)}</ul>
          <button className="btn" onClick={() => { store.addRole(preview); done(); }}>Save role</button>
        </div>
      )}
    </section>
  );
}

/* ---------------- Sourcing ---------------- */

interface Row { profile: SourcedProfile; dupeOf?: Candidate; scored?: ScoreResult; err?: string; added?: boolean; busy?: boolean }
interface ScoreResult {
  name: string; title: string; company: string; location: string; yearsExp: number | null; basedInSriLanka: boolean;
  scores: Record<string, number>; score: number; evidence: string; redFlags: string; openToWork: boolean; overCap: boolean;
  outreachAngle: string; reasons: string[];
}

function Sourcing({ store, status, open }: { store: Store; status: Status | null; open: (id: string) => void }) {
  const { roles, candidates } = store.state;
  const [roleId, setRoleId] = useState(roles[0].id);
  const role = roles.find((r) => r.id === roleId)!;
  const [query, setQuery] = useState(role.searchQueries[0] ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [threshold, setThreshold] = useState(75);

  useEffect(() => { setQuery(role.searchQueries[0] ?? ""); setRows([]); }, [roleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const known = useMemo(() => {
    const m = new Map<string, Candidate>();
    for (const c of candidates) if (c.roleId === roleId) m.set(normaliseLinkedIn(c.linkedin), c);
    return m;
  }, [candidates, roleId]);

  async function search() {
    setBusy(true); setErr(""); setRows([]);
    try {
      const res = await fetch("/api/source", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, roleId, numResults: 10 }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMode(json.mode);
      if (json.warning) setErr(json.warning);
      setRows((json.profiles as SourcedProfile[]).map((p) => ({ profile: p, dupeOf: known.get(normaliseLinkedIn(p.url)) })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function scoreAll() {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].dupeOf || rows[i].scored) continue;
      setRows((rs) => rs.map((r, j) => (j === i ? { ...r, busy: true } : r)));
      try {
        const res = await fetch("/api/score", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, profile: rows[i].profile }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, busy: false, scored: json.result } : r)));
      } catch (e) {
        setRows((rs) => rs.map((r, j) => (j === i ? { ...r, busy: false, err: e instanceof Error ? e.message : String(e) } : r)));
      }
    }
  }

  function addScored() {
    const now = new Date().toISOString();
    const list: Candidate[] = [];
    rows.forEach((r) => {
      if (!r.scored || r.added || r.dupeOf) return;
      const s = r.scored;
      const shortlist = s.score >= threshold && s.basedInSriLanka && !s.overCap;
      list.push({
        id: `${roleId}-${normaliseLinkedIn(r.profile.url).replace(/[^a-z0-9]+/g, "-")}`,
        roleId, name: s.name, title: s.title, company: s.company, location: s.location, yearsExp: s.yearsExp,
        linkedin: r.profile.url.startsWith("http") ? r.profile.url : `https://${r.profile.url}`,
        scores: s.scores, score: weightedScore(role.criteria, s.scores), evidence: s.evidence, redFlags: s.redFlags,
        stage: !s.basedInSriLanka ? "rejected" : shortlist ? "shortlisted" : "sourced",
        openToWork: s.openToWork, overCap: s.overCap, source: `Exa search${mode === "demo" ? " (demo snapshot)" : ""}: “${query}”`,
        outreachAngle: s.outreachAngle || null, gates: s.basedInSriLanka ? "Location OK. Pacific hours to confirm." : "Based outside Sri Lanka.",
        addedAt: now, history: [{ at: now, text: `Sourced and scored ${s.score}/100` }],
      });
    });
    if (!list.length) return;
    const sl = list.filter((c) => c.stage === "shortlisted").length;
    store.addCandidates(list, `Sourcing run for ${role.title}: ${list.length} new profiles added, ${sl} shortlisted`);
    setRows((rs) => rs.map((r) => (r.scored && !r.dupeOf ? { ...r, added: true } : r)));
  }

  const fresh = rows.filter((r) => !r.dupeOf);
  const scoredCount = rows.filter((r) => r.scored).length;

  return (
    <>
      <Header title="Sourcing" sub="Search public profiles, skip anyone already in the tracker, then score the new ones against the scorecard." />
      <section className="card">
        <div className="row wrap">
          <label className="grow">Role <RolePicker roles={roles} value={roleId} onChange={setRoleId} /></label>
          <label>Auto-shortlist at <input className="narrow" value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 0)} inputMode="numeric" /> / 100</label>
        </div>
        <div className="row">
          <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe who you are looking for" onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn" onClick={search} disabled={busy}>{busy ? "Searching…" : "Search with Exa"}</button>
        </div>
        <div className="chips">
          {role.searchQueries.map((q) => <button key={q} className="chip" onClick={() => setQuery(q)}>{q}</button>)}
        </div>
        {!status?.exa && <p className="note">Demo mode: shows a snapshot of real Exa results captured on 24 Nov 2026. Add an Exa API key in Vercel for live searches.</p>}
        {err && <p className="error">{err}</p>}
      </section>

      {rows.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>{rows.length} profiles found · {rows.length - fresh.length} already tracked · {fresh.length} new</h2>
            <div className="row">
              <button className="btn ghost" onClick={scoreAll} disabled={rows.some((r) => r.busy)}>
                {rows.some((r) => r.busy) ? "Scoring…" : `Score ${fresh.length - scoredCount > 0 ? fresh.length - scoredCount : ""} new with ${status?.claude ? "Claude" : "demo scorer"}`}
              </button>
              <button className="btn" onClick={addScored} disabled={!rows.some((r) => r.scored && !r.added && !r.dupeOf)}>Add scored to tracker</button>
            </div>
          </div>
          <ul className="results">
            {rows.map((r, i) => (
              <li key={i} className={r.dupeOf ? "dupe" : ""}>
                <div className="grow">
                  <a href={r.profile.url} target="_blank" rel="noreferrer" className="strong">{r.profile.title}</a>
                  <div className="muted small clamp">{r.profile.text}</div>
                  {r.scored && (
                    <div className="scored">
                      <div className="small"><strong>Evidence:</strong> {r.scored.evidence}</div>
                      <div className="small"><strong>Red flags:</strong> {r.scored.redFlags}</div>
                      <div className="mini-bars">
                        {role.criteria.map((c) => (
                          <span key={c.key} title={c.label} className="mini"><span style={{ height: `${(r.scored!.scores[c.key] ?? 1) * 20}%` }} /></span>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.err && <div className="error small">{r.err}</div>}
                </div>
                <div className="result-side">
                  {r.dupeOf ? (
                    <button className="tag" onClick={() => open(r.dupeOf!.id)}>Already tracked · {stageLabel(r.dupeOf.stage)}</button>
                  ) : r.busy ? (
                    <span className="muted small">Scoring…</span>
                  ) : r.scored ? (
                    <>
                      <span className={scoreClass(r.scored.score)}>{r.scored.score}</span>
                      {!r.scored.basedInSriLanka && <span className="tag red">Outside Sri Lanka</span>}
                      {r.scored.overCap && <span className="tag red">Likely over cap</span>}
                      {r.scored.openToWork && <span className="tag green">Open to Work</span>}
                      {r.added && <span className="tag">Added</span>}
                    </>
                  ) : (
                    <span className="tag">New</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------------- Pipeline ---------------- */

function Pipeline({ store, open }: { store: Store; open: (id: string) => void }) {
  const { roles, candidates } = store.state;
  const [roleId, setRoleId] = useState("all");
  const [q, setQ] = useState("");
  const list = candidates
    .filter((c) => roleId === "all" || c.roleId === roleId)
    .filter((c) => !q || `${c.name} ${c.company} ${c.title}`.toLowerCase().includes(q.toLowerCase()));
  const cols: Stage[] = ["sourced", "shortlisted", "approved", "contacted", "replied", "interview", "offer", "partner", "rejected"];
  return (
    <>
      <Header title="Shortlist & pipeline" sub="Approve or reject in one click. Click a card for the full scorecard and evidence.">
        <RolePicker roles={roles} value={roleId} onChange={setRoleId} all />
        <input placeholder="Search name or company" value={q} onChange={(e) => setQ(e.target.value)} />
      </Header>
      <div className="board">
        {cols.map((s) => {
          const items = list.filter((c) => c.stage === s).sort((a, b) => b.score - a.score);
          return (
            <div className="col" key={s}>
              <div className="col-head"><span>{stageLabel(s)}</span><span className="count">{items.length}</span></div>
              {items.map((c) => (
                <div className="kcard" key={c.id} onClick={() => open(c.id)}>
                  <div className="kcard-top">
                    <span className="strong">{c.name}</span>
                    <span className={scoreClass(c.score)}>{c.score}</span>
                  </div>
                  <div className="muted small">{c.title}</div>
                  <div className="muted small">{c.company}</div>
                  {roleId === "all" && <div className="small role-line">{roles.find((r) => r.id === c.roleId)?.title}</div>}
                  <Flags c={c} />
                  {s === "shortlisted" && (
                    <div className="kcard-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm" onClick={() => store.moveStage(c.id, "approved", `Approved ${c.name} for outreach`)}>Approve</button>
                      <button className="btn sm ghost" onClick={() => store.moveStage(c.id, "rejected", `Rejected ${c.name}`)}>Reject</button>
                    </div>
                  )}
                  {s === "sourced" && (
                    <div className="kcard-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm ghost" onClick={() => store.moveStage(c.id, "shortlisted", `Shortlisted ${c.name}`)}>Shortlist</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Drawer ---------------- */

function Drawer({ c, store, close, goOutreach }: { c: Candidate; store: Store; close: () => void; goOutreach: () => void }) {
  const role = store.state.roles.find((r) => r.id === c.roleId)!;
  const [notes, setNotes] = useState(c.notes ?? "");
  useEffect(() => setNotes(c.notes ?? ""), [c.id, c.notes]);
  return (
    <div className="overlay" onClick={close}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={close} aria-label="Close">×</button>
        <div className="drawer-head">
          <span className={scoreClass(c.score) + " big"}>{c.score}</span>
          <div>
            <h2>{c.name}</h2>
            <div className="muted">{c.title} · {c.company}</div>
            <div className="muted small">{c.location}{c.yearsExp ? ` · ${c.yearsExp} yrs` : ""} · {role.title}</div>
          </div>
        </div>
        <div className="row wrap">
          <span className="tag">{stageLabel(c.stage)}</span>
          <Flags c={c} />
          <a className="btn sm ghost" href={c.linkedin} target="_blank" rel="noreferrer">Open LinkedIn profile</a>
        </div>

        <h3>Scorecard</h3>
        {role.criteria.map((cr) => (
          <div className="crit" key={cr.key}>
            <div className="crit-l small">{cr.label} <span className="muted">({cr.weight}%)</span></div>
            <div className="dots">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= (c.scores[cr.key] ?? 0) ? "d on" : "d"} />)}</div>
          </div>
        ))}

        {c.whyShortlisted && (<><h3>Why shortlisted</h3><p>{c.whyShortlisted}</p></>)}
        <h3>Evidence</h3><p>{c.evidence}</p>
        <h3>Red flags</h3><p>{c.redFlags || "None noted."}</p>
        {c.checkAtFirstCall && (<><h3>Check at first call</h3><p>{c.checkAtFirstCall}</p></>)}
        {c.outreachAngle && (<><h3>Outreach angle</h3><p>{c.outreachAngle}</p></>)}
        <p className="muted small">Open to Work: {c.openToWorkNote ?? (c.openToWork ? "Yes" : "Not checked")}. Source: {c.source}.</p>

        <h3>Notes</h3>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => store.updateCandidate(c.id, { notes })} placeholder="Private team notes" />

        <h3>Move stage</h3>
        <div className="chips">
          {STAGES.map((s) => (
            <button key={s.id} className={s.id === c.stage ? "chip on" : "chip"} title={s.hint} onClick={() => store.moveStage(c.id, s.id, `${c.name}: ${stageLabel(c.stage)} → ${s.label}`)}>{s.label}</button>
          ))}
        </div>
        {(c.stage === "approved" || c.stage === "shortlisted") && (
          <button className="btn wide" onClick={() => { if (c.stage === "shortlisted") store.moveStage(c.id, "approved", `Approved ${c.name} for outreach`); goOutreach(); }}>
            {c.stage === "shortlisted" ? "Approve and draft outreach" : "Draft outreach"}
          </button>
        )}
        {c.history && c.history.length > 0 && (
          <>
            <h3>History</h3>
            <ul className="activity">{c.history.map((h, i) => <li key={i}><span className="muted small">{fmtDate(h.at)}</span> {h.text}</li>)}</ul>
          </>
        )}
      </aside>
    </div>
  );
}

/* ---------------- Outreach ---------------- */

function Outreach({ store, open }: { store: Store; open: (id: string) => void }) {
  const { candidates, roles, sender } = store.state;
  const list = candidates.filter((c) => c.stage === "approved" || (c.stage === "contacted" && c.draft));
  return (
    <>
      <Header title="Outreach drafts" sub="Claude drafts a personal LinkedIn note and email for each approved candidate. A person reviews, edits and sends.">
        <label className="small">Signed as <input value={sender} onChange={(e) => store.setSender(e.target.value)} /></label>
      </Header>
      {list.length === 0 && (
        <section className="card"><p className="muted">No approved candidates yet. Approve someone on the Shortlist & pipeline page and they will appear here.</p></section>
      )}
      {list.map((c) => <DraftCard key={c.id} c={c} role={roles.find((r) => r.id === c.roleId)!} store={store} open={open} />)}
    </>
  );
}

function DraftCard({ c, role, store, open }: { c: Candidate; role: Role; store: Store; open: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const d = c.draft;

  async function draft() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/outreach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role, candidate: c, sender: store.state.sender }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      store.updateCandidate(c.id, { draft: json.draft });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function edit(patch: Partial<NonNullable<Candidate["draft"]>>) {
    if (d) store.updateCandidate(c.id, { draft: { ...d, ...patch } });
  }

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ }
  }

  const gmail = d ? `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(d.emailSubject)}&body=${encodeURIComponent(d.emailBody)}` : "#";

  return (
    <section className="card">
      <div className="card-head">
        <div className="row">
          <span className={scoreClass(c.score)}>{c.score}</span>
          <div>
            <button className="link strong" onClick={() => open(c.id)}>{c.name}</button>
            <div className="muted small">{c.title} · {c.company} · {role.title}</div>
          </div>
        </div>
        <div className="row">
          {c.stage === "contacted" && <span className="tag green">Contacted</span>}
          <button className="btn ghost" onClick={draft} disabled={busy}>{busy ? "Drafting…" : d ? "Redraft" : "Draft with Claude"}</button>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      {d && (
        <div className="drafts">
          <div>
            <div className="draft-label">LinkedIn connection note <span className="muted">({d.linkedinNote.length}/300)</span></div>
            <textarea rows={5} value={d.linkedinNote} onChange={(e) => edit({ linkedinNote: e.target.value })} />
            <div className="row">
              <button className="btn sm" onClick={() => copy(d.linkedinNote, "note")}>{copied === "note" ? "Copied" : "Copy note"}</button>
              <a className="btn sm ghost" href={c.linkedin} target="_blank" rel="noreferrer">Open profile to send</a>
            </div>
          </div>
          <div>
            <div className="draft-label">Email</div>
            <input value={d.emailSubject} onChange={(e) => edit({ emailSubject: e.target.value })} />
            <textarea rows={9} value={d.emailBody} onChange={(e) => edit({ emailBody: e.target.value })} />
            <div className="row">
              <a className="btn sm" href={gmail} target="_blank" rel="noreferrer">Open in Gmail</a>
              <button className="btn sm ghost" onClick={() => copy(`${d.emailSubject}\n\n${d.emailBody}`, "email")}>{copied === "email" ? "Copied" : "Copy email"}</button>
            </div>
          </div>
          <div className="draft-foot">
            <span className="muted small">Drafted by {d.generatedBy}. Nothing is sent automatically.</span>
            {c.stage !== "contacted" && (
              <button className="btn" onClick={() => store.moveStage(c.id, "contacted", `Marked ${c.name} as contacted`)}>Mark as contacted</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Reports ---------------- */

function Reports({ store }: { store: Store }) {
  const { roles, candidates } = store.state;

  function exportCsv() {
    const head = ["Role", "Name", "Title", "Company", "Location", "Score", "Stage", "Open to Work", "Likely over cap", "LinkedIn", "Evidence", "Red flags"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = candidates.map((c) =>
      [roles.find((r) => r.id === c.roleId)?.title, c.name, c.title, c.company, c.location, c.score, stageLabel(c.stage), c.openToWork ? "Yes" : "No", c.overCap ? "Yes" : "No", c.linkedin, c.evidence, c.redFlags].map(esc).join(","),
    );
    const blob = new Blob([[head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "highlife-candidates.csv";
    a.click();
  }

  return (
    <>
      <Header title="Weekly funnel report" sub="Counts include everyone who reached each stage or beyond.">
        <button className="btn ghost" onClick={exportCsv}>Export CSV</button>
      </Header>
      {roles.map((r) => {
        const list = candidates.filter((c) => c.roleId === r.id);
        const reached = (s: Stage) => {
          const idx = FUNNEL.indexOf(s);
          return list.filter((c) => FUNNEL.indexOf(c.stage) >= idx).length;
        };
        const counts = FUNNEL.map((s) => ({ s, n: s === "sourced" ? list.length : reached(s) }));
        const max = Math.max(1, counts[0].n);
        const buckets = [
          { l: "80–100", n: list.filter((c) => c.score >= 80).length },
          { l: "65–79", n: list.filter((c) => c.score >= 65 && c.score < 80).length },
          { l: "50–64", n: list.filter((c) => c.score >= 50 && c.score < 65).length },
          { l: "Under 50", n: list.filter((c) => c.score < 50).length },
        ];
        return (
          <section className="card" key={r.id}>
            <h2>{r.title}</h2>
            <div className="two">
              <div>
                {counts.map(({ s, n }) => (
                  <div className="fun" key={s}>
                    <span className="fun-l small">{stageLabel(s)}</span>
                    <span className="fun-bar"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                    <span className="fun-n">{n}</span>
                  </div>
                ))}
                <p className="muted small">Also: {list.filter((c) => c.stage === "partner").length} partner agencies, {list.filter((c) => c.stage === "rejected").length} rejected.</p>
              </div>
              <div>
                <div className="small strong">Score spread</div>
                {buckets.map((b) => (
                  <div className="fun" key={b.l}>
                    <span className="fun-l small">{b.l}</span>
                    <span className="fun-bar alt"><span style={{ width: `${(b.n / max) * 100}%` }} /></span>
                    <span className="fun-n">{b.n}</span>
                  </div>
                ))}
                <p className="muted small">Average score {list.length ? Math.round(list.reduce((s, c) => s + c.score, 0) / list.length) : 0}. {list.filter((c) => c.openToWork).length} show Open to Work. {list.filter((c) => c.overCap).length} flagged as likely over the LKR {r.salaryCapLkr.toLocaleString()} cap.</p>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
