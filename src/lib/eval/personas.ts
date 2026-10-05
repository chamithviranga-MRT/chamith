import type { Profile } from "@/lib/profile/schema";

export interface Persona {
  id: string;
  title: string;
  /** What the borrower would type into the chat box. */
  text: string;
  /** Subset of fields the extractor is expected to recover from `text`. */
  expect: Partial<Profile>;
}

export const PERSONAS: Persona[] = [
  {
    id: "startup-580",
    title: "Startup, 580 FICO, no revenue",
    text:
      "I'm launching a food truck startup in Phoenix, AZ. No revenue yet — my FICO is 580 and I need $35,000 for working capital " +
      "to get through the first six months. I'd rather not pledge my house.",
    expect: {
      borrowerType: "startup", timeInBusinessMonths: 0, monthlyRevenue: 0, ficoMin: 580, ficoMax: 580,
      amountNeeded: 35000, purpose: "working_capital", businessState: "AZ", businessCountry: "US",
    },
  },
  {
    id: "restaurant-700",
    title: "3-year restaurant, 700 FICO",
    text:
      "I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. " +
      "I want an $80,000 loan to expand into a second location, ideally repaid over 5 years.",
    expect: {
      borrowerType: "existing_small_business", timeInBusinessMonths: 36, monthlyRevenue: 60000, ficoMin: 700, ficoMax: 700,
      amountNeeded: 80000, purpose: "expansion", businessState: "TX", preferredTermMonths: 60, industry: "restaurant",
    },
  },
  {
    id: "contractor-equipment",
    title: "Contractor needing equipment",
    text:
      "I'm a general contractor in Tampa, Florida, in business for 6 years with about $40k a month in sales. FICO around 680. " +
      "I need $120,000 for a new excavator and I can use the machine as collateral. I need the money within 3 weeks.",
    expect: {
      timeInBusinessMonths: 72, monthlyRevenue: 40000, ficoMin: 680, ficoMax: 680, amountNeeded: 120000,
      purpose: "equipment", businessState: "FL", collateralAvailable: true, speedNeededDays: 21,
    },
  },
  {
    id: "nonus-llc",
    title: "Non-US owner of a US LLC",
    text:
      "I'm a citizen and resident of India and I own a Delaware LLC that sells SaaS to US customers. The LLC is 2 years old and does " +
      "about $15k a month in revenue. My FICO is 690 from when I lived in the US. I need $50,000 of working capital.",
    expect: {
      ownerCountry: "IN", businessCountry: "US", businessState: "DE", ownerResidency: "non_resident",
      timeInBusinessMonths: 24, monthlyRevenue: 15000, ficoMin: 690, ficoMax: 690, amountNeeded: 50000, purpose: "working_capital",
    },
  },
  {
    id: "re-investor",
    title: "Real estate investor",
    text:
      "I'm a real estate investor in Georgia buying my third rental property. I've been investing for 4 years, FICO 740, and I need " +
      "$300,000 to purchase a duplex. I can offer the property as collateral and I'm fine with a personal guarantee.",
    expect: {
      borrowerType: "real_estate_investor", businessState: "GA", timeInBusinessMonths: 48, ficoMin: 740, ficoMax: 740,
      amountNeeded: 300000, purpose: "real_estate", collateralAvailable: true, willingPersonalGuarantee: true,
    },
  },
];
