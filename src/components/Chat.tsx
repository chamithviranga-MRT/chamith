"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Disclaimer } from "./Disclaimer";
import { ProfileCard } from "./ProfileCard";
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/session");
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.messages) && data.messages.length) setMessages(data.messages);
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

  const deleteMyData = useCallback(async () => {
    if (!window.confirm("Delete this chat, your profile and all research reports from our database? This cannot be undone.")) return;
    await fetch("/api/session", { method: "DELETE" });
    setMessages([WELCOME]);
    setProfile(null);
    setMissing([]);
    setConfirmed(false);
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

      {profile && (
        <ProfileCard
          profile={profile ?? emptyProfile()}
          missing={missing}
          disabled={busy}
          onSave={(e) => saveProfile(e, false)}
          onConfirm={(e) => saveProfile(e, true)}
        />
      )}
      {confirmed && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100">
          Profile confirmed.
        </p>
      )}
    </main>
  );
}
