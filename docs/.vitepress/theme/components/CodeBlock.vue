<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  code: string
  language?: string
}>()

const copied = ref(false)

async function copyCode() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div class="code-block-wrapper">
    <div class="code-block-header">
      <span class="code-block-lang">{{ language || 'code' }}</span>
      <button class="code-block-copy" @click="copyCode">
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </div>
    <pre class="code-block-pre"><code>{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.code-block-wrapper {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin: 1rem 0;
}

.code-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.code-block-lang {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
}

.code-block-copy {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
}

.code-block-copy:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.code-block-pre {
  margin: 0;
  padding: 1rem;
  background: var(--vp-code-block-bg);
  overflow-x: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 0.875rem;
  line-height: 1.6;
}

.code-block-pre code {
  color: var(--vp-c-text-1);
}
</style>
