# Brag plan: Steplight, investor / detail cut

## What is this app?
Steplight records a business process once in a web app and publishes the training for it in every format and language. A self-healing Replay keeps all of it current, and the same Replay doubles as automated regression testing for business processes.

## The angle
Investors and detail-minded buyers want the mechanism. The film works through one real example end to end: the "Create a new customer" process in the bundled Northwind ERP demo, and one field, **Name**. It shows the market and the opening first. Then it shows exactly how Steplight captures, stores, replays, heals, localizes and publishes. It ends on proof (tests that run on every push) and a roadmap described loosely, because plans change.

## Hook (0–8.9 s)
The live ERP, then the Word guide that explains it. On "the day the software updates", the guide's screenshot grows into today's app (the new layout). The guide's highlight is left on the wrong element, turns red, and "Out of date" lands.

## Chapters and key moments
1. **Problem:** a Dynamics 365 release-wave timeline (Oct 2025 to Oct 2027) with a guide under every wave. Each guide's screenshot goes stale on "re-shoot", its step list is selected on "rewrite", and it fans into EN/DA/DE copies on "re-translate".
2. **Market:** $1.04B, the 2024 digital adoption market (Gartner, as cited by Whatfix), and $1.5B, SAP's 2024 acquisition of WalkMe.
3. **Incumbent:** ClickLearn, with €7.9M revenue in 2024, 800+ customers and a Windows desktop client (16 GB RAM, .NET). Sources are shown on screen.
4. **Why now:** SAP Enable Now takes no new cloud renewals after 30 April 2027 and maintenance ends on 30 November 2030. The window to switch is drawn on the timeline.
5. **Versus:** authoring is a Windows desktop client there and a browser extension plus web Studio here. Process testing is the top tier there and built in here.
6. **How it works, capture:** "How it works" chapter title. The author clicks Name and the extension describes the element (Tag input · Role textbox · Name · Label).
7. **Selectors:** the real ranked selectors for the Name field: `id customer-name`, `role textbox · Name`, `label Name`, `css #customer-name`. Each one matches exactly one element.
8. **Clean steps:** raw browser events (pointerdown, focus, 17+ keydowns, change, blur) collapse into one step. Its instruction is typed out automatically ("⚡ Automatic"), and a sensitive value is masked (•••••• with "Sensitive value" on).
9. **Model:** the real step JSON and its screenshot go through `resolve(lang)` (EN/DA/DE) and out to Documents, Players, Portal and Live guidance.
10. **Replay and healing:** the light walks the real form step by step (with the "Replay… 5s" status). In the new layout, Save has moved: `id customer-save` is not found and `role button · Save` heals it. The step shows the real message, `healed: matched by role "button|Save" instead of id "customer-save"`, and its screenshot refreshes.
11. **Testing:** the real project list. Every process has its automated result ("Passed · 3 healed", "Test passed").
12. **Localization:** Replay in Danish and then German. The real label `name: "Neu"` drops into the German template, and the EN/DA/DE instructions are rebuilt with no machine translation.
13. **AI (Claude):** the portal's "Ask a question", answered from documented processes (a real offline answer). The Translate dialog ("Translation engine: Claude"). A Word guide becomes a draft with "Finalise the guide". "AI: Offline templates" shows that it also works without AI.
14. **Deployment and trust:** one container on a dedicated server (Studio and API, headless Chromium, a data volume of plain JSON and PNG). Authors sit behind an access key, learners use the portal, players and Guide me, analytics are anonymous, and the extension talks only to your server.
15. **Proof:** 139 automated tests, and the end-to-end pipeline passing 39 of 39 checks on every push.
16. **Roadmap:** one-click setup for whole organizations, hosting with backups, an Edge Add-ons listing, PDF import, and redaction inside the recorder.

## Outro
The mark lands, "Steplight", then "Record once. Publish everywhere." and **Book a demo**, held for about 3.4 s.

## Tone
- Preset: `polished` (with `app-store` feature clarity)
- Creative direction: a calm investor briefing in the product's own visual language. The real UI is the evidence, and diagrams grow one part at a time.
- Interpretation: one idea per scene, every number sourced, no hype, reveals timed to the narration's anchor words.

## Format: landscape, 1920×1080, 30 fps
## Duration: 193.8 s (3:14), set by the narration (about 450 words)

## Visual identity
The same as the client cut (`../client-short/brag-plan.md`), plus a dark code card (`#101828`, keys `#8fb1ff`, strings `#5eead4`) for data. The Claude badge uses the Studio's gradient (`#d97757`→`#c15f3c`).

## Messaging rules applied (see the repo's `CLAUDE.md`)
- Hosting is described only as "a single container on a dedicated server". There are no hosts, tunnels or PCs.
- ClickLearn is named here (investor cut) and never in the client cut.
- There are no pricing, customer or "open source" claims about Steplight.
- On screen, the demo app is `erp.northwind.example`. Demo contacts, phones and e-mails were replaced before capture.

## Grounding
| Claim | Source |
|---|---|
| Dynamics 365 release waves twice a year | `research/CLICKLEARN_ANALYSIS.md`, `research/detail/01` |
| Digital adoption ≈ $1.04B (2024) | research: Gartner as quoted by Whatfix |
| SAP–WalkMe ≈ $1.5B (Sep 2024) | `research/detail/02` |
| ClickLearn €7.89M revenue in 2024 (FT1000 2026), 800+ customers, Windows desktop client with 16 GB RAM and .NET 4.8, automated testing in the Enterprise tier | `research/detail/02`, `03`, `04` |
| SAP Enable Now: no cloud renewals after 30 Apr 2027, maintenance ends 30 Nov 2030 | `research/detail/02` |
| Ranked selectors, unique-match rule, noise merge, masking | `src/capture/selectors.ts`, `src/server/recording.ts`, `src/server/privacy.ts` |
| Replay ok/healed/failed and the exact healed message | `src/replay/replay.ts`, a real run (`v2-report`) |
| Localized replay plus templates, Claude only for author text | `src/replay/replay.ts`, `src/core/instructions.ts`, `src/server/ai.ts` |
| Ask answered from documented processes, Word import, offline mode | `src/server/ai.ts`, `src/server/guide-import.ts` |
| Single container, access key, anonymous analytics, extension talks only to your server | `Dockerfile`, `src/server/auth.ts`, `docs/WEB-STORE.md` (privacy) |
| 139 test cases; e2e 39/39 checks; CI on every push | `tests/*.test.ts`, `scripts/e2e.ts`, `.github/workflows` |
| Roadmap items | `docs/ROADMAP.md` |

## Audio direction
- Voice: Kokoro `af_heart` (American female), speed 0.94, loudness-normalised. Timings are in `composition/assets/vo/timing.json`.
- Music: `happy-beats-business-moves-vol-12` under the problem and market chapters, crossfading at "How it works" (61.5 → 64.2 s) into `vol-1` (from its section B), which is brighter for the mechanics. It sits at about 0.13 under the voice, swells to 0.34 after the last line, then fades over 1.6 s.
- SFX: soft drops on chips and numbers, clicks only on visible clicks, one stamp on "out of date", card slides on carried objects, and a bell on the mark.

## Voiceover script
See `vo-script.json` (18 scenes, phrase by phrase). It was polished with the humanizer pass: fragment rows merged, staged run-ups removed, and the Dynamics 365 Guides line dropped (a HoloLens product, not a fair comparison).
