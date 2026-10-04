// Host-half tests: route registration shape and the asset authorisation boundary.
// Everything runs through the real `apply()` entry point with a stub ctx, so the
// registry loading and handler logic under test are the shipped code paths.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, renameSync, rmSync, statfsSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PLUGIN = 'dsh-whale-decor'

const { apply } = await import(pathToFileURL(join(ROOT, 'src', 'index.js')).href)
const { parseHwinfo } = await import(pathToFileURL(join(ROOT, 'src', 'hwstats.js')).href)

// HWiNFO's Gadget mirrors sensors into the registry; the parser is the one piece
// of that path with real logic, and it is pure, so it gets pinned down here.
test('HWiNFO registry groups are bucketed by their label', () => {
  const result = parseHwinfo([
    { name: 'Label0', value: 'CPU Fan' },
    { name: 'Value0', value: '2450 RPM' },
    { name: 'ValueRaw0', value: 2450 },
    { name: 'Label1', value: 'GPU Fan' },
    { name: 'ValueRaw1', value: 1900 },
    { name: 'Label2', value: 'Drive Temperature' },
    { name: 'ValueRaw2', value: 41 },
    { name: 'Label3', value: 'CPU Package' },
    { name: 'ValueRaw3', value: 63 },
  ])
  assert.deepEqual(result.fans.map((fan) => [fan.name, fan.value]), [
    ['CPU Fan', 2450],
    ['GPU Fan', 1900],
  ])
  assert.deepEqual(result.temperatures.map((t) => [t.name, t.value]), [
    ['Drive Temperature', 41],
  ])
  assert.equal(result.available, true)
})

test('an HWiNFO group without a raw value falls back to the formatted one', () => {
  const result = parseHwinfo([
    { name: 'Label0', value: 'Fan' },
    { name: 'Value0', value: '1200' },
  ])
  assert.equal(result.fans[0].value, 1200, 'a unit-free formatted value still parses')
})

test('unlabelled or unrelated registry values yield nothing', () => {
  // No label: the bucket is unknowable, so the group must be skipped rather than
  // guessed into one. A wrong number is worse than a missing row.
  assert.equal(parseHwinfo([{ name: 'ValueRaw0', value: 1234 }]).available, false)
  assert.equal(parseHwinfo([{ name: 'SomethingElse', value: 7 }]).available, false)
  assert.equal(parseHwinfo([]).available, false)
  // A label whose value never parsed must not surface as NaN.
  assert.equal(
    parseHwinfo([{ name: 'Label0', value: 'Fan' }, { name: 'Value0', value: 'n/a' }]).available,
    false,
  )
})

test('the alternative HWiNFO layout names the value after the sensor', () => {
  // HWiNFO has written both shapes across versions. With no Label<i> present the
  // value name is the label, and the two shapes can never both apply.
  const result = parseHwinfo([
    { name: 'CPU Fan', value: 2480 },
    { name: 'GPU Fan', value: 1700 },
    { name: 'Drive Temperature', value: 39 },
  ])
  assert.deepEqual(result.fans.map((fan) => [fan.name, fan.value]), [
    ['CPU Fan', 2480],
    ['GPU Fan', 1700],
  ])
  assert.deepEqual(result.temperatures.map((t) => [t.name, t.value]), [['Drive Temperature', 39]])
})

test('the label layout wins when both could apply, so nothing is counted twice', () => {
  const result = parseHwinfo([
    { name: 'Label0', value: 'CPU Fan' },
    { name: 'ValueRaw0', value: 2480 },
    // A same-named value in the fallback shape would otherwise be a second fan.
    { name: 'CPU Fan', value: 2480 },
  ])
  assert.equal(result.fans.length, 1, 'the fallback must not run when labels exist')
})

test('the unit decides the bucket, so a localised UI label still works', () => {
  // HWiNFO's UI language changes the label but never the unit. A Chinese label
  // whose wording this parser has never seen must still land correctly.
  const result = parseHwinfo([
    { name: 'Label0', value: '中央处理器风扇' },
    { name: 'Value0', value: '2480 RPM' },
    { name: 'ValueRaw0', value: 2480 },
    { name: 'Label1', value: '某个未知传感器' },
    { name: 'Value1', value: '41.5 °C' },
    { name: 'ValueRaw1', value: 41.5 },
    { name: 'Label2', value: '风扇转速' },
    { name: 'ValueRaw2', value: 1700 },
  ])
  assert.deepEqual(result.fans.map((fan) => [fan.name, fan.value]), [
    ['中央处理器风扇', 2480],
    ['风扇转速', 1700],
  ])
  assert.deepEqual(result.temperatures.map((t) => [t.name, t.value]), [['某个未知传感器', 41.5]])
})

test('a value with no unit and an unrecognised label is skipped, not guessed', () => {
  const result = parseHwinfo([
    { name: 'Label0', value: '神秘项目' },
    { name: 'Value0', value: '45.0 %' },
    { name: 'ValueRaw0', value: 45 },
  ])
  assert.equal(result.available, false, 'a percentage could be load, memory or fan duty')
})

test('the real HWiNFO layout captured from this machine classifies correctly', () => {
  // Copied from HKCU\Software\HWiNFO64\VSB on this ASUS TUF A16. Two details here
  // are the whole reason the parser is shaped the way it is:
  //   · the fan labels are "CPU" / "GPU" / "Mid" — no word for "fan" anywhere,
  //     so only the RPM unit identifies them;
  //   · both NVMe drives report "磁盘温度" / "磁盘温度 2", so the label alone
  //     cannot tell the drives apart.
  const SMART_A = 'S.M.A.R.T.: SHGP31-1000GM (KDCCN42281200C66Z) [D:, F:, H:]'
  const SMART_B = 'S.M.A.R.T.: KBG60ZNV512G KIOXIA (YFBCT1GUZ4AN) [C:]'
  const EC = 'ASUS NB EC: ASUS TX Gaming FA608UH_FA608UH'
  const result = parseHwinfo([
    { name: 'Sensor0', value: 'CPU [#0]: AMD Ryzen 7 H 260: Enhanced' },
    { name: 'Label0', value: '核心温度' },
    { name: 'Value0', value: '69.2 ℃' },
    { name: 'ValueRaw0', value: 69.2 },
    { name: 'Sensor1', value: EC },
    { name: 'Label1', value: 'CPU' },
    // HWiNFO writes a thousands separator here; ValueRaw is the parseable form.
    { name: 'Value1', value: '5,000 RPM' },
    { name: 'ValueRaw1', value: 5000 },
    { name: 'Sensor2', value: EC },
    { name: 'Label2', value: 'GPU' },
    { name: 'Value2', value: '5,400 RPM' },
    { name: 'ValueRaw2', value: 5400 },
    { name: 'Sensor3', value: EC },
    { name: 'Label3', value: 'Mid' },
    { name: 'Value3', value: '0 RPM' },
    { name: 'ValueRaw3', value: 0 },
    { name: 'Sensor6', value: SMART_A },
    { name: 'Label6', value: '磁盘温度' },
    { name: 'ValueRaw6', value: 56 },
    { name: 'Sensor7', value: SMART_A },
    { name: 'Label7', value: '磁盘温度 2' },
    { name: 'ValueRaw7', value: 49 },
    { name: 'Sensor8', value: SMART_A },
    { name: 'Label8', value: '磁盘温度 3' },
    { name: 'ValueRaw8', value: 52 },
    { name: 'Sensor9', value: SMART_A },
    { name: 'Label9', value: '磁盘剩余寿命' },
    { name: 'Value9', value: '100.0 %' },
    { name: 'ValueRaw9', value: 100 },
    { name: 'Sensor10', value: SMART_B },
    { name: 'Label10', value: '磁盘温度' },
    { name: 'ValueRaw10', value: 44 },
    { name: 'Sensor11', value: SMART_B },
    { name: 'Label11', value: '磁盘温度 2' },
    { name: 'ValueRaw11', value: 44 },
  ])

  assert.deepEqual(
    result.fans.map((fan) => [fan.name, fan.value]),
    [['CPU', 5000], ['GPU', 5400], ['Mid', 0]],
    'the unit must identify fans whose labels never say 风扇',
  )
  assert.deepEqual(
    result.temperatures.map((t) => [t.name, t.value, t.kind]),
    [
      ['核心温度', 69.2, 'temperature'],
      // SHGP31 publishes three thermistors; only the primary one survives, so the
      // two drives read as two rows instead of five.
      ['磁盘温度 · SHGP31-1000GM', 56, 'disk'],
      ['磁盘温度 · KBG60ZNV512G KIOXIA', 44, 'disk'],
    ],
    'one temperature per drive, each naming its drive',
  )
  assert.ok(
    !result.temperatures.some((t) => t.name.includes('寿命')),
    'remaining-life percent is not a temperature',
  )
})

test('a bare CPU/GPU label with no unit is skipped rather than guessed', () => {
  // Written while pinning the fixture above: dropping the formatted Value<i>
  // leaves no unit, and "GPU" could be a fan, a clock, or a load. Guessing would
  // put a plausible-looking wrong number on screen.
  const result = parseHwinfo([
    { name: 'Sensor0', value: 'ASUS NB EC: ASUS TX Gaming FA608UH_FA608UH' },
    { name: 'Label0', value: 'GPU' },
    { name: 'ValueRaw0', value: 5400 },
  ])
  assert.equal(result.available, false)
})

function harness() {
  const routes = []
  const errors = []
  const ctx = {
    logger: { error: (message) => errors.push(String(message)) },
    inject(services, callback) {
      assert.deepEqual(services, ['webServer'])
      callback({
        effect(setup) {
          setup()
        },
        webServer: {
          register(route) {
            routes.push(route)
            return () => {}
          },
        },
      })
    },
  }
  return { ctx, routes, errors }
}

function request(url, headers = {}) {
  return { url, headers }
}

function response() {
  return {
    status: 0,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(bytes) {
      this.body = bytes ?? null
    },
  }
}

function findRoute(routes, kind) {
  const route = routes.find((candidate) => candidate.kind === kind)
  assert.ok(route, `expected a ${kind} route to be registered`)
  return route
}

// Two exact routes now exist, so name the one under test rather than relying on
// registration order.
function findRouteByPath(routes, path) {
  const route = routes.find((candidate) => candidate.path === path)
  assert.ok(route, `expected a route at ${path}`)
  return route
}

test('apply registers the manifest, asset and hardware routes', () => {
  const { ctx, routes, errors } = harness()
  apply(ctx, {})
  assert.deepEqual(errors, [], 'expected no host errors')
  assert.equal(routes.length, 3)
  assert.equal(routes.filter((route) => route.kind === 'exact').length, 2)
  assert.equal(findRouteByPath(routes, `/plugins/${PLUGIN}/manifest`).kind, 'exact')
  assert.equal(findRouteByPath(routes, `/plugins/${PLUGIN}/asset`).kind, 'prefix')
  assert.equal(findRouteByPath(routes, `/plugins/${PLUGIN}/hwstats`).kind, 'exact')
})

test('the hardware route answers with real readings and no invented zeros', async () => {
  const { ctx, routes, errors } = harness()
  apply(ctx, {})
  assert.deepEqual(errors, [], 'expected no host errors')
  const res = response()
  await findRouteByPath(routes, `/plugins/${PLUGIN}/hwstats`).handler(
    request(`/plugins/${PLUGIN}/hwstats`),
    res,
  )
  assert.equal(res.status, 200)
  const body = JSON.parse(res.body.toString('utf8'))
  // Memory and uptime come from `os`, so they are always present.
  assert.ok(body.memory.totalBytes > 0, 'expected a total memory figure')
  assert.ok(body.memory.usedBytes >= 0 && body.memory.usedBytes <= body.memory.totalBytes)
  assert.ok(Number.isFinite(body.uptimeSec) && body.uptimeSec >= 0)
  assert.ok(typeof body.at === 'string' && body.at.length > 0)
  // CPU needs a delta window; the first call in a fresh process may not have one.
  assert.ok(body.cpu === null || (body.cpu.usage >= 0 && body.cpu.usage <= 100))
  // A missing source must be null *and* declared, never reported as zero.
  assert.equal(body.gpu === null, body.sources.gpu !== 'ok')
  assert.equal(body.perfMode === null, body.sources.perfMode !== 'ok')
  assert.equal(body.fans === null, body.sources.sensors !== 'ok')
  assert.ok(body.disks === null || Array.isArray(body.disks))
  for (const disk of body.disks ?? []) {
    assert.ok(disk.totalBytes > 0 && disk.usedBytes >= 0 && disk.usedBytes <= disk.totalBytes)
  }
  // The phantom EC fan slot must never reach the float, whatever the machine
  // reports — a fan reading 0 has no sensible rendering in a spinning-blade card.
  for (const fan of body.fans ?? []) {
    assert.notEqual(String(fan.name).trim().toLowerCase(), 'mid', 'hidden fans must be dropped')
  }
  // Every disk temperature must be marked, because the client numbers those rows
  // and would otherwise repeat one label per drive.
  const diskTemps = (body.temperatures ?? []).filter((t) => t.kind === 'disk')
  const diskGroups = diskTemps.map((t) => t.group)
  assert.equal(new Set(diskGroups).size, diskGroups.length, 'one temperature row per drive')
})

test('the hardware route refuses a cross-origin reader', async () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  await findRouteByPath(routes, `/plugins/${PLUGIN}/hwstats`).handler(
    request(`/plugins/${PLUGIN}/hwstats`, { origin: 'https://example.com', host: '127.0.0.1:1' }),
    res,
  )
  assert.equal(res.status, 403)
})

/** Independent oracle for the volume list: probe the letters here, not via the plugin. */
function probeMounts() {
  const found = []
  for (let code = 65; code <= 90; code += 1) {
    const mount = String.fromCharCode(code) + ':'
    try {
      if (statfsSync(`${mount}\\`).blocks > 0) found.push(mount)
    } catch {
      /* absent */
    }
  }
  return found
}

test('every mounted volume is reported, not a hardcoded pair', async () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  await findRouteByPath(routes, `/plugins/${PLUGIN}/hwstats`).handler(
    request(`/plugins/${PLUGIN}/hwstats`),
    res,
  )
  const body = JSON.parse(res.body.toString('utf8'))
  const mounts = (body.disks ?? []).map((disk) => disk.mount)

  // The regression this guards: a hardcoded ['C:', 'D:'] silently hid the F: and
  // H: volumes present on this machine. Comparing against an independent probe
  // keeps the assertion honest on any machine, including one with no letters.
  assert.deepEqual(mounts, probeMounts(), 'the reported volumes must match the mounted ones')
  assert.equal(new Set(mounts).size, mounts.length, 'no volume may be listed twice')
  assert.deepEqual(mounts, [...mounts].sort(), 'volumes come back in drive-letter order')
})

test('an explicit drive list overrides discovery', async () => {
  const mine = probeMounts()
  if (mine.length === 0) return // no drive letters to name on this machine
  const { ctx, routes } = harness()
  apply(ctx, { hw: { drives: [mine[0]] } })
  const res = response()
  await findRouteByPath(routes, `/plugins/${PLUGIN}/hwstats`).handler(
    request(`/plugins/${PLUGIN}/hwstats`),
    res,
  )
  const body = JSON.parse(res.body.toString('utf8'))
  assert.deepEqual((body.disks ?? []).map((disk) => disk.mount), [mine[0]])
})

test('an explicitly disabled config registers nothing', () => {
  const { ctx, routes } = harness()
  apply(ctx, { enabled: false })
  assert.deepEqual(routes, [])
})

test('the manifest route serves the generated registry', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  findRoute(routes, 'exact').handler(request(`/plugins/${PLUGIN}/manifest`), res)

  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'], /application\/json/)
  const body = JSON.parse(res.body.toString('utf8'))
  assert.equal(body.version, 1)
  assert.match(body.revision, /^[0-9a-f]{12}$/)
  assert.ok(body.files['avatar.webp'], 'avatar.webp must be in the registry')
  assert.ok(body.files['hero.webp'], 'hero.webp must be in the registry')
  assert.equal(body.floatFrameMs, 336)
  assert.ok(
    Object.keys(body.files).some((name) => name.startsWith('float/')),
    'the float clip must be in the registry',
  )
})

test('a registered asset is served as image bytes', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  findRoute(routes, 'prefix').handler(request(`/plugins/${PLUGIN}/asset/avatar.webp`), res)

  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'image/webp')
  assert.equal(res.headers['content-length'], res.body.length)
  assert.ok(res.body.length > 1000, 'expected real image bytes')
  // WebP magic: RIFF....WEBP
  assert.equal(res.body.subarray(0, 4).toString('ascii'), 'RIFF')
  assert.equal(res.body.subarray(8, 12).toString('ascii'), 'WEBP')
})

test('a nested float frame is served', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  if (!existsSync(join(ROOT, 'assets', 'files', 'float', '000.webp'))) {
    assert.fail('run tools/build-assets.py first')
  }
  const res = response()
  findRoute(routes, 'prefix').handler(request(`/plugins/${PLUGIN}/asset/float/000.webp`), res)
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'image/webp')
})

test('an unregistered name is refused even when the file exists', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const handler = findRoute(routes, 'prefix').handler

  // Plant a real, readable image inside files/ that the registry does not list.
  // This is the property that keeps the route from becoming a general file
  // reader: authorisation is the registry lookup, not the filesystem.
  const probe = join(ROOT, 'assets', 'files', '_unregistered-probe.webp')
  try {
    writeFileSync(probe, readFileSync(join(ROOT, 'assets', 'files', 'avatar.webp')))
    assert.ok(existsSync(probe), 'probe file must exist for this test to mean anything')

    const planted = response()
    handler(request(`/plugins/${PLUGIN}/asset/_unregistered-probe.webp`), planted)
    assert.equal(planted.status, 404, 'an unlisted file must not be served')
  } finally {
    rmSync(probe, { force: true })
  }

  const missing = response()
  handler(request(`/plugins/${PLUGIN}/asset/does-not-exist.webp`), missing)
  assert.equal(missing.status, 404)
})

test('encoded traversal never reaches the filesystem', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const handler = findRoute(routes, 'prefix').handler

  for (const url of [
    `/plugins/${PLUGIN}/asset/..%2Findex.json`,
    `/plugins/${PLUGIN}/asset/%2e%2e%2findex.json`,
    `/plugins/${PLUGIN}/asset/float%2F..%2F..%2Findex.json`,
  ]) {
    const res = response()
    handler(request(url), res)
    assert.equal(res.status, 404, `expected 404 for ${url}`)
  }
})

test('a path outside the asset prefix is not served', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const handler = findRoute(routes, 'prefix').handler
  const res = response()
  handler(request(`/plugins/${PLUGIN}/asset/../../index.json`), res)
  assert.equal(res.status, 404)
})

test('a cross-origin reader is refused', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const handler = findRoute(routes, 'prefix').handler
  const res = response()
  handler(
    request(`/plugins/${PLUGIN}/asset/avatar.webp`, {
      host: '127.0.0.1:19387',
      origin: 'http://evil.example',
    }),
    res,
  )
  assert.equal(res.status, 403)
})

test('a same-origin reader is allowed', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  findRoute(routes, 'prefix').handler(
    request(`/plugins/${PLUGIN}/asset/avatar.webp`, {
      host: '127.0.0.1:19387',
      origin: 'http://127.0.0.1:19387',
    }),
    res,
  )
  assert.equal(res.status, 200)
})

const INDEX_PATH = join(ROOT, 'assets', 'index.json')

test('a rebuilt registry is served without reactivating the plugin', () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const handler = findRoute(routes, 'exact').handler

  const original = readFileSync(INDEX_PATH, 'utf8')
  try {
    const before = response()
    handler(request(`/plugins/${PLUGIN}/manifest`), before)
    const previous = JSON.parse(before.body.toString('utf8'))

    const rebuilt = JSON.parse(original)
    rebuilt.revision = 'deadbeefcafe'
    rebuilt.files['rebuilt-probe.webp'] = { type: 'image/webp' }
    writeFileSync(INDEX_PATH, JSON.stringify(rebuilt))
    // Guard against same-millisecond writes defeating the mtime memo.
    const future = new Date(Date.now() + 5000)
    utimesSync(INDEX_PATH, future, future)

    const after = response()
    handler(request(`/plugins/${PLUGIN}/manifest`), after)
    const served = JSON.parse(after.body.toString('utf8'))

    // Regression: the parsed registry used to be captured when the plugin
    // activated, so regenerating the artwork left the running host serving the
    // previous manifest — a fresh backdrop stayed invisible until a restart.
    assert.notEqual(served.revision, previous.revision, 'the rebuilt manifest must be served')
    assert.ok(served.files['rebuilt-probe.webp'], 'new artwork must appear without a restart')
  } finally {
    writeFileSync(INDEX_PATH, original)
  }
})

test('an unavailable registry answers 503 instead of skipping activation', () => {
  const hidden = `${INDEX_PATH}.test-hidden`
  renameSync(INDEX_PATH, hidden)
  try {
    const { ctx, routes, errors } = harness()
    apply(ctx, {})
    assert.deepEqual(errors, [], 'activation must not depend on the artwork existing')
    assert.equal(routes.length, 3, 'routes must still be registered')

    const res = response()
    findRouteByPath(routes, `/plugins/${PLUGIN}/manifest`).handler(
      request(`/plugins/${PLUGIN}/manifest`),
      res,
    )
    assert.equal(res.status, 503)
  } finally {
    renameSync(hidden, INDEX_PATH)
  }
})

test('the generated registry matches the files actually on disk', async () => {
  const { ctx, routes } = harness()
  apply(ctx, {})
  const res = response()
  findRouteByPath(routes, `/plugins/${PLUGIN}/manifest`).handler(
    request(`/plugins/${PLUGIN}/manifest`),
    res,
  )
  const body = JSON.parse(res.body.toString('utf8'))

  const handler = findRoute(routes, 'prefix').handler
  for (const name of Object.keys(body.files)) {
    const probe = response()
    handler(request(`/plugins/${PLUGIN}/asset/${name}`), probe)
    assert.equal(probe.status, 200, `${name} is registered but not servable`)
  }
})
