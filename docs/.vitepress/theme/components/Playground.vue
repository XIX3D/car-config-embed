<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as monaco from 'monaco-editor'

const DEMO_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3aGVlbF9pZCI6NDIyLCJtYW51ZmFjdHVyZXJfaWQiOjEsImlhdCI6MTc3MjIxNzYzMSwiZXhwIjoxODAzNzUzNjMxfQ.1if43QRSR3HLZwqvvRAs9mYcQd62yQuBolqP-v_mz78'
const WIDGET_URL = 'https://github.com/XIX3D/car-config-embed/releases/download/v0.0.1/car-config-embed.iife.js'

const defaultCode = `<!DOCTYPE html>
<html>
<head>
  <script src="${WIDGET_URL}"><\/script>
</head>
<body>
  <button
    class="avacar-preview"
    data-jwt="${DEMO_JWT}"
    data-brand="HRE WHEELS"
    data-text="Preview on Your Car"
    data-size="standard"
    data-button-theme="light">
  </button>
</body>
</html>`

const code = ref(defaultCode)
const theme = ref<'light' | 'dark'>('light')
const size = ref<'standard' | 'compact'>('standard')
const brand = ref('HRE WHEELS')
const buttonText = ref('Preview on Your Car')
const jwt = ref(DEMO_JWT)

const editorContainer = ref<HTMLElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null

const previewKey = ref(0)

const previewHtml = computed(() => {
  return code.value
    .replace(/data-jwt="[^"]*"/, `data-jwt="${jwt.value}"`)
    .replace(/data-brand="[^"]*"/, `data-brand="${brand.value}"`)
    .replace(/data-text="[^"]*"/, `data-text="${buttonText.value}"`)
    .replace(/data-size="[^"]*"/, `data-size="${size.value}"`)
    .replace(/data-button-theme="[^"]*"/, `data-button-theme="${theme.value}"`)
})

function refreshPreview() {
  previewKey.value++
}

function updateCodeFromConfig() {
  code.value = code.value
    .replace(/data-jwt="[^"]*"/, `data-jwt="${jwt.value}"`)
    .replace(/data-brand="[^"]*"/, `data-brand="${brand.value}"`)
    .replace(/data-text="[^"]*"/, `data-text="${buttonText.value}"`)
    .replace(/data-size="[^"]*"/, `data-size="${size.value}"`)
    .replace(/data-button-theme="[^"]*"/, `data-button-theme="${theme.value}"`)

  if (editor) {
    editor.setValue(code.value)
  }
}

watch([theme, size, brand, buttonText, jwt], updateCodeFromConfig)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(code, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    previewKey.value++
  }, 500)
})

onMounted(() => {
  if (editorContainer.value) {
    const isDark = document.documentElement.classList.contains('dark')

    editor = monaco.editor.create(editorContainer.value, {
      value: code.value,
      language: 'html',
      theme: isDark ? 'vs-dark' : 'vs',
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
    })

    editor.onDidChangeModelContent(() => {
      code.value = editor?.getValue() || ''
    })

    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains('dark')
      monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    onUnmounted(() => {
      observer.disconnect()
      editor?.dispose()
    })
  }
})

function copyCode() {
  navigator.clipboard.writeText(code.value)
}

function resetCode() {
  code.value = defaultCode
  jwt.value = DEMO_JWT
  brand.value = 'HRE WHEELS'
  buttonText.value = 'Preview on Your Car'
  theme.value = 'light'
  size.value = 'standard'
  if (editor) {
    editor.setValue(code.value)
  }
}
</script>

<template>
  <div class="config-panel">
    <div class="config-item">
      <label>Theme</label>
      <select v-model="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
    <div class="config-item">
      <label>Size</label>
      <select v-model="size">
        <option value="standard">Standard</option>
        <option value="compact">Compact</option>
      </select>
    </div>
    <div class="config-item">
      <label>Brand</label>
      <input v-model="brand" type="text" placeholder="Brand name" />
    </div>
    <div class="config-item">
      <label>Button Text</label>
      <input v-model="buttonText" type="text" placeholder="Button text" />
    </div>
  </div>

  <div class="config-item" style="margin-bottom: 1rem;">
    <label>JWT Token</label>
    <input
      v-model="jwt"
      type="text"
      placeholder="Enter JWT token"
      style="width: 100%; font-family: var(--vp-font-family-mono); font-size: 0.75rem;"
    />
  </div>

  <div class="playground-container">
    <div class="editor-panel">
      <div class="panel-header">
        <span>Code Editor</span>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn-primary" @click="copyCode" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
            Copy
          </button>
          <button class="btn-primary" @click="resetCode" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--vp-c-text-3);">
            Reset
          </button>
        </div>
      </div>
      <div ref="editorContainer" style="height: 400px;"></div>
    </div>

    <div class="preview-panel">
      <div class="panel-header">
        <span>Live Preview</span>
      </div>
      <iframe
        :key="previewKey"
        :srcdoc="previewHtml"
        class="preview-iframe"
      />
      <button
        class="btn-primary"
        @click="refreshPreview"
        style="margin-top: 0.5rem; width: 100%;"
      >
        Refresh Preview
      </button>
    </div>
  </div>
</template>
