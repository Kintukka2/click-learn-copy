# Steplight sales collateral

Three pieces in the same visual language as the films in `../client-short` and `../investor-long`. They use the same Inter type, the same ink, blue and teal palette, the teal "step light" highlight and the same real captures.

| Piece | For | Where |
|---|---|---|
| Investor deck (17 slides) | Investors and technical buyers. It names ClickLearn. | claude.ai Slides deck: https://claude.ai/artifact/Q9WAs66GMPPtHFriVPb4uC |
| Client deck (11 slides) | Prospects. It says "legacy desktop tools" and does not name ClickLearn. | claude.ai Slides deck: https://claude.ai/artifact/HZWxdTfv2PHRwE1VmW76Gt |
| One-pager (A4) | A leave-behind for prospects. It is client-facing. | `one-pager.pdf`, with `one-pager.html` as the source. Web version: https://claude.ai/artifact/SSVGyLheUvb8uhG6UTmavG |

The decks live on claude.ai. They download as .pptx or PDF from the deck's Share › Export menu, and every slide has speaker notes. All three links are private until you share them.

## Fill in before sending

- Investor deck, cover: `[Month 2026]`.
- Investor deck, the ask: `[€__]` raise, `[__%]` per use of funds, `[__]` months of runway, and `[your name] · [email]`.
- One-pager, footer: `[name] · [email] · [phone]`. Edit `one-pager.html`, then re-export the PDF (below).

## Sources

The claims follow the rules in `../../CLAUDE.md`. In short, hosting is "a single container on a dedicated server", and there are no hostnames, pricing or customer claims about Steplight.

| Claim | Source |
|---|---|
| Digital adoption ≈ $1.04B (2024); SAP–WalkMe ≈ $1.5B (Sep 2024) | `research/detail/02` (Gartner via Whatfix; SAP press release) |
| ClickLearn: €7.9M revenue (2024), 800+ customers, Windows client with 16 GB RAM and .NET 4.8, process testing and SCORM in the Enterprise tier | `research/detail/01`–`04` |
| SAP Enable Now: no cloud renewals after 30 Apr 2027, maintenance ends 30 Nov 2030 | `research/detail/02` |
| Ranked selectors and the Name field's real selectors | `src/capture/selectors.ts`, the recorded sample project |
| The healed message and "Passed · 3 healed" | A real Replay against the demo's new layout (see `../README.md`) |
| 7 template languages; "Klik på Ny." | `README.md`, `src/core/instructions.ts` |
| Usage counted without names; the extension talks only to your server | `src/server/privacy.ts` |
| 140+ tests; 39/39 end-to-end checks | `tests/`, `scripts/e2e.ts`, `.github/workflows/ci.yml` |
| Roadmap themes | `docs/ROADMAP.md` (themes only, no dates) |

## Files

- `img/`: crops of the 2× captures used by the decks and the one-pager. The demo data in them is already neutralised.
- `one-pager.html`: a single page that prints to one A4 sheet and stacks to one column on phones.

Re-export the PDF with Playwright's Chromium after an edit: open the page, emulate print media, then call `page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true })`. Check that it is still one page.
