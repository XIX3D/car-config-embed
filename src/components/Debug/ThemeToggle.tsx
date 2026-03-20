import { Show } from 'solid-js'
import { themeStore, currentTheme } from '../../stores/theme-store'

const isDebug = import.meta.env.VITE_DEBUG === 'true'

export function ThemeToggle() {
  return (
    <Show when={isDebug}>
      <button
        class="fixed bottom-4 left-4 z-[1000001] px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
        style={{
          background: 'rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fff',
          'backdrop-filter': 'blur(8px)',
        }}
        onClick={() => themeStore.toggle()}
      >
        Theme: {currentTheme()}
      </button>
    </Show>
  )
}
