"""Copy the captured screens a film uses into its composition as WebP.
Usage: python prep_assets.py <composition-dir> name=source ...  (source relative to scratch/shots, or media:<file>)"""
import json
import sys
from pathlib import Path

from PIL import Image

SCRATCH = Path(__file__).resolve().parent.parent
SHOTS = SCRATCH / "shots"
MEDIA = SCRATCH / "capdata/projects/prj_f2viz0pos9/media"
dest = Path(sys.argv[1]) / "assets/img"
dest.mkdir(parents=True, exist_ok=True)
for spec in sys.argv[2:]:
    name, src = spec.split("=", 1)
    width = None
    if "@" in src:
        src, w = src.split("@")
        width = int(w)
    path = MEDIA / src[6:] if src.startswith("media:") else SHOTS / src
    im = Image.open(path).convert("RGB")
    if width and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = dest / f"{name}.webp"
    im.save(out, "WEBP", quality=90, method=6)
    print(f"{name:<18} {im.size[0]}x{im.size[1]}  {out.stat().st_size // 1024} KB")
