import { For, createMemo } from 'solid-js'

interface AmbientParticlesProps {
  count?: number
}

export function AmbientParticles(props: AmbientParticlesProps) {
  const count = () => props.count ?? 12

  const particles = createMemo(() => {
    return Array.from({ length: count() }, (_, i) => {
      const staggerDelay = (i / count()) * 20
      return {
        id: i,
        left: `${10 + Math.random() * 80}%`,
        top: `${60 + Math.random() * 35}%`,
        size: 2 + Math.random() * 1.5,
        duration: 18 + Math.random() * 8,
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
              background: 'radial-gradient(circle, rgba(147, 197, 253, 0.9) 0%, rgba(224, 231, 255, 0.7) 100%)',
              'box-shadow': '0 0 6px rgba(147, 197, 253, 0.5)',
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
