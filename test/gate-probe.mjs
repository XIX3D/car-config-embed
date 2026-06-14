// Posts a set of vehicle images to the live detect-vehicle endpoint and
// runs each detection through two gate variants:
//   - "current"   = what bodykit-demo v0.0.5 ships (make + model regex)
//   - "year-gate" = proposed tightening (make + model regex + year 2020-2024)
//
// Usage:  node test/gate-probe.mjs
//
// No render credits are consumed; detect-vehicle is unauthenticated and
// rate-limited only.

import { readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

const API = 'https://api.platform.xix3d.com/api/v1/products/detect-vehicle'
const DIR = 'docs/public/test-vehicles'

const IMAGES = [
  // 992.1 Turbo / Turbo S — true positives (kit fits)
  '992-1-turbo-s-front.jpg',
  '992-1-turbo-s-rear.jpg',
  '992-1-turbo-cab-front.jpg',
  '992-1-turbo-cab-rear.jpg',

  // 992.2 facelift — false positives the year-gate should block
  '992-2-turbo-front.webp',
  '992-2-turbo-rear.webp',

  // Older-gen 911 Turbos — false positives the year-gate should block
  '991-turbo-front.webp',
  '991-turbo-side.webp',
  '997-turbo-front.webp',

  // Non-Turbo 911s — should fail on model regex
  '911-gt3-front.jpg',
  '911-gt3-front2.jpg',
  '911-gt3-rear.webp',
  '911-carrera-front.jpg',
  '911-carrera-rear.jpg',

  // Non-911 Porsche — should fail on model regex
  'cayman-front.webp',
  'cayman-rear.jpg',

  // Non-Porsche control set — should fail on make
  'lambo-urus.jpeg',
  'mclaren.jpeg',
]

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

// Mirrors VEHICLE_GATES['porsche-911-turbo'] at Modal.tsx as of v0.0.5
function gateCurrent(v) {
  if (!v) return { pass: false, reason: 'no detection' }
  const makeOk = (v.make || '').toLowerCase() === 'porsche'
  const modelOk = /911\s*turbo/i.test(v.model || '')
  if (!makeOk) return { pass: false, reason: `make='${v.make}' != Porsche` }
  if (!modelOk) return { pass: false, reason: `model='${v.model}' no /911 turbo/` }
  return { pass: true, reason: 'accept' }
}

// Proposed tightening — year-bounded to 992.1 production window
function gateYearBounded(v) {
  if (!v) return { pass: false, reason: 'no detection' }
  const makeOk = (v.make || '').toLowerCase() === 'porsche'
  const modelOk = /911\s*turbo/i.test(v.model || '')
  if (!makeOk) return { pass: false, reason: `make='${v.make}' != Porsche` }
  if (!modelOk) return { pass: false, reason: `model='${v.model}' no /911 turbo/` }
  const year = Number(v.year)
  if (!year || Number.isNaN(year)) return { pass: true, reason: 'year missing — accept' }
  if (year < 2020 || year > 2024) return { pass: false, reason: `year ${year} outside 2020-2024` }
  return { pass: true, reason: 'accept' }
}

async function probe(filename) {
  const path = join(DIR, filename)
  const bytes = await readFile(path)
  const mime = MIME[extname(filename).toLowerCase()] || 'application/octet-stream'

  const fd = new FormData()
  fd.append('image', new Blob([bytes], { type: mime }), filename)

  const res = await fetch(API, { method: 'POST', body: fd })
  const status = res.status
  const body = await res.json().catch(() => ({}))
  return { status, detection: body.detection ?? null, raw: body }
}

const pad = (s, n) => String(s).padEnd(n)
const trunc = (s, n) => {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

console.log()
console.log(pad('image', 32), pad('make', 14), pad('model', 22), pad('year', 6), pad('type', 12), pad('current', 9), 'year-gated')
console.log('-'.repeat(120))

let mismatchCount = 0

for (const img of IMAGES) {
  try {
    const { status, detection } = await probe(img)
    if (status !== 200 || !detection) {
      console.log(pad(trunc(img, 31), 32), `(http ${status})`)
      continue
    }
    const g1 = gateCurrent(detection)
    const g2 = gateYearBounded(detection)
    const cur = g1.pass ? '\x1b[32m✅ pass\x1b[0m' : '\x1b[31m❌ block\x1b[0m'
    const yr = g2.pass ? '\x1b[32m✅ pass\x1b[0m' : '\x1b[31m❌ block\x1b[0m'
    if (g1.pass !== g2.pass) mismatchCount++
    console.log(
      pad(trunc(img, 31), 32),
      pad(trunc(detection.make, 13), 14),
      pad(trunc(detection.model, 21), 22),
      pad(trunc(detection.year, 5), 6),
      pad(trunc(detection.vehicle_type, 11), 12),
      pad(cur, 18),
      yr,
    )
  } catch (e) {
    console.log(pad(trunc(img, 31), 32), 'ERROR:', e.message)
  }
}

console.log()
console.log(`${mismatchCount} image(s) flip verdict between current and year-gated.`)
console.log()
