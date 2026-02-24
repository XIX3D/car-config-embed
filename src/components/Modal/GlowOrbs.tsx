export function GlowOrbs() {
  return (
    <div class="absolute inset-0 pointer-events-none overflow-hidden glow-container">
      <svg
        class="absolute"
        style={{ width: '200%', height: '200%', top: '-50%', left: '-50%' }}
        viewBox="0 0 800 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="glowBlur" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="60" result="blur" />
          </filter>
          <filter id="glowBlurSoft" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="100" result="blur" />
          </filter>
        </defs>
        {/* Top cyan glow */}
        <ellipse
          class="glow-cyan"
          filter="url(#glowBlur)"
          cx="400"
          cy="80"
          rx="120"
          ry="80"
          fill="#93c5fd"
          opacity="0.8"
        />
        {/* Top diffuse white glow */}
        <ellipse
          class="glow-white"
          filter="url(#glowBlurSoft)"
          cx="400"
          cy="60"
          rx="180"
          ry="100"
          fill="white"
          opacity="0.3"
        />
        {/* Bottom left green glow */}
        <ellipse
          class="glow-green-left"
          filter="url(#glowBlur)"
          cx="120"
          cy="720"
          rx="140"
          ry="100"
          fill="#e0e7ff"
          opacity="0.7"
        />
        {/* Bottom right green glow */}
        <ellipse
          class="glow-green-right"
          filter="url(#glowBlur)"
          cx="680"
          cy="720"
          rx="140"
          ry="100"
          fill="#e0e7ff"
          opacity="0.7"
        />
      </svg>
    </div>
  )
}
