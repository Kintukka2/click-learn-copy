# ClickLearn: revenue and financials

Researched 16 October 2026. This file combines four sources:
1. Every annual report ClickLearn ApS filed in Denmark (CVR 33075731), 2012–2025. The XBRL and PDF versions come from Virk's public index (`distribution.virk.dk/offentliggoerelser`), and every numeric fact in them was parsed.
2. The filings of its subsidiaries and of its owners' holding companies.
3. Indian company-registry aggregators.
4. Official third-party revenue disclosures, which are covered in detail in [05-revenue-web-sources.md](05-revenue-web-sources.md).

**Labels:**
- **[ACTUAL]**: an official figure, either from a statutory filing or from a ranking that used revenue the company submitted (FT1000/Statista).
- **[DERIVED]**: calculated directly from actual figures.
- **[ESTIMATE]**: a modelled figure; the method is shown.

---

## 1. Headline: revenue

| Year | Revenue | DKK equivalent | Status |
|---|---|---|---|
| 2021 | **€4,726,163** | DKK 35.3m | **[ACTUAL]**: FT1000 2026 (Statista) |
| 2024 | **€7,890,731** | DKK 58.9m | **[ACTUAL]**: FT1000 2026 (Statista) |
| 2022 | about €6.15m | about DKK 45.9m | [ESTIMATE] (§3) |
| 2023 | about €7.06m | about DKK 52.7m | [ESTIMATE] (§3) |
| **2025** | **about €8.3–8.8m** (about US$9.0–9.9m) | DKK 61.9–65.3m | [ESTIMATE], tightly bounded (§3) |

- **Source of the two actual figures:** they come from the Statista data behind the *FT1000: Europe's Fastest-Growing Companies 2026* ranking. ClickLearn is #951 of 1,000, with a CAGR of 18.75% for 2021–2024, 25 employees in both years, and founding year 2010.
  - Retrieved and re-verified from Statista's public ranking API: `https://rankings.statista.com/api/ranking/table-data?projectName=P-175553&page=1&pageSize=25&filters=name~=ClickLearn`
  - Returned row: `{"rank":951,"name":"ClickLearn","cagr":18.75,"headquarters":"Denmark","revenue2024InEur":7890731,"revenue2021InEur":4726163,"employees2024":25,"employees2021":25,"foundingYear":2010}`
- **Entity covered:** the 25 employees match the Danish parent's own FTE figures (24 in 2024, 22 in 2021). So these revenue figures are for **ClickLearn ApS alone**. That is effectively group revenue, because the Indian and US subsidiaries run as low-margin cost centres (§5).
- **Why the annual reports don't show revenue:** ClickLearn ApS reports as a Danish class B company. It uses ÅRL §32 to combine "nettoomsætning" (revenue) and "eksterne omkostninger" (external costs) into a single gross-profit line. Its own accounting-policies note says so: *"Selskabet har foretaget et sammendrag af posterne 'nettoomsætning' samt 'eksterne omkostninger'"*. That is why revenue never appears in the statutory accounts. The FT1000 submission is the only official revenue disclosure found.

### 1.1 Third-party estimates compared with the actual figure
| Source | Their figure | Compared with actual |
|---|---|---|
| Latka | $11.3m (2024), $8.4m (2023), $6.3m (2021) | 2024 is about 30% too high; 2023 is close |
| Growjo | $11.5m | Too high |
| ZoomInfo | $10.7m | Too high |
| RocketReach | $9.0m | About 5% high |
| Prospeo | $10m | Too high |
| Owler | $5–25m | Correct range, but not informative |

The data brokers consistently overstate revenue by roughly 5–35%.

---

## 2. Complete figures from the annual reports, 2015–2025 [ACTUAL, DKK millions]

| Item | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Gross profit** | 2.40 | 8.56 | 12.25 | 16.90 | 27.54 | 25.46 | 22.32 | 29.58 | 34.59 | 39.35 | **41.35** |
| Staff costs (total) | 0.75 | 3.26 | 9.19 | 13.32 | 22.12 | 23.88 | 25.84 | 31.58 | 31.25 | 33.05 | **37.55** |
| ↳ Wages and salaries | | | | | | | | 17.01 | 16.24 | 16.89 | 19.68 |
| ↳ Other staff costs | | | | | | | | 13.79 | 14.28 | 15.42 | 16.96 |
| Depreciation and amortisation | | | | 0.40 | 0.57 | 0.48 | 0.45 | 0.19 | 0.29 | 0.59 | 1.11 |
| Operating profit (EBIT) | 1.65 | 5.29 | 3.06 | 3.19 | 4.86 | 1.10 | **−3.97** | **−2.19** | 3.05 | 5.72 | 2.69 |
| Net profit | 1.26 | 4.18 | 2.29 | 2.39 | 3.56 | −0.05 | −3.15 | −1.81 | 2.23 | 4.20 | 0.24 |
| Average FTE (Danish entity) | | | | | 20 | 22 | 23 | 24 | 22 | 24 | 26 |
| Deferred income (prepaid subscriptions) | 0.59 | 1.78 | 3.33 | 5.73 | 8.07 | 9.77 | 12.90 | 17.27 | 20.10 | 22.76 | **31.62** |
| Trade receivables | 0.73 | 4.87 | 3.76 | 6.61 | 5.28 | 6.78 | 8.00 | 11.41 | 10.08 | 12.29 | 14.36 |
| Cash | 1.70 | 2.75 | 5.42 | 5.95 | 9.72 | 8.29 | 4.99 | 8.47 | 21.63 | 19.10 | 23.49 |
| Total assets | 2.57 | 8.77 | 9.83 | 20.37 | 22.51 | 22.26 | 20.76 | 28.12 | 40.19 | 38.26 | 45.58 |
| Equity | 1.31 | 4.49 | 3.78 | 3.17 | 6.72 | 6.61 | 2.03 | **0.31** | 2.48 | 5.32 | 2.56 |
| Proposed dividend | 1.00 | 3.00 | 3.00 | 0 | 0 | 1.50 | 0 | 0 | 1.50 | 3.00 | 1.50 |

Earlier years (gross profit): 2012 0.96, 2013 0.62, 2014 0.96.

**What the figures show [DERIVED]:**
- **Staff costs consume about 91% of gross profit** (2025: 37.55 / 41.35), so operating margin is thin.
- **Wages:** Danish wages average about DKK 757k per FTE (19.68m ÷ 26).
- **"Other staff costs" of DKK 17m** sit alongside DKK 19.7m of Danish wages. This line almost certainly covers what ClickLearn pays for its Indian and US teams through the subsidiaries (§5) [ESTIMATE].
- **Deferred income grew 39% in 2025**, against 5% gross-profit growth. Prepaid subscriptions of DKK 31.6m equal about 50% of estimated 2025 revenue (39% in 2024). That points to faster bookings or longer prepaid terms going into 2026.
- **The business is funded by customers.** It has carried no bank debt to speak of: short-term bank debt never exceeded DKK 0.27m. Cash (DKK 23.5m) is nine times equity (DKK 2.6m), so customers' prepayments fund the business and the owners take profits out as dividends.
- **Dividends** proposed from 2012 to 2025 total about **DKK 14.6m**.
- **Equity bottomed out at DKK 0.31m in 2022** after two loss years. Management called 2022 *"unsatisfactory"* and 2023 *"satisfactory"*.
- **Revenue is recognised as invoiced revenue less prepayments.** Subscriptions are billed in advance and recognised over time (2025 accounting policies).

---

## 3. Revenue model for the years without an official figure

The two actual data points calibrate the ratio of gross profit to revenue:

| Year | Revenue (actual) | Gross profit (actual) | Gross profit / revenue | External costs (derived) |
|---|---|---|---|---|
| 2021 | DKK 35.26m | DKK 22.32m | **63.3%** | DKK 12.94m |
| 2024 | DKK 58.86m | DKK 39.35m | **66.8%** | DKK 19.51m |

- **What external costs cover:** cost of sales, selling, premises and administration. That means Azure hosting, partner commissions, marketing and events, software, and travel. The 2020 partner deck states partner terms of a **20% margin plus 5% recurring**.
- **Ratio is stable:** the ratio stayed at roughly 63–67% across the transition to subscriptions. So revenue ≈ gross profit ÷ 0.633–0.668.

| Year | Gross profit (actual) | **Revenue estimate (DKK m)** | **Revenue estimate (€m)** | Confidence |
|---|---|---|---|---|
| 2015 | 2.40 | 3.6–3.8 | 0.48–0.51 | Low (pre-subscription model) |
| 2016 | 8.56 | 12.8–13.5 | 1.72–1.81 | Low |
| 2017 | 12.25 | 18.3–19.4 | 2.46–2.59 | Low–medium |
| 2018 | 16.90 | 25.3–26.7 | 3.39–3.58 | Medium |
| 2019 | 27.54 | 41.2–43.5 | 5.52–5.83 | Medium |
| 2020 | 25.46 | 38.1–40.2 | 5.11–5.39 | Medium |
| **2021** | 22.32 | **35.3** | **4.73** | **Actual** |
| 2022 | 29.58 | about 45.9 | about 6.15 | High (ratio interpolated) |
| 2023 | 34.59 | about 52.7 | about 7.06 | High (ratio interpolated) |
| **2024** | 39.35 | **58.9** | **7.89** | **Actual** |
| **2025** | 41.35 | **61.9–65.3** | **8.29–8.76** | High (ratio from the anchors) |

**Cross-checks:**
- **FT1000 2019** reported 936% absolute revenue growth over 2014–2017, and required at least €1.5m revenue in 2017. The model's 2017 figure of about €2.5m clears that floor and implies 2014 revenue of about €0.24m.
- **Latka's 2023 figure** of $8.4m (about €7.8m) is close to the model's €7.06m.
- **Price points multiplied by customers:** the company claims about 800 customers. Public contracts show prices of about £16k a year (UK DfE, 2022–24) and $54k for a perpetual licence (FAA, 2015). The pricing calculator runs from $4.5k to $27.5k for the edition alone. A revenue of €8–9m implies about **€10–11k average revenue per customer per year**, which fits the price list.
- **Revenue per employee:** €7.9m across roughly 80–90 group staff (LinkedIn 89, Tracxn 86) is about **€90–100k per head**. That is typical for a bootstrapped software company with a low-cost offshore engineering team.

**Growth track:**
- Hypergrowth from 2015 to 2019, with revenue up roughly 11× over four years.
- 2020–2021 decline (COVID; the switch from perpetual licences to subscriptions; the Attain re-platform).
- 2021–2024 recovery at 18.75% CAGR [ACTUAL].
- 2025 slowed to about 5–11% [ESTIMATE].
- Deferred income growth (+39%) suggests 2026 revenue will grow faster than 2025's.

---

## 4. Ownership: verified from the owners' own 2025 annual reports [ACTUAL]

| Shareholder (holding company) | CVR | Ultimate owner | Stake in ClickLearn ApS | Evidence |
|---|---|---|---|---|
| Space Act Holding ApS | 32552331 | Michael Randrup Sørensen | **33.33%** | Its 2025 annual report, note 4: "Clicklearn ApS, København K 33,33%", share of profit DKK 79,394, share of equity DKK 853,263 |
| MOL IT Holding ApS | 36958790 | Michael Olsen | **33.33%** | Its 2025 annual report, note 4: "Clicklearn ApS … 33,33%" |
| Enigma Holding ApS | 26398606 | Joachim Schiermacher | **33.33%** (the remainder) | Carries "Kapitalandele i associerede virksomheder" at a cost of DKK 40,000; paid itself an extraordinary dividend of DKK 1.0m in 2025 |

**Earlier ownership:**
- Up to 2018–19, ClickLearn was jointly taxed with **"Randrup & Schiermacher Holding ApS"** as the administration company. That means a joint Randrup/Schiermacher holding company controlled the majority at the time. From 2020 ClickLearn ApS itself is the administration company of its own tax group, so the current three-way 33% split dates from about 2019–2020 [DERIVED from the joint-taxation notes, 2016–2021].
- Early boards of directors (2012–2014) included **Ole Schiermacher, Jacob Schiermacher, Chris Hanson and Peter Stilund Torstensen**, alongside the founders. Since 2017 the executive board has been Schiermacher (CEO, "Adm. direktør"), Olsen ("Underdirektør"), Randrup Sørensen and Theis Linnet Aagaard (directors).

---

## 5. Group structure, newly mapped [ACTUAL]

```
ClickLearn ApS (DK, CVR 33075731)  ← 3 × 33.33% founder holding companies
├── Clicklearn US Inc. (100%)                 US sales/office, St. Petersburg FL
│     2022: profit DKK 0.44m, equity 1.90m   2023: 0.55m / 2.38m   2025: 0.25m / 2.54m
└── Integdevelopment ApS (DK, CVR 35142436, 100%, bought 2018)   dormant holding company
      └── ClickLearn India Private Limited (100%)   ← formerly "AzureTeam Software Development India Pvt. Ltd"
            CIN U74900DL2013PTC253596 · incorporated 5 Jun 2013 · registered office Delhi
            operating office: C G Road / Vasant Vihar, Ahmedabad (GSTIN 24AALCA7058C1ZT)
```

### Integdevelopment ApS (CVR 35142436)
- **Founded 2013 by Lasse Skytte Knudsen**, a cloud-computing consultancy ("konsulentbistand indenfor cloud-computing"). It had revenue of DKK 2.62m in 2014 and DKK 2.52m in 2015.
- ClickLearn ApS **bought it in 2018**; the 2018 annual report says *"Selskabet har i regnskabsåret erhvervet kapitalandelene i Integdevelopment ApS"*.
  - The investment was booked at DKK 5.3m.
  - Goodwill of DKK 2.9m remained in 2022 and DKK 1.33m in 2025, still being amortised.
- Its only real asset is **100% of the Indian company**. Paid-up capital is INR 2.5m, booked at DKK 255k. The Indian company was profitable in 2016 (equity DKK 357k, result DKK 67k).
- **Theis Linnet Aagaard** has been its director since 2018. The company has been dormant since then, with no staff and losses of about DKK 15k a year.
- **The acquisition was effectively how ClickLearn bought its Ahmedabad engineering team** [DERIVED].

### ClickLearn India Private Limited (CIN U74900DL2013PTC253596)
- **Directors:**
  - Joachim Schiermacher and Theis Linnet Aagaard, both appointed 31 Aug 2018, right after the acquisition.
  - **Kuntal Pradip Shah**, currently.
  - Earlier: **Mehul Trivedi** (Managing Director from Sep 2013) and Lasse Skytte Knudsen (director from 2013).
- **Contact email:** mat@clicklearn.com (older listing); \*\*\*\*\*learnindia@\*\*\*\*\*learn.com (current).
- **Revenue range:** "INR 1 cr – 100 cr" (Tofler, FY Mar-2020).
- **FY Mar-2026, filed (Falcon eBiz):** total revenue **+39.76%** year on year, EBITDA +63.75%, net profit +93.29%, **net profit margin 2.69%**, ROE 7.71%.
- **FY Mar-2020:** revenue +95%, net margin 0.37%.
- **A net margin of about 0.4–2.7% is the signature of a cost-plus captive development centre.** It bills its costs plus a small markup to the Danish parent, which is consistent with the DKK 17m "other staff costs" line in Copenhagen. The 40% revenue rise in FY2026 means **the Indian engineering team grew substantially during 2025–26** [DERIVED].
- **The exact INR figures can be bought:**
  - Tofler: dashboard ₹449, MCA filings ₹349.
  - Falcon eBiz: reports.
  - MCA21: official filings, inexpensive.
  - Buying the FY2026 filing would reveal the size of the Indian team's cost base.

### Clicklearn US Inc.
- **Office:** 200 Central Ave, 4th Floor, St. Petersburg, FL 33701.
- **Results:** small and steady profits (DKK 0.25–0.55m) on equity of about DKK 2.5m. This is consistent with a sales and support subsidiary paid on a cost-plus or commission basis, while customer contracts and revenue are booked mainly by the Danish parent [ESTIMATE].
- **PPP:** no record in any of the 13 SBA PPP datasets.

---

## 6. Real price points from public procurement [ACTUAL]

| Buyer | Year | What | Price |
|---|---|---|---|
| US FAA, via reseller ASTRA Inc (USAspending DTFACT15P00275) | 2015 | ClickLearn for IFS, perpetual: base configuration with IFS connector and 1 concurrent author | $30,000 |
| | | 5 additional concurrent authors | $15,000 (about $3k each) |
| | | MS Office and IE connectors | $10,000 |
| | | **Total obligated** | **$53,950** |
| UK Department for Education (Contracts Finder con_16526) | 2022–24 | ClickLearn Enterprise for Business Central, 2 years | **£32,531.56** (about £16.3k a year) |

Current list prices (pricing calculator, annual): Basic $4,500, Essentials $11,125, Professional $23,125, Enterprise $27,500, plus $475 per author, $4.50 per end user, and platform fees. See [01-product-and-content.md](01-product-and-content.md).

---

## 7. Indicative valuation [ESTIMATE, for orientation only]

**Profile:**
- Revenue about €8.3–8.8m (2025).
- Growth 5–19%.
- About 60–70% of revenue recurring and prepaid.
- EBIT margin about 4% (2025) to 10% (2024).
- Founder-owned, no debt, clean cap table, owns its Indian engineering subsidiary.

**Range:**
- Private bootstrapped SaaS businesses of this size and growth usually trade at about **2–4× revenue**, which gives roughly **€17–35m enterprise value**.
- Prospeo's "$32m" falls inside that range; Latka's "$118m" does not, and has no basis.
- Strategic buyers in ERP ecosystems (IFS, Microsoft partners, adoption-platform consolidators) could pay at the top of the range or above it, given the IFS and Dynamics channel.

---

## 8. Still not public

- Exact consolidated group revenue. Revenue is effectively the parent's, but the US subsidiary's own sales aren't broken out.
- Revenue and profit for FT1000 2019's base years (2014 and 2017): ft.com was blocked from this environment. The row is at https://www.ft.com/ft1000-2019 for anyone with FT access.
- The Indian subsidiary's exact INR revenue and headcount. They are inexpensive to buy from MCA21, Tofler or Falcon eBiz.
- The US subsidiary's revenue: Florida corporations don't publish accounts.

---

## Sources
- Virk annual reports, ClickLearn ApS (CVR 33075731), 2012–2025: `http://distribution.virk.dk/offentliggoerelser/_search` with `cvrNummer:33075731`. Key passages: the 2016–2021 accounting policies (gross-profit aggregation), the 2018 management review (acquisition of Integdevelopment), and note 8 in 2022, 2023 and 2025 (subsidiaries).
- Virk filings for Integdevelopment ApS (CVR 35142436), 2013–2025; the 2016 note names "AzureTeam Software Development India Pvt. Ltd".
- Virk 2025 annual reports for Space Act Holding ApS (32552331), MOL IT Holding ApS (36958790) and Enigma Holding ApS (26398606).
- Statista FT1000 2026 API (above); FT1000 2019 coverage on the [ClickLearn blog](https://www.clicklearn.com/blog/no136-fastest-growing-companies/).
- [Insiderbiz: AzureTeam / ClickLearn India](https://www.insiderbiz.in/company/AZURETEAM-SOFTWARE-DEVELOPMENT-INDIA-PRIVATE-LIMITED), [Tofler](https://www.tofler.in/azureteam-software-development-india-private-limited/company/U74900DL2013PTC253596), [Falcon eBiz](https://www.falconebiz.com/company/AZURETEAM-SOFTWARE-DEVELOPMENT-INDIA-PRIVATE-LIMITED-U74900DL2013PTC253596), [Justdial (Ahmedabad office)](https://www.justdial.com/Ahmedabad/AzureTeam-Software-Development-India-Pvt-Ltd-Near-Girish-Cold-Drink-Cross-C-G-Road-C-G-Road/079PXX79-XX79-180528213044-Z7M7_BZDET).
- Third-party estimates, procurement records, PPP checks and other intelligence: see [05-revenue-web-sources.md](05-revenue-web-sources.md).
