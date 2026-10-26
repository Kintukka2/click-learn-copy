# Hyperframes composition brief: Steplight, investor / detail cut

## Objective
A 3-minute explainer that shows how Steplight works, why the market wants it now, and the proof that it works today.

## Output
- Composition directory: `investor-long/composition/`
- Rendered video: `investor-long/brag.mp4`
- Format: landscape 1920×1080, 30 fps
- Duration: 193.83 s, set by the measured narration

## Source material
Everything in the client cut's brief, plus:
- `research/` for the market, the incumbent and the openings
- `src/capture/selectors.ts`, `src/server/recording.ts` and `src/replay/replay.ts` for the mechanism
- `src/server/ai.ts` and `src/server/guide-import.ts` for the AI layer
- `Dockerfile`, `docs/ARCHITECTURE.md` and the privacy notes for deployment (generic only; see the repo's `CLAUDE.md`)
- `tests/` and `scripts/e2e.ts` for the proof

Real data shown: the recorded selectors for the Name field and the real healed result for Save from a Replay run against the changed layout. The JSON excerpt is taken from the stored step.

## Creative direction
- Tone: `polished`, a calm investor briefing in the product's own visual language
- Devices: a diagram that grows (the model, deployment) and one worked example (the "Create a new customer" process, the Name field, the Save button) carried through capture, storage, replay, healing and localization
- Every number on screen carries its source line

## Storyboard
18 scenes. The contract is in `brag-plan.md`, and the measured cue times are in `composition/assets/vo/timing.json`.

## Audio
- Voice: `assets/vo/voiceover.wav` (Kokoro `af_heart`)
- Music: `bed-a.mp3` (vol-12) for 0–64 s, crossfading at "How it works" into `bed-b.mp3` (vol-1, starting from section B). Both sit at about 0.13 under the voice, with an end swell.
- SFX: sparse soft drops on chips and numbers, clicks on visible clicks, one stamp, and one bell

## Gate
`npx hyperframes check` passes with 0 errors, and contrast is 58/58 WCAG AA.
