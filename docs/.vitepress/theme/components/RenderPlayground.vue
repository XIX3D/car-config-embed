<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'

type MonacoEditor = typeof import('monaco-editor')
const monaco = shallowRef<MonacoEditor | null>(null)

interface Product {
  id: number
  name: string
  category: string
  sku: string
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

const apiConnected = ref(false)
const products = ref<Product[]>([])
const selectedProductId = ref<string>('')
const productSearch = ref('')
const productListOpen = ref(false)
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

const fullscreenImage = computed(() => {
  if (fullscreenIndex.value < 0) return null
  return renderResults.value[fullscreenIndex.value]?.imageUrl || null
})

const fullscreenLabel = computed(() => {
  if (fullscreenIndex.value < 0) return ''
  return renderResults.value[fullscreenIndex.value]?.label || ''
})

function openFullscreen(index: number) {
  fullscreenIndex.value = index
}

function closeFullscreen() {
  fullscreenIndex.value = -1
}

function fullscreenPrev() {
  if (fullscreenIndex.value <= 0) return
  for (let i = fullscreenIndex.value - 1; i >= 0; i--) {
    if (renderResults.value[i]?.imageUrl) { fullscreenIndex.value = i; return }
  }
}

function fullscreenNext() {
  if (fullscreenIndex.value >= renderResults.value.length - 1) return
  for (let i = fullscreenIndex.value + 1; i < renderResults.value.length; i++) {
    if (renderResults.value[i]?.imageUrl) { fullscreenIndex.value = i; return }
  }
}

function onFullscreenKeydown(e: KeyboardEvent) {
  if (fullscreenIndex.value < 0) return
  if (e.key === 'ArrowLeft') { fullscreenPrev(); e.preventDefault() }
  else if (e.key === 'ArrowRight') { fullscreenNext(); e.preventDefault() }
  else if (e.key === 'Escape') { closeFullscreen(); e.preventDefault() }
}

const fastMode = ref(true)

const masterPromptContainer = ref<HTMLElement>()
const editablePromptContainer = ref<HTMLElement>()
let masterEditor: any = null
let editableEditor: any = null
let masterEditorInitialized = false
let observer: MutationObserver | null = null

const canRender = computed(() => {
  return selectedProductId.value && (selectedVehicle.value || uploadedFile.value)
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

const filteredProducts = computed(() => {
  const q = productSearch.value.toLowerCase().trim()
  if (!q) return products.value
  return products.value.filter(p =>
    p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
  )
})

function pickProduct(p: Product) {
  selectedProductId.value = String(p.id)
  productSearch.value = ''
  productListOpen.value = false
}

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
  try {
    const res = await apiFetch('/api/v1/products?limit=100&category=wheels&manufacturer_id=1')
    const data = await res.json()
    const all = data.products || data || []
    products.value = all.filter((p: any) => p.manufacturer_id === 1)
  } catch (e) {
    console.error('Failed to fetch products:', e)
    products.value = []
  }
}

async function fetchVariants(productId: string) {
  try {
    const res = await apiFetch(`/api/v1/products/${productId}/variants`)
    const data = await res.json()
    variants.value = data.variants || []
  } catch (e) {
    console.error('Failed to fetch variants:', e)
    variants.value = []
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
    selectedVariantId.value = ''
    masterPrompt.value = ''
    editablePrompt.value = ''
    if (masterEditor) masterEditor.setValue('')
    if (editableEditor) editableEditor.setValue('')
    return
  }
  selectedVariantId.value = ''
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

function onClickOutside(e: MouseEvent) {
  const wrap = document.querySelector('.rp-product-select-wrap')
  if (wrap && !wrap.contains(e.target as Node)) {
    productListOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('paste', onPaste)
  document.addEventListener('keydown', onFullscreenKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
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
        <button class="rp-btn rp-btn-render" :disabled="renderInProgress || !canRender" @click="triggerRender">
          <span v-if="renderInProgress" class="rp-btn-spinner" />
          {{ renderInProgress ? 'Rendering...' : selectedVariantId ? 'Render' : `Render All (${variants.length || 1})` }}
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
        <div class="rp-product-row">
          <div class="rp-product-select-wrap">
            <div class="rp-search-box">
              <input
                v-model="productSearch"
                type="text"
                class="rp-search-input"
                :placeholder="selectedProduct ? selectedProduct.name : 'Search products...'"
                @focus="productListOpen = true"
              />
              <button v-if="selectedProductId" class="rp-search-clear" @click="selectedProductId = ''; productSearch = '';">&times;</button>
            </div>
            <div v-if="productListOpen" class="rp-product-list">
              <div
                v-for="p in filteredProducts"
                :key="p.id"
                class="rp-product-item"
                :class="{ active: selectedProductId === String(p.id) }"
                @mousedown.prevent="pickProduct(p)"
              >
                <img v-if="productThumb(p)" :src="productThumb(p)!" class="rp-product-item-img" />
                <div v-else class="rp-product-item-img rp-product-item-img-empty" />
                <div class="rp-product-item-info">
                  <span class="rp-product-item-name">{{ p.name }}</span>
                  <span class="rp-product-item-sku">{{ p.sku }}</span>
                </div>
              </div>
              <div v-if="!filteredProducts.length" class="rp-product-item-empty">No products match "{{ productSearch }}"</div>
            </div>
          </div>
          <div v-if="selectedProduct" class="rp-product-thumb">
            <img v-if="productThumb(selectedProduct)" :src="productThumb(selectedProduct)!" :alt="selectedProduct.name" />
            <div v-else class="rp-product-thumb-empty">No image</div>
          </div>
        </div>

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
    <div class="rp-card">
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
              <span v-for="(evt, j) in r.sseEvents" :key="j" class="rp-sse-chip" :class="evt.type">
                <template v-if="evt.type === 'vehicle_detected'">{{ evt.data.make }} {{ evt.data.model }}</template>
                <template v-else-if="evt.type === 'error'">{{ evt.data.message }}</template>
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

    <!-- FULLSCREEN MODAL -->
    <Teleport to="body">
      <div v-if="fullscreenImage" class="rp-fullscreen-overlay" @click.self="closeFullscreen">
        <button class="rp-fs-nav rp-fs-prev" :disabled="fullscreenIndex <= 0" @click="fullscreenPrev">&lsaquo;</button>
        <div class="rp-fullscreen-modal">
          <button class="rp-fullscreen-close" @click="closeFullscreen">&times;</button>
          <img :src="fullscreenImage" :alt="fullscreenLabel" />
          <div class="rp-fs-label">{{ fullscreenLabel }}</div>
        </div>
        <button class="rp-fs-nav rp-fs-next" :disabled="fullscreenIndex >= renderResults.length - 1" @click="fullscreenNext">&rsaquo;</button>
      </div>
    </Teleport>
    </template>
  </div>
</template>
