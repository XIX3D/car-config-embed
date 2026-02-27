<script setup lang="ts">
import { ref, computed } from 'vue'

interface JWTPayload {
  wheel_id?: string
  wrap_id?: string
  variant_ids?: string[]
  exp?: number
  iat?: number
  [key: string]: unknown
}

const PRESET_TOKENS = [
  {
    name: 'HRE P101SC',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3aGVlbF9pZCI6NDIyLCJtYW51ZmFjdHVyZXJfaWQiOjEsImlhdCI6MTc3MjIxNzYzMSwiZXhwIjoxODAzNzUzNjMxfQ.1if43QRSR3HLZwqvvRAs9mYcQd62yQuBolqP-v_mz78',
  },
  {
    name: 'Expired Token',
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3aGVlbF9pZCI6NDIyLCJleHAiOjE2MDQxNTM2MDAsImlhdCI6MTYwNDE1MzYwMH0.test',
  },
]

const jwt = ref('')
const activePreset = ref<string | null>(null)

function decodeBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  return atob(base64)
}

function decodeJWT(token: string): { header: object; payload: JWTPayload } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1])) as JWTPayload

    return { header, payload }
  } catch {
    return null
  }
}

const decoded = computed(() => {
  if (!jwt.value.trim()) return null
  return decodeJWT(jwt.value.trim())
})

const isValid = computed(() => {
  if (!decoded.value) return false
  const payload = decoded.value.payload
  if (payload.exp && payload.exp * 1000 < Date.now()) return false
  return !!(payload.wheel_id || payload.wrap_id)
})

const validationMessage = computed(() => {
  if (!jwt.value.trim()) return null
  if (!decoded.value) return { valid: false, message: 'Invalid JWT format' }

  const payload = decoded.value.payload
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return { valid: false, message: 'Token expired' }
  }
  if (!payload.wheel_id && !payload.wrap_id) {
    return { valid: false, message: 'Missing wheel_id or wrap_id' }
  }
  return { valid: true, message: 'Valid token' }
})

function selectPreset(preset: typeof PRESET_TOKENS[0]) {
  jwt.value = preset.token
  activePreset.value = preset.name
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}
</script>

<template>
  <div class="jwt-decoder">
    <h3 style="margin-top: 0; margin-bottom: 0.75rem;">JWT Token Decoder</h3>

    <div class="token-presets">
      <span style="font-size: 0.75rem; color: var(--vp-c-text-2); margin-right: 0.5rem;">Presets:</span>
      <button
        v-for="preset in PRESET_TOKENS"
        :key="preset.name"
        class="token-preset"
        :class="{ active: activePreset === preset.name }"
        @click="selectPreset(preset)"
      >
        {{ preset.name }}
      </button>
    </div>

    <textarea
      v-model="jwt"
      class="jwt-input"
      placeholder="Paste your JWT token here..."
      @input="activePreset = null"
    />

    <div v-if="validationMessage" style="margin-top: 0.75rem;">
      <span
        class="validation-badge"
        :class="{ valid: validationMessage.valid, invalid: !validationMessage.valid }"
      >
        {{ validationMessage.valid ? '✓' : '✗' }} {{ validationMessage.message }}
      </span>
    </div>

    <div v-if="decoded" class="jwt-output">
      <div style="margin-bottom: 1rem;">
        <strong>Header:</strong>
        <pre style="margin: 0.5rem 0 0 0;">{{ JSON.stringify(decoded.header, null, 2) }}</pre>
      </div>

      <div>
        <strong>Payload:</strong>
        <pre style="margin: 0.5rem 0 0 0;">{{ JSON.stringify(decoded.payload, null, 2) }}</pre>
      </div>

      <div v-if="decoded.payload.exp || decoded.payload.iat" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--vp-c-divider);">
        <strong>Timestamps:</strong>
        <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem;">
          <li v-if="decoded.payload.iat">Issued: {{ formatDate(decoded.payload.iat) }}</li>
          <li v-if="decoded.payload.exp">
            Expires: {{ formatDate(decoded.payload.exp) }}
            <span v-if="decoded.payload.exp * 1000 < Date.now()" style="color: #ef4444;"> (expired)</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
