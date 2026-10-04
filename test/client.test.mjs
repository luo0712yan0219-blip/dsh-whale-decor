// Client-half tests: the theme-token layer and the slot contribution set, driven
// through the real `apply()` with a stubbed module loader, React, DOM and slots
// service. This is what proves the two contracts that only break at runtime in
// the browser: `overrideTokens` rejects a bare string, and every alias token needs
// both schemes.

import test from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const NS = 'dsh-whale-decor'

// The 14 alias tokens the host publishes, from cordis_inspect Theme.listTokens.
const EXPECTED_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
]

const EXPECTED_SLOTS = [
  'sidebar.brand.mark',
  'conversation.hero.brand.mark',
  'shell.overlay',
  'conversation.composer.dock',
  'conversation.chat.assistant-actions',
  'sidebar.footer.action',
]

// ── globals the module needs at import time ──────────────────────────────────
// Effects run synchronously and cleanups are not replayed. The behaviour that
// needs this is "mounting the hero seat surfaces the panel", which is exactly
// one effect run. Timers are stubbed below so a poll loop cannot keep the test
// process alive, and so the clock cannot mutate state mid-assertion.
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (fn) => fn(),
  useRef: (initial) => ({ current: initial }),
}
// Every timer the code under test can reach is inert. The comment above always
// said that was the intent, but only setInterval was stubbed — a decoration using
// setTimeout quietly held the process open for the length of its animation.
// `flush` keeps a real one so a test can still yield to the microtask queue.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = () => 0
globalThis.clearTimeout = () => {}
globalThis.setInterval = () => 0
globalThis.clearInterval = () => {}

const requireStub = (name) => {
  if (name === 'react') return react
  throw new Error(`unexpected require(${name})`)
}

let loadedSpec = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loadedSpec = spec
    },
  },
  localStorage: {
    values: new Map(),
    getItem(key) {
      return this.values.has(key) ? this.values.get(key) : null
    },
    setItem(key, value) {
      this.values.set(key, String(value))
    },
  },
  matchMedia: () => ({ matches: false }),
  innerWidth: 1000,
  innerHeight: 800,
}
// The backdrop mount needs a manifest, so the fetch stub serves one. Tests that
// need a *different* manifest use a fresh module instance with its own stub.
const MANIFEST = {
  version: 1,
  revision: 'testrev123456',
  floatFrameMs: 336,
  files: {
    'avatar.webp': { type: 'image/webp' },
    'hero.webp': { type: 'image/webp' },
    'background.webp': { type: 'image/webp' },
    'float/000.webp': { type: 'image/webp' },
    'float/001.webp': { type: 'image/webp' },
  },
}

const created = []
globalThis.document = {
  getElementById: (id) => created.find((element) => element.id === id) ?? null,
  createElement: () => {
    const element = {
      id: '',
      textContent: '',
      remove() {
        const index = created.indexOf(element)
        if (index >= 0) created.splice(index, 1)
      },
    }
    created.push(element)
    return element
  },
  head: { appendChild() {} },
}
// A plausible hardware payload, shaped exactly like the host route's. The
// sensors are deliberately null with `sources.sensors: 'unavailable'` — the
// contract under test is that a missing source is declared, never zeroed.
const HWSTATS = {
  at: '2026-01-01T00:00:00.000Z',
  cpu: { usage: 37.4, cores: 16, model: 'AMD Ryzen 7 H 260' },
  memory: { usedBytes: 12 * 1073741824, freeBytes: 20 * 1073741824, totalBytes: 32 * 1073741824 },
  gpu: {
    name: 'NVIDIA GeForce RTX 5050 Laptop GPU',
    usage: 45,
    memoryUsedMB: 3243,
    memoryTotalMB: 8151,
    temperatureC: 62,
  },
  disks: [{ mount: 'C:', usedBytes: 160 * 1073741824, freeBytes: 300 * 1073741824, totalBytes: 460 * 1073741824 }],
  perfMode: 'Turbo',
  uptimeSec: 2402,
  fans: null,
  temperatures: null,
  sources: { gpu: 'ok', perfMode: 'ok', sensors: 'unavailable' },
}

/** Every URL the client has asked for, so a test can prove which route it polls. */
const fetched = []

// The backdrop mount needs a manifest and the hardware float needs its own
// route, so the stub dispatches on URL. Tests that need a *different* manifest
// use a fresh module instance with its own stub.
globalThis.fetch = async (url) => {
  fetched.push(String(url))
  const body = String(url).includes('/hwstats') ? HWSTATS : MANIFEST
  return { ok: true, status: 200, json: async () => body }
}

await import(pathToFileURL(join(ROOT, 'lib', 'client.js')).href)

const client = loadedSpec.factory((name) => {
  if (name === 'react') return react
  throw new Error(`unexpected require(${name})`)
})

function harness() {
  const state = {
    injected: [],
    registrations: [],
    live: new Set(),
    themeCalls: [],
    themeLayers: [],
  }
  let seq = 0
  const ctx = {
    slots: {
      inject(slot, callback) {
        state.injected.push(slot)
        callback()
        return () => {}
      },
      register(options, component) {
        const token = `${options.name}#${(seq += 1)}`
        const entry = { options, component, token }
        state.registrations.push(entry)
        state.live.add(token)
        return () => state.live.delete(token)
      },
    },
    theme: {
      overrideTokens(source, tokens) {
        const layer = { source, tokens, active: true }
        state.themeCalls.push({ source, tokens })
        state.themeLayers.push(layer)
        return () => {
          layer.active = false
        }
      },
    },
    effect(setup) {
      const dispose = setup()
      if (typeof dispose === 'function') state.disposeFiber = dispose
    },
  }
  return { ctx, state }
}

const liveSlots = (state) => [...new Set([...state.live].map((token) => token.split('#')[0]))].sort()
const liveIds = (state) => [...state.live].map((token) => state.registrations.find((entry) => entry.token === token).options.id).sort()
const activeLayers = (state) => state.themeLayers.filter((layer) => layer.active)
const sourceOf = (state, name) => state.themeCalls.find((call) => call.source === name)
// rgba(r, g, b, a) -> a
const alphaOf = (css) => Number(css.slice(css.lastIndexOf(',') + 1, -1))
const flush = () => new Promise((resolve) => realSetTimeout(resolve, 0))

test('the client module loads under the DSH module loader contract', () => {
  assert.ok(loadedSpec, 'window.__ModuleLoader__.load must be called')
  assert.equal(loadedSpec.id, NS)
  assert.equal(typeof loadedSpec.factory, 'function')
  assert.equal(client.name, `${NS}-client`)
  assert.deepEqual(client.inject, ['slots', 'theme'])
  assert.equal(typeof client.apply, 'function')
})

test('the theme layer covers every published alias token in both schemes', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  assert.equal(state.themeCalls.length, 1)
  const { source, tokens } = state.themeCalls[0]
  assert.equal(source, NS, 'the layer must be identified by the package id')

  assert.deepEqual(Object.keys(tokens).sort(), [...EXPECTED_TOKENS].sort())
  for (const [token, modes] of Object.entries(tokens)) {
    // overrideTokens validates at runtime: a bare string throws a teaching error.
    assert.equal(typeof modes, 'object', `${token} must be { light, dark }, not a bare string`)
    assert.equal(typeof modes.light, 'string', `${token}.light must be a string`)
    assert.equal(typeof modes.dark, 'string', `${token}.dark must be a string`)
    assert.match(modes.light, /^#[0-9a-f]{6}$/i, `${token}.light must be a hex colour`)
    assert.match(modes.dark, /^#[0-9a-f]{6}$/i, `${token}.dark must be a hex colour`)
    assert.notEqual(modes.light, modes.dark, `${token} should differ between schemes`)
  }
  assert.ok(tokens['--dsw-alias-brand-primary'], 'brand colour must be themed')
})

test('every decoration seat is injected and registered while enabled', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  for (const slot of EXPECTED_SLOTS) {
    assert.ok(state.injected.includes(slot), `${slot} must be injected`)
  }
  assert.deepEqual(liveSlots(state), [...EXPECTED_SLOTS].sort())
  assert.equal(activeLayers(state).length, 1, 'the theme layer must be active')
})

test('list-slot registrations carry id and order; single slots carry neither key nor order', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  for (const { options } of state.registrations) {
    assert.ok(options.id, `${options.name} needs an id`)
    if (options.name.startsWith('sidebar.') && options.name !== 'sidebar.footer.action') {
      // single slot: no list ordering
      assert.equal(options.order, undefined)
    }
    if (options.name === 'shell.overlay' || options.name.endsWith('.dock')
      || options.name.endsWith('.assistant-actions') || options.name === 'sidebar.footer.action') {
      assert.equal(typeof options.order, 'number', `${options.name} is a list slot and needs an order`)
    }
  }
})

test('the master switch tears the decoration down and restores it', () => {
  const { ctx, state } = harness()
  client.apply(ctx)
  assert.equal(activeLayers(state).length, 1)

  const toggle = state.registrations.find(
    (entry) => entry.options.name === 'sidebar.footer.action',
  )
  assert.ok(toggle, 'the switch must own a seat in the sidebar footer')

  // Rendering the switch yields the button; clicking it is the user path.
  const button = toggle.component({})
  assert.equal(button.type, 'button')
  assert.equal(typeof button.props.onClick, 'function')

  button.props.onClick() // -> off

  assert.equal(activeLayers(state).length, 0, 'the theme layer must be disposed when off')
  assert.deepEqual(
    liveSlots(state),
    ['sidebar.footer.action'],
    'only the switch itself may survive being switched off',
  )

  button.props.onClick() // -> on again

  assert.equal(activeLayers(state).length, 1, 'the theme layer must come back')
  assert.deepEqual(liveSlots(state), [...EXPECTED_SLOTS].sort(), 'every seat must come back')
})

test('a stored opt-out keeps the decoration off at apply time', async () => {
  window.localStorage.setItem(`${NS}:enabled`, '0')
  try {
    // The preference is read when the module loads, which is what a real page
    // load does. A cache-busting query gives this test a fresh module instance
    // instead of the one already imported above.
    loadedSpec = null
    await import(`${pathToFileURL(join(ROOT, 'lib', 'client.js')).href}?optout=1`)
    assert.ok(loadedSpec, 'the reloaded module must register itself')

    const optedOut = loadedSpec.factory((name) => {
      if (name === 'react') return react
      throw new Error(`unexpected require(${name})`)
    })
    const { ctx, state } = harness()
    optedOut.apply(ctx)

    assert.equal(activeLayers(state).length, 0, 'no theme layer may be stacked')
    assert.deepEqual(
      liveSlots(state),
      ['sidebar.footer.action'],
      'only the switch may be seated when the decoration starts off',
    )
  } finally {
    window.localStorage.values.delete(`${NS}:enabled`)
  }
})

test('the sidebar brand mark outranks the shell fallback in its single-occupancy seat', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const brand = state.registrations.find((entry) => entry.options.name === 'sidebar.brand.mark')
  assert.ok(brand, 'the sidebar brand mark must be registered at all')

  // The shell fills this single slot with its own fish fallback at priority 0,
  // and the LOWEST priority wins. Verified on the live slot tree: priority 10
  // registered but stayed `active: false`; priority -1 became the active
  // occupant. Losing has no UI symptom at all, so this guard matters.
  assert.equal(typeof brand.options.priority, 'number')
  assert.ok(
    brand.options.priority < 0,
    'the brand-mark registration must outrank the shell fallback at priority 0',
  )
})

test('the switch drops its label in the collapsed sidebar rail', () => {
  const { ctx, state } = harness()
  client.apply(ctx)
  const toggle = state.registrations.find(
    (entry) => entry.options.name === 'sidebar.footer.action',
  )

  // ownerProps.wide === false is the 56px rail, where a text label does not fit.
  // createElement keeps a literal `null` child, and React ignores it — so count
  // rendered children rather than raw array length.
  const rendered = (element) => element.children.filter((child) => child != null)

  const rail = toggle.component({ wide: false })
  assert.equal(rail.type, 'button')
  assert.equal(rendered(rail).length, 1, 'the rail renders the icon only')
  assert.ok(rail.props['aria-label'], 'the rail button still needs an accessible name')

  const wide = toggle.component({ wide: true })
  assert.equal(rendered(wide).length, 2, 'the wide sidebar renders icon plus label')
})

const BACKDROP_SURFACES = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-specific-sidebar-fill',
]

test('the backdrop stacks translucent surfaces over the palette', async () => {
  const { ctx, state } = harness()
  client.apply(ctx)
  await flush()

  // Order matters: the backdrop surfaces must be stacked after the palette so
  // they win per-token, while borders/labels/states keep the solid palette.
  assert.deepEqual(
    state.themeCalls.map((call) => call.source),
    [NS, `${NS}:backdrop-surface`, `${NS}:backdrop-scrim`],
  )

  const surfaces = sourceOf(state, `${NS}:backdrop-surface`).tokens
  assert.deepEqual(Object.keys(surfaces).sort(), [...BACKDROP_SURFACES].sort())
  for (const [token, modes] of Object.entries(surfaces)) {
    for (const scheme of ['light', 'dark']) {
      assert.equal(typeof modes[scheme], 'string', `${token}.${scheme} must be set`)
      assert.ok(
        alphaOf(modes[scheme]) < 1,
        `${token}.${scheme} must be translucent, or the backdrop stays hidden`,
      )
    }
  }

  // Menus and popovers land over arbitrary parts of the photo and must not trade
  // away text contrast, so the overlay deliberately stays near-opaque.
  assert.ok(alphaOf(surfaces['--dsw-alias-bg-overlay'].dark) >= 0.9)
  assert.ok(alphaOf(surfaces['--dsw-alias-bg-overlay'].light) >= 0.9)

  // The backdrop has to actually read. Two earlier revisions failed this from
  // opposite sides: light mode at 0.82 washed the pale photo out completely,
  // and dark mode at 0.66 behind a 0.26 scrim read as murk.
  for (const scheme of ['light', 'dark']) {
    assert.ok(
      alphaOf(surfaces['--dsw-alias-bg-base'][scheme]) <= 0.6,
      `${scheme} base above ~0.6 buries the backdrop`,
    )
    assert.ok(
      alphaOf(surfaces['--dsw-specific-sidebar-fill'][scheme]) <= 0.6,
      `${scheme} sidebar above ~0.6 buries the backdrop`,
    )
  }

  // The scrim is the dominant lever on how visible the picture is: it multiplies
  // the whole photo down, gaps included. Keep it light.
  const scrim = sourceOf(state, `${NS}:backdrop-scrim`).tokens['--dsh-whale-scrim']
  for (const scheme of ['light', 'dark']) {
    assert.ok(alphaOf(scrim[scheme]) <= 0.12, `${scheme} scrim above ~0.12 makes the photo murky`)
  }
})

test('the backdrop stylesheet points at the revision-stamped asset', async () => {
  const { ctx } = harness()
  client.apply(ctx)
  await flush()

  const style = created.find((element) => element.id === `${NS}-backdrop`)
  assert.ok(style, 'a backdrop stylesheet must be installed')
  // :root + :root body, not html/body: a bare `body` selector loses to a shell
  // rule written as `html body`, which would silently hide the backdrop.
  assert.match(style.textContent, /:root,\s*:root body/)
  assert.doesNotMatch(style.textContent, /^html,\s*body/m)
  assert.match(
    style.textContent,
    /\/plugins\/dsh-whale-decor\/asset\/background\.webp\?v=testrev123456/,
    'the backdrop URL must carry the build revision so rebuilt art is refetched',
  )
  assert.match(style.textContent, /var\(--dsh-whale-scrim,/, 'the scrim needs a CSS fallback')
  assert.match(style.textContent, /background-attachment: fixed/)
  assert.match(style.textContent, /background-size: cover, cover/)
  // Regression: a centred slice on a narrow window cropped the character out
  // entirely — a 664px-wide window showed nothing but water. The subject of this
  // photo sits near 75% of its width.
  assert.match(
    style.textContent,
    /background-position: 75% center, 75% center/,
    'the backdrop must stay anchored on the character, not the middle of the photo',
  )
})

test('switching the decoration off removes the backdrop as well', async () => {
  const { ctx, state } = harness()
  client.apply(ctx)
  await flush()
  assert.ok(activeLayers(state).some((layer) => layer.source === `${NS}:backdrop-surface`))

  const toggle = state.registrations.find(
    (entry) => entry.options.name === 'sidebar.footer.action',
  )
  toggle.component({}).props.onClick()

  assert.equal(activeLayers(state).length, 0, 'every theme layer must be disposed')
  assert.equal(
    created.find((element) => element.id === `${NS}-backdrop`),
    undefined,
    'the backdrop stylesheet must be removed, or the image outlives the switch',
  )

  toggle.component({}).props.onClick()
  await flush()
  assert.ok(activeLayers(state).some((layer) => layer.source === `${NS}:backdrop-surface`))
})

test('no backdrop layer is stacked when the manifest ships no backdrop', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ version: 1, revision: 'nobackdrop', files: { 'avatar.webp': {} } }),
  })
  try {
    loadedSpec = null
    await import(`${pathToFileURL(join(ROOT, 'lib', 'client.js')).href}?nobackdrop=1`)
    const withoutBackdrop = loadedSpec.factory((name) => {
      if (name === 'react') return react
      throw new Error(`unexpected require(${name})`)
    })
    const { ctx, state } = harness()
    withoutBackdrop.apply(ctx)
    await flush()

    assert.deepEqual(
      state.themeCalls.map((call) => call.source),
      [NS],
      'a missing backdrop must degrade to the palette alone, not a 404 image',
    )
  } finally {
    globalThis.fetch = previous
  }
})

test('every overlay seat is registered under a distinct id', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const overlay = state.registrations.filter((entry) => entry.options.name === 'shell.overlay')
  assert.equal(overlay.length, 3, 'the floating pet, the clock panel and the hardware readout all live here')
  assert.deepEqual(
    overlay.map((entry) => entry.options.id).sort(),
    [`${NS}-float`, `${NS}-panel`, `${NS}-hw`].sort(),
  )
  for (const entry of overlay) {
    assert.equal(typeof entry.options.order, 'number', `${entry.options.id} needs an order`)
  }
})

test('the floating panel is on screen without waiting for any blank session', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const panel = state.registrations.find((entry) => entry.options.id === `${NS}-panel`)
  assert.ok(panel, 'the panel must own an overlay seat')

  const rendered = panel.component({})
  assert.ok(rendered, 'the widget is always mounted — it is not gated on a blank session')
  assert.match(rendered.props.className, new RegExp(`${NS}-panel`))

  const classes = [rendered, ...rendered.children.filter(Boolean)]
    .map((node) => String(node?.props?.className ?? ''))
  assert.ok(classes.some((value) => value.includes(`${NS}-grip`)), 'a drag grip must be present')
  assert.ok(classes.some((value) => value.includes(`${NS}-resize`)), 'a scale handle must be present')
})

test('dragging starts on the card but not on its controls', () => {
  const { ctx, state } = harness()
  client.apply(ctx)
  const panel = state.registrations.find((entry) => entry.options.id === `${NS}-panel`)
  const rendered = panel.component({})

  // The overlay layer is click-through; the panel has to opt back in, both in
  // the stylesheet and inline (equal-specificity shell rules can win otherwise).
  assert.equal(rendered.props.style.pointerEvents, 'auto')
  assert.equal(typeof rendered.props.onPointerDown, 'function', 'the card must be a drag surface')

  const fakeEvent = (isControl) => {
    const event = {
      button: 0,
      clientX: 12,
      clientY: 34,
      target: { closest: (selector) => (isControl && selector.includes('button') ? {} : null) },
      prevented: 0,
      preventDefault() {
        this.prevented += 1
      },
      stopPropagation() {},
    }
    return event
  }

  // Grabbing a control must leave the window where it is.
  const onControl = fakeEvent(true)
  rendered.props.onPointerDown(onControl)
  assert.equal(onControl.prevented, 0, 'a control keeps its own gesture')

  // Grabbing anywhere else must begin a drag — this is what "cannot drag" meant
  // when only the 22px corner handle was wired up.
  const onCard = fakeEvent(false)
  rendered.props.onPointerDown(onCard)
  assert.equal(onCard.prevented, 1, 'the card body must begin a drag')
})

test('a stored panel layout is restored and clamped into the viewport', async () => {
  window.localStorage.setItem(`${NS}:panel`, JSON.stringify({ x: 5000, y: 5000, scale: 9 }))
  try {
    loadedSpec = null
    await import(`${pathToFileURL(join(ROOT, 'lib', 'client.js')).href}?layout=1`)
    const fresh = loadedSpec.factory(requireStub)

    const { ctx, state } = harness()
    fresh.apply(ctx)
    const panel = state.registrations.find((entry) => entry.options.id === `${NS}-panel`)
    const style = panel.component({}).props.style

    // A window that shrank since the last visit must not strand the widget
    // off-screen, and a stored scale must stay inside the allowed range.
    assert.equal(style.left, 960, 'x clamps to the viewport minus the margin')
    assert.equal(style.top, 760, 'y clamps to the viewport minus the margin')
    assert.match(style.transform, /scale\(2\)/, 'scale clamps to the maximum')
  } finally {
    window.localStorage.values.delete(`${NS}:panel`)
  }
})

// The stub's createElement does not invoke child components, so a vnode has to
// be rendered explicitly. Matching on the function's name keeps this working
// without exporting the component from a closed module factory.
const renderChild = (parent, name) => {
  const vnode = parent.children
    .filter(Boolean)
    .find((node) => typeof node.type === 'function' && node.type.name === name)
  assert.ok(vnode, `expected a ${name} child`)
  return vnode.type(vnode.props)
}

test('the weather section asks for a city until one is stored', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const panel = state.registrations.find((entry) => entry.options.id === `${NS}-panel`)
  const weather = renderChild(panel.component({}), 'WeatherSection')

  assert.match(
    String(weather.props.className),
    /is-picking/,
    'with nothing stored it must ask, not invent a city',
  )
  const placeRow = weather.children.filter(Boolean)[1]
  const input = placeRow.children.filter(Boolean)[0]
  assert.equal(input.props['aria-label'], '城市')
})

test('a stored city replaces the prompt and names the place', () => {
  window.localStorage.setItem(
    `${NS}:weather`,
    JSON.stringify({ name: '上海', latitude: 31.22, longitude: 121.46 }),
  )
  try {
    const { ctx, state } = harness()
    client.apply(ctx)

    const panel = state.registrations.find((entry) => entry.options.id === `${NS}-panel`)
    const weather = renderChild(panel.component({}), 'WeatherSection')

    assert.doesNotMatch(
      String(weather.props.className),
      /is-picking/,
      'a stored city must skip the prompt',
    )
    assert.ok(JSON.stringify(weather).includes('上海'), 'the place name must be rendered')
  } finally {
    window.localStorage.values.delete(`${NS}:weather`)
  }
})

test('every registered component renders without throwing', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  for (const { options, component } of state.registrations) {
    // ownerProps: the brand marks receive { size, className }, list entries none.
    const props = options.name.includes('brand.mark')
      ? { size: 28, className: 'host-mark' }
      : {}
    assert.doesNotThrow(() => component(props), `${options.name} must render`)
  }
})

// ── hardware float ──────────────────────────────────────────────────────────
/** Pull the `label` / `value` text out of every row vnode in a rendered card. */
const collectRows = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (node.props?.className === `${NS}-hw-row`) {
    const cells = (node.children ?? []).filter((child) => child && child.props)
    out.push({
      label: cells[0]?.children?.[0] ?? null,
      value: cells[1]?.children?.[0] ?? null,
    })
    return out
  }
  for (const child of node.children ?? []) collectRows(child, out)
  return out
}

const hwEntry = (state) => {
  const entry = state.registrations.find((candidate) => candidate.options.id === `${NS}-hw`)
  assert.ok(entry, 'the hardware readout must own an overlay seat')
  return entry
}

const foldButtonOf = (rendered) => {
  const header = rendered.children.filter(Boolean)[0]
  const button = header.children.filter(Boolean).find((node) => node.type === 'button')
  assert.ok(button, 'the header must carry the fold toggle')
  return button
}

test('the hardware readout sits above the clock card', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const hw = hwEntry(state)
  const panel = state.registrations.find((candidate) => candidate.options.id === `${NS}-panel`)
  assert.equal(hw.options.name, 'shell.overlay')
  assert.ok(
    hw.options.order > panel.options.order,
    'the readout stacks above the clock card rather than under it',
  )
  assert.ok(fetched.some((url) => url.includes('/plugins/dsh-whale-decor/hwstats')),
    'the float must poll this plugin\'s own host route')
})

test('with no reading yet the float reports a gap, not a zero', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const rendered = hwEntry(state).component({})
  assert.equal(rendered.props['data-folded'], '0', 'unfolded by default')
  assert.equal(rendered.props.style.pointerEvents, 'auto',
    'the overlay is click-through; the card opts back in')

  // The first poll has not answered, so every value must read as absent. A "0"
  // here would be indistinguishable from a real measurement.
  const rows = collectRows(rendered)
  assert.ok(rows.length > 0, 'an unfolded card shows its rows')
  const memory = rows.find((row) => row.label === '内存')
  assert.ok(memory, 'the memory row must exist')
  assert.equal(memory.value, '—', 'an unread source must not be rendered as 0')
  assert.ok(
    JSON.stringify(rendered.children).includes('未接入'),
    'the GPU must say 未接入 until a reading arrives',
  )
})

test('a stored fold is restored, and the card clamps back into the viewport', async () => {
  window.localStorage.setItem(`${NS}:hw`, JSON.stringify({ x: 5000, y: 5000, folded: true }))
  try {
    loadedSpec = null
    await import(`${pathToFileURL(join(ROOT, 'lib', 'client.js')).href}?hw=1`)
    const fresh = loadedSpec.factory(requireStub)

    const { ctx, state } = harness()
    fresh.apply(ctx)
    const rendered = hwEntry(state).component({})

    assert.equal(rendered.props['data-folded'], '1', 'a stored fold must be restored')
    assert.equal(rendered.props.style.left, 960, 'x clamps to the viewport minus the margin')
    assert.equal(rendered.props.style.top, 760, 'y clamps to the viewport minus the margin')

    const fold = foldButtonOf(rendered)
    assert.equal(fold.props['aria-expanded'], 'false', 'a folded card reports collapsed')
    assert.equal(fold.children[0], '▾', 'the glyph must offer expanding')
  } finally {
    window.localStorage.values.delete(`${NS}:hw`)
  }
})

test('the fold toggle keeps its own gesture on the drag surface', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const rendered = hwEntry(state).component({})
  assert.equal(typeof rendered.props.onPointerDown, 'function', 'the card must be a drag surface')

  const event = (isControl) => ({
    button: 0,
    clientX: 12,
    clientY: 34,
    target: { closest: (selector) => (isControl && selector.includes('button') ? {} : null) },
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1
    },
    stopPropagation() {
      this.stopped += 1
    },
  })

  // Clicking the toggle must fold, not start a drag.
  const onToggle = event(true)
  rendered.props.onPointerDown(onToggle)
  assert.equal(onToggle.prevented, 0, 'the toggle keeps its own gesture')

  // Grabbing the card itself must still move the window.
  const onCard = event(false)
  rendered.props.onPointerDown(onCard)
  assert.equal(onCard.prevented, 1, 'the card body must begin a drag')

  const fold = event(false)
  foldButtonOf(rendered).props.onClick(fold)
  assert.equal(fold.stopped, 1, 'the toggle must not let the click reach the drag surface')
})

// ── hardware float: free resizing ───────────────────────────────────────────
const resizeHandleOf = (rendered) => {
  const handle = rendered.children
    .filter(Boolean)
    .find((node) => node.props?.className === `${NS}-hw-resize`)
  assert.ok(handle, 'the card must carry a resize handle')
  return handle
}

test('the hardware card keeps its scale in the transform', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const rendered = hwEntry(state).component({})
  // The default is 1, and it must be expressed on the element the drag also
  // writes to — otherwise a drag would silently reset the size.
  assert.match(rendered.props.style.transform, /translate\(-50%, -50%\) scale\(1\)/)
})

test('a stored scale is restored and clamped', async () => {
  window.localStorage.setItem(`${NS}:hw`, JSON.stringify({ x: 100, y: 100, scale: 9 }))
  try {
    loadedSpec = null
    await import(`${pathToFileURL(join(ROOT, 'lib', 'client.js')).href}?hwScale=1`)
    const fresh = loadedSpec.factory(requireStub)

    const { ctx, state } = harness()
    fresh.apply(ctx)
    const rendered = hwEntry(state).component({})
    // 3 is the ceiling: big enough to read across a desk, still a sane card.
    assert.match(rendered.props.style.transform, /scale\(3\)/, 'a stored scale must clamp')
    assert.equal(rendered.props.style.left, 100, 'position still comes through')
  } finally {
    window.localStorage.values.delete(`${NS}:hw`)
  }
})

test('the resize handle claims its gesture instead of dragging, and scales by keyboard', () => {
  const { ctx, state } = harness()
  client.apply(ctx)

  const rendered = hwEntry(state).component({})
  const handle = resizeHandleOf(rendered)
  assert.equal(handle.props['aria-label'], '缩放硬件面板')
  // Without this the card would drag out from under the pointer.
  assert.equal(handle.props['data-dsh-decor-nodrag'], '')

  const pointer = {
    button: 0,
    clientX: 40,
    clientY: 60,
    prevented: 0,
    stopped: 0,
    preventDefault() {
      this.prevented += 1
    },
    stopPropagation() {
      this.stopped += 1
    },
  }
  handle.props.onPointerDown(pointer)
  assert.equal(pointer.prevented, 1, 'the resize handle must claim the pointer')
  assert.equal(pointer.stopped, 1)

  // Keyboard path, so resizing is not pointer-only.
  const grow = { key: ']', shiftKey: false, prevented: 0, preventDefault() { this.prevented += 1 } }
  handle.props.onKeyDown(grow)
  assert.equal(grow.prevented, 1, '] must grow the card')

  const shrink = { key: '[', shiftKey: false, prevented: 0, preventDefault() { this.prevented += 1 } }
  handle.props.onKeyDown(shrink)
  assert.equal(shrink.prevented, 1, '[ must shrink the card')

  const ignored = { key: 'a', shiftKey: false, prevented: 0, preventDefault() { this.prevented += 1 } }
  handle.props.onKeyDown(ignored)
  assert.equal(ignored.prevented, 0, 'unrelated keys must pass through')
})
