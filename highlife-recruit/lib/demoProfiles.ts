import type { SourcedProfile } from "./types";

/**
 * Snapshot of real public results returned by Exa people search on 24 Nov 2026.
 * Served only in demo mode (no EXA_API_KEY), so the sourcing flow can be shown end to end.
 * Some of these people are already in the tracker; the app's dedupe step catches them.
 */
export const DEMO_PROFILES: (SourcedProfile & { roleId: string })[] = [
  {
    roleId: "lending",
    url: "https://lk.linkedin.com/in/danushka-livera-137288223",
    title: "Danushka Livera – SME Senior Relationship Manager at Sampath Bank PLC",
    text: "Colombo, Sri Lanka. 21 years experience. Senior Relationship Manager, Sampath Bank (Nov 2025–present). Nations Trust Bank Relationship Manager: led high-end SME corporate client management, surpassing targets, securing new business; conducted regular sales meetings and trained staff. Branch Manager; Business Development Officer. Post: 1st Place – Best SME RM at Sampath Bank award ceremony.",
  },
  {
    roleId: "lending",
    url: "https://linkedin.com/in/chulaka-rajawansha-765894120",
    title: "Chulaka Rajawansha – Relationship Manager SME at Hatton National Bank PLC",
    text: "Location: Uppsala, Sweden. 15 years banking. Relationship Manager SME at HNB (May 2024–Aug 2026). Managed the bank's largest SME portfolio over LKR 3Bn; second highest advance growth across the network in 2024; Golden Award for SME banking 2024; Best Regional SME Relationship Manager of the Year 2025; built relationships with over 500 SME clients. Earlier marketing assistant: contacted potential customers, followed up leads, prepared sales reports, digital campaigns.",
  },
  {
    roleId: "lending",
    url: "https://linkedin.com/in/sameera-priyadarshana-6700bb60",
    title: "Sameera Priyadarshana – Assistant Manager SME, Union Bank of Colombo",
    text: "Colombo, Sri Lanka. 16 years. Assistant Relationship Manager – SME Analyst, Union Bank of Colombo (Nov 2024–present). SDB Bank Senior Executive Officer – SME Relationship: met or exceeded portfolio targets; generated new prospects from own efforts (personal network, trade associations, referrals); qualified prospects; cross-sold; structured and negotiated deals; prepared call reports for all customer interactions. Earlier credit officer processing business loan applications and portfolio reports. MBA (UK).",
  },
  {
    roleId: "lending",
    url: "https://lk.linkedin.com/in/amilapremarathne",
    title: "Amila Premarathne – Corporate Relationship Manager, Credit Analyst",
    text: "Colombo, Sri Lanka. 20+ years. Multi-market exposure: Oman, Sri Lanka, Bangladesh. Seeking GCC banking opportunities. Commercial Bank of Ceylon Relationship Manager, Corporate Banking: achieved significant interest income targets, canvassed new export customers, exceeded fee income targets, canvassed green loans, zero NPAs in portfolio, oversaw credit operations for the Bangladesh branch.",
  },
  {
    roleId: "lending",
    url: "https://linkedin.com/in/kasun-shalitha-3056a127b",
    title: "Kasun Shalitha – Relationship Manager – SME at Nations Trust Bank PLC",
    text: "Colombo, Sri Lanka. 14 years. Relationship Manager – SME, Nations Trust Bank (Feb 2023–present), Sales department. Earlier Executive – SME and Credit Officer – SME.",
  },
  {
    roleId: "lending",
    url: "https://linkedin.com/in/vignesh-raj-ab1380b7",
    title: "Vignesh Raj – SME Banking | Relationship Management",
    text: "Colombo. Relationship Manager, Sampath Bank: SME portfolio of 56+ clients, 60% loan book growth, LKR 400Mn+ targets. Standard Chartered client acquisition; Nations Trust Bank business development.",
  },
  {
    roleId: "director",
    url: "https://linkedin.com/in/ishani-samuel-5a2390213",
    title: "Ishani Samuel – Organic Reputation Management Lead, DC Group Agency",
    text: "Colombo, Sri Lanka. 2 years 9 months experience. Project Lead, Organic Reputation Management at DC Group Agency (Mar 2026–present): protects brand perception, tracks digital sentiment, crisis management, community strategy. Previously project assistant with media professionals and Sri Lankan authorities; news copywriter at Sri Lanka Broadcasting Corporation; fellowships in investigative journalism and fact-checking. BA Mass Media, University of Colombo.",
  },
  {
    roleId: "director",
    url: "https://linkedin.com/in/ashankumar",
    title: "Ashan Kumar – Founder of Wire Group PR and Reputation Advisory",
    text: "Colombo. Founder and Group Chairperson, Wire Communications Group (Sri Lanka, Maldives, Australia, New Zealand): PR Wire, Media Wire, Digital Wire (digital PR and online reputation management consultancy). Managing Director, PR Wire (20–30 staff). Crisis and reputation management.",
  },
  {
    roleId: "director",
    url: "https://linkedin.com/in/asheeni-boteju-7193a7160",
    title: "Asheeni Boteju – Online Reputation Management Associate at Ekwa Marketing",
    text: "Sri Lanka. ORM Associate at Ekwa Marketing (Canada/US) since 2018. Manages 100+ clients in the USA and Canada, mostly healthcare; monitors and manages online reputation; HIPAA and PIPEDA compliant review responses; optimises Google, Yelp and RateMDs profiles to improve SEO rankings.",
  },
];
