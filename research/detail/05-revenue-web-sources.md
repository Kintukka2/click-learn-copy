# ClickLearn ApS: revenue and intel from web and third-party sources

Research date: 2026-10-16. Scope: everything except Danish Virk/CVR annual reports, which another workstream covers.
Labels: **[ACTUAL/official]** means company-reported data, or a ranking built on company-submitted or registry financials, or a government record. **[ESTIMATE/third-party]** means a data-broker or model estimate.

---

## 1. Headline: the best revenue figures found

| Period | Revenue | Employees | Type | Source |
|---|---|---|---|---|
| FY2024 | **€7,890,731** | 25 | [ACTUAL/official] FT1000 2026 (Statista-verified submission) | Statista ranking API, see §2.1 |
| FY2021 | **€4,726,163** | 25 | [ACTUAL/official] FT1000 2026 | same |
| 2021→2024 | CAGR **18.75%** (rank **#951** of 1000) | — | [ACTUAL/official] | same |
| 2014→2017 | Absolute revenue growth **936%**; implied CAGR ≈ **118%**. Rank **#136**, and #18 of 149 tech companies | — | [ACTUAL/official] (ClickLearn's own blog post about FT1000 2019) | https://www.clicklearn.com/blog/no136-fastest-growing-companies/ |
| FY2024 | $11.3M (11,277,715 USD) | 75 | [ESTIMATE] Latka | https://getlatka.com/companies/clicklearn |
| FY2023 | $8.4M | 66 | [ESTIMATE] Latka | same |
| Mar 2021 | $6.3M (Latka labels it "reported"; source not given) | 25 | [ESTIMATE/unclear] Latka | same |

**Caveat on the FT1000 2026 figures.** These are almost certainly the Danish parent entity's numbers, not consolidated group figures. The ranking lists only 25 employees in both 2021 and 2024. LinkedIn shows 89 people and Tracxn 86, because the headcount includes the India and US teams. At roughly 7.46 DKK/EUR, €7.89M is about DKK 58.9M. At the 2024 average rate of about 1.08 USD/EUR, it is about $8.5M. That is well below Latka's $11.3M estimate.

---

## 2. Growth rankings

### 2.1 FT1000 2026 (Europe's Fastest-Growing Companies 2026, growth 2021–2024): ClickLearn LISTED
- Statista ranking page: https://rankings.statista.com/en/fastest-growing-companies/rankings/fastest-growing-companies-europe-2026/ (project ID P-175553).
- Row data comes from Statista's public table API, the same endpoint the page itself calls:
  `https://rankings.statista.com/api/ranking/table-data?projectName=P-175553&page=1&pageSize=25&filters=name~=ClickLearn`
- Exact row returned:
  `{"rank":951,"name":"ClickLearn","cagr":18.75,"headquarters":"Denmark","category":"IT & Software","revenue2024InEur":7890731,"revenue2021InEur":4726163,"employees2024":25,"employees2021":25,"foundingYear":2010}`
- Only 3 Danish companies are on the 2026 list: Frameo (#235), Clever (#320) and ClickLearn (#951). The list's minimum CAGR was 17.0% and its top CAGR was 621.7%, so ClickLearn only just qualified.
- FT article linked from the page: https://www.ft.com/content/afd4a379-6332-47bb-bc65-04bd6eb24a19 (FT is Cloudflare-blocked from this environment).
- Methodology note (Statista/FT FT1000): revenue figures are submitted by companies or researched from public sources, then checked by Statista.

### 2.2 FT1000 2019 (third edition, growth 2014–2017): ClickLearn #136
- ClickLearn blog post (undated; page shows "Updated February 23, 2026", author Anders Holm, CMO): ranked 136th, 18th of 149 tech companies, first appearance, "Absolute Revenue Growth" of 936%. https://www.clicklearn.com/blog/no136-fastest-growing-companies/ (also https://www.clicklearn.com/?p=1409).
- Edition confirmed as 2019 (period 2014–2017). "Third year of publication" matches FT1000 editions starting in 2017. The 149-technology-company count matches 2019 press coverage: https://businesscloud.co.uk/news/ft1000-europes-fastest-growing-firms-revealed/
- 2019 eligibility: revenue of at least €100k in 2014 and at least €1.5M in 2017 (https://virtuslab.com/company-news/ft100-2019).
- Implied CAGR is (1+9.36)^(1/3)−1 ≈ **118.0%**. This is derived, not published. Implied bounds: 2014 revenue at least €100k and 2017 revenue at least €1.5M. With 10.36× growth and the €1.5M floor, 2014 revenue was at least about €145k.
- A ClickLearn deck dated January 2020 also shows the badge "#136 - Fastest growing Company in Europe": https://download.clicklearn.com/get-smarter-2020-clicklearn-for-microsoft-partners.pdf
- **Absolute 2014 and 2017 euro revenue: NOT FOUND.** The FT 2019 table (https://www.ft.com/ft1000-2019) is behind a Cloudflare challenge. web.archive.org cannot be reached through this environment's proxy (connection reset). archive.ph returned 429 and is blocked for WebFetch. ig.ft.com/ft-1000/2019/ returns S3 AccessDenied (no object). No PDF or mirror copy of the 2019 table turned up in searches. This is the one remaining gap. Someone with FT access, or a working Wayback Machine, can read the row from https://www.ft.com/ft1000-2019; the columns are revenue 2017 (€'000), CAGR, and employees.

### 2.3 Other FT1000 editions
| Edition (growth period) | ClickLearn? | How checked |
|---|---|---|
| 2017 (2012–15) | Not listed | Full table at https://ig.ft.com/ft-1000/ grepped, 0 matches |
| 2018 (2013–16) | Not listed | Full list PDF (FT, Feb 12 2018) hosted at https://deepsense.ai/wp-content/uploads/2019/05/The-FT-1000_-The-complete-list-of-Europe%E2%80%99s-fastest-growing-companies-_-Financial-Times.pdf, 0 matches. Consistent with "first time" in 2019 |
| 2019 (2014–17) | **#136** | See §2.2 |
| 2020–2024 | Not verified (FT/old Statista pages unreachable; old r.statista.com pages redirect). No ClickLearn announcement found, and the company's blog has only the one FT1000 post | — |
| 2025 (2020–23) | **Not listed** | Statista API P-174727. Name search "Click" returns only Revù Clinic, Comfort Click and CLIQ Digital. Danish entries are Frameo and SwipBox only |
| 2026 (2021–24) | **#951** | See §2.1 |
| Long-Term Growth Champions Europe 2025/2026 (P-174776 / P-175581) | Not listed | Statista API |
| The Americas' Fastest Growing 2025/2026 (P-175204 / P-175882) | Not listed | Statista API |

### 2.4 Other rankings: no evidence found
- Deloitte Technology Fast 50 Denmark / Fast 500 EMEA, Børsen Gazelle, Inc. 5000, Inc. 5000 Europe, Tampa Bay Business Journal Fast 50 and Florida Companies to Watch: web searches found nothing naming ClickLearn. I couldn't query the Børsen Gazelle lists directly because they are paywalled.

---

## 3. US government data

### 3.1 PPP loans: NONE for Clicklearn US Inc
- I stream-searched all 13 official SBA PPP FOIA CSVs (public_150k_plus_240930.csv and public_up_to_150k_1..12_240930.csv, from https://data.sba.gov/dataset/ppp-foia) for `click.{0,2}learn`, case-insensitive. All downloads completed (curl exit 0).
- Only hit: "ONE CLICK LEARNING LLC", Odessa FL, $10,227 (NAICS 611710). This is unrelated.
- **Conclusion: Clicklearn US Inc did not take a PPP loan, at least not under any name containing "ClickLearn".** Payroll can't be inferred from PPP data. (federalpay.org and ProPublica bailout pages are bot-blocked, so I used the raw SBA data instead.)

### 3.2 Federal contracts (USAspending), which give a real price point
- Award **DTFACT15P00275**, a purchase order from the FAA (DOT FAA Technical Center, office 692L79). It went through reseller **ASTRA Inc** (Tucson, AZ). Signed 2015-09-14, total obligation **$53,950** ($55,000 initial, then −$1,050 in mod 3 on 2017-03-15). Sole source, "UNIQUE SOURCE".
  - Line items, quoted from the description: "CLICKLEARN FOR IFS (PERPETUAL LICENSE) BASE CONFIGURATION INCLUDES: IFS CONNECTOR AND 1 CONCURRENT AUTHOR LICENSE **$30,000.00**; 5 ADDITIONAL CONCURRENT AUTHOR LICENSES **$15,000.00**; MS OFFICE CONNECTOR AND IE CONNECTOR **$10,000.00**". Purpose: user guides and training for the ILM 2.0 transition program.
  - So in 2015 a perpetual base licence with one author cost about $30k, and each additional concurrent author cost about $3k.
  - API: https://api.usaspending.gov/api/v2/awards/CONT_AWD_DTFACT15P00275_6920_-NONE-_-NONE-/ ; web: https://www.usaspending.gov/award/CONT_AWD_DTFACT15P00275_6920_-NONE-_-NONE-
- No other USAspending contract awards or IDVs mention "ClickLearn" or "Click Learn" in their descriptions for FY2008 to FY2026. No recipient is named ClickLearn, so US federal sales seem to go through resellers.
- SAM.gov and GovSpend: not checked (they need a login).

---

## 4. UK and EU public procurement

- **UK Department for Education, notice con_16526**, "CLICKLEARN - FINANCIAL OPERATIONS". Awarded to "Clicklearn", Sjaeleboderne 2, Copenhagen K, DK-1122, for **£32,531.56** over 2022-07-18 to 2024-07-17 (two years, so about £16.3k a year). The scope is "ClickLearn Enterprise software for Business Central system". Procedure: competitive quotation (non-OJEU). The award is flagged as **not** an SME.
  - https://www.contractsfinder.service.gov.uk/Notice/d2801392-0714-4cc7-9483-65992b50f627 (API: https://www.contractsfinder.service.gov.uk/api/rest/2/get_published_notice/json/d2801392-0714-4cc7-9483-65992b50f627)
  - This is the only ClickLearn hit in the Contracts Finder keyword API.
- **TED (EU)**: the API (https://api.ted.europa.eu/v3/notices/search) found 0 notices for "clicklearn". The 3 hits for "click learn" (Holding Graz 2022/2023, Wirtschaftskammer Österreich 2023) relate to the Austrian training firm CLICK&LEARN GmbH, which is unrelated.
- UK Companies House: no ClickLearn entity. The only match is CLICKLEARNER LTD, Sheffield, which is unrelated.

---

## 5. Pricing and price points

- **Capterra** lists annual plans, currency not stated (G2 shows € for one of them): Basic **6,350**, Essentials **12,350**, Professional **23,350**, Enterprise **27,350** per year. https://www.capterra.com/p/231337/Click-Learn/pricing/ (fetched 2026-10-16). [third-party listing, likely vendor-supplied]
- **TrustRadius**: 8 editions from **$208 to $1,023 per month per installation**, on-prem or cloud (search snippet only; page is bot-blocked). https://www.trustradius.com/products/clicklearn/pricing
- **ClickLearn's own pricing page** has a configurator (platforms, number of authors, number of users, edition). Prices render as €0 or "Get quote" server-side, and Oracle, IFS and SAP need tailored quotes. Onboarding Services is sold at a fixed price. https://www.clicklearn.com/pricing/
- **Licence terms**: subscription (annual), perpetual (one-time plus mandatory first-year maintenance, no price increases for 24 months), ISV (annual) and trial. Subscription is priced on named authors and end-users. Version 3 dates from Dec 2020 and Version 5 from Apr 2026. https://www.clicklearn.com/?p=45607
- **Partner economics** (2020 deck): partners earn a "20% margin on any sales and additional 5% re-occurring". ClickLearn moved from perpetual to subscription licensing around 2020, with a reseller program. https://download.clicklearn.com/get-smarter-2020-clicklearn-for-microsoft-partners.pdf ; https://download.clicklearn.com/clicklearn-partner-program-handout.pdf ; MSDW podcast https://msdynamicsworld.com/node/28688 (Cloudflare-blocked; snippet only)
- **Real transaction prices**: FAA 2015 paid $55k for a perpetual licence with 6 concurrent authors and 3 connectors (§3.2). UK DfE paid £32.5k for two years of Enterprise on Business Central (§4).
- **Microsoft AppSource**: the Business Central add-in listing is a free connector that requires an existing ClickLearn licence (no price shown). https://appsource.microsoft.com/en-us/product/dynamics-365-business-central/PUBID.clicklearn-4120530%7CAID.clicklearn%7CPAPPID.08015097-573b-26c3-bb1a-6683814fb2a7

---

## 6. Third-party estimates [ESTIMATE/third-party]

| Source | Revenue | Employees | Other | Date / URL |
|---|---|---|---|---|
| Latka | $11.3M (2024), $8.4M (2023), $6.3M (Mar 2021) | 75 (Dec 2024); 67 (Oct 2024); 66 (2023); 60 (2022); 54 (2021); 25 (Mar 2021) | Bootstrapped; comparison pages show "valuation $118.4M" with no stated method | Updated Dec 20, 2024. https://getlatka.com/companies/clicklearn |
| Growjo (via ForesightIQ) | $11.5M | 79 | — | https://growjo.com/company/ClickLearn (403); https://www.foresightiq.co/competitive-landscape/clicklearn |
| ZoomInfo | $10.7M | — | — | https://www.zoominfo.com/c/clicklearn-aps/372580558 (403; search snippet) |
| Datanyze (ZoomInfo data) | $10.7M | 51 | — | https://www.datanyze.com/companies/clicklearn/372580558 (403; snippet) |
| RocketReach | $9.0M | 56 | — | https://rocketreach.co/clicklearn-aps-profile_b5cd87bbf42e0b68 (403; snippet) |
| Prospeo | $10.0M; $124k/employee | 59 (51–100 band): 28 engineering, 8 sales, 6 marketing | "Estimated valuation" $32M (industry average); never raised funding | https://prospeo.io/c/clicklearn |
| Owler | $5–25M range | 25–100 | — | https://www.owler.com/company/clicklearn (blocked; snippet) |
| Tracxn | — | 86 (as of May 2026) | Unfunded; lists Michael Randrup as co-founder | https://tracxn.com/d/companies/clicklearn/__-vs7WzujZMprJBmzYBN_IokJDddQEej6ug4raaMglrA (403; snippet) |
| Kompass | — | 20–49 | — | https://gb.kompass.com/en/c/clicklearn-aps/dkcom132056/ |
| BuiltWith | — | "10+" | +1-727 (Florida) phone number | https://builtwith.com/meta/clicklearn.com |
| Crunchbase, Dealroom, PitchBook, Craft, Comparably, Kona Equity, Apollo, 6sense, LeadIQ | — | — | Blocked (403/429/410/404); no snippet figures found | — |
| CB Insights | — | — | Unclaimed profile, no financials | https://www.cbinsights.com/company/clicklearn-aps |

Note: the estimates of about $9–11.5M are higher than the FT1000-verified €7.9M (about $8.5M) for 2024. That gap holds even if the estimators are modelling the whole group.

---

## 7. Company-reported operating metrics [ACTUAL/official, self-reported]

| As of | Customers | Employees | Countries | Other | Source |
|---|---|---|---|---|---|
| Jan 2020 | 395 corporate customers | 60 | 44 | 137 Microsoft partners; offices in DK, US, IN; founded 2010 "after 4 years of core product R&D" | https://download.clicklearn.com/get-smarter-2020-clicklearn-for-microsoft-partners.pdf |
| Mar 2023 (PDF created 2023-03-13) | 700+ | — | 50+ | 8,000+ authors; 240k+ end-users; offices in Copenhagen, Tampa FL and Ahmedabad | https://download.clicklearn.com/product-overview-directionsna.pdf |
| Oct 2026 (About page counters) | 800+ ("since 2013, more than 800 companies") | 50+ | 27 | 750k end-users | https://www.clicklearn.com/about/ (values from data-to-value attributes) |
| Careers page (via ForesightIQ) | "300+ large enterprise customers across 25 countries" | — | — | — | cited at https://www.foresightiq.co/competitive-landscape/clicklearn |
| LinkedIn (Oct 2026) | — | **89 on LinkedIn**; band 51–200 | — | 5,773 followers; offices in Copenhagen, St. Petersburg FL and Ahmedabad | https://www.linkedin.com/company/clicklearn |

Growth implied by the self-reported data: customers rose from 395 (Jan 2020) to 700+ (Mar 2023) to 800+ (2026). That is fast growth through 2022, then a clear slowdown, which matches the FT1000 2026 CAGR of just 18.75%.

---

## 8. Web traffic [ESTIMATE]
- Similarweb (Sept 2026): **16.2K total visits over the last 3 months**. Global rank #1,545,097 and US rank #840,383. Bounce rate 45.65%. Top countries: India 29%, US 26%, UK 14%, Germany 9%. https://www.similarweb.com/website/clicklearn.com/ (the visit figure looks low for an enterprise SaaS vendor, so treat it with caution)

---

## 9. Entities, offices and people
- Offices (contact page): Denmark, Sjæleboderne 2, 1.th, 1122 Copenhagen (+45 88 77 47 35). India, PV Enclave, Bodakdev, Ahmedabad, Gujarat 380059. **United States, 200 Central (Ave), 4th Floor, St. Petersburg, FL 33701.** Australia, Unit 177/189 Adelaide Tce, East Perth 6004. https://www.clicklearn.com/contact/
- The Sunbiz (Florida) record for Clicklearn US Inc couldn't be retrieved (403). OpenCorporates and Bizapedia snippets found nothing.
- People: Joachim Schiermacher (CEO), Michael Randrup / "Michael Randrup Sørensen" (co-founder, director), Anders Holm (CMO), Wouter Hieronimus (IFS-side commercial lead, active at IFS Unleashed 2026), Mark Olesen (Partner Channel Manager, 2022). Other directories name Michael Olsen (Founder, Chief Architect) and Peter Simun. Sources: prospeo, Tracxn snippet, blog posts.

---

## 10. Trademarks and patents
- **TMview** (covers EUIPO, DKPTO, USPTO and others; API https://www.tmdn.org/tmview/api/search/results): **no trademark filed by ClickLearn ApS** for "ClickLearn", "InsideHelp", "VoiceCloud", "User Experience Panel" or "Attain".
  - "ClickLearn" is **registered in South Korea** by **(주)자이닉스 (Xinics Inc.)** in Nice classes 9 and 42 (applications 4020170149914 and 4020170149926, filed 2017-11-24). This is a potential brand conflict in Korea.
  - "CLICK & LEARN" is registered in Austria (AT 4447/2001) by CLICK&LEARN GmbH (Linz). This is an unrelated, older company, and it is the source of name confusion in TED and eLearning directories.
  - "CLICK LEARNING" is registered in the UK (UK00004094792, 2024, Flourish Hub Group Ltd, classes 35 and 41).
- Patents: Google Patents shows **0 results** for assignee "ClickLearn".

---

## 11. Recent news, partnerships and product (2024–2026)
- Oct 10, 2024: partnership with **Colossyan** (AI avatars for training video). https://www.clicklearn.com/blog/clicklearn-and-colossyan-join-forces-to-revolutionize-digital-learning/
- Mar 2025: Salesforce integration launch at Education Summit 2025 (Chicago). The **User eXperience Panel (UXP)** is described as a new AI product. https://www.clicklearn.com/?p=32892
- Aug 27, 2025: partnership with **Fudgelearn** (pre-made Oracle documentation). https://www.clicklearn.com/blog/fudgelearn-clicklearn-partnership/
- Nov 7, 2025: CEO keynote "ClickLearn 2025 – Roadmap to Smarter Authoring" at MasterClass 2025. https://community.clicklearn.com/masterclass-2025-120/keynote-clicklearn-2025-roadmap-to-smarter-authoring-1411
- Jan 2026: IFS Sales Kickoff (Dallas). Apr 2026: exhibiting at Learning Technologies London with BR One. https://www.clicklearn.com/events/learning-technologies-2026/
- Sep–Oct 2026: **Gold Sponsor of IFS Unleashed 2026** (Orlando, Booth 10). Also the sixth anniversary of the **ClickLearn Attain** product, which places its launch around autumn 2020. MasterClass 2026 is set for Oct 27 (LinkedIn).
- Oracle AI World 2025, Las Vegas, booth 10014 (ForesightIQ citing clicklearn.com/events).
- Channels: IFS Platinum / Global Technology Alliance Partner (IFS relationship since 2015), Microsoft partner channel (OneTeam program, with a stated aim of 70% of business via partners), plus Salesforce, SAP, Oracle and Acumatica connectors.
- Named customers (case studies): Portsmouth Aviation, CKS Packaging (11 plants), RUX, DuraServ, Ascensus, Atradius, Thrive Homes, Aptean, K3, ERA, Georg Fischer Piping Systems (1,000+ employees), Multiplex, TravelOperations. Public sector: FAA (2015) and UK DfE (2022–24). https://www.clicklearn.com/customers/
- **M&A, funding, lawsuits:** none found. Every source describes the company as bootstrapped or unfunded and independent. A CB Insights "acquired by AppLearn (Feb 2022)" item refers to YesElf, not ClickLearn.

## 12. Employee reviews and salary
- Glassdoor (https://www.glassdoor.com/Overview/Working-at-ClickLearn-EI_IE2530445.11,21.htm) is bot-blocked, and no rating snippet was retrievable. The Indeed "Click Learning" page is a different South African company. No salary data found.

## 13. Blocked or unavailable sources (for follow-up)
- ft.com (Cloudflare): FT1000 2019 absolute revenue and the 2020–2024 lists.
- web.archive.org (proxy connection reset) and archive.ph (429).
- Owler, ZoomInfo, Crunchbase, Dealroom, PitchBook, Craft, Growjo, RocketReach, Comparably, Tracxn, G2, TrustRadius, msdynamicsworld.com, ecommercetimes.com, federalpay.org, ProPublica, Sunbiz and Glassdoor all returned 403 or a bot check.
