#!/usr/bin/env python3
"""Generate dsh-whale-decor's decoration assets from the MIT licensed dsh-pet art.

Source frames:  <dafeiyu>/assets/pet/**            (MIT, PC2005-cloud/dsh-pet)
Output:         dsh-whale-decor/assets/files/**    (consumed by src/index.js)

The source set is a chibi "whale-tail maid" on a 412x344 RGBA canvas. Only the
MIT-licensed `assets/pet/` tree is read; the restricted legacy BigFish frames
under `legacy/` are deliberately never touched.

Run:  <bundled python> tools/build-assets.py [--source <assets/pet>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guard
    sys.exit("Pillow is required: run this with the bundled DSH python runtime")

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
OUT_ROOT = PROJECT / "assets" / "files"

# Source frames live **in this repo** (`assets/source/frames/`, 33 files, ~500 KB):
# only the frames this pipeline actually consumes, vendored so a rebuild never
# depends on another plugin being installed.
#
# History: this used to read `node_modules/dsh-dafeiyu/assets/pet` directly. When
# that plugin was replaced by its upstream (`dsh-pet`, which ships green-screen
# `assets/webm/` rather than converted WebP frames), the source directory vanished
# with it. Vendoring here keeps the pipeline self-contained and byte-reproducible.
#
# `--source <dir>` still overrides it, e.g. to rebuild from a fuller frame set.
DEFAULT_SOURCE = PROJECT / "assets" / "source" / "frames"

# User-supplied backdrop, kept in the repo so `files/background.webp` stays
# reproducible. Absent is fine: the client only enables the backdrop layer when
# the manifest actually lists it.
BACKGROUND_SOURCE = PROJECT / "assets" / "source" / "background.jpg"
BACKGROUND_MAX_WIDTH = 1920

# Head/bust window, in source-canvas pixels. The rig is shared by every clip,
# so one box keeps the avatar and both stickers framed identically.
HEAD_BOX = (142, 58, 302, 218)  # -> 160x160, ahoge tip (y=63) keeps 5px headroom, face sits just below centre

# Floating widget: every 8th idle frame, downscaled. 42ms * 8 = 336ms playback.
FLOAT_STRIDE = 8
FLOAT_WIDTH = 200

WEBP_OPTS = {"format": "WEBP", "quality": 82, "method": 6}


def load(source: Path, clip: str, frame: int) -> Image.Image:
    path = source / clip / f"{clip}_{frame:03d}.webp"
    if not path.is_file():
        sys.exit(f"missing source frame: {path}")
    return Image.open(path).convert("RGBA")


def write(image: Image.Image, relative: str) -> int:
    target = OUT_ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, **WEBP_OPTS)
    return target.stat().st_size


def content_box(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    """Bounding box of pixels that are actually visible."""
    box = image.getchannel("A").point(lambda v: 255 if v > threshold else 0).getbbox()
    if box is None:
        sys.exit("source frame is fully transparent")
    return box


def scale_to_width(image: Image.Image, width: int) -> Image.Image:
    height = max(1, round(image.height * width / image.width))
    return image.resize((width, height), Image.LANCZOS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args()
    source: Path = args.source
    if not source.is_dir():
        sys.exit(f"source asset tree not found: {source}")

    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict[str, str]] = {}
    report: list[tuple[str, str, int]] = []

    def emit(relative: str, image: Image.Image, origin: str) -> None:
        size = write(image, relative)
        files[relative] = {"type": "image/webp"}
        report.append((relative, origin, size))

    # 1. Sidebar avatar -- bust crop of the neutral idle frame.
    idle_first = load(source, "idle", 1)
    emit("avatar.webp", idle_first.crop(HEAD_BOX).copy(), "idle_001 head")

    # 2. Hero illustration -- full character, trimmed of empty canvas.
    hero = idle_first.crop(content_box(idle_first))
    emit("hero.webp", scale_to_width(hero, 340), "idle_001 trimmed")

    # 3. Composer signature sticker -- the happy pose reads well very small.
    emit("sticker-happy.webp", load(source, "head_pat", 1).crop(HEAD_BOX).copy(), "head_pat_001 head")

    # 4. Reply-tail sticker -- chewing on a token.
    emit("sticker-eat.webp", load(source, "eat_token", 60).crop(HEAD_BOX).copy(), "eat_token_060 head")

    # 5. Floating widget -- decimated idle loop.
    idle_dir = source / "idle"
    frame_numbers = sorted(
        int(p.stem.rsplit("_", 1)[1]) for p in idle_dir.glob("idle_*.webp")
    )
    if not frame_numbers:
        sys.exit(f"no idle frames under {idle_dir}")
    picked = frame_numbers[::FLOAT_STRIDE]
    for index, frame_number in enumerate(picked):
        frame = scale_to_width(load(source, "idle", frame_number), FLOAT_WIDTH)
        emit(f"float/{index:03d}.webp", frame, f"idle_{frame_number:03d}")

    # 6. Backdrop. The source is a photographic frame, not a sprite: it keeps
    #    its aspect ratio and is only capped in width, never cropped here —
    #    `background-size: cover` does the fitting in the browser.
    if BACKGROUND_SOURCE.is_file():
        backdrop = Image.open(BACKGROUND_SOURCE).convert("RGB")
        if backdrop.width > BACKGROUND_MAX_WIDTH:
            backdrop = scale_to_width(backdrop, BACKGROUND_MAX_WIDTH)
        size = write(backdrop, "background.webp")
        files["background.webp"] = {"type": "image/webp"}
        report.append(("background.webp", f"{BACKGROUND_SOURCE.name} {backdrop.width}px", size))
    else:
        print(f"  note: no backdrop at {BACKGROUND_SOURCE}; skipping background.webp")

    # 7. Allowlist consumed by the host route handler: an unknown name can never
    #    reach the filesystem, so the URL cannot steer reads outside this tree.
    #
    #    `revision` fingerprints the generated set. The client appends it to
    #    every asset URL, so regenerating the art busts the day-long browser
    #    cache without any manual invalidation.
    digest = hashlib.sha256()
    for relative in sorted(files):
        digest.update(relative.encode("utf-8"))
        digest.update(str((OUT_ROOT / relative).stat().st_size).encode("ascii"))

    manifest = {
        "version": 1,
        "revision": digest.hexdigest()[:12],
        "generatedBy": "tools/build-assets.py",
        "attribution": {
            "character": "whale-tail maid",
            "upstream": "PC2005-cloud/dsh-pet",
            "license": "MIT",
            "via": "dsh-pet assets/webm (converted frames vendored at assets/source/frames)",
        },
        "floatFrameMs": 42 * FLOAT_STRIDE,
        "files": dict(sorted(files.items())),
    }
    (PROJECT / "assets" / "index.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    total = sum(size for _, _, size in report)
    for relative, origin, size in report:
        print(f"  {relative:28s} {size / 1024:7.1f} KB  <- {origin}")
    print(f"\n{len(report)} files, {total / 1024:.1f} KB total -> {OUT_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
