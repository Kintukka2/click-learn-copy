# Showcase to WiseTech

An internal film for the current client. It explains the replay capability as the "third use case" of their PG ecosystem, in their own terms: what it does for PG maintenance, what else it gets out of the PGs, what it costs to run and where it is today.

4:03 · 1920×1080 · narrated with an ElevenLabs voice (Lyan) · 18 scenes, one per part of the agreed storyboard.

## Not Steplight marketing

- The film calls the product **System Replay** and uses the client's vocabulary: PG, PG Builder, Ava, D365, Wave 2 and Wave 3, finance teams. Don't reuse its copy or screens in Steplight's own marketing, where the rules in `../../CLAUDE.md` apply (no named platforms in the problem, and so on).
- No people are named. The Ava avatar is the client's own chatbot image, supplied for this film.
- Hosting is "a single container on a dedicated server", as in the other films.

## Files

| File | What it is |
|---|---|
| `showcase-to-wisetech.mp4` | The film. The poster is baked in as frame 0. |
| `captions.srt` | Captions in the script's wording, timed to the voice |
| `poster.jpg` | The poster frame (the PG ecosystem diagram) |
| `narration-script.txt` | The text given to ElevenLabs, with its pause tags and spoken spellings |
| `REVIEW.md` | Review notes: what was checked, the weakest shots |
| `composition/` | The editable Hyperframes project |

## Screens

The app was captured at 2× from a scratch copy of the repo. The visible app name was relabelled "System Replay" in the Studio, the extension, the players and the Word and PowerPoint exports. The demo data was anonymised as for the other films, and the demo app is labelled on screen as standing in for D365. The capture scripts are in `../tools/system-replay/`.

## Change and render

- Scene start times and lengths are in `composition/index.html`. Cue times inside each `composition/compositions/<scene>.html` are local to that scene and follow the word timings in `composition/assets/vo/timing.json`.
- For a new voice take, replace `composition/assets/vo/voiceover.wav` (loudness-normalised to −16 LUFS, −1.5 dBTP), transcribe it for word timings and move the cues to match.
- Check and render as in `../README.md`:
  `npx hyperframes@0.8.200 check`, then `npx hyperframes@0.8.200 render --quality high --crf 20 --output ../showcase-to-wisetech.mp4`.
- Music: the same "Happy Beats / Business Moves" beds as the other films. Check their license before any public use.
