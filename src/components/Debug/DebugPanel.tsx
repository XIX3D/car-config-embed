import { createSignal, Show, For, Switch, Match } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { DebugData, DebugPart, DebugImagePart } from '../../types'

interface DebugPanelProps {
  debugData: DebugData
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function fullText(parts: DebugPart[]): string {
  return parts.filter(p => p.type === 'text').map(p => p.content).join('\n')
}

export function DebugPanel(props: DebugPanelProps) {
  const [open, setOpen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const storageUrl = (path: string) => path

  const copyAllText = async () => {
    await navigator.clipboard.writeText(fullText(props.debugData.parts))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <button
        class="absolute bottom-3 left-20 z-20 bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        Gemini Debug
      </button>

      <Show when={open()}>
        <Portal>
          <div
            class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85"
            style={{ "backdrop-filter": "blur(4px)" }}
            onClick={() => setOpen(false)}
          >
            <div
              class="relative flex flex-col bg-[#1a1a2e] rounded-xl overflow-hidden"
              style={{ width: "90vw", "max-width": "900px", "max-height": "90vh", "box-shadow": "0 20px 60px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <span class="text-white font-semibold text-sm">
                  Gemini Debug — {props.debugData.parts.length} parts
                </span>
                <div class="flex gap-2">
                  <button
                    class="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white cursor-pointer transition-colors"
                    onClick={copyAllText}
                  >
                    {copied() ? 'Copied!' : 'Copy text'}
                  </button>
                  <button
                    class="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-lg cursor-pointer transition-colors border-none"
                    onClick={() => setOpen(false)}
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Body */}
              <div class="px-4 py-3 overflow-y-auto flex flex-col gap-2">
                <Show when={props.debugData.missing_references?.length}>
                  <div class="flex flex-wrap items-center gap-2 bg-red-500/15 border border-red-500/30 rounded-lg px-3 py-2">
                    <span class="text-red-400 text-xs font-semibold">
                      Missing references ({props.debugData.missing_references!.length})
                    </span>
                    <For each={props.debugData.missing_references}>
                      {(ref) => (
                        <span class="text-red-300/80 text-[11px] font-mono bg-white/5 px-1.5 py-0.5 rounded">
                          {ref}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>
                <For each={props.debugData.parts}>
                  {(part, i) => (
                    <Switch>
                      <Match when={part.type === 'text'}>
                        <pre
                          class="text-white/80 text-xs font-mono whitespace-pre-wrap bg-white/5 rounded-lg px-3 py-2 leading-relaxed m-0"
                          style={{ "word-break": "break-word" }}
                        >
                          {(part as { content: string }).content}
                        </pre>
                      </Match>
                      <Match when={part.type === 'image'}>
                        {(() => {
                          const img = part as DebugImagePart
                          return (
                            <div class="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                              <div
                                class="shrink-0 rounded-md overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center"
                                style={{ width: "80px", height: "80px" }}
                              >
                                <Show
                                  when={img.source}
                                  fallback={<span class="text-white/20 text-[10px]">no src</span>}
                                >
                                  <img
                                    src={storageUrl(img.source!)}
                                    alt={`Part ${i() + 1}`}
                                    loading="lazy"
                                    class="w-full h-full"
                                    style={{ "object-fit": "contain" }}
                                  />
                                </Show>
                              </div>
                              <div class="flex flex-col gap-1 text-xs min-w-0">
                                <span class="bg-amber-500 text-white font-semibold text-[10px] uppercase px-1.5 py-0.5 rounded w-fit">
                                  image
                                </span>
                                <span class="text-white/50">
                                  {img.mime_type} · {formatBytes(img.size_bytes)}
                                </span>
                                <Show when={img.source}>
                                  <span class="text-amber-400/60 text-[11px] truncate" title={img.source}>
                                    {img.source}
                                  </span>
                                </Show>
                              </div>
                            </div>
                          )
                        })()}
                      </Match>
                    </Switch>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  )
}
