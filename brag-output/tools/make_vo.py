"""Generate a narration track from vo-script.json with Kokoro (one clip per phrase).

Writes <out>/voiceover.wav (full film length, scene leads and tails as silence),
<out>/timing.json (absolute scene and phrase times) and <out>/captions.srt.
Usage: python make_vo.py <vo-script.json> <out-dir> [voice]
"""
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

CACHE = Path.home() / ".cache/hyperframes/tts"
script = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
voice = sys.argv[3] if len(sys.argv) > 3 else script["voice"]
kokoro = Kokoro(str(CACHE / "models/kokoro-v1.0.onnx"), str(CACHE / "voices/voices-v1.0.bin"))
SR = 24000


def trim(x, thresh=0.006, pad=0.03):
    idx = np.where(np.abs(x) > thresh)[0]
    if not len(idx):
        return x
    a = max(0, idx[0] - int(pad * SR))
    b = min(len(x), idx[-1] + int(pad * 2 * SR))
    return x[a:b]


def silence(sec):
    return np.zeros(int(round(sec * SR)), dtype=np.float32)


track, scenes, t = [], [], 0.0
for sc in script["scenes"]:
    start = t
    track.append(silence(sc["lead"]))
    t += sc["lead"]
    phrases = []
    for ph in sc["phrases"]:
        audio, sr = kokoro.create(ph["text"], voice=voice, speed=script.get("speed", 1.0), lang="en-us")
        assert sr == SR
        audio = trim(audio.astype(np.float32))
        dur = len(audio) / SR
        phrases.append({"id": ph["id"], "text": ph["text"], "start": round(t, 3), "end": round(t + dur, 3)})
        track.append(audio)
        t += dur
        if ph.get("gap"):
            track.append(silence(ph["gap"]))
            t += ph["gap"]
    track.append(silence(sc["tail"]))
    t += sc["tail"]
    # scene slots land on whole frames (30 fps)
    end = round(round(t * 30) / 30, 4)
    pad = end - t
    if pad > 0:
        track.append(silence(pad))
    t = end
    scenes.append({"id": sc["id"], "start": round(start, 4), "duration": round(end - start, 4), "voStart": phrases[0]["start"], "voEnd": phrases[-1]["end"], "phrases": phrases})
    print(f"{sc['id']:<10} {start:7.2f} +{end - start:5.2f}s  vo {phrases[-1]['end'] - phrases[0]['start']:5.2f}s")

full = np.concatenate(track)
sf.write(out / "voiceover-raw.wav", full, SR)
(out / "timing.json").write_text(json.dumps({"voice": voice, "total": round(t, 4), "scenes": scenes}, indent=2))


def ts(x):
    h, r = divmod(x, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02}:{int(m):02}:{int(s):02},{int(round((s % 1) * 1000)):03}"


# captions: one cue per sentence-ish group (merge phrases until punctuation ends a sentence)
cues, buf = [], []
for sc in scenes:
    for ph in sc["phrases"]:
        buf.append(ph)
        if ph["text"].rstrip().endswith((".", "?", "!", ":")) or len(" ".join(p["text"] for p in buf).split()) > 12:
            cues.append(buf)
            buf = []
    if buf:
        cues.append(buf)
        buf = []
srt = []
for i, c in enumerate(cues, 1):
    nxt = cues[i][0]["start"] - 0.05 if i < len(cues) else None
    text = " ".join(p["text"] for p in c)
    text = text.replace("L M S", "LMS").replace("scorm", "SCORM").replace("S A P", "SAP").replace("Walk Me", "WalkMe").replace("Click Learn", "ClickLearn").replace("I D", "ID")
    text = text.replace("Dynamics three sixty-five", "Dynamics 365").replace("twenty twenty-four", "2024").replace("twenty twenty-seven", "2027")
    text = text.replace("a hundred and forty", "140").replace("thirty-nine check", "39-check").replace("sixteen-gigabyte", "16 GB")
    end = c[-1]["end"] + 0.25 if nxt is None else min(c[-1]["end"] + 0.25, nxt)
    srt.append(f"{i}\n{ts(c[0]['start'])} --> {ts(end)}\n{text}\n")
(out / "captions.srt").write_text("\n".join(srt))
print(f"total {t:.2f}s")
