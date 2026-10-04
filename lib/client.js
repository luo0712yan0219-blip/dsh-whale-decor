// Client half of dsh-whale-decor — deep-sea whale-blue reskin + whale-tail maid
// decoration for the DSH Web UI.
//
// Loaded by the DSH client module loader, which expects exactly this shape:
//   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
// `require` resolves the shell's shared React; there is no bundler step, so this
// file is hand-written ESM-flavoured CommonJS and every render uses createElement.
//
// Two independent contributions:
//   1. a theme-token layer  (ctx.theme.overrideTokens)  — the reskin
//   2. six slot registrations (ctx.slots)               — the character
//
// Failure policy: decoration must never be able to break the shell. Every step
// is guarded, and a failure degrades to "no decoration" rather than an exception
// escaping into the WebUI (this is the lesson dsh-dafeiyu documents at its own
// settings card).

window.__ModuleLoader__.load({
  id: 'dsh-whale-decor',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const NS = 'dsh-whale-decor'
    const MANIFEST_URL = '/plugins/dsh-whale-decor/manifest'
    const ASSET_URL = '/plugins/dsh-whale-decor/asset/'
    const STORAGE_KEY = NS + ':enabled'
    const STYLE_ID = NS + '-style'

    // ── Deep-sea whale blue ────────────────────────────────────────────────
    // Every alias token the host publishes requires both schemes, so one layer
    // covers light and dark; the built-in themes stay untouched underneath and
    // disposing this layer restores them exactly.
    const TOKENS = {
      '--dsw-alias-bg-base': { light: '#f2f7fd', dark: '#0a1524' },
      '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#101e31' },
      '--dsw-alias-bg-layer-2': { light: '#e8f1fb', dark: '#16283f' },
      '--dsw-alias-bg-overlay': { light: '#ffffff', dark: '#142438' },
      '--dsw-alias-border-l1': { light: '#d6e4f2', dark: '#1d3350' },
      '--dsw-alias-border-l2': { light: '#b5cbe3', dark: '#2a4a70' },
      '--dsw-alias-brand-primary': { light: '#1f6fd0', dark: '#4d9dff' },
      // Both labels are deliberately brighter in dark mode than a neutral palette
      // would set them: they sit on translucent panels over a bright photo, so the
      // text side pays for the backdrop being visible.
      '--dsw-alias-label-primary': { light: '#0c2036', dark: '#eef6ff' },
      '--dsw-alias-label-secondary': { light: '#4a6785', dark: '#c6daf0' },
      '--dsw-alias-state-error-primary': { light: '#d6455d', dark: '#ff6b81' },
      '--dsw-alias-state-idle-primary': { light: '#8ba6c4', dark: '#4a6a8f' },
      '--dsw-alias-state-success-primary': { light: '#128f63', dark: '#3ddc97' },
      '--dsw-alias-state-warn-primary': { light: '#b8791a', dark: '#ffc46b' },
      '--dsw-specific-sidebar-fill': { light: '#e9f1fa', dark: '#0c1a2b' },
    }

    // Geometry in one place: everything below is tuned by editing these.
    const GEOMETRY = {
      heroMin: 110,
      heroMax: 190,
      heroRatio: 3.2,
      floatWidth: 132,
      floatOffsetRight: 18,
      floatOffsetBottom: 14,
      toggleIcon: 18,
      composerSticker: 20,
      replySticker: 18,
      panelMaxWidth: 520,
    }

    // ── Floating panel: clock + weather ────────────────────────────────────
    // Weather comes from Open-Meteo: no API key, no account, and it answers with
    // `Access-Control-Allow-Origin: *`, so the page can call it directly instead
    // of routing every lookup through this plugin's host half.
    const WEATHER_STORAGE_KEY = NS + ':weather'
    const WEATHER_REFRESH_MS = 15 * 60 * 1000
    const WEATHER_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
    const WEATHER_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

    // WMO weather interpretation codes, which is what Open-Meteo reports.
    const WEATHER_CODES = {
      0: ['晴', '☀️'],
      1: ['大致晴朗', '🌤️'],
      2: ['局部多云', '⛅'],
      3: ['阴', '☁️'],
      45: ['有雾', '🌫️'],
      48: ['雾凇', '🌫️'],
      51: ['毛毛雨', '🌦️'],
      53: ['小雨', '🌦️'],
      55: ['中雨', '🌦️'],
      56: ['冻毛毛雨', '🌧️'],
      57: ['冻雨', '🌧️'],
      61: ['小雨', '🌧️'],
      63: ['中雨', '🌧️'],
      65: ['大雨', '🌧️'],
      66: ['冻雨', '🌧️'],
      67: ['强冻雨', '🌧️'],
      71: ['小雪', '🌨️'],
      73: ['中雪', '🌨️'],
      75: ['大雪', '🌨️'],
      77: ['雪粒', '🌨️'],
      80: ['阵雨', '🌦️'],
      81: ['强阵雨', '🌧️'],
      82: ['暴雨', '⛈️'],
      85: ['阵雪', '🌨️'],
      86: ['强阵雪', '🌨️'],
      95: ['雷阵雨', '⛈️'],
      96: ['雷阵雨伴冰雹', '⛈️'],
      99: ['强雷阵雨伴冰雹', '⛈️'],
    }

    const weatherOf = (code) => WEATHER_CODES[code] ?? ['未知', '🌡️']

    // The whole panel is a drag surface; only real controls opt out. Grabbing a
    // 22px handle in the corner is not how anyone expects a floating window to
    // move, and the handle glyph may not even exist in the active font.
    const NO_DRAG_SELECTOR = 'button, input, a, textarea, select, [data-dsh-decor-nodrag]'

    const startsOnControl = (target) => {
      try {
        return Boolean(target && typeof target.closest === 'function' && target.closest(NO_DRAG_SELECTOR))
      } catch {
        return false
      }
    }

    // The overlay layer is click-through and only occupants that opt back in
    // receive pointer events. If the shell scopes that with a rule of equal
    // specificity, a stylesheet-only opt-in can lose; the panel therefore also
    // sets pointer-events inline, which no non-important rule can override.
    const PANEL_POINTER_EVENTS = 'auto'

    // The place is the user's, and it lives in this browser: there is no sane
    // default for it, so the panel asks once and remembers.
    const readPlace = () => {
      try {
        const raw = window.localStorage.getItem(WEATHER_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const name = typeof parsed?.name === 'string' ? parsed.name.trim() : ''
        if (!name) return null
        const latitude = Number(parsed?.latitude)
        const longitude = Number(parsed?.longitude)
        return {
          name,
          latitude: Number.isFinite(latitude) ? latitude : undefined,
          longitude: Number.isFinite(longitude) ? longitude : undefined,
        }
      } catch {
        return null
      }
    }

    const writePlace = (place) => {
      try {
        window.localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(place))
      } catch {
        /* storage unavailable: the place lasts for this page only */
      }
    }

    // ── Backdrop ───────────────────────────────────────────────────────────
    // Setting a background image on <html>/<body> alone shows nothing: every
    // DSH surface is opaque and would cover it. So the backdrop is two layers
    // stacked on the palette, and only the five *surface* tokens go translucent
    // — borders, labels and states keep their solid palette colours.
    //
    // Alpha values were chosen against a rendered composite of this exact
    // backdrop (mean luma 198/255, brightest in the sidebar column at 233).
    //
    // The constraint that fixes them is text contrast, not taste. Solving
    // sRGB contrast for the brightest region the sidebar sits on gives a ceiling
    // of ~102/255 for the composite behind body text; with the scrim held low so
    // the photo keeps its range, that lands the dark surfaces near 0.52.
    //
    // The scrim is the dominant lever for "can I see the picture": it multiplies
    // the whole photo down, gaps included. Dropping it from 0.26 to 0.06 while
    // pulling the panels in from 0.66 is what makes the backdrop read, and it is
    // why the dark labels above are brighter than the base palette.
    const BACKDROP_SURFACE_SOURCE = NS + ':backdrop-surface'
    const BACKDROP_SCRIM_SOURCE = NS + ':backdrop-scrim'
    const BACKDROP_STYLE_ID = NS + '-backdrop'
    const BACKDROP_SCRIM_FALLBACK = 'rgba(8, 18, 34, 0.10)'

    const BACKDROP_SURFACES = {
      '--dsw-alias-bg-base': { light: 'rgba(242, 247, 253, 0.52)', dark: 'rgba(10, 21, 36, 0.52)' },
      '--dsw-alias-bg-layer-1': { light: 'rgba(255, 255, 255, 0.60)', dark: 'rgba(16, 30, 49, 0.56)' },
      '--dsw-alias-bg-layer-2': { light: 'rgba(232, 241, 251, 0.56)', dark: 'rgba(22, 40, 63, 0.54)' },
      // Overlays stay near-opaque on purpose: menus and popovers land over
      // arbitrary parts of the photo and must not trade away text contrast.
      '--dsw-alias-bg-overlay': { light: 'rgba(255, 255, 255, 0.95)', dark: 'rgba(20, 36, 56, 0.95)' },
      // The sidebar covers this photo's brightest column, so it carries the
      // tightest contrast budget of the five surfaces. At 0.56 it also picked up
      // enough of that brightness to read as a *lighter* column than the main
      // panel — inverting the intended depth. 0.60 lands it at roughly the same
      // composite as the main panel, so the column reads as one coherent surface
      // and the photo supplies the variation instead.
      '--dsw-specific-sidebar-fill': { light: 'rgba(233, 241, 250, 0.48)', dark: 'rgba(12, 26, 43, 0.60)' },
    }

    // The scrim keeps text readable whichever part of the photo sits behind it,
    // and names itself as a custom token so the stylesheet can consume it with a
    // plain var() — the CSS fallback means a rejected custom token degrades to a
    // fixed scrim instead of killing the backdrop.
    const BACKDROP_SCRIM = {
      '--dsh-whale-scrim': { light: 'rgba(8, 18, 34, 0.08)', dark: 'rgba(4, 10, 20, 0.06)' },
    }

    // Mirrors tools/build-assets.py (FLOAT_STRIDE=8 over 241 idle frames). Only
    // used if the manifest request fails, so the widget still animates.
    const FALLBACK_FLOAT = Array.from(
      { length: 31 },
      (_, i) => `float/${String(i).padStart(3, '0')}.webp`,
    )
    const FALLBACK_FRAME_MS = 336

    const warn = (what, error) => {
      if (typeof console !== 'undefined' && console.error) {
        console.error(`[${NS}] ${what}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // ── master switch ──────────────────────────────────────────────────────
    // Decoration is opt-out, so the stored value is only read for an explicit
    // "0"; anything unreadable (storage disabled, private mode) means "on".
    const store = {
      value: true,
      subscribers: new Set(),
      read() {
        try {
          return window.localStorage.getItem(STORAGE_KEY) !== '0'
        } catch {
          return true
        }
      },
      set(next) {
        this.value = next
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
        } catch {
          /* storage unavailable: the switch still works for this page */
        }
        for (const notify of [...this.subscribers]) {
          try {
            notify()
          } catch (error) {
            warn('subscriber', error)
          }
        }
      },
      toggle() {
        this.set(!this.value)
      },
      subscribe(notify) {
        this.subscribers.add(notify)
        return () => this.subscribers.delete(notify)
      },
    }
    store.value = store.read()

    function useEnabled() {
      const [enabled, setEnabled] = useState(store.value)
      useEffect(() => store.subscribe(() => setEnabled(store.value)), [])
      return enabled
    }

    // ── asset plumbing ─────────────────────────────────────────────────────
    // The manifest carries the build revision, so regenerated art is fetched
    // fresh instead of being served from the browser's day-long cache.
    let revision = ''
    let manifestPromise = null

    function loadManifest() {
      if (!manifestPromise) {
        try {
          manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
            .then((manifest) => {
              revision = typeof manifest?.revision === 'string' ? manifest.revision : ''
              return manifest
            })
            .catch(() => null)
        } catch {
          manifestPromise = Promise.resolve(null)
        }
      }
      return manifestPromise
    }

    function assetUrl(name) {
      return ASSET_URL + name + (revision ? `?v=${encodeURIComponent(revision)}` : '')
    }

    function floatClip(manifest) {
      const names = manifest && manifest.files ? Object.keys(manifest.files) : []
      const frames = names.filter((name) => name.startsWith('float/')).sort()
      const frameMs = Number(manifest?.floatFrameMs)
      return {
        frames: frames.length ? frames : FALLBACK_FLOAT,
        frameMs: Number.isFinite(frameMs) && frameMs > 0 ? frameMs : FALLBACK_FRAME_MS,
      }
    }

    const prefersReducedMotion = () => {
      try {
        return typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      } catch {
        return false
      }
    }

    // One stylesheet for the things inline styles cannot express: keyframes,
    // hover states, and the reduced-motion opt-out.
    function installStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
@keyframes ${NS}-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}
@keyframes ${NS}-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.${NS}-float {
  animation: ${NS}-bob 5.5s ease-in-out infinite, ${NS}-fade-in .5s ease-out both;
}
.${NS}-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: inherit;
  cursor: pointer;
  opacity: .72;
  transition: opacity .15s ease, background-color .15s ease;
}
.${NS}-toggle:hover { opacity: 1; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.14)); }
.${NS}-toggle img { display: block; transition: filter .15s ease, opacity .15s ease; }
.${NS}-toggle[aria-pressed="false"] img { filter: grayscale(1); opacity: .45; }
.${NS}-reply {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  line-height: 0;
  opacity: .5;
  transition: opacity .15s ease;
}
.${NS}-reply:hover { opacity: 1; }
.${NS}-reply img { display: block; }
.${NS}-reply-quip {
  font-size: 11px;
  line-height: 1.2;
  opacity: .75;
  white-space: nowrap;
  animation: ${NS}-fade-in .2s ease-out both;
}
.${NS}-signature {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1;
  opacity: .55;
  user-select: none;
  pointer-events: none;
}
/* ── floating panel: clock + weather ──────────────────────────────────── */
.${NS}-panel {
  position: fixed;
  /* left / top / transform are set from the component: they carry the dragged
     position and the persisted scale. */
  transform-origin: center center;
  width: min(${GEOMETRY.panelMaxWidth}px, 92vw);
  box-sizing: border-box;
  padding: 20px 22px;
  display: grid;
  grid-template-columns: minmax(140px, auto) 1fr;
  align-items: center;
  gap: 18px 22px;
  border-radius: 18px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(120,150,190,.35));
  background: var(--dsw-alias-bg-overlay, rgba(16,30,49,.94));
  box-shadow: 0 18px 48px rgba(4, 14, 30, .38);
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  color: var(--dsw-alias-label-primary, #eef6ff);
  /* The overlay layer is click-through; occupants opt back in. Marked important
     because a shell rule scoping that layer may match with equal specificity,
     and the component also sets this inline as a second line of defence. */
  pointer-events: auto !important;
  animation: ${NS}-fade-in .4s ease-out both;
}
/* Controls keep their own cursor and text selection; the rest of the card is a
   drag surface, so the grab cursor is the affordance. */
.${NS}-panel button,
.${NS}-panel input { cursor: pointer; }
.${NS}-panel .${NS}-place-input { cursor: text; user-select: text; }
.${NS}-panel .${NS}-resize { cursor: nwse-resize; }
.${NS}-grip,
.${NS}-resize {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary, #c6daf0);
  opacity: .5;
  user-select: none;
  touch-action: none;
  transition: opacity .15s ease;
}
.${NS}-grip:hover,
.${NS}-resize:hover { opacity: 1; }
.${NS}-grip {
  top: 4px;
  right: 34px;
  width: 22px;
  height: 20px;
  font-size: 13px;
  line-height: 1;
  cursor: grab;
  border-radius: 6px;
}
.${NS}-grip:active { cursor: grabbing; }
.${NS}-grip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d9dff); opacity: 1; }
.${NS}-resize {
  right: 4px;
  bottom: 4px;
  width: 20px;
  height: 20px;
  font-size: 12px;
  line-height: 1;
  cursor: nwse-resize;
}
/* ── hardware status float ────────────────────────────────────────────── */
/* Vertical fold: the header (title + live chips + toggle) never moves, the
   detail rows collapse under it. max-height rather than display:none so the
   collapse is animated; the rows hold no focusable nodes, so nothing can be
   tabbed into while hidden. */
.${NS}-hw {
  position: fixed;
  transform-origin: center center;
  width: min(340px, 90vw);
  box-sizing: border-box;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(120,150,190,.35));
  background: var(--dsw-alias-bg-overlay, rgba(16,30,49,.94));
  box-shadow: 0 14px 36px rgba(4, 14, 30, .38);
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
  color: var(--dsw-alias-label-primary, #eef6ff);
  font-size: 12.5px;
  line-height: 1.5;
  overflow: hidden;
  pointer-events: auto !important;
  animation: ${NS}-fade-in .3s ease-out both;
}
.${NS}-hw-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 9px;
  cursor: grab;
  touch-action: none;
}
.${NS}-hw-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary, #4a6a8f);
}
.${NS}-hw-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary, #3ddc97); }
.${NS}-hw-dot[data-state="error"] { background: var(--dsw-alias-state-error-primary, #ff6b81); }
.${NS}-hw-title { flex: none; font-weight: 600; letter-spacing: .02em; }
.${NS}-hw-summary { flex: 1 1 auto; display: flex; flex-wrap: wrap; gap: 1px 8px; min-width: 0; }
.${NS}-hw-chip { display: inline-flex; align-items: baseline; gap: 3px; white-space: nowrap; }
.${NS}-hw-chip i { font-style: normal; font-size: 11px; color: var(--dsw-alias-label-secondary, #c6daf0); }
.${NS}-hw-chip b { font-weight: 600; font-variant-numeric: tabular-nums; }
.${NS}-hw-fold {
  flex: none;
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #c6daf0);
}
.${NS}-hw-fold:hover { color: var(--dsw-alias-label-primary, #eef6ff); }
.${NS}-hw-body {
  display: grid;
  gap: 3px;
  padding: 0 9px 8px;
  max-height: min(60vh, 560px);
  overflow: hidden;
  transition: max-height .22s ease, opacity .18s ease, padding .22s ease;
}
.${NS}-hw[data-folded="1"] .${NS}-hw-body {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.${NS}-hw-row {
  display: grid;
  grid-template-columns: 86px 1fr 50px;
  align-items: center;
  gap: 6px;
}
.${NS}-hw-label {
  color: var(--dsw-alias-label-secondary, #c6daf0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${NS}-hw-value {
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${NS}-hw-bar {
  display: block;
  height: 4px;
  border-radius: 3px;
  background: rgba(140, 170, 205, .22);
  overflow: hidden;
}
.${NS}-hw-bar > i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--dsw-alias-state-success-primary, #3ddc97);
  transition: width .3s ease;
}
.${NS}-hw-bar[data-tone="warm"] > i { background: var(--dsw-alias-state-warn-primary, #ffc46b); }
.${NS}-hw-bar[data-tone="hot"] > i { background: var(--dsw-alias-state-error-primary, #ff6b81); }
/* Fans, side by side: blades above their own label and reading. */
.${NS}-hw-fans {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 5px;
}
.${NS}-hw-fan {
  display: grid;
  justify-items: center;
  gap: 1px;
  padding: 6px 2px 5px;
  border-radius: 9px;
  background: rgba(140, 170, 205, .10);
}
.${NS}-hw-fan-art {
  line-height: 0;
  color: var(--dsw-alias-brand-primary, #4d9dff);
}
.${NS}-hw-fan-spin {
  width: 27px;
  height: 27px;
  display: block;
  /* Duration is set per fan from its RPM; this is only the fallback. */
  animation: ${NS}-hw-fan-rotate 300ms linear infinite;
  transform-origin: 50% 50%;
}
.${NS}-hw-fan-name {
  font-size: 10.5px;
  color: var(--dsw-alias-label-secondary, #c6daf0);
}
.${NS}-hw-fan-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
@keyframes ${NS}-hw-fan-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.${NS}-hw-grip,
.${NS}-hw-resize {
  position: absolute;
  font-size: 11px;
  line-height: 1;
  color: var(--dsw-alias-label-secondary, #c6daf0);
  opacity: .45;
  user-select: none;
  touch-action: none;
}
.${NS}-hw-grip:hover,
.${NS}-hw-resize:hover { opacity: 1; }
.${NS}-hw-grip:focus-visible,
.${NS}-hw-resize:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4d9dff); opacity: 1; }
/* Drag affordance bottom-left, resize bottom-right: the two gestures never
   share a corner, so neither can be grabbed by accident. */
.${NS}-hw-grip {
  left: 5px;
  bottom: 2px;
  cursor: grab;
}
.${NS}-hw-grip:active { cursor: grabbing; }
.${NS}-hw-resize {
  right: 4px;
  bottom: 3px;
  font-size: 12px;
  cursor: nwse-resize;
}
.${NS}-clock { min-width: 0; }
.${NS}-clock-time {
  font-size: 38px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: .02em;
  font-variant-numeric: tabular-nums;
}
.${NS}-clock-date {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #c6daf0);
}
.${NS}-weather { display: grid; gap: 8px; min-width: 0; align-content: center; }
.${NS}-weather.is-picking { gap: 6px; }
.${NS}-weather-title { font-size: 12px; color: var(--dsw-alias-label-secondary, #c6daf0); }
.${NS}-weather-head { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.${NS}-weather-icon { font-size: 16px; line-height: 1; }
.${NS}-weather-place {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${NS}-weather-edit {
  flex: 0 0 auto;
  width: 22px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #c6daf0);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  opacity: .5;
  transition: opacity .15s ease, background-color .15s ease;
}
.${NS}-weather-edit:hover { opacity: 1; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.16)); }
.${NS}-weather-body { display: grid; gap: 6px; }
.${NS}-weather-now { display: flex; align-items: baseline; gap: 8px; }
.${NS}-weather-temp {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.${NS}-weather-desc { font-size: 13px; color: var(--dsw-alias-label-secondary, #c6daf0); }
.${NS}-weather-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #c6daf0);
}
.${NS}-place { display: flex; align-items: center; gap: 6px; }
.${NS}-place-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(120,150,190,.35));
  background: transparent;
  color: inherit;
  font-size: 12px;
}
.${NS}-place-input::placeholder { color: var(--dsw-alias-label-secondary, #c6daf0); }
.${NS}-place-go,
.${NS}-place-cancel {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(120,150,190,.35));
  background: transparent;
  color: inherit;
  font-size: 12px;
}
.${NS}-place-go {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary, #4d9dff);
  color: #fff;
}
.${NS}-weather-hint { font-size: 11px; opacity: .55; }
@media (max-width: 620px) {
  .${NS}-panel { grid-template-columns: 1fr; }
  .${NS}-clock-time { font-size: 30px; }
}
@media (prefers-reduced-motion: reduce) {
  .${NS}-float { animation: none; }
  .${NS}-panel { animation: none; }
  .${NS}-hw { animation: none; }
  /* The fold itself is a state change, not decoration: keep it instant instead
     of animating the height. */
  .${NS}-hw-body { transition: none; }
  .${NS}-hw-bar > i { transition: none; }
  /* Spinning blades are exactly the kind of motion this setting exists to stop;
     the RPM number beside each one still carries the reading. */
  .${NS}-hw-fan-spin { animation: none; }
}
`
      document.head.appendChild(style)
    }

    // The backdrop rule lives in its own element so it can be swapped with the
    // resolved asset URL and removed cleanly when the decoration is switched off.
    function installBackdrop(url) {
      if (typeof document === 'undefined') return null
      let style = document.getElementById(BACKDROP_STYLE_ID)
      if (!style) {
        style = document.createElement('style')
        style.id = BACKDROP_STYLE_ID
        document.head.appendChild(style)
      }
      const scrim = `var(--dsh-whale-scrim, ${BACKDROP_SCRIM_FALLBACK})`
      // `:root, :root body` rather than `html, body`: a plain `body` selector is
      // specificity (0,0,1) and would lose to a shell rule written as
      // `html body` (0,0,2), silently leaving the backdrop unpainted.
      //
      // Horizontal position is 75%, not center: the character sits at roughly
      // 55-95% of this photo's width. On a narrow window `cover` scales by height
      // and crops horizontally, so a centred slice showed nothing but water and
      // the character vanished entirely. 75% keeps her in frame at any width, and
      // it is a no-op on wide windows, which crop vertically instead.
      style.textContent = `
:root, :root body {
  background-color: transparent;
  background-image: linear-gradient(${scrim}, ${scrim}), url("${url}");
  background-size: cover, cover;
  background-position: 75% center, 75% center;
  background-repeat: no-repeat, no-repeat;
  background-attachment: fixed, fixed;
}
`
      return style
    }

    // ── character pieces ───────────────────────────────────────────────────

    // sidebar.brand.mark — ownerProps: { size }. A single slot, so the shell's
    // fish fallback is shadowed only while this is registered; turning the
    // decoration off disposes the registration and the fish comes back.
    function BrandAvatar(props) {
      const edge = Number(props?.size) > 0 ? Number(props.size) : 28
      return h('img', {
        src: assetUrl('avatar.webp'),
        width: edge,
        height: edge,
        alt: '',
        'aria-hidden': true,
        draggable: false,
        style: { display: 'block', objectFit: 'contain' },
      })
    }

    // ── floating panel geometry ────────────────────────────────────────────
    // The panel is a free-floating widget: always on screen, dragged by its grip
    // and scaled from its corner. Geometry persists per browser, and a stored
    // position is clamped into the viewport on load — a window that shrank since
    // the last visit must not strand the panel off-screen.
    const PANEL_STORAGE_KEY = NS + ':panel'
    const PANEL_SCALE_MIN = 0.6
    const PANEL_SCALE_MAX = 2
    const PANEL_KEY_STEP = 8
    const PANEL_KEY_STEP_FAST = 24

    const clampScale = (value) => {
      if (!Number.isFinite(value)) return 1
      return Math.min(PANEL_SCALE_MAX, Math.max(PANEL_SCALE_MIN, value))
    }

    const clampToViewport = (x, y) => {
      try {
        const width = window.innerWidth
        const height = window.innerHeight
        if (!width || !height) return { x, y }
        return {
          x: Math.max(40, Math.min(width - 40, x)),
          y: Math.max(40, Math.min(height - 40, y)),
        }
      } catch {
        return { x, y }
      }
    }

    const readPanelLayout = () => {
      try {
        const raw = window.localStorage.getItem(PANEL_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const x = Number(parsed?.x)
        const y = Number(parsed?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        const safe = clampToViewport(x, y)
        return { x: safe.x, y: safe.y, scale: clampScale(Number(parsed?.scale)) }
      } catch {
        return null
      }
    }

    const writePanelLayout = (layout) => {
      try {
        window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(layout))
      } catch {
        /* storage unavailable: the panel still floats for this page */
      }
    }


    // ── Hardware float: storage, polling, formatting ────────────────────────
    // Same drag/persist idea as the clock panel, but the second gesture is a
    // vertical fold rather than a scale: the header row stays put and the detail
    // rows collapse away beneath it, which is the "上下伸缩" behaviour asked for.
    //
    // Every reading arrives from this plugin's own host route. A source the
    // machine cannot provide is `null` there, and is rendered as 未接入 here —
    // never as a zero, which would read as a real measurement.
    const HW_STORAGE_KEY = NS + ':hw'
    const HWSTATS_URL = '/plugins/dsh-whale-decor/hwstats'
    /** Detail rows visible: poll often enough to feel live. */
    const HW_OPEN_MS = 2000
    /** Folded: the numbers still move, but nothing needs 2s granularity. */
    const HW_FOLDED_MS = 5000
    /**
     * Scale bounds for the readout, wider than the clock card's 0.6–2: a
     * telemetry strip is meant to be glanceable from across a desk, and the
     * request was explicitly "let me adjust the size freely".
     */
    const HW_SCALE_MIN = 0.5
    const HW_SCALE_MAX = 3
    const clampHwScale = (value) => {
      if (!Number.isFinite(value)) return 1
      return Math.min(HW_SCALE_MAX, Math.max(HW_SCALE_MIN, value))
    }
    /** Keyboard steps for the resize handle: `[` / `]`, Shift for a bigger jump. */
    const HW_KEY_SCALE_STEP = 0.05
    const HW_KEY_SCALE_STEP_FAST = 0.2

    const readHwLayout = () => {
      try {
        const raw = window.localStorage.getItem(HW_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const folded = parsed?.folded === true
        const scale = clampHwScale(Number(parsed?.scale))
        const x = Number(parsed?.x)
        const y = Number(parsed?.y)
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: null, y: null, folded, scale }
        const safe = clampToViewport(x, y)
        return { x: safe.x, y: safe.y, folded, scale }
      } catch {
        return null
      }
    }

    const writeHwLayout = (layout) => {
      try {
        window.localStorage.setItem(HW_STORAGE_KEY, JSON.stringify(layout))
      } catch {
        /* storage unavailable: the float still works for this page */
      }
    }

    /**
     * Poll the host route on an interval.
     *
     * A hidden tab skips the request entirely: the hardware readings are only
     * for eyes, so polling a background tab would spawn helper processes for
     * nobody. Uses setInterval rather than a self-rescheduling timeout so the
     * timer is torn down by the same cleanup as the clock's.
     * @param {number} intervalMs - delay between polls.
     * @returns {{stats: object|null, error: string|null}} latest payload and error.
     */
    const useHardwareStats = (intervalMs) => {
      const [stats, setStats] = useState(null)
      const [error, setError] = useState(null)
      useEffect(() => {
        let alive = true
        const tick = async () => {
          if (typeof document !== 'undefined' && document.hidden) return
          try {
            const res = await fetch(HWSTATS_URL, { credentials: 'same-origin' })
            if (!res.ok) throw new Error('HTTP ' + res.status)
            const body = await res.json()
            if (!alive) return
            setStats(body)
            setError(null)
          } catch (err) {
            if (alive) setError(String((err && err.message) || err))
          }
        }
        tick()
        const timer = setInterval(tick, intervalMs)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [intervalMs])
      return { stats, error }
    }

    const hwPercent = (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return null
      return Math.max(0, Math.min(100, n))
    }
    const hwText = (value) => {
      const n = hwPercent(value)
      return n === null ? '—' : Math.round(n) + '%'
    }
    const hwGiB = (bytes) => {
      const n = Number(bytes)
      return Number.isFinite(n) && n >= 0 ? (n / 1073741824).toFixed(1) : '—'
    }
    const hwUptime = (seconds) => {
      const n = Number(seconds)
      if (!Number.isFinite(n) || n < 0) return '—'
      const hours = Math.floor(n / 3600)
      const minutes = Math.floor((n % 3600) / 60)
      return hours > 0 ? hours + ' 小时 ' + minutes + ' 分' : minutes + ' 分'
    }
    /** Used share of a capacity pair, or null when the numbers are unusable. */
    const hwUsedShare = (used, total) => {
      const u = Number(used)
      const t = Number(total)
      if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null
      return (u / t) * 100
    }
    /** Bars read as a warning above 85%, which is when a machine feels slow. */
    const hwTone = (percent) => {
      if (percent === null) return 'idle'
      if (percent >= 85) return 'hot'
      if (percent >= 60) return 'warm'
      return 'ok'
    }

    /**
     * The display's refresh rate, measured once with rAF.
     *
     * It sets the honest speed ceiling for the fans. A five-blade glyph repeats
     * every 72°, so past ~36° per displayed frame the eye stops seeing rotation
     * and sees the wagon-wheel effect instead — the fan crawls or runs backwards,
     * and turning the animation up makes it read *slower*. The faster the panel,
     * the faster the blades may honestly turn: this 165 Hz screen allows about
     * 61 ms a turn, nearly three times the 170 ms a 60 Hz assumption would permit.
     * Assuming 60 Hz everywhere is exactly what made the first attempt feel slow
     * on hardware that could do much better.
     */
    const FAN_BLADE_SYMMETRY_DEG = 72
    const FAN_FASTEST_FLOOR_MS = 40
    const FAN_FASTEST_CEILING_MS = 200
    const FAN_SPIN_IDLE_MS = 1100
    let measuredHz = 0

    const measureDisplayHz = () => {
      if (measuredHz > 0) return Promise.resolve(measuredHz)
      if (typeof requestAnimationFrame !== 'function') {
        measuredHz = 60
        return Promise.resolve(measuredHz)
      }
      return new Promise((resolve) => {
        const stamps = []
        const tick = (stamp) => {
          stamps.push(stamp)
          if (stamps.length < 12) {
            requestAnimationFrame(tick)
            return
          }
          const span = stamps[stamps.length - 1] - stamps[0]
          const average = span > 0 ? span / (stamps.length - 1) : 0
          // Clamped hard: a throttled or background frame must not become an
          // absurd ceiling.
          measuredHz = average > 0
            ? Math.min(360, Math.max(30, Math.round(1000 / average)))
            : 60
          resolve(measuredHz)
        }
        requestAnimationFrame(tick)
      })
    }

    /** Fastest spin this display can show without aliasing, in ms per turn. */
    const hwFanFastestMs = (hz) => {
      const rate = Number.isFinite(hz) && hz > 0 ? hz : 60
      // 36° per frame is the limit; at `rate` frames a second a full 360° turn
      // therefore takes 360 / (36 * rate) seconds — 61 ms at 165 Hz, 167 ms at 60.
      const ceiling = (360 / ((FAN_BLADE_SYMMETRY_DEG / 2) * rate)) * 1000
      return Math.min(FAN_FASTEST_CEILING_MS, Math.max(FAN_FASTEST_FLOOR_MS, Math.round(ceiling)))
    }

    /**
     * One fan glyph, spinning as fast as the display can honestly show.
     *
     * Rotation stops at the aliasing ceiling above; past it, speed is carried by
     * motion blur and a faint smear disc instead — which is also simply what a
     * real fan at 6000 RPM looks like: not distinct blades but a smeared disc.
     *
     * The spin style lives on this element, not on its wrapper: it spent one
     * version on the parent span, where `animationDuration` did nothing at all
     * and every fan silently fell back to the stylesheet default.
     */
    const FAN_BLADE_OPACITY = [0.62, 0.5, 0.58, 0.52, 0.56]

    const hwFanArt = (rpm, hz) => {
      const value = Number(rpm)
      const live = Number.isFinite(value) && value > 0
      const load = live ? Math.max(0, Math.min(1, value / 6000)) : 0
      const fastest = hwFanFastestMs(hz)
      const style = live
        ? {
            animationDuration:
              Math.round(FAN_SPIN_IDLE_MS - load * (FAN_SPIN_IDLE_MS - fastest)) + 'ms',
            filter: 'blur(' + (load * 1.5).toFixed(2) + 'px)',
          }
        // A stopped fan keeps its shape: that is a fact, not a rounding artefact.
        : { animationPlayState: 'paused' }
      return h(
        'svg',
        { viewBox: '0 0 24 24', className: `${NS}-hw-fan-spin`, style, 'aria-hidden': true },
        // The smear a real fan leaves: it fades in with load and is what makes a
        // fast fan read as fast once rotation has run out of road.
        h('circle', {
          key: 'smear',
          cx: 12,
          cy: 12,
          r: 9.6,
          fill: 'currentColor',
          opacity: load * 0.16,
        }),
        h('circle', { cx: 12, cy: 12, r: 2.2, fill: 'currentColor', key: 'hub' }),
        FAN_BLADE_OPACITY.map((opacity, blade) => h('ellipse', {
          key: 'blade-' + blade,
          cx: 12,
          cy: 6.6,
          rx: 2.6,
          ry: 4.6,
          fill: 'currentColor',
          opacity,
          transform: 'rotate(' + (blade * 72) + ' 12 12)',
        })),
      )
    }

    const useNow = (intervalMs) => {
      const [now, setNow] = useState(() => new Date())
      useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), intervalMs)
        return () => clearInterval(timer)
      }, [intervalMs])
      return now
    }

    const formatClock = (value) => {
      try {
        return value.toLocaleTimeString('zh-CN', { hour12: false })
      } catch {
        return value.toTimeString().slice(0, 8)
      }
    }

    const formatDate = (value) => {
      try {
        return value.toLocaleDateString('zh-CN', {
          year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
        })
      } catch {
        return value.toDateString()
      }
    }

    const formatSeconds = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
      const whole = Math.floor(seconds)
      return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
    }

    function HeroClock() {
      const now = useNow(1000)
      return h(
        'div',
        { className: `${NS}-clock` },
        h('div', { className: `${NS}-clock-time` }, formatClock(now)),
        h('div', { className: `${NS}-clock-date` }, formatDate(now)),
      )
    }

    // The weather half. Open-Meteo geocodes a city name and then serves a
    // forecast by lat/lon; the resolved coordinates are stored, so a later page
    // load skips the geocode. There is no sane default city — the place belongs
    // to the user and lives in this browser — so the section asks once.
    function WeatherSection() {
      const [place, setPlace] = useState(() => readPlace())
      const [report, setReport] = useState(null)
      const [status, setStatus] = useState('unset')
      const [draft, setDraft] = useState('')
      const [editing, setEditing] = useState(false)

      useEffect(() => {
        if (!place) {
          setStatus('unset')
          setReport(null)
          return undefined
        }
        let alive = true
        setStatus('loading')
        const load = () => {
          resolveCoordinates(place)
            .then((coords) => {
              if (!alive) return null
              if (!coords) {
                setStatus('not-found')
                return null
              }
              // Store the resolved coordinates. That also re-runs this effect
              // once with a place that no longer needs geocoding.
              if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
                const resolved = {
                  name: coords.name,
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                }
                writePlace(resolved)
                setPlace(resolved)
                return null
              }
              return fetchForecast(coords).then((next) => {
                if (!alive) return
                setReport(next)
                setStatus('ready')
              })
            })
            .catch(() => {
              if (alive) setStatus('error')
            })
        }
        load()
        const timer = setInterval(load, WEATHER_REFRESH_MS)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [place])

      const submitPlace = (event) => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault()
        const name = draft.trim()
        if (!name) return
        const next = { name }
        writePlace(next)
        setPlace(next)
        setDraft('')
        setEditing(false)
        setStatus('loading')
      }

      if (!place || editing) {
        return h(
          'form',
          { className: `${NS}-weather is-picking`, onSubmit: submitPlace },
          h('div', { className: `${NS}-weather-title` }, '设置城市'),
          h(
            'div',
            { className: `${NS}-place` },
            h('input', {
              className: `${NS}-place-input`,
              type: 'search',
              value: draft,
              placeholder: '城市名，如 上海',
              'aria-label': '城市',
              onChange: (event) => setDraft(event.target.value),
            }),
            h('button', { type: 'submit', className: `${NS}-place-go` }, '确定'),
            place
              ? h('button', {
                type: 'button',
                className: `${NS}-place-cancel`,
                onClick: () => setEditing(false),
              }, '取消')
              : null,
          ),
          h('div', { className: `${NS}-weather-hint` }, '数据来自 Open-Meteo，无需账号'),
        )
      }

      const found = report ? weatherOf(report.code) : null

      return h(
        'div',
        { className: `${NS}-weather` },
        h(
          'div',
          { className: `${NS}-weather-head` },
          h('span', { className: `${NS}-weather-icon`, 'aria-hidden': true }, found ? found[1] : '🌡️'),
          h('span', { className: `${NS}-weather-place` }, place.name),
          h('button', {
            type: 'button',
            className: `${NS}-weather-edit`,
            title: '换城市',
            'aria-label': '换城市',
            onClick: () => {
              setDraft(place.name)
              setEditing(true)
            },
          }, '✎'),
        ),
        status === 'ready' && report
          ? h(
            'div',
            { className: `${NS}-weather-body` },
            h(
              'div',
              { className: `${NS}-weather-now` },
              h('span', { className: `${NS}-weather-temp` }, `${Math.round(report.temperature)}°`),
              h('span', { className: `${NS}-weather-desc` }, found[0]),
            ),
            h(
              'div',
              { className: `${NS}-weather-meta` },
              h('span', null, `最高 ${Math.round(report.high)}° / 最低 ${Math.round(report.low)}°`),
              Number.isFinite(report.humidity)
                ? h('span', null, `湿度 ${Math.round(report.humidity)}%`)
                : null,
              Number.isFinite(report.wind) ? h('span', null, `风 ${report.wind} m/s`) : null,
            ),
          )
          : h('div', { className: `${NS}-weather-body` },
            h('div', { className: `${NS}-weather-desc` },
              status === 'not-found'
                ? '没找到这个城市，换个说法试试'
                : status === 'error'
                  ? '天气获取失败，会自己重试'
                  : '正在获取天气…')),
      )
    }

    // Geocoding happens once per place: the resolved coordinates are kept.
    const resolveCoordinates = (place) => {
      if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
        return Promise.resolve({
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
        })
      }
      const url = `${WEATHER_GEOCODE_URL}?name=${encodeURIComponent(place.name)}&count=1&language=zh&format=json`
      return fetch(url, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((data) => {
          const hit = Array.isArray(data?.results) ? data.results[0] : undefined
          if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null
          return { name: hit.name || place.name, latitude: hit.latitude, longitude: hit.longitude }
        })
    }

    const fetchForecast = (coords) => {
      const url = `${WEATHER_FORECAST_URL}?latitude=${coords.latitude}&longitude=${coords.longitude}`
        + '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m'
        + '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1'
      return fetch(url, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
        .then((data) => ({
          temperature: Number(data?.current?.temperature_2m),
          code: Number(data?.current?.weather_code),
          humidity: Number(data?.current?.relative_humidity_2m),
          wind: Number(data?.current?.wind_speed_10m),
          high: Number(data?.daily?.temperature_2m_max?.[0]),
          low: Number(data?.daily?.temperature_2m_min?.[0]),
        }))
    }

    // shell.overlay — the free-floating widget. Drag by the grip (⠿), scale from
    // the corner (◢), both persisted. Registered here rather than in the hero's
    // brand-mark seat because that seat is a square slot driven by ownerProps
    // `{ size }`: a widget this size would be at the mercy of the shell's layout.
    function DecorPanel() {
      const [layout, setLayout] = useState(
        () => readPanelLayout() ?? { x: null, y: null, scale: 1 },
      )
      const [gesture, setGesture] = useState(null)
      const rootRef = useRef(null)

      // Persist only when no gesture is running: a drag would otherwise write to
      // localStorage on every pointermove.
      useEffect(() => {
        if (gesture) return
        writePanelLayout(layout)
      }, [layout, gesture])

      // One listener pair drives both gestures. Pointer capture on the handle
      // alone would miss a pointer that leaves the handle mid-drag.
      useEffect(() => {
        if (!gesture) return undefined
        const onMove = (event) => {
          if (gesture.kind === 'move') {
            const next = clampToViewport(
              gesture.originX + (event.clientX - gesture.startX),
              gesture.originY + (event.clientY - gesture.startY),
            )
            setLayout((current) => ({ ...current, x: next.x, y: next.y }))
            return
          }
          const node = rootRef.current
          if (!node || !gesture.startDistance) return
          const rect = node.getBoundingClientRect()
          const distance = Math.hypot(
            event.clientX - (rect.left + rect.width / 2),
            event.clientY - (rect.top + rect.height / 2),
          )
          const scale = clampScale(gesture.startScale * (distance / gesture.startDistance))
          setLayout((current) => ({ ...current, scale }))
        }
        const onUp = () => setGesture(null)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
      }, [gesture])

      const currentCentre = () => {
        if (Number.isFinite(layout.x) && Number.isFinite(layout.y)) {
          return { x: layout.x, y: layout.y }
        }
        try {
          const rect = rootRef.current.getBoundingClientRect()
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        } catch {
          return { x: 0, y: 0 }
        }
      }

      const beginMove = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        // The panel itself is the drag surface, so a real control keeps its own
        // gesture — otherwise grabbing the search box or the play button would
        // move the window instead.
        if (startsOnControl(event.target)) return
        const origin = currentCentre()
        // Pin the widget where it currently sits on the first drag, so it never
        // jumps from its CSS-centred default to the pointer.
        setLayout((current) => ({ ...current, x: origin.x, y: origin.y }))
        setGesture({
          kind: 'move',
          startX: event.clientX,
          startY: event.clientY,
          originX: origin.x,
          originY: origin.y,
        })
        event.preventDefault()
        event.stopPropagation()
      }

      const beginScale = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        const origin = currentCentre()
        const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
        if (!distance) return
        setGesture({ kind: 'scale', startDistance: distance, startScale: layout.scale })
        event.preventDefault()
        event.stopPropagation()
      }

      const onGripKey = (event) => {
        const step = event.shiftKey ? PANEL_KEY_STEP_FAST : PANEL_KEY_STEP
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        if (!dx && !dy) return
        event.preventDefault()
        const origin = currentCentre()
        const next = clampToViewport(origin.x + dx, origin.y + dy)
        setLayout((current) => ({ ...current, x: next.x, y: next.y }))
      }

      const style = {
        left: Number.isFinite(layout.x) ? layout.x : '50%',
        top: Number.isFinite(layout.y) ? layout.y : '46%',
        transform: `translate(-50%, -50%) scale(${layout.scale})`,
        pointerEvents: PANEL_POINTER_EVENTS,
        cursor: gesture ? 'grabbing' : 'grab',
        userSelect: 'none',
      }

      return h(
        'div',
        {
          className: `${NS}-panel`,
          ref: rootRef,
          style,
          role: 'complementary',
          'aria-label': '时间与天气',
          onPointerDown: beginMove,
        },
        h(HeroClock, {}),
        h(WeatherSection, {}),
        h('div', {
          className: `${NS}-grip`,
          role: 'button',
          tabIndex: 0,
          title: '拖动移动（整张卡片都能拖；方向键微调，Shift 加速）',
          'aria-label': '移动面板',
          onPointerDown: beginMove,
          onKeyDown: onGripKey,
        }, '⠿'),
        h('div', {
          className: `${NS}-resize`,
          title: '拖动缩放',
          'aria-label': '缩放面板',
          'data-dsh-decor-nodrag': '',
          onPointerDown: beginScale,
        }, '◢'),
      )
    }

    // shell.overlay — hardware status, folding vertically.
    //
    // Deliberately narrow: this is a readout, not a dashboard. The header keeps
    // the numbers that matter even when folded, so collapsing hides detail
    // instead of hiding the reading.
    function HwMonitorPanel() {
      const [layout, setLayout] = useState(
        () => readHwLayout() ?? { x: null, y: null, folded: false, scale: 1 },
      )
      const [gesture, setGesture] = useState(null)
      // Held in state, not a module variable, so the fans pick up the measured
      // rate on the very next render rather than waiting for the following poll.
      const [displayHz, setDisplayHz] = useState(60)
      const rootRef = useRef(null)
      const folded = layout.folded === true
      const scale = Number.isFinite(layout.scale) ? layout.scale : 1
      const { stats, error } = useHardwareStats(folded ? HW_FOLDED_MS : HW_OPEN_MS)

      useEffect(() => {
        let alive = true
        measureDisplayHz().then((hz) => {
          if (alive) setDisplayHz(hz)
        })
        return () => {
          alive = false
        }
      }, [])

      useEffect(() => {
        if (gesture) return
        writeHwLayout(layout)
      }, [layout, gesture])

      // One listener pair drives both gestures, same as the clock card.
      useEffect(() => {
        if (!gesture) return undefined
        const onMove = (event) => {
          if (gesture.kind === 'scale') {
            const node = rootRef.current
            if (!node || !gesture.startDistance) return
            const rect = node.getBoundingClientRect()
            const distance = Math.hypot(
              event.clientX - (rect.left + rect.width / 2),
              event.clientY - (rect.top + rect.height / 2),
            )
            setLayout((current) => ({
              ...current,
              scale: clampHwScale(gesture.startScale * (distance / gesture.startDistance)),
            }))
            return
          }
          const next = clampToViewport(
            gesture.originX + (event.clientX - gesture.startX),
            gesture.originY + (event.clientY - gesture.startY),
          )
          setLayout((current) => ({ ...current, x: next.x, y: next.y }))
        }
        const onUp = () => setGesture(null)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onUp)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
        }
      }, [gesture])

      const centre = () => {
        if (Number.isFinite(layout.x) && Number.isFinite(layout.y)) {
          return { x: layout.x, y: layout.y }
        }
        try {
          const rect = rootRef.current.getBoundingClientRect()
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        } catch {
          return { x: 0, y: 0 }
        }
      }

      // Same rule as the clock panel: the whole card drags, real controls keep
      // their own gesture (the fold toggle lives in the header).
      const beginMove = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        if (startsOnControl(event.target)) return
        const origin = centre()
        setLayout((current) => ({ ...current, x: origin.x, y: origin.y }))
        setGesture({
          kind: 'move',
          startX: event.clientX,
          startY: event.clientY,
          originX: origin.x,
          originY: origin.y,
        })
        event.preventDefault()
        event.stopPropagation()
      }

      // Distance from the card's centre drives the scale, exactly like the clock
      // card's corner handle.
      const beginScale = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) return
        const origin = centre()
        const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
        if (!distance) return
        setGesture({ kind: 'scale', startDistance: distance, startScale: scale })
        event.preventDefault()
        event.stopPropagation()
      }

      const onGripKey = (event) => {
        const step = event.shiftKey ? PANEL_KEY_STEP_FAST : PANEL_KEY_STEP
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        if (!dx && !dy) return
        event.preventDefault()
        const origin = centre()
        const next = clampToViewport(origin.x + dx, origin.y + dy)
        setLayout((current) => ({ ...current, x: next.x, y: next.y }))
      }

      // Keyboard path for the resize handle, so scaling is not pointer-only.
      const onResizeKey = (event) => {
        const step = event.shiftKey ? HW_KEY_SCALE_STEP_FAST : HW_KEY_SCALE_STEP
        const delta = event.key === ']' || event.key === 'ArrowUp'
          ? step
          : event.key === '[' || event.key === 'ArrowDown' ? -step : 0
        if (!delta) return
        event.preventDefault()
        setLayout((current) => ({
          ...current,
          scale: clampHwScale((Number.isFinite(current.scale) ? current.scale : 1) + delta),
        }))
      }

      const toggleFolded = (event) => {
        event.stopPropagation()
        setLayout((current) => ({ ...current, folded: !current.folded }))
      }

      const cpu = stats?.cpu ?? null
      const memory = stats?.memory ?? null
      const gpu = stats?.gpu ?? null
      const memoryShare = memory ? hwUsedShare(memory.usedBytes, memory.totalBytes) : null

      // Header chips, always visible.
      const chips = [['CPU', cpu ? hwText(cpu.usage) : '—']]
      chips.push(['内存', memoryShare === null ? '—' : Math.round(memoryShare) + '%'])
      chips.push(['GPU', gpu ? hwText(gpu.usage) : '未接入'])
      if (stats?.perfMode) chips.push([stats.perfMode, ''])

      const rows = []
      const addRow = (key, label, value, share, title) => {
        rows.push(
          h(
            'div',
            { className: `${NS}-hw-row`, key, title: title || undefined },
            h('span', { className: `${NS}-hw-label` }, label),
            h('span', { className: `${NS}-hw-value` }, value),
            share === undefined
              ? null
              : h(
                  'span',
                  { className: `${NS}-hw-bar`, 'data-tone': hwTone(share) },
                  h('i', { style: { width: (share === null ? 0 : share) + '%' } }),
                ),
          ),
        )
      }

      addRow(
        'cpu',
        'CPU',
        cpu ? hwText(cpu.usage) + ' · ' + cpu.cores + ' 核' : '—',
        cpu ? hwPercent(cpu.usage) : null,
        cpu?.model,
      )
      addRow(
        'mem',
        '内存',
        memory ? hwGiB(memory.usedBytes) + ' / ' + hwGiB(memory.totalBytes) + ' GB' : '—',
        memoryShare,
      )
      addRow(
        'gpu',
        'GPU',
        gpu
          ? hwText(gpu.usage) + ' · ' + Math.round(gpu.memoryUsedMB) + '/' + Math.round(gpu.memoryTotalMB)
            + ' MB · ' + Math.round(gpu.temperatureC) + '°C'
          : '未接入',
        gpu ? hwPercent(gpu.usage) : null,
        gpu?.name,
      )
      for (const disk of stats?.disks ?? []) {
        addRow(
          'disk-' + disk.mount,
          '硬盘 ' + disk.mount,
          hwGiB(disk.usedBytes) + ' / ' + hwGiB(disk.totalBytes) + ' GB',
          hwUsedShare(disk.usedBytes, disk.totalBytes),
        )
      }
      addRow('perf', '性能模式', stats?.perfMode ?? '未接入')
      // Numbered rather than repeated. "磁盘温度" twice says nothing about which
      // drive is which, and two "SPD Hub 温度" rows say nothing about which DIMM.
      // The model stays on each row's tooltip. Memory is matched here rather than
      // by the host so this stays a client-only change.
      let diskIndex = 0
      let memoryIndex = 0
      for (const temp of stats?.temperatures ?? []) {
        const isDisk = temp.kind === 'disk'
        const isMemory = !isDisk && /spd|内存|記憶體|dimm|memory/i.test(String(temp.name))
        let label = temp.name
        if (isDisk) label = '磁盘' + diskIndex++
        else if (isMemory) label = '内存' + memoryIndex++
        addRow(
          'temp-' + temp.id,
          label,
          Math.round(Number(temp.value)) + ' °C',
          undefined,
          temp.group ? temp.group : temp.name,
        )
      }
      // One hint row rather than a per-metric row: the fix is the same for both.
      if (stats && stats.sources?.sensors !== 'ok') {
        addRow(
          'sensors',
          '风扇 / 温度',
          '未接入 · HWiNFO 开着并开启 Gadget 后自动出现',
        )
      }
      addRow('uptime', '运行时长', hwUptime(stats?.uptimeSec))

      // Fans are their own block above the rows: blades side by side, each over
      // its own label, spinning at a rate taken from its tachometer. They replace
      // the plain RPM rows rather than doubling them.
      const fanList = stats?.fans ?? []
      const fanTiles = fanList.length === 0 ? null : h(
        'div',
        { className: `${NS}-hw-fans` },
        fanList.map((fan) => h(
          'div',
          { className: `${NS}-hw-fan`, key: 'fan-' + fan.id, title: fan.id },
          // hwFanArt owns its own timing: passing the style to this wrapper is
          // what silently disabled per-fan speed for a whole version.
          h('span', { className: `${NS}-hw-fan-art` }, hwFanArt(fan.value, displayHz)),
          h('span', { className: `${NS}-hw-fan-name` }, fan.name),
          h(
            'span',
            { className: `${NS}-hw-fan-value` },
            Math.round(Number(fan.value)) + ' RPM',
          ),
        )),
      )

      const style = {
        left: Number.isFinite(layout.x) ? layout.x : '18%',
        top: Number.isFinite(layout.y) ? layout.y : '30%',
        transform: 'translate(-50%, -50%) scale(' + scale + ')',
        pointerEvents: PANEL_POINTER_EVENTS,
        cursor: gesture && gesture.kind === 'move' ? 'grabbing' : undefined,
        userSelect: 'none',
      }

      return h(
        'div',
        {
          className: `${NS}-hw`,
          ref: rootRef,
          style,
          role: 'complementary',
          'aria-label': '硬件状态',
          'data-folded': folded ? '1' : '0',
          onPointerDown: beginMove,
        },
        h(
          'div',
          { className: `${NS}-hw-head` },
          h('span', {
            className: `${NS}-hw-dot`,
            'data-state': error ? 'error' : stats ? 'ok' : 'idle',
            'aria-hidden': true,
          }),
          h('span', { className: `${NS}-hw-title` }, '硬件状态'),
          h(
            'span',
            { className: `${NS}-hw-summary` },
            chips.map(([label, value], index) =>
              h(
                'span',
                { className: `${NS}-hw-chip`, key: label + index },
                h('i', null, label),
                value === '' ? null : h('b', null, value),
              ),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: `${NS}-hw-fold`,
              title: folded ? '展开详情' : '收起详情',
              'aria-expanded': folded ? 'false' : 'true',
              onClick: toggleFolded,
            },
            folded ? '▾' : '▴',
          ),
        ),
        h(
          'div',
          { className: `${NS}-hw-body` },
          error
            ? h(
                'div',
                { className: `${NS}-hw-row`, key: 'error' },
                h('span', { className: `${NS}-hw-label` }, '读取'),
                h(
                  'span',
                  { className: `${NS}-hw-value` },
                  // A 404 means the host half predates this route: the page can
                  // hot-reload but the host cannot, so name the actual fix.
                  error.includes('404')
                    ? '宿主需重启后生效（新路由未加载）'
                    : '失败 · ' + error,
                ),
              )
            : null,
          fanTiles,
          ...rows,
        ),
        h(
          'div',
          {
            className: `${NS}-hw-grip`,
            role: 'button',
            tabIndex: 0,
            title: '拖动移动（整张卡片都能拖；方向键微调，Shift 加速）',
            'aria-label': '移动硬件面板',
            onPointerDown: beginMove,
            onKeyDown: onGripKey,
          },
          '⠿',
        ),
        // Free resizing, mirroring the clock card's corner handle.
        h(
          'div',
          {
            className: `${NS}-hw-resize`,
            title: '拖动缩放（也可用 [ 和 ] 微调）',
            'aria-label': '缩放硬件面板',
            role: 'button',
            tabIndex: 0,
            'data-dsh-decor-nodrag': '',
            onPointerDown: beginScale,
            onKeyDown: onResizeKey,
          },
          '◢',
        ),
      )
    }

    // conversation.hero.brand.mark — ownerProps: { size, className }.
    function HeroArt(props) {
      const base = Number(props?.size) > 0 ? Number(props.size) : 40
      const height = Math.round(
        Math.min(GEOMETRY.heroMax, Math.max(GEOMETRY.heroMin, base * GEOMETRY.heroRatio)),
      )
      return h('img', {
        src: assetUrl('hero.webp'),
        className: props?.className,
        alt: '',
        'aria-hidden': true,
        draggable: false,
        style: { height, width: 'auto', maxWidth: '100%', display: 'block' },
      })
    }

    // shell.overlay — frame-wide floating layer. Purely decorative: no pointer
    // events, no focus, nothing read out by assistive tech.
    function FloatingCompanion() {
      const [clip, setClip] = useState(null)
      const [index, setIndex] = useState(0)

      useEffect(() => {
        let alive = true
        loadManifest().then((manifest) => {
          if (alive) setClip(floatClip(manifest))
        })
        return () => {
          alive = false
        }
      }, [])

      const frames = clip ? clip.frames : null
      useEffect(() => {
        if (!frames || frames.length <= 1 || prefersReducedMotion()) return undefined
        const timer = setInterval(
          () => setIndex((current) => (current + 1) % frames.length),
          clip.frameMs,
        )
        return () => clearInterval(timer)
      }, [frames, clip])

      // Warm the next frame so the loop does not visibly stall on a cold cache.
      useEffect(() => {
        if (!frames || frames.length <= 1 || typeof Image !== 'function') return
        try {
          const next = new Image()
          next.src = assetUrl(frames[(index + 1) % frames.length])
        } catch {
          /* preloading is best-effort */
        }
      }, [frames, index])

      if (!frames || frames.length === 0) return null
      const current = frames[prefersReducedMotion() ? 0 : index % frames.length]
      return h('img', {
        src: assetUrl(current),
        className: `${NS}-float`,
        alt: '',
        'aria-hidden': true,
        draggable: false,
        style: {
          position: 'fixed',
          right: GEOMETRY.floatOffsetRight,
          bottom: GEOMETRY.floatOffsetBottom,
          width: GEOMETRY.floatWidth,
          zIndex: 2147483000,
          pointerEvents: 'none',
          userSelect: 'none',
          filter: 'drop-shadow(0 6px 14px rgba(6, 24, 48, .32))',
        },
      })
    }

    // conversation.composer.dock — a quiet signature under the composer card.
    function ComposerSignature() {
      return h(
        'div',
        { className: `${NS}-signature`, 'aria-hidden': true },
        h('img', {
          src: assetUrl('sticker-happy.webp'),
          width: GEOMETRY.composerSticker,
          height: GEOMETRY.composerSticker,
          alt: '',
          draggable: false,
          style: { display: 'block' },
        }),
        h('span', null, '鲸鱼娘在桌角陪着先生呀 🐋'),
      )
    }

    // conversation.chat.assistant-actions — one small reaction per finished
    // assistant message; click for a one-line quip.
    function ReplySticker() {
      const [quipped, setQuipped] = useState(false)
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
        h(
          'button',
          {
            type: 'button',
            className: `${NS}-reply`,
            title: quipped ? '收好尾巴，继续干活' : '吃到 token 啦',
            'aria-label': '鲸鱼娘反应',
            onClick: () => setQuipped((current) => !current),
          },
          h('img', {
            src: assetUrl('sticker-eat.webp'),
            width: GEOMETRY.replySticker,
            height: GEOMETRY.replySticker,
            alt: '',
            'aria-hidden': true,
            draggable: false,
          }),
        ),
        quipped ? h('span', { className: `${NS}-reply-quip` }, '好吃，谢谢先生！') : null,
      )
    }

    // sidebar.footer.action — the master switch. Deliberately NOT gated by the
    // switch itself, or turning decoration off would remove the only way back.
    // ownerProps: { wide } — false means the 56px rail, where a label does not fit.
    function DecorToggle(props) {
      const enabled = useEnabled()
      const wide = props?.wide !== false
      const label = enabled ? '关闭鲸鱼娘装饰' : '开启鲸鱼娘装饰'
      return h(
        'button',
        {
          type: 'button',
          className: `${NS}-toggle`,
          'aria-pressed': enabled,
          'aria-label': label,
          title: label,
          onClick: () => store.toggle(),
        },
        h('img', {
          src: assetUrl('avatar.webp'),
          width: GEOMETRY.toggleIcon,
          height: GEOMETRY.toggleIcon,
          alt: '',
          'aria-hidden': true,
          draggable: false,
        }),
        wide ? h('span', null, '鲸鱼娘') : null,
      )
    }

    // Slot seat -> registration options -> component.
    //
    // `sidebar.brand.mark` is a single-occupancy seat that the shell already
    // fills with its own fish fallback at priority 0, and the LOWEST priority
    // value wins that contest. Measured against the live slot tree:
    //   priority  10 -> registered, but `active: false`; the fallback stayed.
    //   priority  -1 -> `active: true`; the fallback went inactive.
    // The only symptom of losing is "the avatar never appears" — nothing in the
    // UI reports it. The hero seat ships no occupant, but it follows one rule.
    const DECORATIONS = [
      {
        slot: 'sidebar.brand.mark',
        options: { id: `${NS}-brand`, priority: -1 },
        Component: BrandAvatar,
      },
      {
        slot: 'conversation.hero.brand.mark',
        options: { id: `${NS}-hero`, priority: -1 },
        Component: HeroArt,
      },
      {
        slot: 'shell.overlay',
        options: { id: `${NS}-float`, order: 900 },
        Component: FloatingCompanion,
      },
      {
        slot: 'shell.overlay',
        options: { id: `${NS}-panel`, order: 920 },
        Component: DecorPanel,
      },
      {
        slot: 'shell.overlay',
        options: { id: `${NS}-hw`, order: 940 },
        Component: HwMonitorPanel,
      },
      {
        slot: 'conversation.composer.dock',
        options: { id: `${NS}-signature`, order: 20 },
        Component: ComposerSignature,
      },
      {
        slot: 'conversation.chat.assistant-actions',
        options: { id: `${NS}-reply`, order: 40 },
        Component: ReplySticker,
      },
    ]

    const ALWAYS = [
      {
        slot: 'sidebar.footer.action',
        options: { id: `${NS}-toggle`, order: 50, label: '鲸鱼娘装饰' },
        Component: DecorToggle,
      },
    ]

    function apply(ctx) {
      installStyles()

      // Two lifetimes, deliberately kept apart. The switch owns its seat for as
      // long as the plugin lives; everything it controls is mounted and torn down
      // together with the theme layer. Sharing one registration list would let
      // the first sync() dispose the very button that drives it — the switch would
      // work exactly once, and then be gone with no way back.
      const switchSeat = { registrations: [], waits: [] }
      const decoration = { registrations: [], waits: [] }
      let themeDispose = null

      // The backdrop needs the manifest (asset URL + existence check), so unlike
      // the palette it mounts asynchronously. `backdropToken` invalidates an
      // in-flight mount when the switch flips off before the fetch settles.
      let backdropSurfaces = null
      let backdropScrim = null
      let backdropStyle = null
      let backdropToken = 0

      const contribute = (group, spec) => {
        try {
          const wait = ctx.slots.inject(spec.slot, () => {
            try {
              const dispose = ctx.slots.register(
                { name: spec.slot, ...spec.options },
                spec.Component,
              )
              if (typeof dispose === 'function') group.registrations.push(dispose)
            } catch (error) {
              warn(`register ${spec.slot}`, error)
            }
          })
          if (typeof wait === 'function') group.waits.push(wait)
        } catch (error) {
          warn(`inject ${spec.slot}`, error)
        }
      }

      const disposeGroup = (group) => {
        for (const dispose of group.registrations.splice(0).reverse()) {
          try {
            dispose()
          } catch (error) {
            warn('unregister', error)
          }
        }
        for (const wait of group.waits.splice(0).reverse()) {
          try {
            wait()
          } catch (error) {
            warn('unwait', error)
          }
        }
      }

      const unmountBackdrop = () => {
        backdropToken += 1
        for (const dispose of [backdropSurfaces, backdropScrim]) {
          if (!dispose) continue
          try {
            dispose()
          } catch (error) {
            warn('backdrop theme teardown', error)
          }
        }
        backdropSurfaces = null
        backdropScrim = null
        if (backdropStyle) {
          try {
            backdropStyle.remove()
          } catch (error) {
            warn('backdrop style teardown', error)
          }
          backdropStyle = null
        }
      }

      const mountBackdrop = () => {
        const token = (backdropToken += 1)
        loadManifest()
          .then((manifest) => {
            if (token !== backdropToken) return
            const files = manifest && manifest.files
            if (!files || !files['background.webp']) return
            backdropStyle = installBackdrop(assetUrl('background.webp'))
            try {
              backdropSurfaces = ctx.theme.overrideTokens(BACKDROP_SURFACE_SOURCE, BACKDROP_SURFACES)
            } catch (error) {
              warn('backdrop surfaces', error)
            }
            try {
              backdropScrim = ctx.theme.overrideTokens(BACKDROP_SCRIM_SOURCE, BACKDROP_SCRIM)
            } catch (error) {
              warn('backdrop scrim', error)
            }
          })
          .catch(() => {})
      }

      const unmountDecoration = () => {
        disposeGroup(decoration)
        unmountBackdrop()
        if (themeDispose) {
          try {
            themeDispose()
          } catch (error) {
            warn('theme teardown', error)
          }
          themeDispose = null
        }
      }

      const mountDecoration = () => {
        for (const spec of DECORATIONS) contribute(decoration, spec)
        try {
          themeDispose = ctx.theme.overrideTokens(NS, TOKENS)
        } catch (error) {
          warn('theme', error)
        }
        mountBackdrop()
      }

      const sync = () => {
        unmountDecoration()
        if (store.value) mountDecoration()
      }

      // The switch is seated unconditionally and survives every toggle.
      for (const spec of ALWAYS) contribute(switchSeat, spec)
      sync()

      const unsubscribe = store.subscribe(sync)
      if (typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          unsubscribe()
          unmountDecoration()
          disposeGroup(switchSeat)
        })
      }
    }

    module.exports = {
      name: `${NS}-client`,
      inject: ['slots', 'theme'],
      apply,
    }
    return module.exports
  },
})
