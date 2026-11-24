"use client";
import { useCallback, useEffect, useState } from "react";
import { SEED_CANDIDATES, SEED_ROLES } from "./roles";
import type { Candidate, Role, Stage } from "./types";

export interface Activity { at: string; text: string }
export interface State { roles: Role[]; candidates: Candidate[]; activity: Activity[]; sender: string }

const KEY = "highlife-recruit-v1";

function seedState(): State {
  return {
    roles: SEED_ROLES,
    candidates: SEED_CANDIDATES,
    activity: [
      { at: "2026-11-24T09:00:00Z", text: "Imported 45 researched profiles and 2 scorecards from the shortlist workbook" },
    ],
    sender: "Chamith",
  };
}

export function useStore() {
  const [state, setState] = useState<State>(seedState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw) as State);
    } catch {
      /* storage unavailable: keep seed */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  const log = (s: State, text: string): Activity[] => [{ at: new Date().toISOString(), text }, ...s.activity].slice(0, 200);

  const moveStage = useCallback((id: string, stage: Stage, note?: string) => {
    setState((s) => {
      const c = s.candidates.find((x) => x.id === id);
      if (!c) return s;
      const text = note ?? `${c.name} moved to ${stage}`;
      return {
        ...s,
        candidates: s.candidates.map((x) =>
          x.id === id ? { ...x, stage, history: [{ at: new Date().toISOString(), text }, ...(x.history ?? [])] } : x,
        ),
        activity: log(s, text),
      };
    });
  }, []);

  const updateCandidate = useCallback((id: string, patch: Partial<Candidate>) => {
    setState((s) => ({ ...s, candidates: s.candidates.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  }, []);

  const addCandidates = useCallback((list: Candidate[], text: string) => {
    setState((s) => ({ ...s, candidates: [...list, ...s.candidates], activity: log(s, text) }));
  }, []);

  const addRole = useCallback((role: Role) => {
    setState((s) => ({ ...s, roles: [...s.roles, role], activity: log(s, `Created scorecard for ${role.title}`) }));
  }, []);

  const setSender = useCallback((sender: string) => setState((s) => ({ ...s, sender })), []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState(seedState());
  }, []);

  return { state, loaded, moveStage, updateCandidate, addCandidates, addRole, setSender, reset };
}
