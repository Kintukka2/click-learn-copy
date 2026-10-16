# ClickLearn: technical and forensic analysis

Date of observation: 2026-10-16. Sources: curl, DNS-over-HTTPS (dns.google), Playwright with Chromium 141 headless, crt.sh, CertSpotter, the Chrome Web Store, and ClickLearn's public docs. Anything marked **[inference]** is my interpretation. Everything else was observed directly.

Raw evidence (kept in the session scratchpad, not committed): headers, HTML, sitemaps, `crtsh.json`, `certspotter.json`, Playwright JSON, docs PDF text and extension manifests. Screenshots are in `../screenshots/`.

Limitations:
- The Wayback Machine (web.archive.org and archive.org) could not be reached. The proxy reset the connection, WebFetch is blocked for that host, and the API returned 429. No site-history timeline is available.
- The `dig` command is not installed, so DNS lookups went through DNS-over-HTTPS.
- TLS goes through an intercepting proxy, so `openssl s_client` would show the proxy's certificate. Certificate issuers come from CT logs instead.

---

## 1. Main site, www.clicklearn.com

### CMS and framework
- **WordPress 7.1.3**, from `<meta name="generator" content="WordPress 7.1.3">`. `/readme.html` returns 200.
- **Elementor + Elementor Pro**, with the **Hello Elementor** theme and the child theme `hello-theme-child-master`. Seen in `wp-content/plugins/elementor`, `elementor-pro` and `themes/hello-elementor`.
- **WP Rocket 3.23.5.1** (generator meta) with these features: RUCSS, delay JS, defer JS, minify, lazyload, CDN, host fonts locally.
- **Rank Math SEO**, including its llms.txt generator and AI-visibility routes.
- **Wordfence** and **Wordfence Login Security**, from the REST namespaces.
- Other `/wp-json/` namespaces:
  - `clicklearn/v1`, a custom plugin with a `/shorten` URL-shortener POST route.
  - `asg/v1`, which offers schema generate/clear routes. **[inference]** This is an AI schema generator plugin.
  - `elementor-mcp-composer/v1.0.19`, `elementor-ai/v1` and `elementor-one/v1`.
  - `mcp` with `mcp-adapter-default-server` and `mcp-oauth-server`. This is a WordPress MCP adapter endpoint.
  - `wp-abilities/v1`.
- Custom post types:
  - From the sitemaps: customers, podcasts, webinar, event, video.
  - From REST: `docs`, which powers `/trust-center/*` (security document, DPA, SLA, versioned T&Cs and privacy policy), plus `e-floating-buttons`.
- jQuery 3.7.1. Self-hosted Satoshi variable font.
- The REST API exposes `/wp-json/wp/v2/pages/448` for the homepage. `/wp-json/wp/v2/users` returns 401. `xmlrpc.php` returns 403. `wp-login.php` returns 200.

### Hosting and CDN
- `www` is a CNAME to the apex, which has A record `162.159.135.42` (a Cloudflare IP). There is no AAAA record.
- Response headers show **Kinsta** behind **Cloudflare**:
  `server: cloudflare`, `cf-cache-status: HIT`, `x-kinsta-cache: HIT`, `ki-cf-cache-status: HIT`, `ki-edge: v=28.5.1`, `ki-origin: g1p`, `ki-cache-type: Edge`, `cache-control: public, max-age=0, s-maxage=3600`.
  **[inference]** This is Kinsta managed WordPress on Google Cloud, using Kinsta's Cloudflare edge.
- HTTP/2 and h3 (`alt-svc: h3`). Cloudflare `__cf_bm` bot cookie. NEL reporting is on.
- The apex and plain HTTP both 301 to `https://www.clicklearn.com/`.
- `prem-stage.clicklearn.com` (162.159.134.42) returns 500 "WordPress › Error". **[inference]** This is a staging WordPress environment.
- CT logs also list `testwp.clicklearn.com`, which no longer resolves.

### Security headers (homepage)
```
strict-transport-security: max-age=63072000; preload, max-age=31536000; includeSubDomains   (two values merged)
content-security-policy: upgrade-insecure-requests; frame-ancestors 'self'; frame-src 'self' https://www.youtube.com https://js-eu1.hsforms.net/ ... https://tag-proxy.clicklearn.com https://26665845.hs-sites-eu1.com;
content-security-policy: frame-ancestors 'self' https://*.clicklearn.com https://*.clicklearn.dk
x-frame-options: DENY
x-frame-options: SAMEORIGIN            (conflicting duplicate)
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: accelerometer=(), camera=(), microphone=(), ... payment=*, fullscreen=*
cross-origin-opener-policy: unsafe-none; cross-origin-resource-policy: cross-origin
x-permitted-cross-domain-policies: none
access-control-allow-methods: GET,POST
```
Observations:
- There is no `script-src` or `default-src` restriction, so the CSP only controls framing.
- HSTS and X-Frame-Options headers are duplicated, and the two X-Frame-Options values conflict.
- The WordPress version is exposed through the generator meta and readme.html.

### Analytics, marketing tags and consent
- **Consent: Cookie Information** (Danish CMP), from `policy.app.cookieinformation.com/latest/clicklearn.com/en.js`.
  - The banner categories are Necessary, Functional, Statistical and Marketing.
  - **Google Consent Mode v2** is on. Before consent the hits carry `gcs=G100` and `npa=1`. After consent they carry `gcs=G111`.
- **Google Tag Manager `GTM-K93HHHL`** is served first-party through **Stape** server-side tagging:
  - `load.tag-proxy.clicklearn.com/45wtyzfllnbmu.js`. The loader code references `stapeUserId`. `load.tag-proxy` is a CNAME to `leub.stape.net`.
  - `tag-proxy.clicklearn.com` is at 51.158.227.154. **[inference]** That IP is Scaleway, used by Stape EU.
  - `gcp-tag-proxy.clicklearn.com` appears in CT logs.
  - First-party FP* cookies are set: `FPID`, `FPLC`, `FPAU`, `FPGSID`.
- **GA4 properties:** `G-Q6D44YNWH8` and `G-TX3CLZN5TX`. A custom event `cta_events` fires with `event_type=low_intent/medium_intent`, plus scroll-depth events.
- **Before consent** only GTM, GA4 (consent-denied pings), Microsoft Clarity (`window.clarity`) and Bing UET (`uetq`) objects exist. 38 requests, about 1.35 MB.
- **After accepting** about 135 requests and about 2.8 MB load. These were seen:
  - **HubSpot** (portal **26665845**, EU1 hublet): `js-eu1.hs-scripts.com/26665845.js`, hs-analytics, hs-banner, hsadspixel, `web-interactives-embed.js`, cookies `hubspotutk`/`__hstc`.
  - **LinkedIn Insight** (`snap.licdn.com`, `px.ads.linkedin.com`).
  - **Meta Pixel** (`connect.facebook.net/en_US/fbevents.js`, `_fbp`), plus Meta's `capi-automation…clientParamBuilder.bundle.js`. **[inference]** This is a Conversions API parameter builder.
  - **Microsoft Clarity** project `gf1xeb3652`.
  - **Bing UET** tag `97028625`.
  - **Google Ads / DoubleClick** (`googleads.g.doubleclick.net`, `ad.doubleclick.net/ccm`, `_gcl_au`).
  - **X/Twitter** pixel (`static.ads-twitter.com/uwt.js`).
  - **Reddit** pixel `a2_ie7z307s1fi4`.
  - **OpenAI ads/measurement pixel** (`bzrcdn.openai.com/sdk/oaiq.min.js`, pixel id `3jFt2mYMfeY9Se5kNRioo8`).
  - **Capterra** conversion tracking (`tr.capterra.com`).
  - **Leadfeeder/Dealfront** (`sc.lfeeder.com/lftracker_v1_p1e024BooZZaGB6d.js`, `_lfa`).
  - **FirstTouch.ai**, which loads **RB2B**. `app.firsttouch.ai/first-touch-web-visitors.js` sets `window.reb2b` and loads `ddwl4m2hdecbv.cloudfront.net/b/<id>/<id>.js.gz`. This is person-level B2B visitor de-anonymisation.
  - **A custom Dynamics CRM tracker** from the legacy site: `more.clicklearn.com/scripts/_xrmt.js` (`window.crmTracker`, track types PageView/Download/LeadCapture/Video*) posting to `more.clicklearn.com/umbraco/surface/DynamicsCrm/Track`. Cookies `xrmt_a` and `crmsession`.
  - An unidentified endpoint `tw-0fde0867….ecs.us-west-2.on.aws/events` that loads after consent.
- **Chat widget:** none was seen. No HubSpotConversations, Intercom or Drift.

### Forms and lead capture
- **All forms are HubSpot Forms** (EU1, portal 26665845). Form IDs seen:
  - `/try-clicklearn/`: `0a3f8c74-7ca4-4609-b245-0587ea6612aa`. Developer embed v4. Submits to `forms-eu1.hsforms.com/submissions/v3/public/submit/formsnext/multipart/26665845/…`.
  - `/demo/`: `86bad3b4-4707-49b1-85e7-2455625a8511`.
  - `/contact/`: `6865e210-0994-4b30-be78-f85436c0a324`, via `hbspt.forms.create`.
  - `/pricing/`: `e496985f-64f4-4895-ba42-3c52af4be2fb`.
- **Clearout.io** does real-time email validation on the form (`clearout.io/jswidget/928a6d01…`).
- Hidden fields include `utm_*`, `gclid`, `msclkid`, `crmid`, `xrmt`, `cl_sourcecaptureid`, `cl_campaign`, `cl_form_id`, `self_attribution`, `cl_segmentid`, and Cookie Information consent categories. The `crmid` and `xrmt` fields link HubSpot to the legacy Dynamics CRM tracker.
- "Try ClickLearn" is a **form-gated "free guided setup"**. There is no self-serve installer download on the marketing site.

### Performance (Playwright, 1440×900, headless Chromium, via proxy)
| Page | TTFB | FCP | load event | LCP | requests (pre / post consent) | bytes (pre / post) |
|---|---|---|---|---|---|---|
| Home | 670 ms | 1052 ms | 1370 ms | 1.40 s | 38 / 135 | 1.35 MB / 2.82 MB |
| /product/how-it-works/ | 578 | 816 | 1457 | 1.48 s | 36 / 130 | 1.33 / 3.46 MB |
| /pricing/ | 210 | 304 | 863 | 0.30 s | 29 / 117 | 0.83 / 2.05 MB |
| /try-clicklearn/ | 870 | 1172 | 1763 | 1.17 s | 59 / 141 | 1.96 / 2.68 MB |
| /integrations/dynamics/ | 135 | 328 | 943 | 0.86 s | 40 / 146 | 1.23 / 3.41 MB |

- The homepage HTML is 594 KB uncompressed and about 96 KB over the wire. Most of it is inline CSS from WP Rocket RUCSS.
- The Stape GTM bundle is about 580 KB (3 files) on every page.
- Elementor entrance animations hide content until it scrolls into view. The screenshots inject CSS to un-hide it.

### SEO
- The site is English only: `og:locale en_US`, `inLanguage en-US`, no `hreflang`, and `/de/`, `/da/`, `/fr/` and similar return 404. The claim of "45+ languages" refers to the product output, not the website.
- Rank Math sitemap index has 8 sitemaps and about 314 URLs: post 84, page 34, customers 14, podcasts 21, webinar 46, event 57, video 52, category 6.
- `robots.txt` only disallows `/wp-admin/`.
- `llms.txt` (960 lines, "Generated by Rank Math SEO") is present.
- JSON-LD graph: `["Person","Organization"]` ClickLearn (sameAs Facebook, X, LinkedIn, CVR 33075731, G2, Capterra, SourceForge), WebSite with SearchAction, WebPage, and Article.
- Homepage oddities:
  - It is typed as an Article authored by "Anders Holm", with twitter label "Time to read 6 minutes".
  - `twitter:site "@@ClickLearn"` and `twitter:creator "@com"` are malformed.
- Title: "ClickLearn | Digital Adoption & User Training". The meta description and canonical are present.

## 2. DNS and email

| Record | Value |
|---|---|
| NS | ns01/ns02.domaincontrol.com (GoDaddy). SOA is dns.jomax.net |
| MX | 0 clicklearn-com.mail.protection.outlook.com (**Microsoft 365**) |
| SPF | `v=spf1 include:spf.protection.outlook.com include:sendgrid.net include:26665845.spf08.hubspotemail.net -all`, which covers M365, SendGrid and HubSpot |
| DMARC | `v=DMARC1; p=reject; rua/ruf=mailto:admin@clicklearn.com; fo=1` |
| Verification TXT | facebook-domain-verification, 4× `_globalsign-domain-verification`, 6× google-site-verification, `openai-domain-verification`, `anthropic-domain-verification-v42jbq`, and a stray `clicklearnglobalweb.trafficmanager.net` |
| M365 extras | autodiscover → outlook, lyncdiscover/sip → Teams/Skype Online, enterpriseenrollment → **Intune** |
| CAA | none |

## 3. Subdomains

Sources: CertSpotter (43 current names) and crt.sh (65 names, first certificate 2018-05-31). Issuers seen include GeoTrust/DigiCert, Google Trust Services, Let's Encrypt, Thawte and GlobalSign AlphaSSL.

| Host | Resolves to | What it is |
|---|---|---|
| www / apex | Cloudflare → Kinsta | WordPress marketing site |
| prem-stage | Cloudflare | WordPress staging (500 error) |
| more, www2 | Azure Front Door `clicklearnglobalweb.azurefd.net` | Legacy **Umbraco** (ASP.NET) site, `noindex,nofollow`. Hosts the Dynamics CRM tracking endpoint and `/partner-program`. App Insights `request-context` header |
| partners | AWS (3.33.251.168) | 301 → more.clicklearn.com/partner-program |
| docs, documentation | Azure Front Door → help.content.eu | Product documentation (see section 4) |
| help.content.eu | Azure Front Door `cl-front-door-prod-eu` | Public ClickLearn content tenant. IIS/ASP.NET MVC 5.2 |
| globalweb-cdn | Azure CDN/Front Door | Static media (Umbraco `/media/` IDs) |
| cdn, help, download, apps | Azure Front Door/CDN → **Azure Blob Storage** (`x-ms-blob-type`) | Static files. The root returns a ResourceNotFound XML 404 |
| portal, portalapi, content | Traffic Manager → App Service `cl-attain-portal-prod-cecana-4010` / `cl-attain-portalapi-prod-cecana-4010` (Canada Central) | Global "Welcome to ClickLearn Portal" (ASP.NET MVC, Inspinia/Bootstrap theme, legacy UA tag `UA-9944611-3`) and "ClickLearn \| API" |
| `*.portal.{eu,us,ca,au}`, `*.portalapi.*`, `*.content.*` | Wildcard → Azure Front Door | **Per-tenant admin portal, API and published content** for each data-residency region. An unknown tenant shows an "Invalid Customer" image |
| stampregistry, lookup.stampregistry | Traffic Manager → Azure Function App `cl-attain-stampregistry-prod-cecana` | **[inference]** Tenant → region "stamp" lookup service ("Your Azure Function App is up and running") |
| upload, uploadv8-{westec,ncenus,aueast,ceca} | Azure cloudapp VMs/LB per region | Studio upload endpoints (named in the docs firewall list) |
| api | App Service `clicklearnapi` (West Europe) | IIS/ASP.NET, 404 at root |
| universe, learning, dev-universe | Traffic Manager → App Service `portalweb-production-northcentralus` | **ClickLearn Universe**, an ASP.NET LMS (`/Areas/LMS/`) for certification/academy. GTM `GTM-P48PVRM`, GA4 `G-YHCCDSEJWZ`/`G-98WDZM2PTZ`, Google Ads 930890899, ActiveCampaign (`vgo`), Quora pixel |
| status | App Service `status-clicklearn-com` (West Europe) | Custom React status page (`/system/status`). Lists Portal, Studio and Admin Panel in West Europe, North Central US, Australia East and Central Canada. It showed a 06-Oct-2026 publishing incident in West Europe |
| community | `clicklearn-en-community.insided.com` (CloudFront) | **Gainsight Customer Communities (inSided)**. Hosts the release notes |
| support | HubSpot CMS (`26665845.sites.hscoscdn-eu1.net`) | **HubSpot Service Hub customer portal** (`/customerportal`, login required) |
| campaign | HubSpot CMS | Landing-page domain (root 404) |
| tag-proxy, load.tag-proxy, gcp-tag-proxy | Stape | Server-side GTM |
| customer-dialogue | Azure Container Apps (West Europe) | `server: uvicorn` (Python ASGI), 404 at root. **[inference]** An AI or chat backend |
| localhost, development, `*.development` (kaatest) | no public DNS | Dev certificates only |
| trial, moodle, moodlephp, universe-moodle, moodle-universe, test-universe, email, appss, campaigns, testwp | no longer resolve | Historic (CT logs only). Earlier Moodle-based academy **[inference]** |

## 4. Product: ClickLearn Attain (Studio + Cloud) technical requirements

Sources:
- `https://help.content.eu.clicklearn.com/publiccontent/Clicklearn%20Product%20Documentation.1033/Clicklearn%20Product%20Documentation.htm`
- Its PDF, which is 858 pages and 136 MB. pdfinfo shows `Producer: Aspose.Words for .NET 21.4.0`. **[inference]** ClickLearn uses Aspose for its Word/PDF output.
- The docs page is itself ClickLearn output: `clprojecttype=Content`, "ClickLearn Attain Studio", with SCORM/xAPI scripts `pmodelcmi.js` and `pmodelxapi.js`.

### Naming
- **ClickLearn Attain** is the platform.
- **ClickLearn Studio** is the Windows desktop authoring app.
- The **Admin Portal** is per-tenant at `<org>.portal.<region>.clicklearn.com`.
- The **ClickLearn Content Cloud / ClickLearnCloud** hosts published content.
- **ClickLearn Assist** is the in-app guidance overlay.
- **UXP / User Experience Panel** is a browser side-panel extension. It can be deployed through Intune (PowerShell) or GPO.
- **Universe** is the LMS and certification site.

### System requirements (docs §2.1)
- **Windows only.** The docs say "Windows 7 or later" and "does not work on Windows 8.0". The FAQ §39.1.1.2 says "Windows 11 or above", so the documentation is inconsistent.
- Mac users need a Windows VM.
- **.NET Framework 4.8+**, and **Microsoft Edge** must be installed. **[inference]** Edge is needed for WebView2 or embedded browser use.
- 16 GB RAM minimum, dual-core CPU (4-core recommended), 10 GB disk, 100% display scaling recommended.
- Install as **ClickOnce** (auto-updating) or **MSI** (managed). "You cannot install ClickLearn Attain using an executable file."
- The FAQ cites version 12.1.45.0 (March 2025). The Chrome Web Store Connector is 12.1.55.0, and the community release notes go up to 12.2.5.0 (June 2026).
- Proxy configuration lives in `C:\ProgramData\ClickLearn\ClickLearnProxy.txt`.
- Firewall allow-list per region:
  - `[ORG].portal.<r>.clicklearn.com`, `[ORG].portalapi.<r>…`, `[ORG].content.<r>…`
  - `uploadv8-<region>.clicklearn.com`
  - `portalapi`, `portal`, `apps`, `lookup.stampregistry` and `upload.clicklearn.com`
- Cloud hosting is Microsoft Azure in West Europe, North Central US, Canada Central and Australia East, chosen by the customer. The Trust Center security document (March 2026) says:
  - Encryption is AES-256 with keys in Azure Key Vault, and TLS 1.2+.
  - Tenancy is logically isolated multi-tenant, with optional dedicated Azure SQL or Blob storage.
  - Roles are Customer Administrator, Author and Content User. SSO is via Office 365 / OpenID.
  - **No ISO 27001 or SOC 2 yet**; they are "on the roadmap".

### How the recorder captures applications
- Security doc: "ClickLearn functions as a desktop application, complemented by a browser extension… Recordings are executed locally… eliminating the need for APIs or integrations."
- Marketing (`/product/features/connector/`): there are **Windows, Office and Web connectors**, each claimed to cover "90%" of applications, plus a **custom-built connector** service.
- **Web recording uses the "ClickLearn Connector" browser extension.**
  - Chrome ID `bapjjkngobbamfijnkfcboaipbdlnbie`: about 7,000 users, v12.1.55.0, updated 2026-07-31.
  - Edge ID `glfnkokmpphdldkdlbhmlnekdlgiomfd`.
  - Manifest v3. Permissions: `tabs`, `nativeMessaging`, `storage`, `notifications`, `scripting`, host `<all_urls>`.
  - Content scripts run in all frames, including a MAIN-world XHR hook (`cl-xhr-connector.js`).
  - Static reading only, nothing was executed:
    - The service worker connects to the desktop app through the **native messaging host `com.clicklearn.clgchost`** and/or **local WebSockets `ws://127.0.0.1:8767` and `:8768`**. Release notes for 12.1.65.0 say they moved to WebSockets for stability.
    - The 4.1 MB `cl-connectors.js` holds DOM element-identification logic: heavy use of `shadowRoot`, `aria-label`, `role=` and `innerText`, plus app-specific code for SAP UI5/Fiori, Salesforce Lightning/Aura, PowerApps, IFS, Oracle, Acumatica and Kendo. It also handles replay (`replayElementFound`).
- **Assist extension** "ClickLearn Assist", Chrome ID `eahlmagcgafncnofhlkdfgmjdkkeephk`: about 10,000 users, v12.1.52.0. It has the same structure but no nativeMessaging. It renders in-app guidance.
- **Authoring Tools extension**, Chrome ID `nicmgkdfjeohcjkeeafghpafmkhpomdo` (Edge `hpjglmmmlghioncgkbfnajmmibgdmolh`): 694 users, v GC.AT.4.0.0.1.
- **Desktop and thick-client recording relies on accessibility and scripting APIs:**
  - Docs §36 require the **Java Access Bridge** for Java apps.
  - Docs §37 require **SAP GUI Scripting** to be enabled ("SAP Logon requirements").
  - **[inference]** Generic Windows apps are captured through Windows UI Automation/MSAA. The "Windows connector" exists, but the docs I searched do not name the API.
- **Replay** re-runs recorded steps against an updated UI to refresh screenshots.
- Dynamics-specific pieces include a Business Central extension and control add-ins, a D365 CE help solution, and a Dynamics AX data-model import.

### Public downloads (no executable installers are public)
- `https://apps.clicklearn.com/BrowserExtension/assist/installationforassistonallusers.bat` (1,439 B). Read as text only, not run: it downloads `clicklearnassistextension{chrome,edge}.reg` from the same blob and applies them with `regedit /s`. These are force-install policies for the extension.
- `https://apps.clicklearn.com/D365CEHelpSolution.zip` (18,774 B).
- The 136 MB product documentation PDF.
- The Studio ClickOnce/MSI installers are delivered through the licence email or the tenant portal (docs §3.1–3.2). They are not publicly linked.

## Screenshots
- ../screenshots/home.png, how-it-works.png, pricing.png, try-clicklearn.png, integrations-dynamics.png (taken after consent, animations forced visible)
- ../screenshots/sub-docs.png, sub-universe.png, sub-community.png, sub-support.png, sub-status.png
