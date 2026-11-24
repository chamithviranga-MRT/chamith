export type Stage =
  | "sourced"
  | "shortlisted"
  | "approved"
  | "contacted"
  | "replied"
  | "interview"
  | "offer"
  | "rejected"
  | "partner";

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "sourced", label: "Sourced", hint: "Found and scored, not yet shortlisted" },
  { id: "shortlisted", label: "Shortlisted", hint: "Top matches awaiting your approval" },
  { id: "approved", label: "Approved for outreach", hint: "You approved; draft and send" },
  { id: "contacted", label: "Contacted", hint: "Message sent by a person" },
  { id: "replied", label: "Replied", hint: "Candidate responded" },
  { id: "interview", label: "Interview", hint: "Screening or interview booked" },
  { id: "offer", label: "Offer", hint: "Offer made" },
  { id: "partner", label: "Partner agency", hint: "Agency owner; contract or partner deal" },
  { id: "rejected", label: "Rejected", hint: "Not a fit or over cap" },
];

export const FUNNEL: Stage[] = ["sourced", "shortlisted", "approved", "contacted", "replied", "interview", "offer"];

export interface Criterion {
  key: string;
  label: string;
  weight: number;
  meaning: string;
  s1: string;
  s3: string;
  s5: string;
}

export interface Role {
  id: string;
  title: string;
  team: string;
  salaryCapLkr: number;
  hours: string;
  location: string;
  summary: string;
  mustHaves: string[];
  searchQueries: string[];
  criteria: Criterion[];
}

export interface Candidate {
  id: string;
  roleId: string;
  name: string;
  title: string;
  company: string;
  location: string;
  yearsExp: number | null;
  linkedin: string;
  scores: Record<string, number>;
  score: number;
  gates?: string | null;
  evidence: string;
  redFlags: string;
  stage: Stage;
  openToWork: boolean;
  openToWorkNote?: string;
  overCap: boolean;
  source: string;
  rank?: number | null;
  whyShortlisted?: string | null;
  checkAtFirstCall?: string | null;
  outreachAngle?: string | null;
  addedAt: string;
  notes?: string;
  draft?: { linkedinNote: string; emailSubject: string; emailBody: string; generatedBy: string };
  history?: { at: string; text: string }[];
}

export interface SourcedProfile {
  url: string;
  title: string;
  text: string;
}

export function weightedScore(criteria: Criterion[], scores: Record<string, number>): number {
  const total = criteria.reduce((sum, c) => sum + (scores[c.key] ?? 1) * c.weight, 0);
  return Math.round(total / 5);
}

export function normaliseLinkedIn(url: string): string {
  return url.toLowerCase().replace(/^https?:\/\/([a-z]{2,3}\.)?(www\.)?/, "").replace(/\/+$/, "").split("?")[0];
}
