#!/usr/bin/env node
/**
 * A stand-in for the CarConfig API, enough to drive every screen of the brand embed window.
 *
 * Speaks the widget's real calls (embed validate/decode, variants, email-required, the v2 render
 * stream, quote request, lead, email-renders) and the backend's real refusal bodies, plus the
 * NEW fields the round 16 backend doc asks for (visitor_limit / visitor_used, details_required,
 * features.email_renders, limit/used on the stream). Which answer each call gets is set per test
 * through POST /__scenario; every request is logged at GET /__log.
 *
 * It answers CORS exactly as the real API does (middleware/cors.go): the same allow-list, which
 * does NOT name X-Visitor-ID unless the scenario says the backend has added it. Serve the test
 * page from the other port so the browser really preflights.
 *
 *   node tools/mock-backend.mjs [--api 3911] [--page 3910] [--assets <dir>] [--bundle <file>]
 *
 * <dir> holds orig.jpg, gold.jpg, bronze.jpg, black.jpg (renders) and wheel-*.png (finishes).
 * Dependency-free on purpose, like the other tools/ scripts.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)

  return i > -1 ? process.argv[i + 1] : fallback
}
const API_PORT = Number(arg('api', 3911))
const PAGE_PORT = Number(arg('page', 3910))
const ASSETS = resolve(arg('assets', 'test/assets'))
const BUNDLE = resolve(arg('bundle', 'dist/car-config-embed.iife.js'))
const PAGE = resolve(arg('pagefile', 'test/round16.html'))

const CORS_HEADERS = 'Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, X-Session-ID, X-Impersonate, Stripe-Signature, ngrok-skip-browser-warning'

const DEFAULT = {
  gate: { email_required: false, free_sessions_used: 0, free_sessions_limit: 3 },
  /** One entry per render, used in order; the last repeats. */
  renders: ['ok'],
  /** Milliseconds between stream events. */
  step: 150,
  /** Per-visitor limit, counted here as R1 would. null = no cap and no fields sent. */
  limit: null,
  quote: 'ok',
  lead: 'ok',
  emailRenders: 'ok',
  /** The backend added X-Visitor-ID to its CORS allow-list. */
  corsVisitor: false,
}

let scenario = { ...DEFAULT }
let used = 0
let renderCount = 0
let logId = 900
const log = []

const VARIANTS = [
  { id: '1', variant_name: 'Champagne', file: 'wheel-champagne.png', render: 'gold.jpg' },
  { id: '2', variant_name: 'Bronze', file: 'wheel-bronze.png', render: 'bronze.jpg' },
  { id: '3', variant_name: 'Satin Black', file: 'wheel-satin-black.png', render: 'black.jpg' },
]

const asset = (name) => `http://127.0.0.1:${API_PORT}/assets/${name}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', scenario.corsVisitor ? `${CORS_HEADERS}, X-Visitor-ID` : CORS_HEADERS)
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const readBody = (req) => new Promise((ok) => {
  const chunks = []

  req.on('data', (c) => chunks.push(c))
  req.on('end', () => ok(Buffer.concat(chunks)))
})

/** One multipart field's value, read straight off the raw body (enough for short text fields). */
const field = (raw, name) => {
  const m = new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(raw)

  return m ? m[1] : undefined
}

/** A JSON body for the log, with any images (megabytes of base64) replaced by how many there were. */
const summarize = (raw) => {
  try {
    const body = JSON.parse(raw)

    if (Array.isArray(body.images)) body.images = `${body.images.length} image(s)`

    return JSON.stringify(body)
  } catch {
    return raw.slice(0, 400)
  }
}

/** A refusal written as a status and body, e.g. "http:402:{\"error\":\"quota_exceeded\"}". */
function parseHttp(spec) {
  const [, status, ...rest] = spec.split(':')

  return { status: Number(status), body: rest.length ? JSON.parse(rest.join(':')) : {} }
}

async function renderStream(req, res, raw) {
  const spec = scenario.renders[Math.min(renderCount, scenario.renders.length - 1)]

  renderCount++
  const products = JSON.parse(field(raw, 'products') || '[]')
  const variant = VARIANTS.find((v) => Number(v.id) === products[0]?.variant_id) || VARIANTS[0]

  if (scenario.limit !== null && used >= scenario.limit) {
    return json(res, 429, { error: 'visitor_limit_reached', limit: scenario.limit, used, message: "You've hit your limit. Please come back later." })
  }
  if (spec.startsWith('http:')) {
    const { status, body } = parseHttp(spec)

    return json(res, status, body)
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  let open = true

  req.on('close', () => { open = false })
  const send = (event, data) => open && res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const usage = () => (scenario.limit === null ? {} : { limit: scenario.limit, used })

  send('started', { status: 'processing', ...usage() })
  await sleep(scenario.step)
  send('vehicle_detected', { make: 'Ferrari', model: 'F8 Tributo', year: '2020', vehicle_type: 'coupe' })
  await sleep(scenario.step)
  send('mask_started', { cached: renderCount > 1 })

  if (spec === 'hold') return // stays open: the loading screen, for as long as the test wants it
  if (spec.startsWith('sse-error:')) {
    await sleep(scenario.step)
    send('error', { message: spec.slice('sse-error:'.length) })

    return res.end()
  }
  if (spec === 'drop') return res.destroy()

  await sleep(scenario.step)
  send('mask_complete', { gate_passed: true, attempts: 1, duration_ms: 1, cached: renderCount > 1, sockets: 2 })
  send('fill_started', {})
  await sleep(scenario.step)
  send('composite_complete', { outside_change_pct: 2, residual_chroma_pct: 0, duration_ms: 1, outside_verdict: 'PASS', socket_px: 1, written_px: 1 })
  await sleep(scenario.step)
  if (!open) return
  used++
  send('complete', { image_b64: readFileSync(join(ASSETS, variant.render)).toString('base64'), ...usage() })
  send('recorded', { render_log_ids: [++logId] })
  res.end()
}

function respondWith(res, spec) {
  if (spec === 'ok') return json(res, 201, { success: true, data: { id: 1 } })
  if (spec === '401') return json(res, 401, { error: 'embed_session_not_bound', message: 'This preview has expired or was never opened. Open it again to continue.' })
  if (spec === '404') return json(res, 404, { success: false, error: 'manufacturer not found' })

  return json(res, 500, { success: false, error: 'Failed to capture lead' })
}

const api = createServer(async (req, res) => {
  cors(req, res)
  const url = new URL(req.url, `http://127.0.0.1:${API_PORT}`)
  const p = url.pathname

  if (req.method === 'OPTIONS') {
    const asked = (req.headers['access-control-request-headers'] || '').toLowerCase()

    log.push({ method: 'OPTIONS', path: p, asked })
    res.writeHead(204)

    return res.end()
  }

  const raw = (await readBody(req)).toString('latin1')

  log.push({
    method: req.method,
    path: p,
    query: url.search,
    session: req.headers['x-session-id'] || null,
    visitorHeader: req.headers['x-visitor-id'] || null,
    visitorField: field(raw, 'visitor_id') || null,
    body: req.headers['content-type']?.includes('json') ? summarize(raw) : undefined,
  })

  if (p === '/__scenario' && req.method === 'POST') {
    scenario = { ...DEFAULT, ...JSON.parse(raw || '{}') }
    used = scenario.used ?? 0
    renderCount = 0
    log.length = 0

    return json(res, 200, scenario)
  }
  if (p === '/__log') return json(res, 200, log)
  if (p.startsWith('/assets/')) {
    const f = join(ASSETS, p.slice('/assets/'.length))

    if (!existsSync(f)) return json(res, 404, {})
    res.writeHead(200, { 'Content-Type': extname(f) === '.png' ? 'image/png' : 'image/jpeg' })

    return res.end(readFileSync(f))
  }

  const wheel = {
    id: '101',
    name: 'P101',
    category: 'Wheels',
    manufacturer_id: 7,
    manufacturer: { id: 7, company_name: 'HRE Wheels' },
    reference_image_paths: [asset('crest.jpg')],
  }

  switch (p) {
    case '/api/v1/embed/validate': return json(res, 200, { valid: true, is_active: true, manufacturer_id: 7, wheel_id: 101 })
    case '/api/v1/embed/decode': return json(res, 200, { valid: true, manufacturer_id: 7, wheel, wrap: null, variant_ids: (scenario.variants ?? [1, 2, 3]) })
    case '/api/v1/products/101/variants':
      return json(res, 200, {
        variants: VARIANTS.map((v, i) => ({ id: v.id, variant_name: v.variant_name, display_order: i, reference_image_paths: [asset(v.file)] })),
      })
    case '/api/v1/render/email-required':
      return json(res, 200, {
        ...scenario.gate,
        ...(scenario.limit === null ? {} : { visitor_limit: scenario.limit, visitor_used: used }),
      })
    case '/api/v1/render/v2/chain/stream': return renderStream(req, res, raw)
    case '/api/v1/quote/request': return respondWith(res, scenario.quote)
    case '/api/v1/quote/lead': return respondWith(res, scenario.lead)
    case '/api/v1/embed/email-renders': return respondWith(res, scenario.emailRenders)
    default: return json(res, 404, { message: 'Not Found' })
  }
})

// The brand's page, on its own origin so the widget's calls are cross-origin as on a real site.
const page = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname

  if (p === '/widget.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' })

    return res.end(readFileSync(BUNDLE))
  }
  if (p.startsWith('/assets/')) {
    const f = join(ASSETS, p.slice('/assets/'.length))

    res.writeHead(existsSync(f) ? 200 : 404, { 'Content-Type': extname(f) === '.png' ? 'image/png' : 'image/jpeg' })

    return res.end(existsSync(f) ? readFileSync(f) : '')
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(readFileSync(PAGE))
})

api.listen(API_PORT, '127.0.0.1', () => console.log(`mock API  http://127.0.0.1:${API_PORT}`))
page.listen(PAGE_PORT, '127.0.0.1', () => console.log(`brand page http://127.0.0.1:${PAGE_PORT}`))
