# ClickLearn (clicklearn.com): product and content research

Researched 2026-10-16. Pages were fetched with curl (HTTPS via the proxy, TLS verified). Every fact below comes from a page I loaded. Anything I inferred is marked **[inferred]**. Raw HTML/text copies were kept in the session scratchpad (not committed).

## 0. Sources enumerated

- `robots.txt` points to `sitemap_index.xml` (Rank Math). It has 8 sub-sitemaps: page (34 URLs), post (84), customers (14), podcasts (21, "Digital Adoption Talks"), webinar (46), event (57), category (6), video (52).
- I fetched all 34 pages, all 14 customer stories, the trust-center legal pages and key blog posts. Off-site: community.clicklearn.com (Gainsight), universe.clicklearn.com (academy/LMS), partners.clicklearn.com, more.clicklearn.com/isv-landing-page, the Chrome Web Store listing, and the public **Product Documentation portal** (`help.content.eu.clicklearn.com/.../ClickLearn Product Documentation.htm`). The portal is itself a ClickLearn-published learning portal, v1.7, with 220 topics; I downloaded and parsed all of them. I also read 3 PDFs from campaign.clicklearn.com (Feature & Pricing comparison, Top WalkMe Alternatives, Seadrill case).
- **Not found:** no careers/jobs page (404, and `/careers/` redirects to home). No `/faq/`, `/support/` or `/partners/` pages on the main site (404). `/product/features/voice-cloud/` says only "More info to come soon". Workday and ServiceNow are **not** listed anywhere as supported platforms.

---

## 1. What the product does

- Homepage H1: "70% of software implementations fail. Make yours a success!" Sub-line: "Auto-produce & update training content and documentation in 7 different formats and 45 languages with just a few clicks." (https://www.clicklearn.com/)
- "ClickLearn is a Digital Adoption Platform that captures work processes in enterprise software. The platform auto-produces learning content in 7 formats and 45+ languages, creates a customizable eLearning portal, and keeps documentation current with automatic updates." (home)
- Homepage FAQ: "If you work with creating training material or documentation for business software, you can use ClickLearn to record your processes. The application automatically turns this into step-by-step instructions in Word, PDF, and Powerpoint formats, interactive videos, and a virtual assistant. All your recordings form the basis of a learning portal that can be automatically translated into more than 45 languages." (home)
- /product/ H1: "Digital adoption and AI-powered training in one solution". "ClickLearn is a Digital Adoption Platform and the market-leading solution for the automatic creation of training material and documentation…" Other claims on that page: "Save 80% time on your training production", "No complexity. No infrastructure. No consultancy costs." (https://www.clicklearn.com/product/)
- Self-description as "DAP+": "We often refer to ClickLearn as a DAP+ solution due to the technical build-up behind the surface." (/use-cases/digital-adoption-platform/, /use-cases/workflow-learning/)
- Homepage benefits list: "ClickLearn writes the user instructions for you / Produces training in multiple formats incl. video / Updates documentation and training automatically / Delivers on-screen guidance inside your applications / Comes with a complete eLearning portal / Records documentation across all your platforms / Implement immediately at no cost".
- Target personas (home FAQ "Who uses ClickLearn?"): **Management** (CIO/CTO/Product Managers driving digital transformation), **Development** (Developers, ERP/CRM specialists, Solution Architects), **Training** (Authors, Training Managers).
- Use cases on the site: ERP implementation, CRM implementation, corporate software training, software documentation, digital adoption platform, workflow learning. The nav also lists software adoption, digital transformation, training & onboarding, process documentation, change management, cloud migration, compliance and global rollouts.

## 2. Product names, modules and components

| Name | What it is | Source |
|---|---|---|
| **ClickLearn Attain** | Current product generation. "ClickLearn Attain is version 2.0 of ClickLearn Classic" (blog dated Feb 15 2022). Current release is "ClickLearn Attain version 12.2.10.0" (release notes, Oct 1 2026). | /blog/what-is-clicklearn-attain/; community |
| **ClickLearn Classic** | Previous generation. Attain can "Import from ClickLearn Classic" (.clwx files). | Docs FAQ 36.1.18.6 |
| **ClickLearn Studio** (also "ClickLearn Attain Studio") | "the desktop application where authors record processes, edit content, configure structure, and publish output." Windows only. | Docs 1.1 |
| **Admin Portal** | "a web-based management interface where administrators manage users, monitor content engagement, configure permissions, and access published content." URL pattern `https://[org].portal.{eu,us,au,ca}.clicklearn.com`. | Docs 1.1, 2.1 |
| **Learning portal / eLearning portal** | Published web portal: "videos, written instructions, full search capabilities, and built-in tracking", "Available 24/7 and on all devices". | /product/features/ |
| **ClickLearn Assist** (marketing names: "Virtual Assistant", "live assistant", "Online assistant") | In-app guidance overlay: "a step-by-step in-application guidance that overlays on top of the business system itself." | Docs 1.1; /product/features/ |
| **Replay** | Re-runs recordings against the updated system to refresh screenshots and data: "Replay refreshes screenshots and step data automatically in under 15 minutes." | Docs 7.1 |
| **User eXperience Panel™ (UXP)**, aka **User Adoption Center (UAC)**, "User Adoption Center for IFS Cloud™" | AI side panel inside apps (contextual content, AI chat, notifications, feature tours). "UXP and UAC are used interchangeably." | /product/features/uxp/; community UXP page |
| **ClickLearn Alfred** | Microsoft Teams chatbot / AI assistant connected to UXP AI sources. | Docs 17.14 |
| **InsideHelp™ / Inside Help** | Field/form-level context help deployed into the Help menu of D365 CE and BC. | Docs 16.1, FAQ 36.1.20.4 |
| **Automated Process Testing (APT)** | Project type that turns recordings into automated regression tests. Also an "APT Console" and "APT API". | Docs 15; FAQ 36.1.19.4 |
| **ClickLearn Analytics™ / Learning Analytics / Dashboard** | Usage tracking, ratings, OData export, UXP dashboard. | Attain blog; Docs 12 |
| **ClickLearn VoiceCloud™** | Narration + subtitles "in over 50 languages and dialects". | /pricing/ |
| **Connectors** | Windows Connector, Web Connector (Chrome/Edge extensions), Office connector, Custom Built Connector, Generic Web Connector. | /product/features/connector/; Docs 32 |
| **ClickLearn Authoring Tools** | Newer browser extension (Chrome/Edge) that replaces the "ClickLearn Connector" extension. It records in web apps and Outlook Online. | Docs 33 |
| **ClickLearn Universe** | Learning/certification site ("Get certified – Become a certified author"). | universe.clicklearn.com; nav |
| **ClickLearn Community** | Gainsight forum: release notes, FAQ, MasterClass, Aspire. Stats: "1,049 Topics, 1,776 Replies, 1,563 Members". | community.clicklearn.com |
| **ClickLearn Academy** | "Online community & Academy" (pricing feature). | /pricing/ |
| **ContentCloud / ClickLearnCloud** | ClickLearn-hosted content on Microsoft Azure. | Docs 13.3; security doc |

Project types in Studio (Docs 5.3): **Content Project** (the most common type; for recordings and the learning portal), **Automated Process Testing**, **InsideHelp**.

## 3. Workflow: record, create, customize, publish, adapt, update

The 6 steps on /product/how-it-works/:
1. **Record**: "The unique, cross-platform recorder technology understands your actions within the underlying business system."
2. **Create**: "Your captured content is converted into 7 learning formats. Incl. videos, written instructions and a quiz format."
3. **Customize**: "Get a single editing process for all your content. Auto-translate into +45 languages. Apply your business branding. Separate content with chapters and notes. Include annotated screenshots…"
4. **Publish**: "Your content is automatically added to an eLearning portal. Accessibility on all devices 24/7. Plug-and-play functionality."
5. **Adapt**: "Provide guidance through an in-app virtual live assistant. Monitor usage and insights in a dashboard."
6. **Update**: "Automate the updating process. Keep your documentation up-to-date."

Detail from the documentation portal:
- **Install**: ClickOnce (auto-updates) or MSI. Sign in with an organization name. Install a browser extension to record web apps. Ports 8768/8769 must be open (Docs 2–3; FAQ 36.1.3.1).
- **Recording** (Docs 6.2–6.3): "Start new recording", or import a recording from another project, the local computer or "ClickLearn Cloud Storage". Recorder modes: **Automatic** (continuous) or **Single-step**. Controls: Record, Pause, **Annotated Screenshot**, Stop. You stop by pressing both Ctrl keys. During recording a "green rectangle/box" highlights the captured element. Multi-screen recording is not supported.
- **Editors** (Docs 6.4): **Written Editor** (text blocks), **Video Editor** (audio, subtitles, mouse action, images, delays, AI avatar), **Assist Editor** (advance by click / auto-complete / Next button; include or exclude steps), **Flow Editor** (branching questions: Yes/No, single and multiple selection, conditionals; "Personalize the recording path for each user"), **Data Editor** (edit captured field values, keyboard input, delays, for Replay/APT).
- **Extras**: customize connector template text, change the voice per step, custom audio (record your own voice or upload), **Generate Summaries with AI**, **Generate Narration from PowerPoint** (AI writes a narration script from slides with style/mode/length options), copy content from a published project.
- **Structure & Segments** (Docs 10): build the portal table of contents (sections, dividers, icons). **Segments** give audience-specific links. Language-Independent URL Part (LIUP). Segmentation can be exported to and imported from Excel.
- **Localization** (Docs 11): every project needs at least 2 languages. Localization dashboard and "Run analyzer". "Auto-translate all content", per-step auto-translate, asset localization, and Replay per language to capture localized UI screenshots.
- **Team** (Docs 8): roles and permissions. The security doc names the roles Customer Administrator, Author User and Content User.
- **Publishing** (Docs 13): Produce, then publish. You get a shareable link per portal and per segment. Versioning, a public/private access toggle, tracking on/off.
- **Deployment options** (Docs 13.3): **ContentCloud** (hosted by ClickLearn), **On-premise** (files saved locally; combinable only with SharePoint), **SharePoint** (via a SharePoint app), **Inside CRM** (D365 CE, via "ClickLearn Assist for CRM"), **Inside Business Central** (via the ClickLearn extension).
- **Publishing Template** (Docs 14.7): entities Master, Portal, Frontpage, Section, Recording, Webpage, Videos, Show Me Video, Try Me Video, Test Me Video, Word Document, Adobe Reader (PDF), PowerPoint Presentation, ClickLearn Assist, LMS Package. Brand fonts are supported.
- **Update loop**: Replay (Docs 7) and Automated Process Testing (Docs 15). APT test runs can be scheduled.
- Quick Start promise: "You can go from installing ClickLearn Attain to a published guide with a shareable link in a single session… a published guide with a link you can send to anyone - no install required on their side." (Docs 1.2)
- Case-study quote on the authoring experience: "you look for the green box, you create it, you tick, tick, tick, and it's done." (David Newman, Portsmouth Aviation)

## 4. Output formats ("7 learning formats" + Assist)

- Pricing tooltip: "With a single recording, you automatically produce 7 learning formats with a few clicks; three video formats (**Show Me, Try Me, and Test Me**), three types of written documentation (**Word, PDF, and PowerPoint**), and a **Virtual Assistant** built directly into your system." (/pricing/)
- The docs portal's format bar (model.json labels) lists **Show Me**, **Try Me**, **Test Me**, **Window Video** (WMV), **Word** (DOCX), **PDF**, **PowerPoint** (PPTX), plus **Assist**. Video size is 1024x576.
- Docs 1.1: "From one recording, ClickLearn Attain produces all of the following… In addition to the seven formats above, ClickLearn Attain generates ClickLearn Assist". The Docs version of the seven therefore appears to be Show Me, Try Me, Test Me, Window Video, Word, PDF, PowerPoint, with Assist counted as extra. **[inferred from the format bar; marketing pages count the Virtual Assistant as one of the 7 instead]**
- Features page: "Choose ShowMe, TryMe, and TestMe plus PowerPoint slides for classroom training, and interactive videos for self-learning. Materials are available in .pdf or .docx (Word) for printing and sharing, HTML for SharePoint, website, or even directly in your business application." (/product/features/)
- The connector page spells them "See-Me, Try-Me, and Test-Me videos".
- Format behaviour (Docs 14.7):
  - **Show Me**: narrated, auto-playing video with transitions, timing and action-rectangle highlights.
  - **Try Me**: hands-on practice. The learner clicks through, with fast mode and subtitles options.
  - **Test Me**: assessment with "configurable pass percentages, per-step scoring… SCORM-ready assessments". The UI shows "Detailed Evaluation… You have passed the test".
  - **Assist**: templates Default/Simple/Small/Attain, mascot images, Next/Back buttons.
- **LMS**: "SCORM 1.2", "SCORM 2004 (3rd Edition)", "cmi5". Options include passed percentage, per-recording package, completion control, forward-sequence-only, and embed XSD (Docs 13.8). Marketing copy: "All materials produced with ClickLearn are SCORM-compliant and can be easily imported into any LMS or KMS." (/product/). The portal JS also includes `pmodelxapi.js` and `pmodelcmi.js` (xAPI/CMI tracking).
- Portal features: "Download the entire portal as a single PDF file", search (Ctrl+K), per-page feedback rating (Bad–Great), "Copy IFRAME code", and a "Created with ClickLearn" stamp option (docs portal PublishSettings).
- AI avatar videos via Colossyan or Synthesia. These can be added into "Text Documents, PowerPoint presentations, PDF files" (/product/features/ai-video-avatars/).

## 5. Supported apps and platforms

- Integrations page: **Dynamics 365 F&O / AX, Dynamics 365 CE / CRM, Dynamics 365 NAV / BC, IFS, SAP, Oracle, Acumatica, Salesforce**, "Custom build integration", **Microsoft Power Platform, Microsoft Office 365**. (/integrations/)
- Home FAQ: "With its Windows and Web Apps connectors, ClickLearn covers about 90% of all Windows and web-based applications. Including: Microsoft Dynamics 365 | NAV | CRM | AX; Microsoft 365, Power Platform, and SharePoint; IFS, SAP, Oracle, SalesForce and Acumatica applications; Custom Windows Apps; Custom Web Apps".
- "The Windows connector covers 90% of all Windows applications… The web connector covers 90% of all web-based applications." (/product/features/connector/)
- "ClickLearn works cross-platform from Excel to ERPs/CRMs, and even in browsers and Windows applications." (home). Cross-application recording: "If your process leaves an application, ClickLearn follows." (/product/)
- Docs also cover Java apps (Java Access Bridge), SAP specifics (SAP Logon/GUI configuration), IFS specifics (IFS Scope Tool, IFS Cloud embedded portal link), and Outlook Online recording via Authoring Tools. Release 12.2.10.0 notes: "The generic connector has been improved to support JD Edwards (Oracle)" and fixes for "SAP Fiori".
- UXP-supported systems: "CRM, BC, FO, IFS, Salesforce, Acumatica, Oracle" (Docs 17.1).
- Inside Help: D365 CE and BC only (FAQ 36.1.20.4).
- Dynamics claims: "deeply integrated with all Microsoft applications – regardless of version"; "Less help desk calls 40%"; "Deploy within 15 h" (/integrations/dynamics/).
- Each solution page (F&O, CE, BC, IFS, SAP, Oracle, Salesforce, Acumatica) uses the same template:
  - a gated "8 Videos (27m)" demo series (Simplify how end-users connect with content; Master education within the flow of work; Craft training material in just a few clicks; Create training materials for diverse user needs; Keep training materials evergreen; Translate content into 45+ languages; Gain insights into user engagement and progress; Maintain brand consistency)
  - a Without/With ClickLearn comparison
  - role-based benefits (CFOs, IT & Change Managers, CIOs; for Salesforce: support teams and Sales & Marketing leaders)
  - case studies.
- Pricing page platform options: D365 F&O/AX, D365 BC/NAV, D365 CE/CRM, Microsoft 365 Office, Power Platform, Custom Application, Salesforce, Acumatica, plus **Oracle, IFS, SAP ("require tailored pricing - response within 24 hours")**.

## 6. Deployment and architecture (desktop, SaaS, extensions)

- **Desktop authoring:** "ClickLearn functions as a desktop application, complemented by a browser extension, to record and generate learning content. Recordings are executed locally within the application, eliminating the need for APIs or integrations with the customer's internal systems. End users who solely consume published content are not required to install the desktop application." (Security doc §4)
- System requirements (Docs 2.1): Windows 7 or later (not Windows 8.0), .NET 4.8+, Microsoft Edge installed, **16 GB RAM minimum**, dual-core CPU minimum (4-core recommended), 10 GB disk. Mac is supported only via a Windows VM (Docs 2.2). Studio cannot run on mobile, but published content works in mobile browsers (FAQ).
- **Browser extensions:**
  - "ClickLearn Connector" for Chrome: "used by ClickLearn Studio to record and replay processes within the Google Chrome browser"; 7,000 users; v12.1.55.0, updated July 31 2026; 4.0 stars from 4 ratings (Chrome Web Store).
  - Edge Connector add-on.
  - Newer "ClickLearn Authoring Tools" extensions (Docs 33).
  - Separate end-user extensions: "ClickLearn UXP" and "ClickLearn Assist" (Chrome Web Store related items). UXP and Assist extensions cannot run at the same time (Docs 17 limitations). UXP is deployed to end users via GPO or Microsoft Intune.
- **SaaS / cloud:** ClickLearnCloud on Microsoft Azure. Customers pick a region at onboarding: West Europe (Netherlands), North Central US (Illinois), Canada Central (Toronto), Australia East. Multi-tenant with logical isolation, with optional dedicated Azure SQL/Blob. AES-256 at rest, TLS 1.2+ in transit, Azure Key Vault. Daily backups. RTO and RPO 24h. Data deleted 90 days after termination (Security doc §3–14).
- **Deployment models:** "on-premises, hybrid, and cloud deployment options" (Security doc §4).
- **Auth:** ClickLearn Login, Office 365, LinkedIn, Google, Facebook, OpenID; SSO and MFA via the customer's IdP (Security doc §9).
- **Compliance:** GDPR. "Although formal certification or attestation has not yet been obtained, ClickLearn is actively preparing to pursue certifications such as ISO 27001 or SOC 2". Relies on Azure's SOC/ISO certifications (Security doc §25).
- **SLA:** "minimum monthly uptime objective of 99.9%". P1 initial response "4 Business Hours" (P2 8 business hours, P3 2 business days, P4 3 business days) (SLA page).
- **Support** (/about/): "'first-day response, second-day resolution' target". Support contact: support@clicklearn.com.
- Marketing line: "Resource-light with no server-side implementation" (/product/).

## 7. AI, translation and voice features

- **UXP AI Chat:**
  - "Conversational learning through Generative AI creates new content and explanations in natural language… All conversations are generated based on your company's information and assets." (/pricing/)
  - "Fully integrated AI chatbot… It centralizes company knowledge, ensuring responses to your queries lie within your organization's scope." (/lp/uxp/)
  - Sources are recordings, PDFs ("Additional AI sources"), external content and dynamic assets such as a YouTube crawler. There are settings for AI temperature and a consent message (Docs 17).
- **AI security:** "ClickLearn AI is available as an optional feature… The AI framework utilizes a retrieval exclusively accessing customer-configured private data sources, without reliance on public datasets, third-party information, or cross-tenant data." (Security doc §24). Which LLM provider is used is **not stated**.
- **Company Assets Integration:** AI summaries of documents, videos and process descriptions, either "static" (periodic upload) or "dynamic". Pricing tiers: "Fixed & core usage" vs "Dynamic & ext. usage".
- **AI summaries of recordings** (Docs 6.8), **AI narration from PowerPoint** (Docs 6.9), **AI tokens** metering (AI Search, AI Summary, Publishing; Docs 14.10).
- **UXP features:** contextual guidance ("understands where you are in an application and adapts to your role"), onboarding tours / **Feature Tour**, "'What's new'-guidance and personalized notifications". Notification types: Intrusive Modal, Subtle Pop-Up, Sidebar. Roles are pulled from CE/BC/F&O/Acumatica. UXP Dashboard tracks engagement, searches and AI conversations.
- **UXP enablement:** "7 steps. ~5 minutes to enable… Uses your existing ClickLearn content" (community UXP page).
- **Teams bot:** ClickLearn Alfred, available in EU and US regions only (Docs 17.14).
- **Translation:**
  - "Auto-translate into +45 languages" (how-it-works).
  - "Get training material in 7 formats and auto translate into 45 languages, dialects and 100+ digital voices." (/integrations/dynamics/)
  - Professional human translation inside the app via **Andovar** partnership: instant quotes, status tracking, auto-distribution of translations (blog, Nov 29 2021).
- **Voice:** text-to-speech narrator voices by language, dialect and gender, voice rate, and a Speech Editor for pronunciation (Docs 14.3). VoiceCloud™ covers "over 50 languages and dialects" (/pricing/).
- **AI avatars:**
  - **Colossyan** partnership (Oct 10 2024). "AI avatars speaking 70+ languages. Translate your video with 4 clicks." Customers need their own Colossyan subscription; promo "CLICKLEARN20" gives 20% off.
  - Docs also support **Synthesia** avatars, one provider at a time.
- **AI messaging:** home "NEW FEATURE: Say goodbye to months of training". CEO quote: "We're bringing a new paradigm to the learning of software." (Joachim Schiermacher, /product/features/uxp/)

## 8. Pricing model and tiers

- Model: annual subscription priced by **edition + platforms + named authors + end users** (License Descriptions, Appendix A: "License Variables… Editions, Platforms, Authors, End-Users"). Also available:
  - **Perpetual License** (one-time payment; connector licenses plus concurrent authors; at least 1 year of maintenance required)
  - Partner Demonstration & Consulting License
  - Trial License
  - **ISV License** (for documenting your own software)
  (trust-center/license-descriptions, v5 April 2026)
- End-user threshold: "You may go up to 30% above your agreed number of End-Users at any time" (Terms §3.4).
- Pricing page (/pricing/) is an interactive calculator. Steps: 1) Choose platform(s); 2) "How many will create training content?" (slider 0–40); 3) "How many people use your platform?" (slider 0–4000, step 25); 4) Choose edition, in EUR or USD. Prices then show per month and per year, with a "Get quote" button (HubSpot form).
- **Exact prices from the calculator's `PRICING_CONFIG` in the page source** (annual):
  - Edition base: **Basic $4,500 / €3,600; Essentials $11,125 / €8,900; Professional $23,125 / €18,500 ("Popular"); Enterprise $27,500 / €22,000**
  - **Per author: $475 / €380 per year**
  - **Per end user: $4.50 / €3.60 per year**
  - **Platform add-ons:** D365 F&O/AX $2,065 / €1,650; D365 BC/NAV $1,000 / €800; D365 CE/CRM $2,065 / €1,650; Microsoft 365 $1,000 / €800; Power Platform $1,000 / €800; Custom Application $2,065 / €1,650; Salesforce $2,065 / €1,650; Acumatica $50 / €50. Oracle, IFS and SAP are quote-only.
  - Formula: total = base + sum(platforms) + authors × author price + end users × end-user price.
  - Basic is disabled when 2 or more platforms are selected; Essentials when 4 or more are selected. **[logic read from JS]**
  - Worked example **[inferred calculation]**: Professional + D365 F&O + 5 authors + 500 users = 23,125 + 2,065 + 2,375 + 2,250 = **$29,815/yr (~$2,485/mo)**.
- Edition taglines:
  - Basic: "Create documentation with ease; ideal for smaller teams."
  - Essentials: "Create documentation and videos; perfect for evolving training needs."
  - Professional: "AI-powered training and collaboration; built for scaling teams."
  - Enterprise: "Includes APT, LMS & SCORM integration; for larger organizations"
- Feature matrix rows: Onboarding Services ("Instructor led setup & implementation… fixed price"), Record & edit, Replay, 7 Learning formats, 50+ languages, recording across platforms, number of learning portals, SSO, Team collaboration & versioning, Online assistant & InsideHelp™, Service & support, Community & Academy, Learning & feedback Analytics, UXP, AI Chat, Company Assets Integration, LMS integration & SCORM, Automated Process Testing. Tier-by-tier allocation **[inferred from checkmark counts in the HTML; checkmarks are icons, so read with care]**:

| Feature | Basic | Essentials | Professional | Enterprise |
|---|---|---|---|---|
| Record/edit, Replay, Onboarding services, Support, Community/Academy | ✓ | ✓ | ✓ | ✓ |
| 7 learning formats | Written formats | Written & video | ✓ | ✓ |
| Languages | Local language | 50+ | 50+ | 50+ |
| Recording across platforms | 1 platform only | 3 platforms | ✓ | ✓ |
| Learning portals | 3 | 5 | Unlimited | Unlimited |
| SSO | – | ✓ | ✓ | ✓ |
| Analytics | – | ✓ | ✓ | ✓ |
| Team collaboration & versioning | – | – | ✓ | ✓ |
| Online assistant & InsideHelp | – | – | ✓ | ✓ |
| UXP | – | ✓? | ✓ | ✓ |
| AI Chat | – | – | ✓ | ✓ |
| Company assets integration | – | – | Fixed & core | Dynamic & ext. |
| LMS/SCORM, Automated Process Testing | – | – | – | ✓ |

(UXP showed 3 checkmarks, but the edition cards place "AI User Guidance" in Professional and Enterprise only. The UXP row for Essentials is therefore uncertain.)

- Other price signals:
  - ISV page: "We have a tailored package specifically for ISVs."
  - Fudgelearn offer: "Try ClickLearn for 2 weeks in your own environment… 10% Discount on ClickLearn Licences (First Year)".
  - WalkMe comparison PDF: ClickLearn "Enterprise pricing, predictable scale", setup "Low to moderate effort".
  - "Low yearly cost" (/product/).
  - Demo: "30-minute product tour or a demo on your own system" (/lp/uxp/). Customers page: "Book a 20 minute free demo consultation".

## 9. Customers, case studies and quantified claims

All 13 customer stories (https://www.clicklearn.com/customers/…):

| Customer | Industry / platform | Headline claims |
|---|---|---|
| **Portsmouth Aviation** | Manufacturing/Eng., IFS Cloud, 150+ employees, UK | "Smoothest IFS Implementation in 20 Years"; 150 users trained; 250+ recordings; go-live tickets stayed at "~20 per week" |
| **CKS Packaging, Inc** | Plastics mfg, D365 BC, 3000 employees, Atlanta | "Cut ERP Support Hours by 75% Across 11 Plants"; "79% faster onboarding"; "~$1,332 saved per new hire"; 100 active users; used UXP |
| **RUX** | Equipment rental, D365 CE+BC, 60 employees, St. Petersburg FL | "-1 day in application setup"; 60 users; documentation for Microsoft AppSource |
| **DuraServ** | Facilities services, D365 BC, Carrollton TX | "80% Reduction in time spent creating content"; "12 days saved every month"; rollout across 30 offices |
| **Ascensus** | Financial services, D365 F&O/CE/BC, 3,300+ employees | "50+ Training resources created in just 3 months"; "300+ ShowMe videos watched"; about 3 hours per training in all formats; "What would take a typical training resource an entire day now only takes us two hours" (Kylie Kyser) |
| **Atradius** | Trade credit insurance, D365 BC, 3650 employees, Amsterdam | "3 mins to generate training material"; 4 documentation languages |
| **Thrive Homes** | Housing association, D365 CE, 199 employees, UK | "40% time saved"; "200+ Scripts created in half the time"; training cut from one month to two weeks |
| **Aptean** | IT services, D365 F&O/BC, 3000 employees | "Working across 25+ applications" |
| **K3 / K3 Pebblestone** | Software dev (ISV), D365 BC, 750 employees | "-25% time spent on implementation"; users in 30+ countries; "7x training material formats" |
| **ERA Group** | Business services, D365 CE, 1000 employees | Adoption in "+35 Countries"; "+20 language variations" |
| **Georg Fischer (GF Piping Systems)** | Industrial machinery, D365 CE, 6,800+ employees, Switzerland | "1000+ Employees"; "7x documentation languages"; "750+ TryMe videos watched"; 80 training records in 7 languages; 3 authors; Replay for Microsoft updates every 6 months |
| **Multiplex** | Construction, IFS, Sydney | "Reduces Helpdesk Calls by 50%"; "33% Ticket reduction in the 1st month"; ~120 videos on 8 IFS modules; 1,000+ IFS users |
| **TravelOperations** | Travel, "Other" platform, 22 employees, Copenhagen | "80% of user queries answered in one recording"; "16 customers trained and onboarded in ten months"; 10+ countries |

- Community stories (Oct 2026): **CDL Electric / Railroad Crossings**: "3,500 Crossings, No Trainers Added", 125 maintainers trained, "100% Adoption of the new app", "100+ Training hours saved per year". **Franz Bakery**: "Scan Gun Training, No Extra Hires".
- Seadrill (Oracle Cloud; with Fudgelearn) case PDF: 3,500 employees (about 3,000 offshore), "over 500 unique training assets", 7 formats, six global regions.
- Logo wall on solution pages (img alts): **Federal Aviation Administration, Goodyear Dunlop, Lockheed Martin, Maersk Drilling, MHI Vestas Offshore Wind, Nuvei, Oxford Immunotec, Pepsi, Atradius, GF Piping Systems, Multiplex**.
- Testimonial names:
  - Adrian DeMartino (Decon Technologies): "It has paid for itself 10 times over"
  - Martin Kerr (Bestborn Business Solutions): "Hands down, ClickLearn is the most efficient solution on the market…"
  - David Eager (VP Global Alliances, IFS): calls ClickLearn "our Platinum Partner"
  - Kevan S., Jonathan S., Erin Pidcock (Multiplex), Aly Breeman (K3|pebblestone), Alex Ivkovic (CIO, CDF: "approximately 20 languages")
  - Jeroen le Sage (Red Cross): "Normally, you need a day for a work instruction. Now you can do it in one or two hours."
  - Charles Massey (VP of IT)
  - Rob Brown (Net@Work), Rebecca Mergner (VP B2B ERP Products)
  - Penny Elson, Mike Frejik, Kevin LaChapelle
- Other quantified marketing claims:
  - "reducing help desk calls by up to 50%" (/lp/uxp/)
  - "Save 80% time on your training production" (/product/)
  - "Less help desk calls 40%" and "Deploy within 15 h" (/integrations/dynamics/)
  - "Companies have an average of 178 software systems implemented each with 2-4 updates every year" (/product/features/uxp/)

## 10. Company stats (note the inconsistencies)

- /about/ counters (values in page source): **800+ Customers, 27 Countries, 750k End-users, 50+ Employees**. Text: "Since 2013, we've helped more than 800 companies improve their digital adoption."
- /product/: "Why +1000 other companies have chosen ClickLearn".
- /use-cases/erp-implementation/: "Since 2009, we've helped **1281 companies** succeed".
- Fudgelearn page: "Trusted by 1,000+ customers and 800,000+ end users worldwide."
- Attain blog: "more than **8100 authors**".
- Partner interview (May 2022): "a global size of around **130 partners**".
- Founding: "founded by three IT pioneers"; first built for Microsoft Dynamics (/about/). The legal entity is **ClickLearn ApS**, CVR 33075731, Sjæleboderne 2, 1122 Copenhagen K (terms).
- Offices (/contact/): Copenhagen, Denmark (HQ); Ahmedabad, India; St. Petersburg, FL, USA ("North American Headquarters"); East Perth, Australia.
- Leadership named: **Joachim Schiermacher, CEO**; Anders Holm, CMO; Mark Olesen, Partner Channel Manager; Morten Neubert, Principal Technical Advisor; Michael Odushegun, Technical Support Consultant.
- Growth: "ClickLearn is nr. 136 in Financial Times FT1000… ranked 18th against 149 technology companies… 'Absolute Revenue Growth' of 936%" (blog, year not stated).

## 11. Partners and alliances

- **Microsoft:** "licensed Microsoft service vendor"; Microsoft Gold Partner badge; listed in AppSource partner directory.
- **IFS:** "Platinum Partner" (IFS quote); IFS Global Partner badge; badge "**4X IFS SOFTWARE PARTNER OF THE YEAR**" (image on /integrations/ifs/); "A gold awarded IFS training platform"; gold sponsor at IFS Unleashed.
- **Oracle:** "licensed Oracle partner"; Oracle Partner Finder link.
- **SAP:** listed on sapusers.org (UK&I SAP user group partner); "Dedicated contributor to SAP user groups worldwide".
- **Salesforce:** listed as an integration; no partner-tier claim found.
- **Technology partners:** Colossyan (AI avatars), Synthesia (avatars, in docs), Andovar (translation), Fudgelearn (Oracle blended learning).
- **Partner program** ("OneTeam", partners.clicklearn.com):
  - Target partners: "ERP & CRM implementation partners; IFS, Microsoft, SAP, Oracle, Acumatica, Salesforce consultancies; Digital transformation firms; Managed services providers; ISVs".
  - Named partners: Alithya Fullscope, Arcwide, City Dynamics, Columbus, Crearo, Delivers-IT, Dynamics Square, Elite Dynamics, ERP Dynamics, Foxcode, Hitachi Solutions, Inno Solutions, Innovia, MicroChannel, NAB Solutions, New Dynamic, Notora, Purely CRM, Qexpertise, QGate Software, Thinkmax, Thinksmart, UNIQ, Vav consultants, 365WineTrade.
  - Also mentioned on site: Net@Work (Acumatica), HSO (customer days), Bestborn, Brone (webinar).
- **ISV program:** "Build digital adoption into your Microsoft application without writing a single word" (more.clicklearn.com/isv-landing-page).

## 12. Awards and reviews

- G2 2026 badges on /about/: High Performer, Best Support, Users Love Us, Momentum Leader, Best Meets Requirements. /product/why/ also shows "Easiest Admin", "Easiest To Do Business With" and "High Performer" badges.
- "4.4/5.0 based on 44 reviews from G2" (/lp/uxp/). Listings also exist on Capterra and SourceForge.
- FT1000 #136. 4X IFS Software Partner of the Year. "A gold awarded D365 training platform" (F&O page).

## 13. Resources and content programs

- Blog (84 posts) on digital adoption, DAP, workflow learning, the 5 moments of need, EPSS, ERP/CRM adoption, WalkMe alternatives, and release guides for Acumatica 2026 R1, IFS Cloud 26R1 and Oracle 2026.
- Webinars (46), for example "The future of employee training: 10 ways to boost productivity with AI", "AI avatars", and "Spotlight on Ascensus".
- Podcast "Digital Adoption Talks" (21 episodes).
- eBooks: rollout plan templates for Dynamics, IFS, SAP, Oracle, Salesforce and Acumatica; ERP/CRM implementation plan templates; "10 benefits for enterprise AI adoption".
- Events (57): IFS Unleashed and Connect, Community Summit, SAPinsider, UKISUG, Dreamforce-adjacent Agentforce World Tours, Acumatica Summit, Directions, Oracle AI World, JD Edwards INFOCUS, Learning Technologies.
- Own events: ClickLearn **MasterClass** (2022–2026, next Oct 27 2026), **Aspire** online conference (2023, 2024), "LevelUp" sessions.
- Glossary page. Community "Morten's Corner". Product documentation portal (EN + FR).
- **Release notes:** community.clicklearn.com "Attain: Release notes". Latest: **12.2.10.0 (Oct 1 2026)**: "generate and clear the LIUP for selected elements, a tabbed layout for element properties, Excel export of project data with custom templates, and a redesigned publishing page… A total of 23 issues were addressed", including JD Edwards generic connector support.

## 14. Legal and trust pages

Trust Center (/trust-center/) contains:
- Terms & Conditions (Schedule 1)
- SLA (1.1)
- License Types & Descriptions (1.2, v5 April 2026)
- Data Processing Addendum (1.3)
- Privacy and Cookie policies
- ClickLearn Universe usage policy
- "Security, Privacy, and Control Framework" (v1 March 2026, contact security@clicklearn.com)

Licence restriction to note: under the standard subscription and perpetual licences, customers may not use ClickLearn to create documentation for software they sell to third parties. That use requires the ISV License (Appendix E).
