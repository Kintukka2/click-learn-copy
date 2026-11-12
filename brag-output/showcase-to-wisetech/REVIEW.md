# System Replay film: review notes

## What it is
A 4:03 narrated explainer for the client ("Getting more value from our PGs"), built from storyboard draft 6 and the ElevenLabs take (voice: Lyan). 18 scenes, 1920×1080 at 30 fps.

## Creative calls
- Every scene is timed to the narration's own word timings (Parakeet transcript of the take). Reveals land on the word that names them.
- Three scenes adapt the investor film: the opener, the release animation (relabelled for D365 updates and Wave 2 and Wave 3) and the moved Save button (now "the 4-step check").
- Every app screen and export was re-captured with "System Replay" in place of the app name, in a scratch copy of the app. The demo data stays anonymised. The demo app is labelled as standing in for D365.
- Music: the investor film's two beds. Bed A runs under the problem, bed B from "It starts from a PG", and bed A returns for the close and swells after the last line.
- Ava's avatar is the image you supplied. The chat window around it is a generic sketch, not Teams' own design.

## What was measured
- `hyperframes check`: 0 errors and 0 warnings after fixes. Fixed along the way: an overlap in the PG versus system check, lines on screen too briefly to read, text under the 28 px phone floor, and clip lengths.
- I inspected stills at 55 key moments and fixed six layout issues: a cropped Guide me card, the recording bar out of frame, a node label overflowing its box, a wrapping row, a cramped server label and overlapping end tags.
- The voice was loudness-normalised to −16 LUFS, −1.5 dBTP.

## Not checked
- Sound was measured, not heard. Watch once with sound.
- Motion was checked as stills, not as playback.

## Weakest shots
- The PG ecosystem diagram sits slightly high in the frame.
- In the server scene, the "Talks only to this server" label sits close to the Authors box.

## Kept on purpose
- The training scene's slides wait off-screen before they push in. The check reports this as `panel_out_of_canvas` at info level.
