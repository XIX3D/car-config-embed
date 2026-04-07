import { For, createMemo } from 'solid-js'
import { PARTICLE_CONFIG } from '../../constants'

interface AmbientParticlesProps {
  count?: number
}

export function AmbientParticles(props: AmbientParticlesProps) {
  const count = () => props.count ?? PARTICLE_CONFIG.defaultCount

  const particles = createMemo(() => {
    const { leftRange, topRange, sizeRange, durationRange, staggerMultiplier } = PARTICLE_CONFIG
    return Array.from({ length: count() }, (_, i) => {
      const staggerDelay = (i / count()) * staggerMultiplier
      return {
        id: i,
        left: `${leftRange.min + Math.random() * (leftRange.max - leftRange.min)}%`,
        top: `${topRange.min + Math.random() * (topRange.max - topRange.min)}%`,
        size: sizeRange.base + Math.random() * sizeRange.variance,
        duration: durationRange.base + Math.random() * durationRange.variance,
        delay: staggerDelay,
      }
    })
  })

  return (
    <div class="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      <For each={particles()}>
        {(p) => (
          <div
            class="absolute rounded-full"
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: 'radial-gradient(circle, color-mix(in srgb, var(--theme-primary-light) 90%, transparent) 0%, color-mix(in srgb, var(--theme-primary-muted) 70%, transparent) 100%)',
              'box-shadow': '0 0 6px color-mix(in srgb, var(--theme-primary-light) 50%, transparent)',
              opacity: 0,
              animation: `gentleRise ${p.duration}s ease-in-out ${p.delay}s infinite`,
              'animation-fill-mode': 'forwards',
            }}
          />
        )}
      </For>
    </div>
  )
}
