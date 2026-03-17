import { Show, For } from 'solid-js'
import type { RenderResult } from '../../types'
import { TruncatedTitle } from './TruncatedTitle'
import { ZENO } from '../../constants'

interface SuccessViewProps {
  productImgUrl: string
  brandName: string
  modelName: string
  isWraps: boolean
  results: RenderResult[]
  interestedFinishes: number[]
  onClose: () => void
  onShare: () => void
}

function CelebrationEffect() {
  const confettiColors = [ZENO.electric, ZENO.cyan, ZENO.green, '#ffffff']
  const confettiCount = 50

  const confettiPieces = Array.from({ length: confettiCount }, (_, i) => ({
    id: i,
    color: confettiColors[i % confettiColors.length],
    left: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    rotation: Math.random() * 360,
    rotationEnd: 360 + Math.random() * 720,
    drift: -50 + Math.random() * 100,
    isCircle: Math.random() > 0.5,
    size: 4 + Math.random() * 8,
  }))

  return (
    <div class="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <For each={confettiPieces}>
        {(piece) => (
          <div
            class="absolute"
            style={{
              left: `${piece.left}%`,
              top: '-20px',
              width: `${piece.size}px`,
              height: piece.isCircle ? `${piece.size}px` : `${piece.size * 0.6}px`,
              'background-color': piece.color,
              'border-radius': piece.isCircle ? '50%' : '2px',
              animation: `confettiFall ${piece.duration}s ease-out ${piece.delay}s forwards`,
              '--rotation': `${piece.rotation}deg`,
              '--rotation-end': `${piece.rotationEnd}deg`,
              '--drift': `${piece.drift}px`,
            }}
          />
        )}
      </For>
    </div>
  )
}

function Sparkles() {
  const sparkleCount = 8
  const sparkles = Array.from({ length: sparkleCount }, (_, i) => ({
    id: i,
    angle: (i * 360) / sparkleCount,
    distance: 50 + Math.random() * 30,
    delay: i * 0.15,
    color: i % 2 === 0 ? ZENO.cyan : ZENO.green,
  }))

  return (
    <div class="absolute inset-0 pointer-events-none">
      <For each={sparkles}>
        {(sparkle) => {
          const x = Math.cos((sparkle.angle * Math.PI) / 180) * sparkle.distance
          const y = Math.sin((sparkle.angle * Math.PI) / 180) * sparkle.distance

          return (
            <svg
              class="absolute w-4 h-4"
              style={{
                left: `calc(50% + ${x}px - 8px)`,
                top: `calc(50% + ${y}px - 8px)`,
                color: sparkle.color,
                animation: `sparkle 1.5s ease-in-out ${sparkle.delay}s infinite`,
              }}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" />
            </svg>
          )
        }}
      </For>
    </div>
  )
}

function AmbientGlow() {
  return (
    <div
      class="absolute rounded-full"
      style={{
        width: '180px',
        height: '180px',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, ${ZENO.electric}30 0%, transparent 70%)`,
        animation: 'softPulse 2s ease-in-out infinite',
      }}
    />
  )
}

export function SuccessView(props: SuccessViewProps) {
  const selectedResults = () =>
    props.interestedFinishes
      .map((i) => props.results[i])
      .filter(Boolean)

  const handleClose = () => props.onClose()
  const handleShare = () => props.onShare()

  return (
    <div class="relative z-1 p-6 flex flex-col items-center text-center min-h-[520px] overflow-hidden">
      {/* Celebration Effect */}
      <CelebrationEffect />

      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp relative z-10">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {props.productImgUrl ? (
              <img class="w-11 h-11 rounded-full object-cover" src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div class="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
            )}
          </div>
          <div class="flex flex-col text-left">
            <span class="text-[10px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle text={props.modelName} class="text-xl font-medium text-white" />
          </div>
        </div>
        <button
          class="w-10 h-10 rounded-xl bg-transparent border-none text-white/30 text-2xl cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/5 hover:scale-105 z-10"
          aria-label="Close"
          onClick={handleClose}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Success Content */}
      <div class="flex-1 flex flex-col items-center justify-center py-4 relative z-10">
        {/* Checkmark with ambient glow and sparkles */}
        <div class="relative mb-6">
          <AmbientGlow />
          <Sparkles />
          <div
            class="relative w-20 h-20 rounded-full flex items-center justify-center animate-successPop"
            style={{
              background: `linear-gradient(135deg, ${ZENO.electric}, ${ZENO.cyan})`,
              'box-shadow': `0 0 30px ${ZENO.electric}60, 0 0 60px ${ZENO.cyan}40`,
            }}
          >
            <svg class="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h2 class="text-[28px] font-bold text-white m-0 mb-2">Thank you!</h2>
        <p class="text-[15px] text-white/40 m-0 mb-4">
          {props.isWraps ? 'A wrap specialist' : 'A wheel specialist'} will contact you shortly
        </p>

        <Show when={selectedResults().length > 0}>
          <div class="mb-6 p-4 rounded-xl bg-white/5 text-left w-full max-w-[280px] animate-fadeInUp opacity-0 [animation-delay:0.2s]">
            <p class="text-xs uppercase tracking-[1px] text-white/40 mb-2">Interested in:</p>
            <div class="flex flex-wrap gap-2">
              <For each={selectedResults()}>
                {(result) => (
                  <div class="flex items-center gap-2 py-1 px-2 rounded-md bg-white/5">
                    <div
                      class="w-3 h-3 rounded"
                      style={{ background: result.hexColor || '#ccc' }}
                    />
                    <span class="text-sm text-white/70">
                      {result.label.replace(' (Original)', '')}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="flex flex-col gap-3 w-full max-w-[280px]">
          <div class="relative w-full animate-fadeInUp">
            <button
              class="relative w-full py-4 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20"
              onClick={handleShare}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share to Social
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto relative z-10">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
