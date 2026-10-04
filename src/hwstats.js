// Hardware telemetry for the status float.
//
// Contract: every field is best-effort and read-only. A source that is not
// available yields `null` (and says why in `sources`) — never a fabricated zero.
// The float renders "未接入" for those, because a made-up reading is worse than
// an honest gap. That is the same rule dsh-pet applies to balances it cannot
// query.
//
// What each source can and cannot reach on a normal Windows laptop:
//
//   CPU / memory / uptime   os.*                always available, no spawn
//   disk capacity           fs.statfsSync       always available, no spawn
//   GPU                     nvidia-smi          NVIDIA only, one short spawn
//   performance mode        powercfg            always available, one short spawn
//   fan RPM / drive temps   LibreHardwareMonitor WMI   *only if LHM is running*
//
// There is deliberately no "decibels" reading: consumer PCs have no sound-level
// sensor, so any number here would be invented.

import { execFile } from 'node:child_process'
import { statfsSync } from 'node:fs'
import { cpus, freemem, totalmem, uptime } from 'node:os'

const EXEC_TIMEOUT_MS = 4000
/** A CPU delta shorter than this per core is noise, not a measurement. */
const MIN_CPU_WINDOW_MS = 200
/** GPU numbers move slowly enough that a one-second memo removes burst duplication. */
const GPU_TTL_MS = 1000
/** Switching performance mode is rare; re-reading it often just spawns processes. */
const PERF_TTL_MS = 30000
/** LHM is polled through PowerShell, so it gets a longer interval than the cheap sources. */
const LHM_TTL_MS = 5000
/** How long a discovered volume list is reused before probing the letters again. */
const DRIVE_TTL_MS = 30000
/**
 * Fan names the EC reports but the chassis does not have. This ASUS TUF lists a
 * "Mid" fan that reads 0 forever; a widget built around spinning blades has no
 * sensible rendering for a fan that never turns.
 */
const DEFAULT_HIDDEN_FANS = ['Mid']

/**
 * Run a program and capture stdout. Never rejects: an absent binary, a timeout
 * or a non-zero exit all resolve to `null` so a missing optional tool cannot
 * fail a telemetry request.
 * @param {string} file - executable path or name.
 * @param {string[]} args - arguments.
 * @param {number} [timeout] - kill deadline in ms.
 * @returns {Promise<string|null>} stdout, or null when unavailable.
 */
function run(file, args, timeout = EXEC_TIMEOUT_MS) {
  return new Promise((resolve) => {
    try {
      execFile(file, args, { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (error, stdout) => {
        resolve(error ? null : String(stdout))
      })
    } catch {
      resolve(null)
    }
  })
}

/**
 * One cumulative CPU-times snapshot.
 * @returns {{idle: number, total: number, cores: number, model: string}} sample.
 */
function sampleCpu() {
  const list = cpus()
  let idle = 0
  let total = 0
  for (const core of list) {
    const times = core?.times ?? {}
    for (const value of Object.values(times)) total += Number(value) || 0
    idle += Number(times.idle) || 0
  }
  return { idle, total, cores: list.length, model: String(list[0]?.model ?? '').trim() }
}

// Primed at import so the first request already has a window to difference
// against instead of reporting nothing for its first tick.
let lastCpu = sampleCpu()

/**
 * CPU load over the window since the previous call.
 * @returns {{usage: number, cores: number, model: string}|null} null while the window is too short.
 */
function cpuUsage() {
  const now = sampleCpu()
  const prev = lastCpu
  lastCpu = now
  const deltaTotal = now.total - prev.total
  const deltaIdle = now.idle - prev.idle
  // Guard against a sub-millisecond window (two polls in the same tick): the
  // ratio of two near-zero numbers is meaningless, not merely imprecise.
  if (!(deltaTotal > 0)) return null
  if (deltaTotal < now.cores * MIN_CPU_WINDOW_MS) return null
  const usage = (1 - deltaIdle / deltaTotal) * 100
  return {
    usage: Math.max(0, Math.min(100, usage)),
    cores: now.cores,
    model: now.model,
  }
}

/**
 * Physical memory as Windows reports it (free here means *available*).
 * @returns {{usedBytes: number, freeBytes: number, totalBytes: number}} memory.
 */
function memory() {
  const total = totalmem()
  const free = freemem()
  return { usedBytes: total - free, freeBytes: free, totalBytes: total }
}

let driveMemo = { at: 0, letters: null }

/**
 * Every mounted volume, found by probing A:-Z:.
 *
 * A hardcoded letter list silently hid real volumes: this machine has C:, D:,
 * F: and H:, and a list of `['C:', 'D:']` showed half of them. Probing all 26
 * letters costs nothing measurable (0 ms for the whole sweep on a machine with
 * four fixed disks), so discovery is the default and `config.drives` is only an
 * override.
 *
 * The list is memoised briefly: a mapped-but-offline network drive can make its
 * own probe slow, and re-walking the alphabet on every 2 s poll would pay that
 * cost each time. A volume plugged in later still appears within DRIVE_TTL_MS.
 * @param {number} now - current epoch ms.
 * @returns {string[]} mount points, in drive-letter order.
 */
function driveLetters(now) {
  if (driveMemo.letters && now - driveMemo.at < DRIVE_TTL_MS) return driveMemo.letters
  const letters = []
  for (let code = 65; code <= 90; code += 1) {
    const mount = String.fromCharCode(code) + ':'
    try {
      const stats = statfsSync(`${mount}\\`)
      if (stats.blocks > 0) letters.push(mount)
    } catch {
      /* no such volume */
    }
  }
  driveMemo = { at: now, letters }
  return letters
}

/**
 * Capacity of each mounted volume.
 * @param {string[]} [letters] - explicit override; omitted means discover.
 * @param {number} [now] - current epoch ms.
 * @returns {Array<{mount: string, usedBytes: number, freeBytes: number, totalBytes: number}>|null} null when none answered.
 */
function disks(letters, now = Date.now()) {
  const configured = Array.isArray(letters)
    ? letters.filter((entry) => typeof entry === 'string' && /^[A-Za-z]:$/.test(entry.trim()))
    : []
  const wanted = configured.length > 0
    ? configured.map((entry) => entry.trim().toUpperCase())
    : driveLetters(now)
  const found = []
  for (const mount of wanted) {
    try {
      const stats = statfsSync(`${mount}\\`)
      const total = stats.blocks * stats.bsize
      const free = stats.bavail * stats.bsize
      if (!Number.isFinite(total) || total <= 0) continue
      found.push({ mount, usedBytes: total - free, freeBytes: free, totalBytes: total })
    } catch {
      /* volume went away between discovery and this read */
    }
  }
  return found.length > 0 ? found : null
}

let gpuMemo = { at: 0, value: null, probed: false }

/**
 * First GPU via nvidia-smi. Absent on non-NVIDIA machines, which is not an error.
 * @param {number} now - current epoch ms.
 * @returns {Promise<object|null>} GPU reading or null.
 */
async function gpu(now) {
  if (gpuMemo.probed && now - gpuMemo.at < GPU_TTL_MS) return gpuMemo.value
  const out = await run('nvidia-smi', [
    '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
    '--format=csv,noheader,nounits',
  ])
  let value = null
  const line = out?.split(/\r?\n/).find((row) => row.trim() !== '')
  if (line) {
    const parts = line.split(',').map((part) => part.trim())
    if (parts.length >= 5) {
      const numbers = parts.slice(1, 5).map((part) => Number(part))
      if (numbers.every((n) => Number.isFinite(n))) {
        value = {
          name: parts[0],
          usage: numbers[0],
          memoryUsedMB: numbers[1],
          memoryTotalMB: numbers[2],
          temperatureC: numbers[3],
        }
      }
    }
  }
  gpuMemo = { at: now, value, probed: true }
  return value
}

let perfMemo = { at: 0, value: null }

/**
 * Active Windows power scheme, which is what ASUS keeps in step with its
 * Armoury Crate performance mode (Silent / Performance / Turbo / PD_Turbo).
 * @param {number} now - current epoch ms.
 * @returns {Promise<string|null>} scheme name or null.
 */
async function perfMode(now) {
  if (now - perfMemo.at < PERF_TTL_MS) return perfMemo.value
  const out = await run('powercfg', ['/getactivescheme'])
  let value = null
  if (out) {
    // Localised output looks like: 电源方案 GUID: <guid>  (Turbo) *
    // The trailing marker is not part of the name, so take the last group.
    const groups = [...out.matchAll(/\(([^)]+)\)/g)]
    if (groups.length > 0) value = groups[groups.length - 1][1].trim()
  }
  perfMemo = { at: now, value }
  return value
}

/**
 * Every PowerShell helper starts with this.
 *
 * Windows PowerShell 5.1 writes its redirected stdout in the console code page,
 * not UTF-8, so HWiNFO's Chinese sensor labels arrived as mojibake and the whole
 * temperature half was dropped — the fans survived only because "RPM" is ASCII.
 * Pinning the output encoding is what makes non-ASCII labels usable at all.
 */
const PS_UTF8_PREAMBLE = [
  "$ErrorActionPreference='Stop'",
  'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }',
].join('\n')

/** PowerShell that dumps LibreHardwareMonitor's fan and temperature sensors. */
const LHM_SCRIPT = [
  PS_UTF8_PREAMBLE,
  "foreach ($ns in @('root/LibreHardwareMonitor','root/OpenHardwareMonitor')) {",
  '  try {',
  '    $s = Get-CimInstance -Namespace $ns -ClassName Sensor',
  "    $s | Where-Object { $_.SensorType -eq 'Fan' -or $_.SensorType -eq 'Temperature' } |",
  "      Select-Object @{n='kind';e={$_.SensorType}},@{n='name';e={$_.Name}},@{n='id';e={$_.Identifier}},@{n='value';e={[double]$_.Value}} |",
  '      ConvertTo-Json -Compress',
  '    exit 0',
  '  } catch { }',
  '}',
  'exit 3',
].join('\n')

let lhmMemo = { at: 0, value: null, probed: false }

/**
 * Fan and temperature sensors from LibreHardwareMonitor / OpenHardwareMonitor,
 * if either is running. Their WMI provider is the only practical way to reach
 * fan RPM and NVMe drive temperatures on a Windows laptop — the plain Win32
 * classes return nothing for both.
 * @param {number} now - current epoch ms.
 * @returns {Promise<{fans: object[]|null, temperatures: object[]|null, available: boolean}>} sensors.
 */
async function lhmSensors(now) {
  if (lhmMemo.probed && now - lhmMemo.at < LHM_TTL_MS) return lhmMemo.value
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LHM_SCRIPT], 8000)
  let value = { fans: null, temperatures: null, available: false }
  if (out) {
    try {
      const parsed = JSON.parse(out.trim())
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      const fans = []
      const temperatures = []
      for (const row of rows) {
        const name = String(row?.name ?? '').trim()
        const value = Number(row?.value)
        if (name === '' || !Number.isFinite(value)) continue
        // The identifier carries the hardware path, e.g.
        // /nvme/0/temperature/0 or /lpc/nct6798d/fan/1 — far more useful as a
        // label than the generic "Fan #1"/"Temperature".
        const id = String(row?.id ?? '')
        const entry = { name, value, id }
        if (String(row?.kind) === 'Fan') fans.push(entry)
        else temperatures.push(entry)
      }
      value = {
        fans: fans.length > 0 ? fans : null,
        temperatures: temperatures.length > 0 ? temperatures : null,
        available: fans.length > 0 || temperatures.length > 0,
      }
    } catch {
      /* Not our JSON: treat the provider as unusable rather than guessing. */
    }
  }
  lhmMemo = { at: now, value, probed: true }
  return value
}

/**
 * HWiNFO's "Gadget" feature mirrors every sensor the user selected into this
 * registry key. That is a published integration point — Rainmeter and similar
 * tools read it the same way — and it needs nothing from us: a plain registry
 * read, no elevation, no driver.
 *
 * This is the fallback for machines where the vendor WMI interface publishes no
 * instances (this ASUS TUF A16 is one): HWiNFO ships the driver knowledge
 * instead, and hands the result over in a form any program can consume.
 * @see https://docs.rainmeter.net/tips/hwinfo/
 */
const HWINFO_KEY = 'HKCU:\\Software\\HWiNFO64\\VSB'

const HWINFO_SCRIPT = [
  PS_UTF8_PREAMBLE,
  'try {',
  `  $k = Get-Item -Path '${HWINFO_KEY}'`,
  '  $k.GetValueNames() | ForEach-Object {',
  '    [pscustomobject]@{ name = $_; value = $k.GetValue($_) }',
  '  } | ConvertTo-Json -Compress',
  '} catch { exit 3 }',
].join('\n')

/**
 * Labels that name a fan or a temperature, in both languages HWiNFO may show —
 * the label follows the UI language, which is why it is only the *fallback*.
 */
const FAN_LABEL_RE = /fan|rpm|风扇|風扇|风机|風機|转速|轉速/i
const TEMP_LABEL_RE = /temp|温度|溫度/i

/**
 * The formatted value carries its own unit, and units are not localised: the
 * Chinese UI still shows `2450 RPM` and `41.0 °C`. That makes the unit a more
 * trustworthy signal than the label, so it decides the bucket first.
 */
const FAN_UNIT_RE = /rpm|转\s*\/\s*分|轉\s*\/\s*分/i
const TEMP_UNIT_RE = /°\s*[cf]|℃|摄氏|攝氏|华氏|華氏/i

/**
 * Reduce HWiNFO's sensor group to something that fits beside a label.
 * `S.M.A.R.T.: SHGP31-1000GM (KDCCN…) [D:, F:, H:]` becomes `SHGP31-1000GM`.
 * Only used to tell repeated labels apart, so it need not be pretty in general.
 */
function shortGroup(value) {
  const text = String(value ?? '').trim()
  if (text === '') return ''
  return text.replace(/^[^:]*:\s*/, '').split('(')[0].split('[')[0].trim()
}

/**
 * Two NVMe drives both report `磁盘温度` and `磁盘温度 2`. Bucketed by label alone
 * the float would show four rows the user cannot tell apart, so a repeated name
 * gains its group tag. Unique labels stay short.
 */
function disambiguate(entries) {
  const counts = new Map()
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  // Ambiguity is a property of the group, not of one row: SHGP31 publishes
  // "磁盘温度", "磁盘温度 2" and "磁盘温度 3", and only the first two repeat
  // across drives. Naming just those leaves a bare "磁盘温度 3" beside two named
  // siblings, so once any row of a group needs naming, all of them get it.
  const ambiguous = new Set()
  for (const entry of entries) {
    if (counts.get(entry.name) > 1 && entry.group !== '') ambiguous.add(entry.group)
  }
  for (const entry of entries) {
    if (entry.group === '') continue
    if (counts.get(entry.name) > 1 || ambiguous.has(entry.group)) {
      entry.name = `${entry.name} · ${entry.group}`
    }
  }
  return entries
}

/**
 * Does this temperature come from a drive?
 *
 * HWiNFO groups drive sensors under "S.M.A.R.T.: <model>", which survives
 * localisation, so that prefix is the primary test; the label is the fallback.
 */
function isDriveSource(name, rawGroup) {
  if (/^\s*s\.m\.a\.r\.t\./i.test(String(rawGroup ?? ''))) return true
  return /磁盘|硬盘|drive|ssd|nvme/i.test(String(name ?? ''))
}

/**
 * Keep one temperature per drive.
 *
 * Two drives reporting five rows between them is noise in a small readout, and
 * the extra sensors (second/third thermistor) add nothing a glance can use. The
 * first entry of each drive survives, which is the primary "磁盘温度".
 * Only drives are collapsed — a GPU publishing a core and a hotspot temperature
 * keeps both.
 */
function onePerDrive(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    if (entry.kind !== 'disk') return true
    const key = entry.group === '' ? entry.id : entry.group
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Pair HWiNFO's `Sensor<i>` / `Label<i>` / `Value<i>` / `ValueRaw<i>` groups into
 * readings.
 *
 * Deliberately generic: the values are enumerated rather than assumed, so a
 * naming variant shows up as a missing row instead of a wrong number. A group
 * that cannot be classified is skipped, never guessed into a bucket.
 * @param {object[]} rows - `{name, value}` for every value under the key.
 * @returns {{fans: object[]|null, temperatures: object[]|null, available: boolean}} sensors.
 */
export function parseHwinfo(rows) {
  const groups = new Map()
  const labels = new Map()
  const raws = new Map()
  const formatted = new Map()
  for (const row of rows) {
    const match = String(row?.name ?? '').match(/^(Sensor|Label|ValueRaw|Value)(\d+)$/i)
    if (!match) continue
    const index = Number(match[2])
    const kind = match[1].toLowerCase()
    if (kind === 'sensor') groups.set(index, String(row.value ?? ''))
    else if (kind === 'label') labels.set(index, String(row.value ?? ''))
    else if (kind === 'valueraw') raws.set(index, Number(row.value))
    else {
      // Keep the text: it is the only place the unit survives.
      formatted.set(index, String(row.value ?? ''))
    }
  }
  const fans = []
  const temperatures = []
  const classify = (name, formattedText) => {
    const unit = String(formattedText ?? '')
    if (TEMP_UNIT_RE.test(unit)) return 'temperature'
    if (FAN_UNIT_RE.test(unit)) return 'fan'
    if (FAN_LABEL_RE.test(name)) return 'fan'
    if (TEMP_LABEL_RE.test(name)) return 'temperature'
    return null
  }
  const bucket = (name, value, formattedText, id, rawGroup) => {
    const kind = classify(name, formattedText)
    if (kind === null) return
    const entry = {
      name,
      value,
      id,
      group: shortGroup(rawGroup),
      // Drives expose several temperature sensors each (this machine's SHGP31
      // publishes three); the float wants one row per drive. The *raw* group is
      // what identifies a SMART source — shortGroup has already stripped its
      // "S.M.A.R.T." prefix by the time it lands on the entry.
      kind: kind === 'temperature' && isDriveSource(name, rawGroup) ? 'disk' : kind,
    }
    if (kind === 'fan') fans.push(entry)
    else temperatures.push(entry)
  }
  for (const [index, label] of labels) {
    const name = label.trim()
    if (name === '') continue
    // ValueRaw is the numeric form; Value is the formatted string, which is not
    // reliably parseable — HWiNFO writes "5,000 RPM" with a thousands separator.
    const text = formatted.get(index)
    const raw = raws.has(index) ? raws.get(index) : Number(text)
    if (!Number.isFinite(raw)) continue
    bucket(name, raw, text, 'hwinfo/' + index, groups.get(index))
  }
  // Fallback layout: no `Label<i>` values at all, so the value NAME is the
  // label. The two shapes are mutually exclusive, so this cannot double-count —
  // and covering both means the first run works whichever one HWiNFO writes.
  if (labels.size === 0) {
    for (const row of rows) {
      const name = String(row?.name ?? '').trim()
      const value = Number(row?.value)
      if (name === '' || !Number.isFinite(value)) continue
      bucket(name, value, '', 'hwinfo/' + name, '')
    }
  }
  return {
    fans: fans.length > 0 ? disambiguate(fans) : null,
    temperatures: temperatures.length > 0 ? disambiguate(onePerDrive(temperatures)) : null,
    available: fans.length > 0 || temperatures.length > 0,
  }
}

let hwinfoMemo = { at: 0, value: null, probed: false }

/**
 * Sensors mirrored by a running HWiNFO Gadget.
 * @param {number} now - current epoch ms.
 * @returns {Promise<{fans: object[]|null, temperatures: object[]|null, available: boolean}>} sensors.
 */
async function hwinfoSensors(now) {
  if (hwinfoMemo.probed && now - hwinfoMemo.at < LHM_TTL_MS) return hwinfoMemo.value
  const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', HWINFO_SCRIPT], 8000)
  let value = { fans: null, temperatures: null, available: false }
  if (out) {
    try {
      const parsed = JSON.parse(out.trim())
      value = parseHwinfo(Array.isArray(parsed) ? parsed : [parsed])
    } catch {
      /* Not our shape: report nothing rather than a guess. */
    }
  }
  hwinfoMemo = { at: now, value, probed: true }
  return value
}

/**
 * Fan and temperature sensors, from whichever monitor is actually running.
 *
 * Neither path is guaranteed: this machine's ASUS WMI class publishes no
 * instance, and the plain Win32 classes return nothing for fan RPM or NVMe
 * temperature. Every option here is a helper program that ships the model
 * knowledge; when none is present the float says 未接入 instead of inventing a
 * reading.
 * @param {number} now - current epoch ms.
 * @returns {Promise<{fans: object[]|null, temperatures: object[]|null, available: boolean, via: string|null}>} sensors.
 */
async function sensors(now) {
  const lhm = await lhmSensors(now)
  if (lhm.available) return { ...lhm, via: 'LibreHardwareMonitor' }
  const hwinfo = await hwinfoSensors(now)
  if (hwinfo.available) return { ...hwinfo, via: 'HWiNFO' }
  return { fans: null, temperatures: null, available: false, via: null }
}

/**
 * Read every available hardware source.
 * @param {object} [config] - plugin config; `drives` overrides the probed letters,
 *   `hideFans` overrides the fan names to drop.
 * @returns {Promise<object>} telemetry payload.
 */
export async function readHardwareStats(config = {}) {
  const now = Date.now()
  const [gpuReading, mode, sensorReading] = await Promise.all([gpu(now), perfMode(now), sensors(now)])
  // This machine's EC publishes a "Mid" fan slot that has no fan behind it: it
  // reads 0 forever, and a fan that never turns is noise in a readout built
  // around spinning blades. Overridable, because it is a per-chassis fact.
  const hideFans = Array.isArray(config?.hideFans) ? config.hideFans : DEFAULT_HIDDEN_FANS
  const hidden = new Set(
    hideFans.map((name) => String(name).trim().toLowerCase()).filter((name) => name !== ''),
  )
  const fans = (sensorReading.fans ?? []).filter(
    (fan) => !hidden.has(String(fan.name).trim().toLowerCase()),
  )
  return {
    at: new Date(now).toISOString(),
    cpu: cpuUsage(),
    memory: memory(),
    gpu: gpuReading,
    disks: disks(config?.drives, now),
    perfMode: mode,
    uptimeSec: Math.round(uptime()),
    fans: fans.length > 0 ? fans : null,
    temperatures: sensorReading.temperatures,
    // The client needs to distinguish "no reading yet" from "this machine has no
    // such sensor", so the reason travels with the payload.
    sources: {
      gpu: gpuReading ? 'ok' : 'unavailable',
      perfMode: mode ? 'ok' : 'unavailable',
      sensors: sensorReading.available ? 'ok' : 'unavailable',
    },
    // Which helper supplied the sensors, so the float can name it instead of
    // just claiming they are missing.
    sensorsVia: sensorReading.via,
  }
}

export function resetCaches() {
  lastCpu = sampleCpu()
  driveMemo = { at: 0, letters: null }
  gpuMemo = { at: 0, value: null, probed: false }
  perfMemo = { at: 0, value: null }
  lhmMemo = { at: 0, value: null, probed: false }
  hwinfoMemo = { at: 0, value: null, probed: false }
}
