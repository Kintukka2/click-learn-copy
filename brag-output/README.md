# Steplight films

Two narrated product films, made with `/brag` and Hyperframes. The narration is an AI American female voice (Kokoro `af_heart`).

| Film | For | Length | File |
|---|---|---|---|
| Client cut | Prospects: the friction, the fix, the features in real UI | 1:05 | `client-short/brag.mp4` |
| Investor cut | Investors and technical buyers: market, mechanism, proof, roadmap | 3:14 | `investor-long/brag.mp4` |

Each folder has the plan and storyboard (`brag-plan.md`), the Hyperframes handoff (`composition-brief.md`), the narration script (`vo-script.json`), captions (`captions.srt`), a poster (`brag.jpg`, also baked in as frame 0), the caption for posting (`share-copy.txt`) and the editable composition (`composition/`). Longer copy for LinkedIn, email and investor intros is in `share-copy-variants.md`.

## What is on screen is the real product

- **Screens:** the running app was captured at 2× (`tools/capture-video.ts`). That covers the recorded sample project, Replay and a test against the changed layout (3 steps healed), the Danish and German localized replays, the published portal, the players, Guide me in the live app, and an imported Word guide.
- **Documents:** the real Word, PDF and PowerPoint exports, rendered to pages with LibreOffice.
- **Data:** the selectors, the step JSON, the healed message (`healed: matched by role "button|Save" instead of id "customer-save"`), the 139 test cases and the 39 end-to-end checks all come from this repo or from that run.
- **Rebuilt parts:** pieces that had to move (the step rows, chips, the Test me score, the Translate dialog, the recording pill) were rebuilt in HTML from the product's own CSS and labels.

## What was changed for the cameras

- The demo data's contact names became roles, phone numbers moved to the UK drama range (+44 20 7946 0xxx), and e-mail domains became `example.com`. This was done in a scratch copy, so the repo's demo data is untouched.
- `localhost` addresses are shown as `erp.northwind.example` and `learn.northwind.example`.
- Hosting is described only as "a single container on a dedicated server". See the messaging rules in `../CLAUDE.md`.
- ClickLearn is named only in the investor cut.

## Before you publish

- **Music:** the bed tracks are the "Happy Beats / Business Moves" series by ende.app, bundled with the brag skill. Check their license terms before posting publicly or using the films in paid campaigns. You can also swap in your own track: `composition/assets/music/`, then re-render.
- **Market figures:** the investor cut's numbers come from `research/` and are labelled as third-party figures on screen. Refresh them if you use the film after 2026.

## Change the voice or the words

1. Edit `vo-script.json`, or keep it and pick another Kokoro voice (`af_bella`, `af_nova`, …).
2. Regenerate the narration and timings:
   `python3 tools/make_vo.py client-short/vo-script.json client-short/composition/assets/vo [voice]`
   Then loudness-normalise with ffmpeg: `loudnorm=I=-16:TP=-1.5`, 24 kHz mono (see the commit that added this folder).
3. If a scene's length changed, rewrite the scene hosts in `composition/index.html` from `assets/vo/timing.json`, and adjust that scene's cue times in `compositions/<scene>.html`.

## Render

```bash
cd client-short/composition        # or investor-long/composition
npx hyperframes@0.8.200 check      # must pass with 0 errors
npx hyperframes@0.8.200 preview    # edit in the browser studio
npx hyperframes@0.8.200 render --quality high --crf 20 --output ../brag.mp4
```

Rendering needs Node 22+, ffmpeg and `npx hyperframes browser ensure` once. The fonts (Inter, JetBrains Mono) are fetched and cached by the compiler.

## Review notes

- **Checked:** `hyperframes check` shows 0 errors in both films, with WCAG AA contrast on every text check. Loudness was measured on the render: −14.5 LUFS integrated, −1.5 dBTP, no clipping. Key frames and every scene cut were inspected as stills.
- **Not checked by ear:** the mix was measured, not listened to. Watch once with sound before sending.
- **Warnings kept on purpose:** small secondary labels (step numbers, language codes, mono code text) sit at 22–27 px; the per-letter "Steplight" reveal is counted as nine words by the reading-time check.
