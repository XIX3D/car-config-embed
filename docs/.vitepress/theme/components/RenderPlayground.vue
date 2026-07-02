<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'

type MonacoEditor = typeof import('monaco-editor')
const monaco = shallowRef<MonacoEditor | null>(null)

interface Product {
  id: number
  name: string
  category: string
  sku: string
  external_id: string | null
  status: string
  orthographic_image: string | null
  reference_image_paths: string[]
}

interface Variant {
  id: number
  product_id: number
  variant_name: string
  variant_type: string
  hex_color: string | null
  prompt_finish: string | null
  prompt_override: string | null
  is_default: boolean
  is_top_variant: boolean
  display_order: number
  reference_image: string | null
  orthographic_image: string | null
}

interface SSEEvent {
  type: string
  data: Record<string, any>
  timestamp: number
}

interface TestVehicle {
  id: string
  src: string
  label: string
  tag: string
  difficulty: 'normal' | 'hard'
}

const BUNDLED_VEHICLES: TestVehicle[] = [
  { id: 'ford-gt-front', src: '/test-vehicles/ford-gt-front.jpeg', label: 'Ford GT Front 3/4', tag: 'Standard', difficulty: 'normal' },
  { id: 'ford-gt-rear', src: '/test-vehicles/ford-gt-rear.jpeg', label: 'Ford GT Rear 3/4', tag: 'Rear', difficulty: 'normal' },
  { id: 'lambo-urus', src: '/test-vehicles/lambo-urus.jpeg', label: 'Lambo Urus', tag: 'SUV', difficulty: 'normal' },
  { id: 'ford-gt-closeup', src: '/test-vehicles/ford-gt-closeup.jpeg', label: 'Ford GT Close-up', tag: 'Close-up', difficulty: 'hard' },
  { id: 'kingpin-mustang', src: '/test-vehicles/kingpin-mustang.jpeg', label: 'Kingpin Mustang', tag: 'Dark', difficulty: 'hard' },
  { id: 'mclaren', src: '/test-vehicles/mclaren.jpeg', label: 'McLaren', tag: 'Portrait', difficulty: 'hard' },
  { id: 'subaru', src: '/test-vehicles/subaru.jpg', label: 'Subaru', tag: 'Street', difficulty: 'normal' },
  { id: 'iphone-1', src: '/test-vehicles/iphone-shot-1.jpg', label: 'iPhone Shot 1', tag: 'Phone', difficulty: 'hard' },
  { id: 'iphone-2', src: '/test-vehicles/iphone-shot-2.jpg', label: 'iPhone Shot 2', tag: 'Phone', difficulty: 'hard' },
  { id: 'samsung', src: '/test-vehicles/samsung-shot.jpg', label: 'Samsung Shot', tag: 'Phone', difficulty: 'hard' },
  { id: 'whatsapp', src: '/test-vehicles/whatsapp-car.jpeg', label: 'WhatsApp Car', tag: 'Casual', difficulty: 'normal' },
  { id: 'wraps-1', src: '/test-vehicles/wraps-1.jpeg', label: 'Wraps 1', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-2', src: '/test-vehicles/wraps-2.jpg', label: 'Wraps 2', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-3', src: '/test-vehicles/wraps-3.jpeg', label: 'Wraps 3', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-4', src: '/test-vehicles/wraps-4.jpeg', label: 'Wraps 4', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-5', src: '/test-vehicles/wraps-5.jpeg', label: 'Wraps 5', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-6', src: '/test-vehicles/wraps-6.jpeg', label: 'Wraps 6', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-7', src: '/test-vehicles/wraps-7.jpeg', label: 'Wraps 7', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-8', src: '/test-vehicles/wraps-8.jpeg', label: 'Wraps 8', tag: 'Wrap', difficulty: 'normal' },
  { id: 'wraps-9', src: '/test-vehicles/wraps-9.jpg', label: 'Wraps 9', tag: 'Wrap', difficulty: 'normal' },
]

const apiBaseUrl = ref('https://api.platform.xix3d.com')
const authToken = ref('')
const authEmail = ref('')
const authPassword = ref('')
const authError = ref('')
const authLoading = ref(false)
const isAuthenticated = ref(false)
const manufacturerId = ref<number | null>(null)

const apiConnected = ref(false)
const products = ref<Product[]>([])
const selectedProductId = ref<string>('')
const productSearch = ref('')
const productModalOpen = ref(false)
const productSearchInput = ref<HTMLInputElement>()
const productGrid = ref<HTMLElement>()
const outputSection = ref<HTMLElement>()

type QcStatus = 'good' | 'needs_work'
type ProductStatus = '' | 'good' | 'needs_work'
interface QcEntry { status: QcStatus | null; note: string; ts: number }
const qcMap = ref<Record<string, QcEntry>>({})
const qcFilter = ref<'all' | 'unreviewed' | 'needs_work' | 'good'>('all')

const variants = ref<Variant[]>([])
const selectedVariantId = ref<string>('')

const masterPrompt = ref('')
const editablePrompt = ref('')
const promptDirty = ref(false)
const savedPrompts = ref<Record<string, string>>({})
const showMasterPrompt = ref(false)

const selectedVehicle = ref<string>('')
const uploadedFile = ref<File | null>(null)
const vehicleImagePreview = ref('')

interface RenderResult {
  label: string
  variantId: string | null
  imageUrl: string | null
  error: string | null
  loading: boolean
  elapsed: string | null
  sseEvents: SSEEvent[]
}

const renderResults = ref<RenderResult[]>([])
const renderInProgress = ref(false)
const fullscreenIndex = ref<number>(-1)
const viewerOpen = ref(false)
interface RejectedAttempt {
  image_b64: string
  reason: string
  confidence?: number
}

interface DebugModalData {
  debug: Record<string, any> | null
  rejected: RejectedAttempt[]
}

const debugModalData = ref<DebugModalData | null>(null)

const REJECTED_VISIBLE_KEY = 'rp-debug-rejected-visible'
const showRejected = ref<boolean>(
  typeof window !== 'undefined' && window.localStorage.getItem(REJECTED_VISIBLE_KEY) !== '0'
)

function toggleRejected() {
  showRejected.value = !showRejected.value
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REJECTED_VISIBLE_KEY, showRejected.value ? '1' : '0')
  }
}

function openDebugModal(result: RenderResult) {
  const debugEvt = result.sseEvents.find(e => e.type === 'debug')
  const rejected = result.sseEvents
    .filter(e => e.type === 'audit_failed_debug')
    .map(e => e.data as RejectedAttempt)
  if (debugEvt || rejected.length) {
    debugModalData.value = {
      debug: debugEvt ? debugEvt.data : null,
      rejected,
    }
  }
}

function closeDebugModal() {
  debugModalData.value = null
}

function getDebugEvent(result: RenderResult) {
  return result.sseEvents.find(e => e.type === 'debug')
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function storageUrl(path: string): string {
  return path
}

async function copyDebugText() {
  const parts = debugModalData.value?.debug?.parts
  if (!parts) return
  const text = parts
    .filter((p: any) => p.type === 'text')
    .map((p: any) => p.content)
    .join('\n')
  await navigator.clipboard.writeText(text)
}

const currentResult = computed(() =>
  fullscreenIndex.value >= 0 ? renderResults.value[fullscreenIndex.value] ?? null : null
)

const fullscreenLabel = computed(() => currentResult.value?.label || '')

function openFullscreen(index: number) {
  fullscreenIndex.value = index
  viewerOpen.value = true
}

function closeFullscreen() {
  viewerOpen.value = false
  fullscreenIndex.value = -1
}

function fullscreenPrev() {
  if (fullscreenIndex.value > 0) fullscreenIndex.value--
}

function fullscreenNext() {
  if (fullscreenIndex.value < renderResults.value.length - 1) fullscreenIndex.value++
}

function onFullscreenKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && productModalOpen.value) { closeProductModal(); e.preventDefault(); return }
  if (!viewerOpen.value) return
  if (e.key === 'ArrowLeft') { fullscreenPrev(); e.preventDefault(); return }
  if (e.key === 'ArrowRight') { fullscreenNext(); e.preventDefault(); return }
  if (e.key === 'Escape') { closeFullscreen(); e.preventDefault(); return }
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
  if (!typing && selectedProductId.value) {
    if (e.key === 'g' || e.key === 'G') { setProductQc(currentQc.value?.status === 'good' ? null : 'good'); e.preventDefault() }
    else if (e.key === 'n' || e.key === 'N') { setProductQc(currentQc.value?.status === 'needs_work' ? null : 'needs_work'); e.preventDefault() }
    else if (e.key === 'Enter' || e.key === ' ') { advanceWheel(); e.preventDefault() }
    else if (e.key === 'ArrowUp') { cycleReference(-1); e.preventDefault() }
    else if (e.key === 'ArrowDown') { cycleReference(1); e.preventDefault() }
  }
}

const fastMode = ref(true)

const masterPromptContainer = ref<HTMLElement>()
const editablePromptContainer = ref<HTMLElement>()
let masterEditor: any = null
let editableEditor: any = null
let masterEditorInitialized = false
let observer: MutationObserver | null = null

// Tracks which product the current variants.value reflects. Set by fetchVariants
// on success, cleared synchronously when selectedProductId changes. Render is
// gated on this matching the current selection so a render can never fire with
// stale variant IDs from a previous product (two Velos wheels share the same
// variant names, so the UI labels look right even when the IDs underneath are
// wrong — only a structural guard prevents that class of bug).
const variantsLoadedFor = ref<string | null>(null)
const variantsLoading = computed(
  () => !!selectedProductId.value && variantsLoadedFor.value !== selectedProductId.value
)

const canRender = computed(() => {
  if (!selectedProductId.value) return false
  if (!(selectedVehicle.value || uploadedFile.value)) return false
  if (variantsLoading.value) return false
  return true
})

const renderBlockReason = computed(() => {
  if (!selectedProductId.value) return 'Select a product first'
  if (!(selectedVehicle.value || uploadedFile.value)) return 'Choose a vehicle image'
  if (variantsLoading.value) return 'Loading variants…'
  return ''
})

const selectedProduct = computed(() => {
  if (!selectedProductId.value) return null
  return products.value.find(p => p.id === Number(selectedProductId.value))
})

const selectedVariant = computed(() => {
  if (!selectedVariantId.value) return null
  return variants.value.find(v => v.id === Number(selectedVariantId.value))
})

const selectedVehicleObj = computed(() => {
  return BUNDLED_VEHICLES.find(v => v.id === selectedVehicle.value)
})

// Reference images shown beside the render in the QC viewer.
// The authoritative source is the debug event: the exact reference images fed to the
// model for THIS render (wheel reference, orthographic view, center-cap detail, ...).
const refIndex = ref(0)
type RefImage = { src: string; label: string }

function cleanRefLabel(text: string): string {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
  let last = lines[lines.length - 1] || 'Reference'
  last = last.replace(/[:\-–—]\s*$/, '')
  if (last.length > 48) last = last.slice(0, 47) + '…'
  return last || 'Reference'
}
function refPriority(label: string): number {
  const l = label.toLowerCase()
  if (/vehicle|base image|input image|the car|customer/.test(l)) return 9
  if (/reference/.test(l)) return 0
  if (/orthograph/.test(l)) return 1
  return 5
}
function refsFromDebug(result: RenderResult | null): RefImage[] {
  const parts = result?.sseEvents.find(e => e.type === 'debug')?.data?.parts
  if (!Array.isArray(parts)) return []
  const out: RefImage[] = []
  let label = 'Reference'
  for (const part of parts) {
    if (part?.type === 'text' && typeof part.content === 'string') {
      label = cleanRefLabel(part.content)
    } else if (part?.type === 'image' && part.source) {
      out.push({ src: part.source, label })
    }
  }
  // reference + orthographic first, vehicle/base image last
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => refPriority(a.r.label) - refPriority(b.r.label) || a.i - b.i)
    .map(x => x.r)
}
const referenceImages = computed<RefImage[]>(() => {
  const fromDebug = refsFromDebug(currentResult.value)
  if (fromDebug.length) return fromDebug
  // fallback before the render's debug arrives: product/variant fields
  const out: RefImage[] = []
  const seen = new Set<string>()
  const add = (src: string | null | undefined, label: string) => {
    if (src && !seen.has(src)) { seen.add(src); out.push({ src, label }) }
  }
  const vid = currentResult.value?.variantId
  if (vid) {
    const v = variants.value.find(v => String(v.id) === vid)
    if (v) { add(v.reference_image, 'Variant reference'); add(v.orthographic_image, 'Variant orthographic') }
  }
  const p = selectedProduct.value
  if (p) {
    add(p.orthographic_image, 'Orthographic')
    ;(p.reference_image_paths || []).forEach((r, i) => add(r, `Reference ${i + 1}`))
  }
  return out
})
const currentReference = computed(() => {
  const list = referenceImages.value
  if (!list.length) return null
  return list[Math.min(refIndex.value, list.length - 1)]
})
function cycleReference(dir: number) {
  const n = referenceImages.value.length
  if (n < 2) return
  refIndex.value = (Math.min(refIndex.value, n - 1) + dir + n) % n
}
// Reset to the top reference whenever the viewed finish/product changes.
watch(() => currentResult.value?.variantId, () => { refIndex.value = 0 })

const filteredProducts = computed(() => {
  const q = productSearch.value.toLowerCase().trim()
  let list = products.value
  if (q) {
    list = list.filter(p =>
      p.name.toLowerCase().includes(q)
      || p.sku.toLowerCase().includes(q)
      || (p.external_id?.toLowerCase().includes(q) ?? false)
    )
  }
  if (qcFilter.value !== 'all') {
    list = list.filter(p => {
      const st = productStatus(String(p.id))
      return qcFilter.value === 'unreviewed' ? !st : st === qcFilter.value
    })
  }
  return list
})

function pickProduct(p: Product) {
  selectedProductId.value = String(p.id)
  productModalOpen.value = false
}

function openProductModal() {
  productModalOpen.value = true
  nextTick(() => {
    productSearchInput.value?.focus()
    productSearchInput.value?.select()
    productGrid.value?.querySelector('.active')?.scrollIntoView({ block: 'center' })
  })
}

function closeProductModal() {
  productModalOpen.value = false
}

// ── QC status (one verdict + note per wheel, in localStorage, keyed per account) ──
const QC_KEY_PREFIX = 'rp-qc-v1-'
function qcStorageKey() {
  return `${QC_KEY_PREFIX}${manufacturerId.value ?? 'anon'}`
}
function normalizeEntry(e: any): QcEntry {
  let status: QcStatus | null = (e?.status === 'good' || e?.status === 'needs_work') ? e.status : null
  // migrate the older per-finish shape into a single wheel verdict
  if (!status && e?.finishes && typeof e.finishes === 'object') {
    const vals = Object.values(e.finishes) as any[]
    if (vals.some(f => f?.status === 'needs_work')) status = 'needs_work'
    else if (vals.length && vals.every(f => f?.status === 'good')) status = 'good'
  }
  return { status, note: typeof e?.note === 'string' ? e.note : '', ts: typeof e?.ts === 'number' ? e.ts : 0 }
}
function loadQc() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(qcStorageKey())
    const parsed = raw ? JSON.parse(raw) : {}
    const out: Record<string, QcEntry> = {}
    for (const k in parsed) out[k] = normalizeEntry(parsed[k])
    qcMap.value = out
  } catch { qcMap.value = {} }
}
function saveQc() {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(qcStorageKey(), JSON.stringify(qcMap.value)) } catch { /* quota */ }
}
function ensureEntry(productId: string): QcEntry {
  let e = qcMap.value[productId]
  if (!e) { e = { status: null, note: '', ts: Date.now() }; qcMap.value[productId] = e }
  return e
}

const currentQc = computed(() => selectedProductId.value ? qcMap.value[selectedProductId.value] : undefined)
const currentWheelNote = computed(() => currentQc.value?.note ?? '')

function setProductQc(status: QcStatus | null) {
  if (!selectedProductId.value) return
  const e = ensureEntry(selectedProductId.value)
  e.status = status
  e.ts = Date.now()
  if (!e.status && !e.note) delete qcMap.value[selectedProductId.value]
  saveQc()
}
function setWheelNote(note: string) {
  if (!selectedProductId.value) return
  const e = ensureEntry(selectedProductId.value)
  e.note = note
  e.ts = Date.now()
  if (!e.status && !e.note) delete qcMap.value[selectedProductId.value]
  saveQc()
}
// edit a note straight from the picker worklist (any product, not just the selected one)
function setNoteFor(productId: string, note: string) {
  const e = ensureEntry(productId)
  e.note = note
  e.ts = Date.now()
  if (!e.status && !e.note) delete qcMap.value[productId]
  saveQc()
}

function productStatus(productId: string): ProductStatus {
  return qcMap.value[productId]?.status || ''
}
function statusLabel(s: ProductStatus): string {
  if (s === 'good') return '👍 Good'
  if (s === 'needs_work') return '🚩 Needs work'
  return '○ Unreviewed'
}

const qcStats = computed(() => {
  let good = 0, needs = 0
  for (const p of products.value) {
    const s = productStatus(String(p.id))
    if (s === 'good') good++
    else if (s === 'needs_work') needs++
  }
  const total = products.value.length
  return { good, needs, total, left: Math.max(0, total - good - needs) }
})

const nextUnreviewedProduct = computed(() => {
  const n = products.value.length
  if (!n) return null
  const start = productIndex.value
  for (let i = 1; i <= n; i++) {
    const p = products.value[(start + i) % n]
    if (p && !productStatus(String(p.id))) return p
  }
  return null
})

async function nextWheel() {
  const target = nextUnreviewedProduct.value
  if (!target) return
  selectedProductId.value = String(target.id)
  selectedVariantId.value = ''
  // load this wheel's finishes + prompt before rendering all of them
  await Promise.all([fetchVariants(String(target.id)), fetchPromptPreview(String(target.id))])
  fullscreenIndex.value = 0
  viewerOpen.value = true
  await triggerRender()
}

// Keyboard/note-field entry point for "next wheel" (guarded so it can't double-fire).
function advanceWheel() {
  if (renderInProgress.value || !nextUnreviewedProduct.value) return
  nextWheel()
}

function download(filename: string, text: string, mime: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
function exportQc() {
  download(`qc-status-${manufacturerId.value ?? 'export'}.json`, JSON.stringify(qcMap.value, null, 2), 'application/json')
}
function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportQcCsv() {
  const rows: string[][] = [['name', 'sku', 'external_id', 'status', 'note']]
  for (const p of products.value) {
    const e = qcMap.value[String(p.id)]
    if (!e || (!e.status && !e.note)) continue
    rows.push([p.name, p.sku, p.external_id ?? '', e.status ?? '', e.note])
  }
  download(`qc-status-${manufacturerId.value ?? 'export'}.csv`, rows.map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv')
}
function importQc(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      if (data && typeof data === 'object') {
        const merged = { ...qcMap.value }
        for (const k in data) merged[k] = normalizeEntry(data[k])
        qcMap.value = merged
        saveQc()
      }
    } catch { /* invalid file */ }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

watch(manufacturerId, loadQc)

function prevProduct() {
  const idx = products.value.findIndex(p => String(p.id) === selectedProductId.value)
  if (idx > 0) pickProduct(products.value[idx - 1])
}

function nextProduct() {
  const idx = products.value.findIndex(p => String(p.id) === selectedProductId.value)
  if (idx >= 0 && idx < products.value.length - 1) pickProduct(products.value[idx + 1])
}

const productIndex = computed(() => {
  if (!selectedProductId.value) return -1
  return products.value.findIndex(p => String(p.id) === selectedProductId.value)
})

function productThumb(p: Product): string | null {
  if (p.orthographic_image) return p.orthographic_image
  if (p.reference_image_paths?.length) return p.reference_image_paths[0]
  return null
}

function variantThumb(v: Variant): string | null {
  return v.reference_image || v.orthographic_image || null
}

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${apiBaseUrl.value}${path}`
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string> || {}) }
  if (authToken.value) {
    headers['Authorization'] = `Bearer ${authToken.value}`
  }
  const res = await fetch(url, { ...options, headers })
  if (res.status === 401) {
    logout()
    throw new Error('Session expired')
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res
}

async function login() {
  authError.value = ''
  authLoading.value = true
  try {
    const res = await fetch(`${apiBaseUrl.value}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authEmail.value, password: authPassword.value }),
    })
    const data = await res.json()
    if (!res.ok) {
      authError.value = data.error || data.message || 'Login failed'
      return
    }
    authToken.value = data.token
    manufacturerId.value = data.user?.id ?? null
    isAuthenticated.value = true
    authPassword.value = ''
    await connectApi()
    await initMonaco()
  } catch (e) {
    authError.value = e instanceof Error ? e.message : 'Connection failed'
  } finally {
    authLoading.value = false
  }
}

function logout() {
  authToken.value = ''
  manufacturerId.value = null
  isAuthenticated.value = false
  apiConnected.value = false
  products.value = []
  variants.value = []
  selectedProductId.value = ''
  selectedVariantId.value = ''
}

async function connectApi() {
  apiConnected.value = false
  await fetchProducts()
  apiConnected.value = products.value.length > 0
}

async function fetchProducts() {
  const mId = manufacturerId.value
  if (mId == null) {
    products.value = []
    return
  }
  try {
    const res = await apiFetch(`/api/v1/products?limit=1000&category=wheels&manufacturer_id=${mId}`)
    const data = await res.json()
    const all = data.products || data || []
    products.value = all.filter((p: any) => p.manufacturer_id === mId)
  } catch (e) {
    console.error('Failed to fetch products:', e)
    products.value = []
  }
}

async function fetchVariants(productId: string) {
  try {
    const res = await apiFetch(`/api/v1/products/${productId}/variants`)
    const data = await res.json()
    // Guard against stale responses: if the user switched products while this
    // request was in flight, don't clobber the newer fetch's data.
    if (selectedProductId.value !== productId) return
    variants.value = data.variants || []
    variantsLoadedFor.value = productId
  } catch (e) {
    console.error('Failed to fetch variants:', e)
    if (selectedProductId.value !== productId) return
    variants.value = []
    variantsLoadedFor.value = productId
  }
}

async function fetchPromptPreview(productId: string) {
  try {
    let url = `/api/v1/products/${productId}/prompt-preview`
    if (selectedVariantId.value) {
      url += `?variant_id=${selectedVariantId.value}`
    }
    const res = await apiFetch(url)
    const data = await res.json()

    // master_prompt = raw template, rendered_prompt = template with variables filled
    masterPrompt.value = data.master_prompt || data.rendered_prompt || ''
    const customText = data.custom_prompt || ''

    const savedKey = `${productId}-${selectedVariantId.value || 'default'}`
    if (savedPrompts.value[savedKey]) {
      editablePrompt.value = savedPrompts.value[savedKey]
      promptDirty.value = true
    } else {
      editablePrompt.value = customText
      promptDirty.value = false
    }

    if (masterEditor) masterEditor.setValue(masterPrompt.value)
    if (editableEditor) editableEditor.setValue(editablePrompt.value)
  } catch (e) {
    console.error('Failed to fetch prompt:', e)
    masterPrompt.value = ''
    editablePrompt.value = ''
  }
}

function selectVehicle(id: string) {
  uploadedFile.value = null
  if (selectedVehicle.value === id) {
    selectedVehicle.value = ''
    vehicleImagePreview.value = ''
  } else {
    selectedVehicle.value = id
    const v = BUNDLED_VEHICLES.find(v => v.id === id)
    vehicleImagePreview.value = v ? v.src : ''
  }
}

const dragOver = ref(false)

function setUploadedImage(file: File) {
  if (!file.type.startsWith('image/')) return
  uploadedFile.value = file
  selectedVehicle.value = ''
  vehicleImagePreview.value = URL.createObjectURL(file)
}

function onFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) setUploadedImage(file)
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) setUploadedImage(file)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        setUploadedImage(file)
        event.preventDefault()
        return
      }
    }
  }
}

function selectVariant(variantId: string) {
  selectedVariantId.value = selectedVariantId.value === variantId ? '' : variantId
}

function resetPrompt() {
  editablePrompt.value = masterPrompt.value
  promptDirty.value = false
  const savedKey = `${selectedProductId.value}-${selectedVariantId.value || 'default'}`
  delete savedPrompts.value[savedKey]
  if (editableEditor) editableEditor.setValue(editablePrompt.value)
}

const savingPrompt = ref(false)
const saveSuccess = ref(false)

async function saveCustomPrompt() {
  if (!selectedProductId.value) return
  savingPrompt.value = true
  saveSuccess.value = false
  try {
    await apiFetch(`/api/v1/products/${selectedProductId.value}/custom-prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: editablePrompt.value }),
    })
    const savedKey = `${selectedProductId.value}-${selectedVariantId.value || 'default'}`
    savedPrompts.value[savedKey] = editablePrompt.value
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 2000)
  } catch (e) {
    console.error('Failed to save prompt:', e)
  } finally {
    savingPrompt.value = false
  }
}


async function getVehicleBlob(): Promise<Blob | null> {
  if (uploadedFile.value) return uploadedFile.value
  if (selectedVehicle.value) {
    const vehicle = BUNDLED_VEHICLES.find(v => v.id === selectedVehicle.value)
    if (vehicle) {
      const res = await fetch(vehicle.src)
      return res.blob()
    }
  }
  return null
}

async function renderOne(result: RenderResult, vehicleBlob: Blob, productId: number, variantId: string | null) {
  result.loading = true
  const startTime = performance.now()

  const formData = new FormData()
  formData.append('vehicle_image', vehicleBlob, 'vehicle.png')

  const productsPayload = [{
    product_id: productId,
    ...(variantId ? { variant_id: parseInt(variantId, 10) } : {})
  }]
  formData.append('products', JSON.stringify(productsPayload))
  formData.append('fast_mode', 'true')
  formData.append('debug', 'true')

  try {
    const res = await fetch(`${apiBaseUrl.value}/api/v1/render/chain/stream`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      result.error = `Render failed (${res.status})`
      result.loading = false
      return
    }

    const reader = res.body?.getReader()
    if (!reader) { result.error = 'Streaming not supported'; result.loading = false; return }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const eventMatch = chunk.match(/^event: (.+)$/m)
        const dataMatch = chunk.match(/^data: (.+)$/m)
        if (!eventMatch || !dataMatch) continue

        try {
          const event = eventMatch[1]
          const data = JSON.parse(dataMatch[1])
          result.sseEvents = [...result.sseEvents, { type: event, data, timestamp: Date.now() }]

          if (event === 'complete' && data.image_b64) {
            result.imageUrl = `data:image/png;base64,${data.image_b64}`
            result.elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
            result.loading = false
          } else if (event === 'error') {
            result.error = data.message || 'Render error'
            result.loading = false
          }
        } catch { /* skip */ }
      }
    }

    if (result.loading) {
      result.loading = false
      if (!result.imageUrl && !result.error) result.error = 'Stream ended without result'
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'Unknown error'
    result.loading = false
  }
}

async function triggerRender() {
  if (!canRender.value) return

  renderInProgress.value = true
  nextTick(() => outputSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  let vehicleBlob: Blob | null = null
  try {
    vehicleBlob = await getVehicleBlob()
  } catch {
    renderResults.value = [{ label: 'Error', variantId: null, imageUrl: null, error: 'Failed to load vehicle image', loading: false, elapsed: null, sseEvents: [] }]
    renderInProgress.value = false
    return
  }
  if (!vehicleBlob) { renderInProgress.value = false; return }

  const productId = Number(selectedProductId.value)

  if (selectedVariantId.value) {
    // Single variant selected
    const v = variants.value.find(v => v.id === Number(selectedVariantId.value))
    const label = v ? v.variant_name : 'Selected Variant'
    const result: RenderResult = { label, variantId: selectedVariantId.value, imageUrl: null, error: null, loading: true, elapsed: null, sseEvents: [] }
    renderResults.value = [result]
    await renderOne(result, vehicleBlob, productId, selectedVariantId.value)
  } else {
    // No variant selected → render product (no variant) + all variants
    const items: { label: string; variantId: string | null }[] = [
      { label: 'Product (default)', variantId: null },
      ...variants.value.map(v => ({ label: v.variant_name, variantId: String(v.id) }))
    ]
    renderResults.value = items.map(item => ({
      label: item.label,
      variantId: item.variantId,
      imageUrl: null,
      error: null,
      loading: true,
      elapsed: null,
      sseEvents: [],
    }))

    await Promise.all(renderResults.value.map(result =>
      renderOne(result, vehicleBlob!, productId, result.variantId)
    ))
  }

  renderInProgress.value = false
}

watch(selectedProductId, async (pid) => {
  if (!pid) {
    variants.value = []
    variantsLoadedFor.value = null
    selectedVariantId.value = ''
    masterPrompt.value = ''
    editablePrompt.value = ''
    if (masterEditor) masterEditor.setValue('')
    if (editableEditor) editableEditor.setValue('')
    return
  }
  // Clear stale variants + the loaded-for marker synchronously before the
  // network fetch resolves. This trips canRender to false until the new
  // product's variants land, so the Render button cannot fire with stale
  // variant IDs from the previous product.
  variants.value = []
  variantsLoadedFor.value = null
  selectedVariantId.value = ''
  refIndex.value = 0
  await Promise.all([fetchVariants(pid), fetchPromptPreview(pid)])
})

watch(selectedVariantId, async () => {
  if (selectedProductId.value) {
    await fetchPromptPreview(selectedProductId.value)
  }
})

function initMasterEditor() {
  if (masterEditorInitialized || !masterPromptContainer.value || !monaco.value) return
  masterEditorInitialized = true

  const isDark = document.documentElement.classList.contains('dark')
  masterEditor = monaco.value.editor.create(masterPromptContainer.value, {
    value: masterPrompt.value,
    language: 'markdown',
    theme: isDark ? 'vs-dark' : 'vs',
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'off',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    folding: false,
  })
}

watch(showMasterPrompt, (open) => {
  if (open) {
    nextTick(() => initMasterEditor())
  } else {
    masterEditor?.dispose()
    masterEditor = null
    masterEditorInitialized = false
  }
})

async function initMonaco() {
  if (!editablePromptContainer.value) return

  const monacoModule = await import('monaco-editor')
  monaco.value = monacoModule

  const isDark = document.documentElement.classList.contains('dark')

  editableEditor = monacoModule.editor.create(editablePromptContainer.value, {
    value: editablePrompt.value,
    language: 'markdown',
    theme: isDark ? 'vs-dark' : 'vs',
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
  })

  editableEditor.onDidChangeModelContent(() => {
    editablePrompt.value = editableEditor?.getValue() || ''
    promptDirty.value = editablePrompt.value !== masterPrompt.value
  })

  observer = new MutationObserver(() => {
    const isDark = document.documentElement.classList.contains('dark')
    monacoModule.editor.setTheme(isDark ? 'vs-dark' : 'vs')
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
}

onMounted(() => {
  document.addEventListener('paste', onPaste)
  document.addEventListener('keydown', onFullscreenKeydown)
})

onUnmounted(() => {
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('keydown', onFullscreenKeydown)
  observer?.disconnect()
  masterEditor?.dispose()
  editableEditor?.dispose()
  renderResults.value.forEach(r => {
    if (r.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(r.imageUrl)
  })
  if (vehicleImagePreview.value.startsWith('blob:')) URL.revokeObjectURL(vehicleImagePreview.value)
})
</script>

<template>
  <div class="rp">
    <!-- LOGIN SCREEN -->
    <div v-if="!isAuthenticated" class="rp-login">
      <div class="rp-login-card">
        <div class="rp-login-header">Prompt Playground</div>
        <div class="rp-login-body">
          <div class="rp-login-field">
            <label>API URL</label>
            <input v-model="apiBaseUrl" type="text" placeholder="https://api.platform.xix3d.com" />
          </div>
          <div class="rp-login-field">
            <label>Email</label>
            <input v-model="authEmail" type="email" placeholder="you@company.com" @keydown.enter="login" />
          </div>
          <div class="rp-login-field">
            <label>Password</label>
            <input v-model="authPassword" type="password" placeholder="Password" @keydown.enter="login" />
          </div>
          <div v-if="authError" class="rp-login-error">{{ authError }}</div>
          <button class="rp-btn rp-btn-render" style="width: 100%; justify-content: center;" :disabled="authLoading || !authEmail || !authPassword" @click="login">
            <span v-if="authLoading" class="rp-btn-spinner" />
            {{ authLoading ? 'Signing in...' : 'Sign In' }}
          </button>
        </div>
      </div>
    </div>

    <!-- PLAYGROUND (authenticated) -->
    <template v-else>
    <!-- API BAR -->
    <div class="rp-topbar">
      <div class="rp-topbar-left">
        <span class="rp-dot" :class="apiConnected ? 'connected' : 'disconnected'" />
        <input v-model="apiBaseUrl" type="text" class="rp-url-input" placeholder="https://api.platform.xix3d.com" />
        <button class="rp-btn rp-btn-ghost" @click="connectApi">Reconnect</button>
        <button class="rp-btn rp-btn-ghost" @click="logout">Logout</button>
      </div>
      <div class="rp-topbar-right">
        <span class="rp-muted" style="font-size: 0.75rem;">{{ authEmail }}</span>
        <label class="rp-inline-toggle">
          <input type="checkbox" v-model="fastMode" />
          <span>Fast</span>
        </label>
        <label class="rp-inline-toggle" title="Show rejected images in the debug modal">
          <input type="checkbox" :checked="showRejected" @change="toggleRejected" />
          <span>Show rejected</span>
        </label>
        <button
          class="rp-btn rp-btn-render"
          :disabled="renderInProgress || !canRender"
          :title="renderBlockReason"
          @click="triggerRender"
        >
          <span v-if="renderInProgress || variantsLoading" class="rp-btn-spinner" />
          {{ renderInProgress ? 'Rendering...' : variantsLoading ? 'Loading variants...' : selectedVariantId ? 'Render' : `Render All (${variants.length || 1})` }}
        </button>
      </div>
    </div>

    <!-- STEP 1: PRODUCT -->
    <div class="rp-card rp-card-visible">
      <div class="rp-card-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="rp-step">1</span>
          <span>Select Product</span>
          <span v-if="selectedProductId && products.length" class="rp-muted" style="font-size: 0.7rem;">
            {{ productIndex + 1 }} / {{ products.length }}
          </span>
        </div>
        <div v-if="selectedProductId" class="rp-nav-btns">
          <button class="rp-btn rp-btn-ghost rp-btn-xs" :disabled="productIndex <= 0" @click="prevProduct">&larr; Prev</button>
          <button class="rp-btn rp-btn-ghost rp-btn-xs" :disabled="productIndex >= products.length - 1" @click="nextProduct">Next &rarr;</button>
        </div>
      </div>
      <div class="rp-card-body">
        <button class="rp-product-trigger" @click="openProductModal">
          <template v-if="selectedProduct">
            <img v-if="productThumb(selectedProduct)" :src="productThumb(selectedProduct)!" :alt="selectedProduct.name" class="rp-product-trigger-img" />
            <div v-else class="rp-product-trigger-img rp-product-item-img-empty" />
            <div class="rp-product-trigger-info">
              <span class="rp-product-trigger-name">{{ selectedProduct.name }}</span>
              <span class="rp-product-trigger-sku">{{ selectedProduct.sku }}<template v-if="selectedProduct.external_id"> &middot; {{ selectedProduct.external_id }}</template></span>
            </div>
            <span class="rp-product-trigger-action">Change</span>
          </template>
          <template v-else>
            <span class="rp-product-trigger-placeholder">Select a product&hellip;</span>
            <span class="rp-product-trigger-action">Browse</span>
          </template>
        </button>

        <!-- VARIANTS -->
        <div v-if="variants.length" class="rp-variants">
          <div class="rp-variants-label">Variants</div>
          <div class="rp-variants-grid">
            <button
              v-for="v in variants"
              :key="v.id"
              class="rp-variant-card"
              :class="{ active: selectedVariantId === String(v.id) }"
              @click="selectVariant(String(v.id))"
            >
              <img v-if="variantThumb(v)" :src="variantThumb(v)!" :alt="v.variant_name" class="rp-variant-img" />
              <div v-else-if="v.hex_color" class="rp-variant-swatch" :style="{ background: v.hex_color }" />
              <div v-else class="rp-variant-swatch rp-variant-swatch-empty" />
              <div class="rp-variant-info">
                <span class="rp-variant-name">{{ v.variant_name }}</span>
                <span v-if="v.variant_type" class="rp-variant-type">{{ v.variant_type }}</span>
              </div>
              <span v-if="v.is_default" class="rp-variant-default">default</span>
            </button>
          </div>
        </div>

        <div v-if="selectedProductId && !variants.length" class="rp-muted">No variants found for this product.</div>
      </div>
    </div>

    <!-- STEP 2: VEHICLE IMAGE -->
    <div class="rp-card">
      <div class="rp-card-header">
        <span class="rp-step">2</span>
        <span>Choose Vehicle Image</span>
      </div>
      <div class="rp-card-body">
        <div class="rp-vehicle-grid">
          <button
            v-for="v in BUNDLED_VEHICLES"
            :key="v.id"
            class="rp-vehicle-card"
            :class="{ active: selectedVehicle === v.id }"
            @click="selectVehicle(v.id)"
          >
            <img :src="v.src" :alt="v.label" />
            <div class="rp-vehicle-card-footer">
              <span class="rp-vehicle-label">{{ v.label }}</span>
              <span class="rp-vehicle-tag" :class="v.difficulty">{{ v.tag }}</span>
            </div>
          </button>
          <label
            class="rp-vehicle-card rp-vehicle-upload"
            :class="{ active: !!uploadedFile, 'rp-dragover': dragOver }"
            @drop="onDrop"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
          >
            <input type="file" accept="image/*" @change="onFileUpload" />
            <template v-if="uploadedFile && vehicleImagePreview">
              <img :src="vehicleImagePreview" :alt="uploadedFile.name" />
              <div class="rp-vehicle-card-footer">
                <span class="rp-vehicle-label">{{ uploadedFile.name }}</span>
                <span class="rp-vehicle-tag normal">Custom</span>
              </div>
            </template>
            <template v-else>
              <div class="rp-upload-icon">+</div>
              <span class="rp-vehicle-label">Drop, paste, or click</span>
            </template>
          </label>
        </div>
      </div>
    </div>

    <!-- STEP 3: PROMPT -->
    <div class="rp-card">
      <div class="rp-card-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="rp-step">3</span>
          <span>Prompt</span>
          <span v-if="promptDirty" class="rp-badge rp-badge-warn">Modified</span>
          <span v-if="savedPrompts[`${selectedProductId}-${selectedVariantId || 'default'}`]" class="rp-badge rp-badge-ok">Saved</span>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button v-if="promptDirty" class="rp-btn rp-btn-ghost rp-btn-xs" @click="saveCustomPrompt" :disabled="savingPrompt">{{ savingPrompt ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Prompt' }}</button>
          <button v-if="promptDirty" class="rp-btn rp-btn-ghost rp-btn-xs" @click="resetPrompt">Reset</button>
          <button class="rp-btn rp-btn-ghost rp-btn-xs" @click="showMasterPrompt = !showMasterPrompt">
            {{ showMasterPrompt ? 'Hide' : 'Show' }} Master
          </button>
        </div>
      </div>
      <div class="rp-card-body rp-prompt-body">
        <div v-if="showMasterPrompt" class="rp-master-section">
          <div class="rp-master-label">Master Prompt (Read-Only)</div>
          <div ref="masterPromptContainer" style="height: 200px;" />
        </div>
        <div ref="editablePromptContainer" class="rp-editor-container" />
      </div>
    </div>

    <!-- STEP 4: OUTPUT -->
    <div ref="outputSection" class="rp-card">
      <div class="rp-card-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="rp-step">4</span>
          <span>Output</span>
          <span v-if="renderResults.length > 1" class="rp-muted" style="font-size: 0.75rem;">
            {{ renderResults.filter(r => r.imageUrl).length }}/{{ renderResults.length }} complete
          </span>
        </div>
        <span v-if="renderInProgress" class="rp-muted" style="font-size: 0.75rem;">Batch rendering...</span>
      </div>
      <div class="rp-card-body">
        <div v-if="selectedProductId && renderResults.length" class="rp-qc-summary">
          <button class="rp-qc-btn good" :class="{ active: currentQc?.status === 'good' }" @click="setProductQc(currentQc?.status === 'good' ? null : 'good')">👍 Good</button>
          <button class="rp-qc-btn needs" :class="{ active: currentQc?.status === 'needs_work' }" @click="setProductQc(currentQc?.status === 'needs_work' ? null : 'needs_work')">🚩 Needs work</button>
          <input
            class="rp-qc-note"
            :value="currentWheelNote"
            @input="setWheelNote(($event.target as HTMLInputElement).value)"
            placeholder="Note — what to fix on this wheel"
          />
          <button class="rp-btn rp-btn-ghost rp-btn-xs rp-qc-next" :disabled="!nextUnreviewedProduct" @click="nextWheel">
            {{ nextUnreviewedProduct ? 'Next wheel →' : 'All reviewed' }}
          </button>
        </div>

        <div v-if="!renderResults.length" class="rp-output-center">
          <span class="rp-muted">
            {{ selectedVariantId ? 'Click Render to generate' : 'Click Render to generate all variants' }}
          </span>
        </div>

        <div v-else class="rp-results-grid">
          <div v-for="(r, i) in renderResults" :key="i" class="rp-result-card">
            <div class="rp-result-header">
              <span class="rp-result-label">{{ r.label }}</span>
              <div style="display: flex; align-items: center; gap: 0.3rem;">
                <span v-if="r.elapsed" class="rp-muted" style="font-size: 0.7rem;">{{ r.elapsed }}s</span>
                <button v-if="r.imageUrl" class="rp-btn rp-btn-ghost rp-btn-xs" @click="openFullscreen(i)">View</button>
              </div>
            </div>

            <div v-if="r.sseEvents.length" class="rp-sse-strip">
              <span v-for="(evt, j) in r.sseEvents" :key="j"
                class="rp-sse-chip" :class="[evt.type, { clickable: evt.type === 'debug' || evt.type === 'audit_failed_debug' }]"
                @click="(evt.type === 'debug' || evt.type === 'audit_failed_debug') && openDebugModal(r)">
                <template v-if="evt.type === 'vehicle_detected'">{{ evt.data.make }} {{ evt.data.model }}</template>
                <template v-else-if="evt.type === 'error'">{{ evt.data.message }}</template>
                <template v-else-if="evt.type === 'debug'">debug ▸</template>
                <template v-else-if="evt.type === 'audit_failed_debug'">audit failed ▸</template>
                <template v-else>{{ evt.type }}</template>
              </span>
            </div>

            <div v-if="r.loading" class="rp-output-center" style="min-height: 120px;">
              <div class="rp-spinner" />
              <span class="rp-muted">Rendering...</span>
            </div>
            <div v-else-if="r.error" class="rp-error">{{ r.error }}</div>
            <div v-else-if="r.imageUrl" class="rp-render-result">
              <img :src="r.imageUrl" :alt="r.label" @click="openFullscreen(i)" style="cursor: pointer;" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- FLOATING RENDER BUTTON -->
    <button
      class="rp-fab-render"
      :disabled="renderInProgress || !canRender"
      :title="renderBlockReason"
      @click="triggerRender"
    >
      <span v-if="renderInProgress || variantsLoading" class="rp-btn-spinner" />
      <span v-else class="rp-fab-render-icon">&#9654;</span>
      <span>{{ renderInProgress ? 'Rendering...' : variantsLoading ? 'Loading variants...' : selectedVariantId ? 'Render' : `Render All (${variants.length || 1})` }}</span>
    </button>

    <!-- PRODUCT PICKER MODAL -->
    <Teleport to="body">
      <div v-if="productModalOpen" class="rp-fullscreen-overlay" @click.self="closeProductModal">
        <div class="rp-pm">
          <div class="rp-pm-header">
            <input
              ref="productSearchInput"
              v-model="productSearch"
              type="text"
              class="rp-pm-search"
              placeholder="Search products by name, SKU, or ID..."
            />
            <span class="rp-muted rp-pm-count">{{ filteredProducts.length }} / {{ products.length }}</span>
            <button class="rp-fullscreen-close" @click="closeProductModal" style="position: static;">&times;</button>
          </div>
          <div class="rp-pm-toolbar">
            <div class="rp-pm-filters">
              <button class="rp-pm-filter" :class="{ active: qcFilter === 'all' }" @click="qcFilter = 'all'">All ({{ products.length }})</button>
              <button class="rp-pm-filter" :class="{ active: qcFilter === 'unreviewed' }" @click="qcFilter = 'unreviewed'">Unreviewed ({{ qcStats.left }})</button>
              <button class="rp-pm-filter" :class="{ active: qcFilter === 'needs_work' }" @click="qcFilter = 'needs_work'">🚩 Needs work ({{ qcStats.needs }})</button>
              <button class="rp-pm-filter" :class="{ active: qcFilter === 'good' }" @click="qcFilter = 'good'">👍 Good ({{ qcStats.good }})</button>
            </div>
            <div class="rp-pm-actions">
              <span class="rp-muted rp-pm-stats">{{ qcStats.good + qcStats.needs }} done · {{ qcStats.left }} left</span>
              <button class="rp-btn rp-btn-ghost rp-btn-xs" @click="exportQcCsv">Export CSV</button>
              <button class="rp-btn rp-btn-ghost rp-btn-xs" @click="exportQc">JSON</button>
              <label class="rp-btn rp-btn-ghost rp-btn-xs" style="cursor: pointer;">
                Import
                <input type="file" accept="application/json" @change="importQc" style="display: none;" />
              </label>
            </div>
          </div>
          <div ref="productGrid" class="rp-pm-grid">
            <div
              v-for="p in filteredProducts"
              :key="p.id"
              class="rp-pm-card"
              :class="[`qc-${productStatus(String(p.id)) || 'none'}`, { active: selectedProductId === String(p.id) }]"
            >
              <div class="rp-pm-card-click" @click="pickProduct(p)">
                <div class="rp-pm-card-img">
                  <img v-if="productThumb(p)" :src="productThumb(p)!" :alt="p.name" loading="lazy" />
                  <div v-else class="rp-product-item-img-empty" style="width: 100%; height: 100%;" />
                  <span v-if="productStatus(String(p.id))" class="rp-pm-badge" :class="productStatus(String(p.id))">
                    {{ productStatus(String(p.id)) === 'good' ? '👍' : '🚩' }}
                  </span>
                </div>
                <div class="rp-pm-card-info">
                  <span class="rp-pm-card-name">{{ p.name }}</span>
                  <span class="rp-pm-card-sku">{{ p.sku }}</span>
                  <span v-if="p.external_id" class="rp-pm-card-ext">{{ p.external_id }}</span>
                </div>
              </div>
              <input
                v-if="productStatus(String(p.id)) === 'needs_work' || qcMap[String(p.id)]?.note"
                class="rp-pm-card-note"
                :value="qcMap[String(p.id)]?.note ?? ''"
                placeholder="Add a fix note..."
                @click.stop
                @input="setNoteFor(String(p.id), ($event.target as HTMLInputElement).value)"
              />
            </div>
            <div v-if="!filteredProducts.length" class="rp-product-item-empty">No products match the current filter</div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- FULLSCREEN REVIEW / QC VIEWER -->
    <Teleport to="body">
      <div v-if="viewerOpen" class="rp-fullscreen-overlay" @click.self="closeFullscreen">
        <div class="rp-fs">
          <button class="rp-fullscreen-close" @click="closeFullscreen">&times;</button>
          <div class="rp-fs-top">
            <span class="rp-fs-title">{{ selectedProduct?.name || 'Render' }}</span>
            <span class="rp-fs-sub">{{ fullscreenLabel }} · finish {{ fullscreenIndex + 1 }} of {{ renderResults.length }}</span>
          </div>

          <div class="rp-fs-stage">
            <button class="rp-fs-nav rp-fs-prev" :disabled="fullscreenIndex <= 0" @click="fullscreenPrev">&lsaquo;</button>
            <div class="rp-fs-compare">
              <div class="rp-fs-pane">
                <span v-if="referenceImages.length" class="rp-fs-pane-label">Render</span>
                <div class="rp-fs-image">
                  <img v-if="currentResult?.imageUrl" :src="currentResult.imageUrl" :alt="fullscreenLabel" />
                  <div v-else-if="currentResult?.error" class="rp-fs-state rp-error">{{ currentResult.error }}</div>
                  <div v-else class="rp-fs-state"><div class="rp-spinner" /><span class="rp-muted">Rendering...</span></div>
                </div>
              </div>
              <div v-if="referenceImages.length" class="rp-fs-pane rp-fs-ref">
                <span class="rp-fs-pane-label">Reference<template v-if="currentReference"> · {{ currentReference.label }}</template></span>
                <div class="rp-fs-ref-main">
                  <img v-if="currentReference" :src="currentReference.src" :alt="currentReference.label" />
                </div>
                <div v-if="referenceImages.length > 1" class="rp-fs-ref-thumbs">
                  <button
                    v-for="(refImg, ri) in referenceImages"
                    :key="ri"
                    class="rp-fs-ref-thumb"
                    :class="{ active: ri === Math.min(refIndex, referenceImages.length - 1) }"
                    :title="refImg.label"
                    @click="refIndex = ri"
                  >
                    <img :src="refImg.src" :alt="refImg.label" />
                  </button>
                </div>
              </div>
            </div>
            <button class="rp-fs-nav rp-fs-next" :disabled="fullscreenIndex >= renderResults.length - 1" @click="fullscreenNext">&rsaquo;</button>
          </div>

          <div class="rp-fs-qc">
            <span class="rp-fs-qc-label">This wheel:</span>
            <button class="rp-qc-btn good" :class="{ active: currentQc?.status === 'good' }" @click="setProductQc(currentQc?.status === 'good' ? null : 'good')">👍 Good <kbd>G</kbd></button>
            <button class="rp-qc-btn needs" :class="{ active: currentQc?.status === 'needs_work' }" @click="setProductQc(currentQc?.status === 'needs_work' ? null : 'needs_work')">🚩 Needs work <kbd>N</kbd></button>
            <input class="rp-qc-note" :value="currentWheelNote" placeholder="Note — what to fix (Enter = next wheel)" @input="setWheelNote(($event.target as HTMLInputElement).value)" @keydown.enter.prevent="advanceWheel" />
          </div>

          <div class="rp-fs-keys">
            <span><kbd>←</kbd><kbd>→</kbd> finish</span>
            <span v-if="referenceImages.length > 1"><kbd>↑</kbd><kbd>↓</kbd> reference</span>
            <span><kbd>G</kbd> good</span>
            <span><kbd>N</kbd> needs work</span>
            <span><kbd>Enter</kbd> next wheel</span>
          </div>

          <div class="rp-fs-strip">
            <button v-for="(r, i) in renderResults" :key="i" class="rp-fs-thumb" :class="{ active: i === fullscreenIndex }" @click="fullscreenIndex = i">
              <img v-if="r.imageUrl" :src="r.imageUrl" :alt="r.label" />
              <div v-else class="rp-fs-thumb-empty"><div v-if="r.loading" class="rp-spinner" /></div>
            </button>
          </div>

          <div class="rp-fs-foot">
            <span class="rp-fs-foot-status" :class="productStatus(selectedProductId)">{{ statusLabel(productStatus(selectedProductId)) }}</span>
            <button class="rp-btn rp-btn-render rp-fs-next-btn" :disabled="!nextUnreviewedProduct || renderInProgress" @click="nextWheel">
              <span>{{ nextUnreviewedProduct ? 'Next wheel →' : 'All reviewed 🎉' }}</span>
              <kbd v-if="nextUnreviewedProduct">Enter</kbd>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- DEBUG MODAL -->
    <Teleport to="body">
      <div v-if="debugModalData" class="rp-fullscreen-overlay" @click.self="closeDebugModal" @keydown.escape="closeDebugModal">
        <div class="rp-debug-modal">
          <div class="rp-debug-modal-header">
            <span class="rp-debug-modal-title">
              Gemini Debug — {{ debugModalData.debug?.parts?.length || 0 }} parts<span v-if="debugModalData.rejected.length"> · {{ debugModalData.rejected.length }} rejected</span>
            </span>
            <div style="display: flex; gap: 0.5rem;">
              <button v-if="debugModalData.rejected.length" class="rp-btn rp-btn-ghost rp-btn-xs" @click="toggleRejected">
                {{ showRejected ? 'Hide rejected' : 'Show rejected' }}
              </button>
              <button v-if="debugModalData.debug" class="rp-btn rp-btn-ghost rp-btn-xs" @click="copyDebugText">Copy text</button>
              <button class="rp-fullscreen-close" @click="closeDebugModal" style="position: static;">&times;</button>
            </div>
          </div>
          <div class="rp-debug-modal-body">
            <div v-if="showRejected && debugModalData.rejected.length" class="rp-debug-rejected">
              <span class="rp-debug-rejected-label">Rejected attempts ({{ debugModalData.rejected.length }})</span>
              <div v-for="(att, k) in debugModalData.rejected" :key="`rej-${k}`" class="rp-debug-rejected-card">
                <div class="rp-debug-rejected-preview">
                  <img :src="`data:image/jpeg;base64,${att.image_b64}`" :alt="`Rejected attempt ${k + 1}`" loading="lazy" />
                </div>
                <div class="rp-debug-rejected-meta">
                  <span class="rp-debug-rejected-badge">rejected</span>
                  <div class="rp-debug-rejected-reason">{{ att.reason }}</div>
                  <span v-if="att.confidence != null" class="rp-muted" style="font-size: 0.7rem;">confidence: {{ att.confidence }}</span>
                </div>
              </div>
            </div>
            <div v-if="debugModalData.debug?.missing_references?.length" class="rp-debug-missing">
              <span class="rp-debug-missing-label">Missing references ({{ debugModalData.debug.missing_references.length }})</span>
              <span v-for="(ref, k) in debugModalData.debug.missing_references" :key="k" class="rp-debug-missing-item">{{ ref }}</span>
            </div>
            <template v-for="(part, k) in debugModalData.debug?.parts" :key="k">
              <pre v-if="part.type === 'text'" class="rp-debug-prompt">{{ part.content }}</pre>
              <div v-else-if="part.type === 'image'" class="rp-debug-image-card">
                <div class="rp-debug-image-preview">
                  <img v-if="part.source" :src="storageUrl(part.source)" :alt="`Part ${k + 1}`" loading="lazy" />
                  <div v-else class="rp-debug-image-placeholder">No source</div>
                </div>
                <div class="rp-debug-image-meta">
                  <span class="rp-debug-image-badge">image</span>
                  <span class="rp-muted">{{ part.mime_type }} · {{ formatBytes(part.size_bytes) }}</span>
                  <span v-if="part.source" class="rp-debug-source">{{ part.source }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
    </template>
  </div>
</template>
