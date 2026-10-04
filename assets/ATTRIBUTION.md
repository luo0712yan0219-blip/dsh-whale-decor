# Artwork attribution

The files under `files/` are **not** covered by this package's source-code
licence alone; the character art carries the upstream MIT licence below.

## What is in this package

| Output | Source |
| --- | --- |
| `files/avatar.webp`, `files/hero.webp` | `idle` clip frame (bust crop / trimmed full body) |
| `files/sticker-*.webp` | `head_pat` / `eat_token` clip frames (bust crop) |
| `files/float/*.webp` | every 8th `idle` frame, downscaled to 200px wide |

## whale-tail maid character art — MIT

- Character: `whale-tail maid` (`characterId: whaletail-maid`)
- Upstream: [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) — Copyright (c) 2026 PC2005-cloud
- Licence: MIT. The full upstream notice is bundled here as
  [`dsh-pet-LICENSE.txt`](dsh-pet-LICENSE.txt), which is what the MIT terms require
  to travel with these derived images.
- The upstream ships transparent VP9 WebM clips; the WebP frames in this package
  were re-encoded from them as 12 fps frames on a shared 412x344 crop window.

## There is deliberately **no backdrop image** in this package

The author's own backdrop is a user-supplied photograph-style image carrying no
asserted licence, so it is **not redistributed here**. The plugin handles its
absence: the client checks `manifest.files['background.webp']` and skips the
entire backdrop layer when it is missing, so the theme, the character art, the
cards and the hardware readout all still work — there is simply no photo behind
them.

**To use your own image**, drop it at `assets/files/background.webp` and add it
to `assets/index.json`:

```json
"background.webp": { "type": "image/webp" }
```

The host route serves assets through that allowlist, so a file that is not listed
is not reachable — adding the entry is what makes it load.

## Deliberately not used

The legacy BigFish frames archived by `dsh-dafeiyu` under `legacy/dafeiyu/`
(derived from fan-made and AI-assisted sheets) are under restricted terms and are
never read by this project's pipeline. Nothing BigFish-derived is present here.

## No warranty, no affiliation

No warranty is given. The `dsh-pet` name and its project identity belong to their
respective owners. This is an unofficial decoration and is not affiliated with or
endorsed by DeepSeek.
