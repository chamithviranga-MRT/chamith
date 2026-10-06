"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Disclaimer } from "./Disclaimer";
import { ProfileCard } from "./ProfileCard";
import { ProgressPanel } from "./ProgressPanel";
import { Results } from "./Results";
import { readNdjson } from "@/lib/client/ndjson";
import { initialProgress, progressReducer, type ProgressState } from "@/lib/client/progress";
import type { Report } from "@/lib/report/types";
import { emptyProfile, type Profile } from "@/lib/profile/schema";
import { missingRequired, type MissingField } from "@/lib/profile/normalize";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I'm LendMatch. Tell me about your situation in your own words: what you need funding for, how much, " +
    "how long you've been in business, your approximate credit, and where you're based. " +
    "Please don't share SSNs, bank account numbers or IDs — I never need them.",
};

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState<MissingField[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [researching, setResearching] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const [report, setReport] = useState<Report | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpNote, setFollowUpNote] = useState<string | null>(null);
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastRunScrolled = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session");
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.messages) && data.messages.length) setMessages(data.messages);
        if (data.lastRun?.report) {
          setReport(data.lastRun.report as Report);
          setRunId(data.lastRun.id as string);
        }
        if (data.profile?.data) {
          setProfile(data.profile.data as Profile);
          setMissing(missingRequired(data.profile.data as Profile));
          setConfirmed(Boolean(data.profile.confirmed));
        }
        if (!data.capabilities?.anthropic) {
          setNotice("ANTHROPIC_API_KEY is not configured — running in offline extraction mode with reduced accuracy.");
        }
      } catch {
        if (!cancelled) setNotice("Could not reach the server. Check that the app and database are running.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // bring a freshly produced report into view once (not on every follow-up)
  useEffect(() => {
    if (report && runId && lastRunScrolled.current === null && !researching && progress.lenders.length > 0) {
      lastRunScrolled.current = runId;
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [report, runId, researching, progress.lenders.length]);

  const deleteMyData = useCallback(async () => {
    if (!window.confirm("Delete this chat, your profile and all research reports from our database? This cannot be undone.")) return;
    await fetch("/api/session", { method: "DELETE" });
    setMessages([WELCOME]);
    setProfile(null);
    setMissing([]);
    setConfirmed(false);
    setReport(null);
    setRunId(null);
    setFollowUpNote(null);
    setProgress(initialProgress);
    setNotice("Your data has been deleted. A new anonymous session will start when you next send a message.");
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply ?? data.error ?? "Something went wrong." }]);
      if (data.profile) {
        setProfile(data.profile as Profile);
        setMissing((data.missing ?? []) as MissingField[]);
        setConfirmed(false);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Network error — please try again." }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy]);

  const startResearch = useCallback(async () => {
    setResearching(true);
    setReport(null);
    setRunId(null);
    setProgress({ ...initialProgress, stage: "Starting research…" });
    try {
      const res = await fetch("/api/research", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setProgress((p) => ({ ...p, error: err.error ?? `Research could not start (HTTP ${res.status}).` }));
        return;
      }
      await readNdjson(res, (ev) => {
        if (ev.event === "run") setRunId(ev.data.runId as string);
        else if (ev.event === "report") {
          setReport(ev.data.report as Report);
          setRunId(ev.data.runId as string);
        } else setProgress((p) => progressReducer(p, ev));
      });
    } catch {
      setProgress((p) => ({ ...p, error: "The connection dropped during research. Your confirmed profile is saved; press “Confirm & research” again to retry (cached lenders will be reused)." }));
    } finally {
      setResearching(false);
    }
  }, []);

  const callRerank = useCallback(async (payload: { message?: string; refreshSlug?: string }) => {
    const res = await fetch("/api/rerank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFollowUpNote(data.error ?? `Request failed (HTTP ${res.status}).`);
      return;
    }
    if (data.changed) {
      setReport(data.report as Report);
      setRunId(data.runId as string);
    }
    setFollowUpNote(data.note ?? null);
  }, []);

  const followUp = useCallback(async (text: string) => {
    setFollowUpBusy(true);
    setFollowUpNote(null);
    try {
      await callRerank({ message: text });
    } catch {
      setFollowUpNote("Network error — please try again.");
    } finally {
      setFollowUpBusy(false);
    }
  }, [callRerank]);

  const refreshLender = useCallback(async (slug: string) => {
    setRefreshingSlug(slug);
    setFollowUpNote(null);
    try {
      await callRerank({ refreshSlug: slug });
    } catch {
      setFollowUpNote("Network error — please try again.");
    } finally {
      setRefreshingSlug(null);
    }
  }, [callRerank]);

  const saveProfile = useCallback(async (edits: Partial<Profile>, confirm: boolean): Promise<string[] | null> => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits, confirm }),
    });
    const data = await res.json();
    if (!res.ok) return (data.issues as string[] | undefined) ?? (data.missing ? ["Required fields are still missing."] : [data.error ?? "Could not save"]);
    setProfile(data.profile as Profile);
    setMissing(data.missing as MissingField[]);
    setConfirmed(Boolean(data.confirmed));
    return null;
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lend<span className="text-fuchsia-600">Match</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Live research on US lending products, ranked for your situation.
          </p>
        </div>
        <button
          onClick={deleteMyData}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Delete my data
        </button>
      </header>

      <Disclaimer />
      {notice && (
        <p role="status" className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-100">
          {notice}
        </p>
      )}

      <section aria-label="Conversation" className="flex flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex max-h-[55vh] flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end" : "self-start"}>
              <div
                className={`max-w-[85ch] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div className="self-start text-xs text-slate-500">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="e.g. I run a 3-year-old restaurant in Austin, TX with a 700 FICO and need $80k for a kitchen expansion…"
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-600 dark:bg-slate-950"
            disabled={!ready}
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || !ready}
            className="self-end rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>

      {!report && (researching || progress.lenders.length > 0 || progress.error) && <ProgressPanel state={progress} />}
      {report && (
        <div ref={resultsRef} className="scroll-mt-4">
          <Results report={report} runId={runId} onRefresh={refreshLender} refreshingSlug={refreshingSlug} onFollowUp={followUp} followUpBusy={followUpBusy} followUpNote={followUpNote} />
        </div>
      )}
      {profile &&
        (() => {
          const card = (
            <ProfileCard
              profile={profile}
              missing={missing}
              disabled={busy || researching}
              onSave={(e) => saveProfile(e, false)}
              onConfirm={async (e) => {
                const errs = await saveProfile(e, true);
                if (!errs) {
                  lastRunScrolled.current = null;
                  void startResearch();
                }
                return errs;
              }}
            />
          );
          return report ? (
            <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <summary className="cursor-pointer text-sm font-semibold">Your profile — edit and re-run the research</summary>
              <div className="mt-3">{card}</div>
            </details>
          ) : (
            card
          );
        })()}
    </main>
  );
}
