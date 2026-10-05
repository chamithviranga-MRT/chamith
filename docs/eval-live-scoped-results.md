# Live evaluation, scoped run (real lender pages)

**Not a full run.** 18 of the 25 seed lenders, no profile-driven discovery, profile extraction and reasoning done **offline** (no Anthropic key), data scraped with Firecrawl on 2026-10-05. Credits used: 518 of 819 (456 first pass, 61 after fixes; the rest of the evaluation ran from the 7-day cache). Raw per-persona reports are written to `reports/` (gitignored) by `npm run eval -- --mode=live --no-discovery`.

**How to read this.** "Claim audit: 0 flags" means every number in the report matches the stored scraped record and cites its source. It does **not** mean the stored record is right: the first pass also passed with an Amex monthly fee shown as an APR, a UK page and a blog article used as sources, and a bank auto loan at #1 for a real-estate investor. All four were found by reading the output, not by the audit (see the README for the fixes). Expect more of that kind; the rows below are what survived one round of review, not a verified ranking.

**Coverage.** TD Bank, Live Oak Bank and Funding Circle returned no usable product data (Funding Circle only exposed its UK site). Many rows show "Not published" for rate, term or speed: either the page does not state it or the grounding verifier could not find the value verbatim. Rows without a rate get no cost estimate and are ranked on eligibility, speed and reliability only, so treat their order as weak.

## 3-year restaurant, 700 FICO  (`restaurant-700`)

“I own a restaurant in Austin, TX that's been open for 3 years. My FICO is 700 and we do about $60,000 a month in revenue. I want an $80,000 loan to expand into a second location, ideally repaid over 5 years.”

53 products considered · 26 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Bluevine                       Business Line of Credit            Alternative   86.0  $10,000 – $250,000     7.8% APR                 Not published       1 day            $6,952
 2  Gem          OnDeck                         OnDeck Line of Credit              Alternative   69.5  $6,000 – $200,000      Not published            1 year – 2 years    same day         n/a
 3  Gem          OnDeck                         OnDeck Term Loan                   Alternative   69.5  $5,000 – $400,000      Not published            up to 2 years       same day         n/a
 4  Gem          American Express Business Lin… American Express® Business Line o… Alternative   69.2  $2,000 – $250,000      Not published            Not published       1 day – 3 days   n/a
 5  Gem          Chase                          Business Line of Credit            Conventional  66.2  $10,000 – $500,000     Not published            5 years             Not published    n/a
 6  Gem          Lendio                         SBA 504 Loan                       SBA           66.1  up to $5,000,000       Not published            up to 25 years      Not published    n/a
 7  Gem          Lendio                         SBA 7(a) Loan                      SBA           66.1  up to $5,000,000       Not published            up to 25 years      Not published    n/a
 8  Gem          PNC                            SBA 7(a) Loan                      Conventional  64.3  up to $5,000,000       Not published            up to 15 years      Not published    n/a
 9  Gem          Newtek                         Business Loan                      SBA           63.8  $5,000 – $15,000,000   Not published            up to 25 years      Not published    n/a
10  Gem          Bank of America                Commercial Real Estate             Conventional  63.1  Not published          Not published            up to 15 years      Not published    n/a
```

- Claim audit: 0 flags — every number, source and estimate label checked
- Independent oracle: engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
- Persona checks: all passed

## Startup, 580 FICO, no revenue  (`startup-580`)

“I'm launching a food truck startup in Phoenix, AZ. No revenue yet — my FICO is 580 and I need $35,000 for working capital to get through the first six months. I'd rather not pledge my house.”

53 products considered · 27 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Chase                          My Chase Loan                      Conventional  68.8  from $500              Not published            Not published       up to 2 days     n/a
 2  Gem          Bluevine                       SBA 7(a) Loan                      Alternative   64.6  up to $350,000         Not published            Not published       same day         n/a
 3  Gem          Bluevine                       Term Loan                          Alternative   64.6  up to $500,000         Not published            Not published       same day         n/a
 4  Gem          Capital One                    VentureOne Business Credit Card    Conventional  63.8  Not published          16.74% – 22.74% APR      Not published       Not published    $3,238
 5  Gem          Bank of America                Small Business Administration Loan Conventional  63.3  from $25,000           Not published            Not published       Not published    n/a
 6  Gem          Capital One                    Spark 1.5% Cash Select Credit Card Conventional  62.9  Not published          16.74% – 26.74% APR      Not published       Not published    $3,271
 7  Gem          PNC                            SBA 7(a) Loan                      Conventional  62.8  up to $5,000,000       Not published            up to 15 years      Not published    n/a
 8  Gem          PNC                            SBA Express Loan                   Conventional  62.5  up to $500,000         Not published            Not published       Not published    n/a
 9  Gem          Newtek                         Business Loan                      SBA           62.3  $5,000 – $15,000,000   Not published            up to 25 years      Not published    n/a
10  Gem          U.S. Bank                      Business term loan                 SBA           61.7  $5,000 – $250,000      Not published            Not published       Not published    n/a
```

- Claim audit: 0 flags — every number, source and estimate label checked
- Independent oracle: engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
- Persona checks: all passed

## Contractor needing equipment  (`contractor-equipment`)

“I'm a general contractor in Tampa, Florida, in business for 6 years with about $40k a month in sales. FICO around 680. I need $120,000 for a new excavator and I can use the machine as collateral. I need the money within 3 weeks.”

53 products considered · 21 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond OnDeck                         OnDeck Line of Credit              Alternative   72.3  $6,000 – $200,000      Not published            1 year – 2 years    same day         n/a
 2  Gem          OnDeck                         OnDeck Term Loan                   Alternative   72.3  $5,000 – $400,000      Not published            up to 2 years       same day         n/a
 3  Gem          American Express Business Lin… American Express® Business Line o… Alternative   70.8  $2,000 – $250,000      Not published            Not published       1 day – 3 days   n/a
 4  Gem          Lendio                         SBA 504 Loan                       SBA           65.3  up to $5,000,000       Not published            up to 25 years      Not published    n/a
 5  Gem          Lendio                         SBA 7(a) Loan                      SBA           65.3  up to $5,000,000       Not published            up to 25 years      Not published    n/a
 6  Gem          Bluevine                       SBA 7(a) Loan                      Alternative   64.6  up to $350,000         Not published            Not published       same day         n/a
 7  Gem          Bluevine                       Term Loan                          Alternative   64.6  up to $500,000         Not published            Not published       same day         n/a
 8  Gem          Chase                          Business Line of Credit            Conventional  64.5  $10,000 – $500,000     Not published            5 years             Not published    n/a
 9  Gem          Bank of America                Small Business Administration Loan Conventional  63.3  from $25,000           Not published            Not published       Not published    n/a
10  Gem          PNC                            SBA 7(a) Loan                      Conventional  62.8  up to $5,000,000       Not published            up to 15 years      Not published    n/a
```

- Claim audit: 0 flags — every number, source and estimate label checked
- Independent oracle: engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
- Persona checks: all passed

## Non-US owner of a US LLC  (`nonus-llc`)

“I'm a citizen and resident of India and I own a Delaware LLC that sells SaaS to US customers. The LLC is 2 years old and does about $15k a month in revenue. My FICO is 690 from when I lived in the US. I need $50,000 of working capital.”

53 products considered · 33 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond Bluevine                       Business Line of Credit            Alternative   83.2  $10,000 – $250,000     7.8% APR                 Not published       1 day            $4,345
 2  Gem          OnDeck                         OnDeck Line of Credit              Alternative   71.3  $6,000 – $200,000      Not published            1 year – 2 years    same day         n/a
 3  Gem          OnDeck                         OnDeck Term Loan                   Alternative   71.3  $5,000 – $400,000      Not published            up to 2 years       same day         n/a
 4  Gem          American Express Business Lin… American Express® Business Line o… Alternative   70.3  $2,000 – $250,000      Not published            Not published       1 day – 3 days   n/a
 5  Gem          Bank of America                Business Advantage Credit Line Ca… Conventional  69.5  from $50,000           Not published            from 6 months       same day         n/a
 6  Gem          Chase                          My Chase Loan                      Conventional  67.9  from $500              Not published            Not published       up to 2 days     n/a
 7  Gem          Bluevine                       SBA 7(a) Loan                      Alternative   63.8  up to $350,000         Not published            Not published       same day         n/a
 8  Gem          Chase                          Business Line of Credit            Conventional  63.4  $10,000 – $500,000     Not published            5 years             Not published    n/a
 9  Gem          Capital One                    VentureOne Business Credit Card    Conventional  63.1  Not published          16.74% – 22.74% APR      Not published       Not published    $4,626
10  Gem          Capital One                    Spark 1.5% Cash Select Credit Card Conventional  62.1  Not published          16.74% – 26.74% APR      Not published       Not published    $4,673
```

- Claim audit: 0 flags — every number, source and estimate label checked
- Independent oracle: engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
- Persona checks: all passed

## Real estate investor  (`re-investor`)

“I'm a real estate investor in Georgia buying my third rental property. I've been investing for 4 years, FICO 740, and I need $300,000 to purchase a duplex. I can offer the property as collateral and I'm fine with a personal guarantee.”

53 products considered · 17 passed every hard filter · showing 10

```
 #  Label        Lender                         Product                            Cat.         Score  Amount                 Rate                     Term                Speed            Est. monthly
 1  Pink Diamond OnDeck                         OnDeck Term Loan                   Alternative   71.4  $5,000 – $400,000      Not published            up to 2 years       same day         n/a
 2  Gem          Chase                          Business Line of Credit            Conventional  64.7  $10,000 – $500,000     Not published            5 years             Not published    n/a
 3  Gem          Bluevine                       SBA 7(a) Loan                      Alternative   64.6  up to $350,000         Not published            Not published       same day         n/a
 4  Gem          Bluevine                       Term Loan                          Alternative   64.6  up to $500,000         Not published            Not published       same day         n/a
 5  Gem          Bank of America                Equipment Financing                Conventional  63.4  from $250,000          Not published            up to 7 years       Not published    n/a
 6  Gem          Bank of America                Franchise Financing                Conventional  63.4  from $250,000          Not published            up to 25 years      Not published    n/a
 7  Gem          PNC                            SBA 7(a) Loan                      Conventional  63.1  up to $5,000,000       Not published            up to 15 years      Not published    n/a
 8  Gem          Newtek                         Business Loan                      SBA           62.3  $5,000 – $15,000,000   Not published            up to 25 years      Not published    n/a
 9  Gem          Chase                          SBA Express Line of Credit         Conventional  61.2  up to $500,000         Not published            Not published       Not published    n/a
10  Gem          Citi                           Commercial Real Estate Loan        Conventional  61.1  $250,000 – $10,000,000 Not published            up to 20 years      Not published    n/a
```

- Claim audit: 0 flags — every number, source and estimate label checked
- Independent oracle: engine and oracle agree (nothing ineligible ranked, nothing eligible removed)
- Persona checks: all passed
