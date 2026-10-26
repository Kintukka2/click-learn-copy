# Hyperframes composition brief: Steplight, client cut

## Objective
A premium, problem-led product film for prospects. The pain comes first, then the fix in the real product UI.

## Output
- Composition directory: `client-short/composition/`
- Rendered video: `client-short/brag.mp4`
- Format: landscape 1920×1080, 30 fps
- Duration: 65.37 s, set by the measured narration (the user asked for about 60 s)

## Source material
- Project root: the repo root (Steplight)
- Primary files read: `README.md`, `docs/ARCHITECTURE.md`, `studio/src/styles.css`, `src/players/player.css`, `src/assist/assist.css`, `extension/content.ts`, `src/core/instructions.ts`, `demo-erp/*`
- Product name: Steplight
- Strongest claim, in the product's own words: "Record a process once. Publish it everywhere." (Studio onboarding)
- Real UI recreated or shown: Northwind ERP before and after its layout change, the recording pill, the Studio step list, the Word, PDF and PowerPoint exports, the Show me and Try it players, the Test me score, the Studio export menu, Guide me (Assist), the Replay report, and the language switch
- Copy that must appear verbatim: "Click **New**.", "In the **Name** field, enter **Fjord Kontormøbler ApS**.", "SCORM 1.2 package", "Klik på **Ny**.", "Updated · 3 healed", "Book a demo"

## Creative direction
- Tone: `polished` × `app-store`, a quiet premium product film
- Angle, hook and outro: see `brag-plan.md`
- Avoid: generic SaaS language, abstract filler, a dark void with floating glow, tilted UI, three-card rows

## Visual identity
Taken from `studio/src/styles.css`: ground `#f6f7f9`, ink `#101828`, brand `#2f6fed`, teal `#14b8a6` (the highlight, i.e. the "step light"), and the Studio chip palettes. Type is Inter at 800 for display.

## Storyboard
The contract is the table in `brag-plan.md`.

## Audio
- Voice: `assets/vo/voiceover.wav` (Kokoro `af_heart`, −16 LUFS, true peak −1.5 dB)
- Music: `assets/music/bed.mp3` (ende.app vol-11), media-start 2.78 s so that section B opens on the reveal. A volume lane ducks it to about 0.14 under the voice and lets it swell at the end.
- SFX: chosen after the motion existed (click, key, drop, card-slide, soft impact, bell), timed to land with their pictures
- Audio-reactive: none, on purpose, because breathing and pulsing motion reads as generated

## Hyperframes notes
- Each scene is a sub-composition in `compositions/`. The shared parts are in `assets/kit.css` and `assets/kit.js`. Typed text, counters and rollers are pure functions of timeline time (`SL.drive`).
- Screens are 2× captures (2880×1800), so a plate scale of 1 shows the UI at 2× its real size.
- Gate: `npx hyperframes check` passes with 0 errors, and contrast is 15/15 WCAG AA.
