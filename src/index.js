// Host half of dsh-whale-decor.
//
// All presentation lives in lib/client.js; this half exists only to make the
// generated artwork reachable from the page, plus the manifest the client uses
// to discover the float-frame list and the build revision.
//
// Security boundary: a request may only name a file that appears in
// assets/index.json. The registry lookup happens before any filesystem call, so
// the URL cannot steer a read outside assets/files — there is no path joining of
// untrusted input.

import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readHardwareStats } from './hwstats.js'

export const name = 'dsh-whale-decor'
export const inject = []

const PLUGIN = 'dsh-whale-decor'
const ASSET_PREFIX = `/plugins/${PLUGIN}/asset`
const MANIFEST_PATH = `/plugins/${PLUGIN}/manifest`
const HWSTATS_PATH = `/plugins/${PLUGIN}/hwstats`

const ASSET_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const FILE_ROOT = join(ASSET_ROOT, 'files')
const INDEX_PATH = join(ASSET_ROOT, 'index.json')

function sendJson(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': bytes.length,
  })
  res.end(bytes)
}

// Decorative artwork is not secret; the allowlist above is what actually
// protects the filesystem. This only refuses a cross-origin reader, and a
// same-origin GET legitimately sends no Origin header at all.
function sameOrigin(req) {
  const origin = req.headers?.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

// Read per request, memoised by mtime only. Caching the parsed registry for the
// lifetime of the activation looked harmless and was not: rebuilding the artwork
// left the running host serving the previous manifest, so a fresh backdrop was
// invisible until DSH restarted. Decoration assets get rebuilt often.
let cached = { stamp: null, registry: null }

function readRegistry() {
  let stamp
  try {
    stamp = statSync(INDEX_PATH).mtimeMs
  } catch {
    return null
  }
  if (cached.stamp === stamp && cached.registry) return cached.registry
  try {
    const manifest = JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
    const files = manifest?.files
    if (!files || typeof files !== 'object') return null
    const types = new Map()
    for (const [asset, meta] of Object.entries(files)) {
      types.set(asset, typeof meta?.type === 'string' ? meta.type : 'application/octet-stream')
    }
    cached = { stamp, registry: { manifest, types } }
    return cached.registry
  } catch {
    return null
  }
}

function assetName(req) {
  let pathname
  try {
    pathname = new URL(req.url ?? '', 'http://dsh.local').pathname
  } catch {
    return null
  }
  if (!pathname.startsWith(ASSET_PREFIX)) return null
  const rest = pathname.slice(ASSET_PREFIX.length).replace(/^\/+/, '')
  if (!rest) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return null
  }
}

function createManifestHandler() {
  return (req, res) => {
    try {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'cross-origin request refused' })
      const registry = readRegistry()
      if (!registry) return sendJson(res, 503, { error: 'asset registry unavailable' })
      sendJson(res, 200, registry.manifest)
    } catch {
      sendJson(res, 500, { error: 'manifest unavailable' })
    }
  }
}

function createAssetHandler() {
  return (req, res) => {
    try {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'cross-origin request refused' })
      const name = assetName(req)
      if (!name || name.includes('..') || name.includes('\\')) {
        return sendJson(res, 404, { error: 'unknown asset' })
      }
      // Registry hit is the authorisation; only then does a path exist.
      const registry = readRegistry()
      const type = registry?.types.get(name)
      if (!type) return sendJson(res, 404, { error: 'unknown asset' })
      let bytes
      try {
        bytes = readFileSync(join(FILE_ROOT, name))
      } catch {
        return sendJson(res, 404, { error: 'asset unavailable' })
      }
      res.writeHead(200, {
        'content-type': type,
        'cache-control': 'public, max-age=86400',
        'content-length': bytes.length,
      })
      res.end(bytes)
    } catch {
      // Never let a decoration request take the HTTP carrier down.
      try {
        sendJson(res, 500, { error: 'asset request failed' })
      } catch {
        /* response already gone */
      }
    }
  }
}

function createHwStatsHandler(config) {
  return async (req, res) => {
    try {
      if (!sameOrigin(req)) return sendJson(res, 403, { error: 'cross-origin request refused' })
      // Reading is entirely local: os/fs plus at most three short-lived helper
      // processes (nvidia-smi, powercfg, and PowerShell only when a hardware
      // monitor is running). Nothing here touches the network.
      sendJson(res, 200, await readHardwareStats(config?.hw))
    } catch {
      // A telemetry failure must never take the carrier down; the float just
      // shows its last values.
      try {
        sendJson(res, 500, { error: 'hardware stats unavailable' })
      } catch {
        /* response already gone */
      }
    }
  }
}

export function apply(ctx, config = {}) {
  if (config?.enabled === false) return
  if (typeof ctx.inject !== 'function') {
    const logger = ctx.logger ?? console
    logger.error?.(`[${PLUGIN}] this host exposes no ctx.inject; asset routes not registered.`)
    return
  }
  // Routes are registered unconditionally and resolve the registry per request.
  // Bailing out here when index.json was missing meant a plugin that activated
  // before its artwork was generated never served anything, even afterwards.
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.register({
        kind: 'exact',
        path: MANIFEST_PATH,
        handler: createManifestHandler(),
      }),
      `${PLUGIN}: asset manifest`,
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({
        kind: 'prefix',
        path: ASSET_PREFIX,
        handler: createAssetHandler(),
      }),
      `${PLUGIN}: asset bytes`,
    )
    httpCtx.effect(
      () => httpCtx.webServer.register({
        kind: 'exact',
        path: HWSTATS_PATH,
        handler: createHwStatsHandler(config),
      }),
      `${PLUGIN}: hardware stats`,
    )
  })
}
