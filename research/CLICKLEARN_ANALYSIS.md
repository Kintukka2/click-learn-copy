# ClickLearn: full analysis

**Subject:** https://www.clicklearn.com/ (ClickLearn ApS, Copenhagen, CVR 33075731)
**Researched:** 16 October 2026

**Method:** three research passes ran in parallel:
1. A full crawl of the website, its sitemaps, the product documentation and the community.
2. Technical forensics: HTTP headers, DNS, certificate-transparency logs, Playwright performance runs and screenshots, and static reading of the browser-extension code.
3. Company and market intelligence: Danish annual reports (Virk XBRL, 2012–2025), review sites, press coverage and competitors.

**Supporting files:**
- [detail/01-product-and-content.md](detail/01-product-and-content.md): product, features, workflow, pricing and customers, with a source URL for every fact.
- [detail/02-company-and-market.md](detail/02-company-and-market.md): ownership, financials, leadership, partners, reviews and competitors.
- [detail/03-technical-forensics.md](detail/03-technical-forensics.md): website stack, product cloud architecture and how the recorder works.
- [detail/04-revenue-and-financials.md](detail/04-revenue-and-financials.md): **actual revenue**, a revenue model for 2015–2025, every annual-report line item, verified ownership and the group structure (including the Indian subsidiary).
- [detail/05-revenue-web-sources.md](detail/05-revenue-web-sources.md): FT1000 data, third-party revenue estimates, public procurement price points and other intelligence.
- [screenshots/](screenshots/): full-page captures of the main site and its subdomains.

**Evidence labels:** [V] = verified from a primary source. [3P] = third-party claim. [E] = estimate or inference.

---

## 1. ClickLearn in brief

ClickLearn is a **record-once, publish-everywhere platform for documentation, training and in-app guidance in enterprise business software**, mainly Microsoft Dynamics 365. It also supports IFS, SAP, Oracle, Salesforce and Acumatica.

- An author clicks through a business process in the live system while ClickLearn's Windows desktop app records it.
- ClickLearn then generates the outputs automatically:
  - Word, PDF and PowerPoint guides
  - three kinds of interactive video: Show Me, Try Me and Test Me
  - an on-screen guide that runs inside the live app ("Assist")
- It translates everything into 45+ languages and publishes it to a branded learning portal, an LMS (SCORM/cmi5), SharePoint, or directly inside Dynamics.
- When the software updates, **Replay** re-runs the recorded process and refreshes every screenshot and step automatically.
- The same recordings can be run as **automated regression tests**.
- An AI side panel (**UXP**) answers user questions inside the app, using the customer's own content.

**How it positions itself:**
- It calls itself a "Digital Adoption Platform" and "DAP+".
- Homepage headline: *"70% of software implementations fail. Make yours a success!"*
- What actually sets it apart from WalkMe, Whatfix and Pendo is **automated content production for ERP rollouts**, not overlay analytics.

---

## 2. Product architecture

```
            AUTHOR SIDE (Windows)                         CLOUD (Microsoft Azure)                    END-USER SIDE
 ┌─────────────────────────────────────┐      ┌───────────────────────────────────────┐    ┌──────────────────────────────┐
 │ ClickLearn Studio (desktop, .NET 4.8)│      │ <org>.portal.{eu|us|ca|au}  Admin     │    │ Learning portal (web)        │
 │  ├─ Windows connector (UI tree)      │─────▶│ <org>.portalapi.*           API       │───▶│ Word / PDF / PPT downloads   │
 │  ├─ Office connector                 │upload│ <org>.content.*            Content     │    │ Show Me / Try Me / Test Me   │
 │  ├─ Java Access Bridge / SAP GUI     │      │ stampregistry (tenant→region lookup)   │    │ Assist overlay (extension)   │
 │  └─ Web connector ◀─ws://127.0.0.1:8767─┐   │ Azure Front Door + Blob CDN            │    │ UXP AI side panel (extension)│
 └─────────────────────────────────────┘   │   │ Analytics (OData) · AI chat backend    │    │ Alfred (Teams bot)           │
   Chrome/Edge "ClickLearn Connector" ─────┘   └───────────────────────────────────────┘    │ InsideHelp in D365 CE / BC   │
   (MV3, nativeMessaging, all_urls)                                                          │ LMS (SCORM 1.2/2004, cmi5)   │
                                                                                             └──────────────────────────────┘
```

### 2.1 Product modules [V]

| Module | What it does |
|---|---|
| **ClickLearn Attain** | The current platform generation, described as "version 2.0 of ClickLearn Classic". It launched on 6 Oct 2020. The current release is **12.2.10.0 (1 Oct 2026)**. |
| **Studio** | Windows authoring app. Installs via ClickOnce or MSI. Needs 16 GB RAM, .NET 4.8 and Edge. Mac users need a Windows VM. |
| **Admin Portal / ContentCloud** | Multi-tenant web admin and hosting, with a choice of 4 Azure regions. |
| **Learning portal** | Branded portal with search, tracking, ratings, PDF export and iframe embedding. |
| **Assist** (Virtual Assistant) | Live step-by-step guidance overlaid on the real application. |
| **Replay** | Re-runs a recording against the updated system. Claimed to refresh screenshots and step data "in under 15 minutes". |
| **UXP: User eXperience Panel™** (also called User Adoption Center) | AI side panel with contextual content, AI chat over customer content, notifications and feature tours. Generally available from 16 Apr 2024. |
| **Alfred** | Microsoft Teams chatbot (EU and US regions only). |
| **InsideHelp™** | Field- and form-level help inside D365 CE and Business Central. |
| **APT: Automated Process Testing** | Uses recordings as regression tests, with a console and an API. Launched 2021. |
| **Analytics** | Usage dashboards with OData export to Excel or BI tools. |
| **VoiceCloud™** | Narration and subtitles in 50+ languages, with 100+ digital voices. |
| **Universe / Community** | Certification academy (ASP.NET LMS) and a community on Gainsight inSided with 1,563 members. Release notes are published in the community. |

### 2.2 Workflow: Record → Create → Customize → Publish → Adapt → Update [V]

1. **Record**
   - Automatic or single-step capture.
   - Each step gets an annotated screenshot with a green box around the element.
   - Recording can follow a process across applications: *"If your process leaves an application, ClickLearn follows."*
2. **Create**
   - Every output format is generated from the one recording.
   - Separate editors: Written, Video, Assist, Flow (branching) and Data.
3. **Customize**
   - Branding through publishing templates; chapters and notes.
   - AI summaries, and narration generated from PowerPoint.
4. **Localize**
   - Auto-translate, then run the analyzer to check completeness, then **Replay per language** so screenshots show the translated interface.
   - Professional human translation through Andovar.
5. **Publish**
   - Produce, then Publish, which gives a link per portal and per audience segment.
   - Targets: ContentCloud, on-prem, SharePoint, D365 CE, BC, or an LMS package.
6. **Update**
   - After an ERP release wave, Replay refreshes everything.

### 2.3 Output formats

| # | Format | Kind |
|---|---|---|
| 1 | Show Me | Narrated demo video |
| 2 | Try Me | Guided hands-on simulation |
| 3 | Test Me | Scored assessment with a pass percentage |
| 4 | Word | Document |
| 5 | PDF | Document |
| 6 | PowerPoint | Document |
| 7 | Assist (Virtual Assistant) | Live in-app overlay |

- The documentation also lists a **Window Video** format.
- HTML output for SharePoint and websites is also available.
- **AI-avatar presenter videos** come through the **Colossyan** and **Synthesia** integrations. The customer needs their own subscription to those services.

### 2.4 Supported applications [V]
- **Microsoft:**
  - Dynamics 365 F&O and AX
  - CE and CRM
  - Business Central and NAV
  - Power Platform
  - Microsoft 365 (Excel, Outlook Online)
  - SharePoint
- **Other ERP and CRM vendors:** IFS (a flagship partner), SAP (GUI scripting and UI5/Fiori), Oracle (including JD Edwards, added in 12.2.10.0), Salesforce (Lightning/Aura), Acumatica.
- **Custom software:** Java apps and custom Windows or web apps.
- ClickLearn claims each of its Windows and web connectors covers "90%" of applications of that type.
- **Workday and ServiceNow are not listed.**

---

## 3. How the recorder works

From the public documentation, the Trust Center security document, and a static read of the Chrome extension code:

- **Desktop-centric.** *"ClickLearn functions as a desktop application, complemented by a browser extension… Recordings are executed locally."* People who only view published content install nothing.
- **Web capture.**
  - The "ClickLearn Connector" is a Manifest V3 extension for Chrome (ID `bapjjkngobbamfijnkfcboaipbdlnbie`, about 7k users) and Edge.
  - It has these permissions: `tabs`, `nativeMessaging`, `storage`, `notifications`, and `scripting` on `<all_urls>` in all frames.
  - It talks to Studio through a native messaging host, `com.clicklearn.clgchost`, and through **local WebSockets `ws://127.0.0.1:8767/8768`**. Release 12.1.65.0 moved it to WebSockets.
- **Element identification.**
  - A 4.1 MB `cl-connectors.js` identifies page elements using shadow DOM, `aria-label`, `role` and `innerText`.
  - It has app-specific logic for SAP UI5/Fiori, Salesforce Lightning/Aura, PowerApps, IFS, Oracle, Acumatica and Kendo UI.
  - The "Generic Web" connector supports `data-clid` attributes, so customers can tag their own apps.
- **Thick clients.**
  - Java apps go through the **Java Access Bridge** and SAP GUI through **SAP GUI Scripting**; the docs require both.
  - Ordinary Windows apps are captured through the Windows accessibility and UI-automation tree [E, consistent with the Java and SAP approach].
- **Replay** re-drives the recorded steps against the new user interface and takes the screenshots again.
- **End-user extensions** are separate:
  - Assist, about 10k users.
  - UXP, deployable at scale via Intune or Group Policy. A public `.bat` force-installs it by writing registry policy.

---

## 4. Cloud and security posture [V]

- **Hosting:**
  - Multi-tenant on Microsoft Azure (App Service, Functions, Front Door, Blob Storage, Container Apps).
  - Customers pick a region: **West Europe, North Central US, Canada Central or Australia East**.
  - On-premises and hybrid deployment are also offered.
- **Tenant URLs:** `<org>.portal.<region>.clicklearn.com`. A stamp-registry service maps each tenant to its region.
- **Protection:**
  - AES-256 at rest, with keys in Azure Key Vault; TLS 1.2+ in transit.
  - GDPR compliance.
  - RTO and RPO of 24 h.
  - 99.9% monthly uptime objective.
  - P1 incidents get a first response within 4 business hours.
- **No ISO 27001 or SOC 2 certification.** The security document says it is "on the roadmap". This is a real obstacle in enterprise procurement.
- **AI:** optional, and answers only from data sources the customer configures. **The LLM vendor is not named.** A Python service (uvicorn on Azure Container Apps, `customer-dialogue.clicklearn.com`) appears to be the AI chat backend [E].
- **Public status page:** status.clicklearn.com. It shows a publishing incident in West Europe on 6 Oct 2026.

---

## 5. Pricing (exact, from the pricing calculator's `PRICING_CONFIG`) [V]

The price is calculated as: **annual price = edition base + Σ platform fees + authors × author fee + end users × end-user fee**

| Edition | USD / year | EUR / year | Adds |
|---|---|---|---|
| Basic | 4,500 | 3,600 | Documentation only, 1 platform |
| Essentials | 11,125 | 8,900 | Video formats, up to 3 platforms |
| **Professional** ("Popular") | 23,125 | 18,500 | AI User Guidance (UXP and AI chat) |
| Enterprise | 27,500 | 22,000 | APT, LMS and SCORM |

| Add-on | USD | EUR |
|---|---|---|
| Per author | 475 | 380 |
| Per end user | 4.50 | 3.60 |
| D365 F&O / D365 CE / Salesforce / Custom app (each) | 2,065 | 1,650 |
| Business Central / M365 / Power Platform (each) | 1,000 | 800 |
| Acumatica | 50 | 50 |
| SAP / Oracle / IFS | quote only | quote only |

- **Calculator rules:** up to 40 authors and 4,000 end users. Basic is disabled once 2 or more platforms are selected, and Essentials once 4 or more are.
- **Licence types:** subscription, perpetual (with at least 1 year of maintenance), ISV, partner demo, and trial. Customers may exceed their licensed end users by up to 30%.
- **Example:** Professional + D365 F&O + 5 authors + 500 end users = 23,125 + 2,065 + 2,375 + 2,250 = **US$29,815 a year**.
- **Compared with competitors:** this sits well below typical WalkMe and Whatfix enterprise deals [3P].

---

## 6. Company

| Item | Finding |
|---|---|
| Legal entity | CLICKLEARN ApS, incorporated **1 Aug 2010** [V]. Marketing uses "since 2009" and "since 2013" interchangeably. |
| Founders and owners | Joachim Schiermacher (CEO), Michael Olsen (Founder and Chief Architect), Michael Randrup Sørensen. Each owns **33.33%** through a personal holding company (Enigma, MOL IT and Space Act Holding) [V, the holding companies' 2025 annual reports]. **Bootstrapped; no VC or PE found.** |
| Other leadership | Theis Linnet Aagaard (director, CFO), Martin Flensborg (CCO), Mark Olesen (Head of Sales EMEA), Fadi Kanaan (Head of Sales NA). |
| Offices | Copenhagen (HQ), St. Petersburg FL (North America HQ), Ahmedabad (development), East Perth (Australia). |
| Subsidiaries | Clicklearn US Inc. (100%), and Integdevelopment ApS (100%, bought 2018), which owns **ClickLearn India Pvt Ltd** (formerly AzureTeam Software Development India; the Ahmedabad engineering centre, run at cost plus a small markup) [V]. |
| Danish entity headcount | 26 FTE (2025). The whole group is probably about 50–80 people [E]; the website says "50+". |
| Customers claimed | 800+ (/about/), "1,000+", or "1,281". The site contradicts itself. Also claimed: about 750–800k end users and 8,100 authors. |
| Recognition | FT1000 2019 #136 (936% growth, 2014–17); **FT1000 2026 #951** (18.75% CAGR, 2021–24). G2 2026 badges: High Performer, Best Support, Momentum Leader. |

### 6.1 Financials [V]

**Actual revenue:** **€7,890,731 in 2024** and **€4,726,163 in 2021**. Both figures come from the Statista data behind the FT1000 2026 ranking, where ClickLearn is #951. The Danish annual reports show gross profit only. For estimated revenue in the other years, see [detail/04](detail/04-revenue-and-financials.md).

| Year | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Gross profit (DKK m) | 2.4 | 8.6 | 12.3 | 16.9 | 27.5 | 25.5 | 22.3 | 29.6 | 34.6 | 39.4 | 41.3 |
| Revenue (€m) | ~0.5 | ~1.8 | ~2.5 | ~3.5 | ~5.7 | ~5.2 | **4.73** | ~6.2 | ~7.1 | **7.89** | ~8.3–8.8 |

Revenue figures in bold are actual; the rest are estimated from gross profit, using the 63–67% gross-profit-to-revenue ratio that the two actual years establish.

- **The 2020–21 dip** coincides with the switch from perpetual licences to subscriptions and the Attain re-platform. Losses followed in 2021 and 2022. It returned to profit in 2023 (DKK 2.2m) and 2024 (DKK 4.2m).
- **2025:**
  - EBITDA DKK 3.8m and net profit only DKK 0.24m; FX losses pushed finance costs up.
  - Cash DKK 23.5m.
  - **Deferred subscription income DKK 31.6m, up 39% year on year.** This is the clearest sign that bookings are still growing.
  - Dividends: DKK 3.0m paid, DKK 1.5m proposed.
- **Size:** 2025 revenue was about **€8.3–8.8m (US$9–10m)** [E, calibrated on the actual 2024 figure]. Third-party estimates of $10–11.5m (Latka, Growjo, ZoomInfo) are too high.

### 6.2 Product timeline
- **2010:** company founded.
- **2013:** commercial traction.
- **2019:** FT1000.
- **Oct 2020:** Attain launches as a cloud-first, multi-author platform.
- **Dec 2020:** switch to subscriptions; ISV editions launched.
- **2021:** APT.
- **2022–23:** Universe.
- **Jan/Apr 2024:** UXP with AI chat, and Alfred for Teams.
- **Oct 2024:** Colossyan avatars.
- **2025:** Salesforce launch at Agentforce London.
- **Aug 2025:** Fudgelearn partnership for Oracle.
- **Jan 2026:** User Adoption Center for IFS Cloud.
- **May 2026:** 12.2.2.0, a backend rebuild.
- **Oct 2026:** 12.2.10.0, adding JD Edwards.

### 6.3 Go-to-market
- **The partner channel is the engine.**
  - The "OneTeam" programme is free for Microsoft partners, who earn a recurring margin and co-sell.
  - It has about 100–137 partners, including Columbus, HSO, Hitachi Solutions, Alithya, Innovia, BR One, QGate and MicroChannel.
  - 176 deals were closed through partners, cited at Partner Day 2024.
- **IFS** is a Global Partner and lists ClickLearn on the IFS Marketplace ("4X IFS Software Partner of the Year").
- **ISV editions** let Dynamics ISVs bundle ClickLearn content with their own apps.
- **The website still shows a "Microsoft Gold Partner" badge.** Microsoft retired that tier in 2022, and no current designation could be verified.
- **Hiring signals:**
  - Copenhagen is hiring for Customer Success, Customer Success Management and RevOps/Marcom.
  - Ahmedabad is hiring C#/MVC and Windows desktop developers.
  - There is **no AI/ML hiring**, so AI capability comes from partners.

### 6.4 Customers and proof points (vendor-reported)
| Customer | Platform | Reported result |
|---|---|---|
| Multiplex | IFS | Help-desk calls down 50% (33% in month 1) |
| CKS Packaging | BC + UXP | ERP support hours down 75% across 11 plants; onboarding 79% faster; about $1,332 saved per hire |
| DuraServ | — | Content-creation time down 80%; 12 days a month saved |
| K3 Pebblestone | — | Implementation time down 25% |
| Georg Fischer | — | 1,000+ users trained in 7 languages |
| Portsmouth Aviation | IFS | "Smoothest IFS implementation in 20 years" (150 users) |
| Atradius | — | 3 minutes to document each process |
| Ascensus | — | 50+ trainings produced in 3 months |
| Thrive Homes | — | 40% time saved |
| Aptean, ERA, Seadrill, RUX, TravelOperations, CDL Electric, Franz Bakery, S.R. Smith, Decon | — | Further case studies |

Logos on the site include the FAA, Lockheed Martin, Pepsi, Goodyear Dunlop, Maersk Drilling, MHI Vestas, Nuvei and Oxford Immunotec.

### 6.5 Reviews [3P]
- **Ratings:**
  - G2: about **4.4–4.5/5 from about 40–44 reviews**. Support scores 9.4 and ease of setup 8.6.
  - Capterra/GetApp: **4.3/5 from 22 reviews**.
  - Gartner Peer Insights: no presence.
- **Praised:**
  - Many formats from one recording.
  - Replay's time savings.
  - Excellent support.
  - Multilingual output.
- **Criticised:**
  - Steep learning curve.
  - Authoring is Windows-only.
  - Replay breaks when the user interface changes.
  - Large projects publish slowly.
  - Analytics are thin.
  - The interface looks dated.
  - Reviews are few and old.

---

## 7. Marketing website stack (www.clicklearn.com) [V]

| Layer | Finding |
|---|---|
| CMS | **WordPress 7.1.3**, Elementor Pro, Hello Elementor child theme. Plugins: WP Rocket, Rank Math SEO, Wordfence. |
| Hosting | **Kinsta** (Google Cloud) behind **Cloudflare**, with HTTP/2 and HTTP/3. |
| Custom code | REST endpoints: `clicklearn/v1/shorten` (URL shortener), `asg/v1` (schema generator), and a public **WordPress MCP adapter at `/wp-json/mcp`** with an OAuth server. |
| Content types | Customers, podcasts, webinars, events, videos, and docs (which power the Trust Center). |
| CRM and forms | **HubSpot**: portal 26665845 on the EU1 data centre; every form is a HubSpot form; Clearout.io validates email addresses as they are typed. A legacy Dynamics CRM tracker (`_xrmt.js` on Umbraco) is still wired in. |
| Tags | Google Tag Manager GTM-K93HHHL run through **Stape server-side tagging** on the first-party domain `load.tag-proxy.clicklearn.com`. Two GA4 properties. |
| Ad and tracking pixels | LinkedIn, Meta (with CAPI), Bing UET, Google Ads, X, Reddit, the **OpenAI ads pixel**, Capterra, and Microsoft Clarity. |
| Visitor de-anonymisation | **Leadfeeder/Dealfront**, and **RB2B** loaded through FirstTouch.ai. RB2B identifies individual visitors, not just companies. |
| Consent | Cookie Information (a Danish vendor), with Google Consent Mode v2. |
| Weight before consent | 38 requests, 1.35 MB. |
| Weight after consent | About 135 requests, 2.8 MB. The GTM bundle alone is about 580 KB. |
| Speed | Home TTFB 670 ms, FCP 1.05 s, load 1.37 s. |
| SEO | Website is English only (the 45 languages are product output, not site languages). About 314 URLs across 8 Rank Math sitemaps. `llms.txt` is present. |
| DNS and email | GoDaddy name servers. **Microsoft 365** email. SPF covers M365, SendGrid and HubSpot. DMARC `p=reject`. OpenAI and **Anthropic** domain-verification TXT records exist. No CAA record. |

**Defects observed:**
- The homepage's schema markup describes it as an *Article* by "Anders Holm" with "6 minutes" reading time.
- Malformed Twitter tags (`@@ClickLearn`, `@com`).
- Conflicting X-Frame-Options headers (`DENY` and `SAMEORIGIN` both sent).
- The CSP has no `script-src`.
- `wp-login.php` is publicly reachable.
- A staging host returns 500.
- An old Universal Analytics tag is still on the portal.
- Stale content: "0" counters, missing careers and FAQ pages, a "coming soon" VoiceCloud page, and the retired Gold Partner badge.

### 7.1 Subdomain map
| Host | Purpose |
|---|---|
| `<org>.portal|portalapi|content.{eu,us,ca,au}` | Per-tenant admin, API and content (Azure Front Door, ASP.NET MVC on IIS) |
| `stampregistry`, `lookup.stampregistry` | Tenant-to-region lookup (Azure Functions) |
| `upload`, `uploadv8-*` | Per-region upload endpoints for Studio |
| `apps`, `download`, `cdn`, `help` | Blob-backed CDN for installers, extensions and documentation |
| `universe`, `learning` | Certification LMS (ASP.NET) |
| `community` | Gainsight inSided community; release notes |
| `support` | HubSpot Service Hub customer portal |
| `status` | Custom React status page |
| `more`, `www2` | Legacy Umbraco site (noindex) |
| `campaign` | HubSpot landing pages |
| `customer-dialogue` | Python (uvicorn) service on Azure Container Apps; likely the AI backend [E] |

---

## 8. Competitive landscape

| Competitor | How it compares with ClickLearn |
|---|---|
| **WalkMe** (SAP, about $1.5B, deal closed Sep 2024) | Overlay and analytics leader, now SAP-aligned, and expensive. That makes it less neutral for Dynamics customers. |
| **SAP Enable Now** | The closest functional analogue. Cloud renewals end on 30 Apr 2027 and maintenance on 30 Nov 2030, which **is a migration opening for ClickLearn**. ClickLearn has no migration offer yet. |
| **Whatfix** ($125M Series E, 2024) | Analyst-report leader, strong on AI and analytics, and actively runs SEO campaigns against ClickLearn. |
| **Pendo** | Product analytics for SaaS teams. Little ERP overlap. |
| **Userlane, Lemon Learning, tts** | European adoption platforms; mostly in-app overlays. |
| **Assima, Epiplex, uPerform** | Legacy ERP simulation and documentation tools. The most direct functional rivals. |
| **Scribe** ($1.3B valuation, Nov 2025), **Tango** | Cheap browser-only capture tools that erode the low end. They cannot record ERP thick clients. |
| **Microsoft** | Dynamics 365 Guides ends support on 31 Dec 2026. The long-term threat is **Copilot and built-in help** turning basic how-to content into a commodity. |
| **Camtasia, Captivate, dominKnow** | Manual authoring tools; ClickLearn's case against them is automation. |

**ClickLearn's advantages:**
- It records ERP desktop clients as well as web apps.
- One recording produces 7 formats in 45 languages.
- Replay keeps content current through twice-yearly ERP release waves.
- Recordings double as regression tests, which is rare among adoption platforms.
- Its ERP-partner channel.
- Clear published pricing that undercuts WalkMe and Whatfix.
- Top-rated support.

**ClickLearn's weaknesses:**
- Small and thinly profitable, with limited R&D budget.
- No analyst-report coverage and few reviews.
- Authoring is Windows-only, needs 16 GB RAM, and the interface looks dated.
- No ISO 27001 or SOC 2 certification.
- AI depends on partners.
- Overlay analytics are weak.
- Website claims are stale.
- The company is bootstrapped and pays founder dividends, which makes it a plausible **acquisition target** for an ERP-ecosystem player or a PE roll-up [E].

---

## 9. Blueprint: what a ClickLearn-class product needs

The core is the **capture engine plus the output generator**; everything else is packaging around it.

1. **Capture agent**
   - Desktop: a Windows UI Automation / MSAA tree walker, the Java Access Bridge, SAP GUI Scripting, and Office COM.
   - Browser: a Manifest V3 extension connected to the desktop agent over localhost WebSockets.
   - For every step, record:
     - the action (click, type or select) and any entered value
     - a robust element selector: ARIA role and name, label text and a structural path, plus app-specific adapters (UI5, Lightning, PowerApps)
     - a screenshot with the element's bounding box
     - the window or page context
2. **Step model**
   - Store the process as an app-neutral JSON document of ordered steps, with branches, variables, notes and per-language text.
3. **Generators** (each output is a render target of the step model)
   - Word, PDF and PPTX through templates (ClickLearn uses Aspose.Words for .NET).
   - Show Me video: screenshots plus cursor animation plus text-to-speech.
   - Try Me and Test Me: an HTML5 click-target simulation that can be scored.
   - SCORM 1.2/2004 and cmi5 packaging.
4. **Replay engine**
   - Re-locate each element by its selector, re-run the action, re-capture the screenshot, and flag any drift.
   - The same engine also drives regression testing.
5. **Localization**
   - Machine-translate step text, then replay with the app's interface set to the target language so screenshots are localized too.
6. **Runtime guidance**
   - An end-user browser extension that loads the step model and highlights elements live (Assist).
   - A side panel with retrieval-augmented AI chat over the customer's own content (UXP).
7. **Cloud**
   - Multi-tenant portal, an API, and per-region content storage behind a CDN.
   - A tenant-to-region registry, an analytics event pipeline, and SSO.

**The gaps ClickLearn leaves open:**
- Mac or browser-native authoring.
- A modern user interface.
- In-house AI that generates processes from natural language.
- Strong analytics.
- SOC 2 certification from day one.
- A migration path for SAP Enable Now customers.

---

## 10. Contradictions and open items

- **Founding year:** 2009, 2010 (legal incorporation) and 2013 all appear.
- **Customer count:** 800+, 1,000+ and 1,281 all appear.
- **The 7th output format:** Assist (marketing) or Window Video (docs).
- **Windows support:** the documentation says both "Windows 7 or later" and "Windows 11 or above".
- **SCORM:** Whatfix claims ClickLearn isn't SCORM compliant; ClickLearn's own docs list SCORM 1.2, SCORM 2004 and cmi5 in Enterprise.
- **Not obtainable from public sources:**
  - revenue for 2025 (the figures for 2021 and 2024 are known; see §6.1)
  - group headcount
  - current Microsoft partner tier
  - whether ClickLearn appears in paywalled Gartner, Forrester or Everest reports
  - the LLM vendor behind UXP
  - Wayback Machine history (archive.org was unreachable from this environment)
