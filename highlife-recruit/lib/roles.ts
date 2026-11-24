import seed from "@/data/seed.json";
import type { Candidate, Criterion, Role } from "./types";

const criteria = seed.criteria as unknown as Record<string, Criterion[]>;

export const SEED_ROLES: Role[] = [
  {
    id: "lending",
    title: "Business Lending Research & Outreach Specialist",
    team: "The Fund One (fintech)",
    salaryCapLkr: 400000,
    hours: "Remote, Mon–Thu 8 AM–4 PM US Pacific",
    location: "Sri Lanka (remote)",
    summary:
      "Researches US business lenders and funding programmes, builds and maintains the lender database, and runs outbound calls and emails to lenders and business owners. US banking experience is not required.",
    mustHaves: [
      "Go-getter sales drive with targets beaten",
      "Polished outbound sales and follow-up",
      "Customer and relationship management",
      "Comfortable working US Pacific hours",
    ],
    searchQueries: [
      "Sri Lanka business development relationship manager SME lending bank Colombo LinkedIn",
      "Sri Lanka sales development representative US clients cold calling Colombo LinkedIn",
      "Colombo loan sales top performer award relationship manager LinkedIn",
    ],
    criteria: criteria.lending,
  },
  {
    id: "director",
    title: "Director, Online Reputation Management",
    team: "Highlife MGMT",
    salaryCapLkr: 700000,
    hours: "Remote, US Pacific hours",
    location: "Sri Lanka (remote)",
    summary:
      "Reports to the CEO and builds and leads an online reputation practice for 5–10 clients: branded search, reviews, Knowledge Panels, digital PR and source verification, plus scoping, budgets and specialist management.",
    mustHaves: [
      "Led ORM or reputation mandates end to end",
      "Search, reviews and entity (Knowledge Panel) work",
      "Team and specialist management",
      "Commercial scoping and budgets",
    ],
    searchQueries: [
      "Sri Lanka online reputation management lead agency LinkedIn",
      "Colombo head of digital PR reputation crisis management LinkedIn",
      "Sri Lanka SEO director reviews Google Business Profile US clients LinkedIn",
    ],
    criteria: criteria.director,
  },
];

export const SEED_CANDIDATES = seed.candidates as unknown as Candidate[];
