export function GlowOrbs() {
  return (
    <div class="absolute inset-0 pointer-events-none">
      {/* Top Ice Glow System */}
      <TopIceGlow />
      {/* Bottom Lavender Glow System */}
      <BottomGlowSystem />
    </div>
  )
}

function TopIceGlow() {
  return (
    <>
      {/* Main ice blue ellipse - wide, top center */}
      <div
        class="absolute pointer-events-none"
        style={{
          top: '-100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '130%',
          height: '280px',
          animation: 'breatheGlow 4s ease-in-out infinite',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 650 280" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            <filter id="iceBlur1" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="50" />
            </filter>
          </defs>
          <ellipse cx="325" cy="50" rx="280" ry="110" fill="#93c5fd" opacity="0.55" filter="url(#iceBlur1)" />
        </svg>
      </div>

      {/* Secondary ice ellipse - top left */}
      <div
        class="absolute pointer-events-none"
        style={{
          top: '-60px',
          left: '-8%',
          width: '50%',
          height: '200px',
          animation: 'breatheSide 4s ease-in-out infinite',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 320 200" fill="none">
          <defs>
            <filter id="iceBlur2" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="35" />
            </filter>
          </defs>
          <ellipse cx="160" cy="50" rx="120" ry="70" fill="#93c5fd" opacity="0.4" filter="url(#iceBlur2)" />
        </svg>
      </div>

      {/* Tertiary ice ellipse - top right */}
      <div
        class="absolute pointer-events-none"
        style={{
          top: '-50px',
          right: '-8%',
          width: '50%',
          height: '200px',
          animation: 'breatheSide 4s ease-in-out infinite 1s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 320 200" fill="none">
          <defs>
            <filter id="iceBlur3" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="35" />
            </filter>
          </defs>
          <ellipse cx="160" cy="50" rx="120" ry="70" fill="#a5b4fc" opacity="0.35" filter="url(#iceBlur3)" />
        </svg>
      </div>

      {/* White overlay ellipse - center top */}
      <div
        class="absolute pointer-events-none"
        style={{
          top: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '85%',
          height: '180px',
          animation: 'breatheWhite 4s ease-in-out infinite',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 425 180" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            <filter id="topWhiteBlur1" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="25" />
            </filter>
          </defs>
          <ellipse cx="213" cy="45" rx="170" ry="55" fill="white" opacity="0.35" filter="url(#topWhiteBlur1)" />
        </svg>
      </div>

      {/* Small white accent ellipse */}
      <div
        class="absolute pointer-events-none"
        style={{
          top: '10px',
          left: '50%',
          width: '55%',
          height: '90px',
          transform: 'translateX(-50%)',
          animation: 'breatheWhite 4s ease-in-out infinite 0.3s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 220 90" fill="none">
          <defs>
            <filter id="topWhiteBlur2" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="15" />
            </filter>
          </defs>
          <ellipse cx="110" cy="45" rx="90" ry="35" fill="white" opacity="0.3" filter="url(#topWhiteBlur2)" />
        </svg>
      </div>

      {/* Frost sparkles */}
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          top: '10%',
          left: '10%',
          width: '5px',
          height: '5px',
          background: 'white',
          'box-shadow': '0 0 8px rgba(255,255,255,0.6)',
          animation: 'shimmerFrost 2.5s ease-in-out infinite',
        }}
      />
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          top: '16%',
          right: '12%',
          width: '4px',
          height: '4px',
          background: 'white',
          'box-shadow': '0 0 8px rgba(147,197,253,0.5)',
          animation: 'shimmerFrost 3s ease-in-out infinite 0.8s',
        }}
      />
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          top: '25%',
          left: '6%',
          width: '4px',
          height: '4px',
          background: 'white',
          'box-shadow': '0 0 6px rgba(255,255,255,0.5)',
          animation: 'shimmerFrost 3.5s ease-in-out infinite 0.3s',
        }}
      />
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          top: '20%',
          right: '8%',
          width: '3px',
          height: '3px',
          background: 'white',
          'box-shadow': '0 0 6px rgba(147,197,253,0.4)',
          animation: 'shimmerFrost 4s ease-in-out infinite 1.5s',
        }}
      />
    </>
  )
}

function BottomGlowSystem() {
  return (
    <>
      {/* Main lavender ellipse - wide, bottom center */}
      <div
        class="absolute pointer-events-none"
        style={{
          bottom: '-100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '130%',
          height: '280px',
          animation: 'breatheGlow 4s ease-in-out infinite 0.5s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 650 280" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            <filter id="lavenderBlur1" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="50" />
            </filter>
          </defs>
          <ellipse cx="325" cy="230" rx="280" ry="110" fill="#e0e7ff" opacity="0.55" filter="url(#lavenderBlur1)" />
        </svg>
      </div>

      {/* Secondary lavender ellipse - bottom left */}
      <div
        class="absolute pointer-events-none"
        style={{
          bottom: '-60px',
          left: '-8%',
          width: '50%',
          height: '200px',
          animation: 'breatheSide 4s ease-in-out infinite 0.5s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 320 200" fill="none">
          <defs>
            <filter id="lavenderBlur2" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="35" />
            </filter>
          </defs>
          <ellipse cx="160" cy="150" rx="120" ry="70" fill="#c7d2fe" opacity="0.45" filter="url(#lavenderBlur2)" />
        </svg>
      </div>

      {/* Tertiary lavender ellipse - bottom right */}
      <div
        class="absolute pointer-events-none"
        style={{
          bottom: '-50px',
          right: '-8%',
          width: '50%',
          height: '200px',
          animation: 'breatheSide 4s ease-in-out infinite 1.5s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 320 200" fill="none">
          <defs>
            <filter id="lavenderBlur3" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="35" />
            </filter>
          </defs>
          <ellipse cx="160" cy="150" rx="120" ry="70" fill="#ddd6fe" opacity="0.4" filter="url(#lavenderBlur3)" />
        </svg>
      </div>

      {/* White overlay ellipse - center bottom */}
      <div
        class="absolute pointer-events-none"
        style={{
          bottom: '-40px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '85%',
          height: '180px',
          animation: 'breatheWhite 4s ease-in-out infinite',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 425 180" fill="none" preserveAspectRatio="xMidYMid slice">
          <defs>
            <filter id="whiteBlur1" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="25" />
            </filter>
          </defs>
          <ellipse cx="213" cy="140" rx="170" ry="55" fill="white" opacity="0.35" filter="url(#whiteBlur1)" />
        </svg>
      </div>

      {/* Small white accent ellipse at bottom */}
      <div
        class="absolute pointer-events-none"
        style={{
          bottom: '10px',
          left: '50%',
          width: '55%',
          height: '90px',
          transform: 'translateX(-50%)',
          animation: 'breatheWhite 4s ease-in-out infinite 0.8s',
        }}
      >
        <svg class="w-full h-full" viewBox="0 0 220 90" fill="none">
          <defs>
            <filter id="whiteBlur2" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="15" />
            </filter>
          </defs>
          <ellipse cx="110" cy="65" rx="90" ry="30" fill="white" opacity="0.3" filter="url(#whiteBlur2)" />
        </svg>
      </div>

      {/* Frost sparkles bottom */}
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          bottom: '20%',
          right: '8%',
          width: '4px',
          height: '4px',
          background: 'white',
          'box-shadow': '0 0 8px rgba(255,255,255,0.5)',
          animation: 'shimmerFrost 3.2s ease-in-out infinite 1.2s',
        }}
      />
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          bottom: '25%',
          left: '12%',
          width: '4px',
          height: '4px',
          background: 'white',
          'box-shadow': '0 0 8px rgba(224,231,255,0.5)',
          animation: 'shimmerFrost 2.8s ease-in-out infinite 0.5s',
        }}
      />
      <div
        class="absolute pointer-events-none rounded-full"
        style={{
          bottom: '18%',
          left: '25%',
          width: '3px',
          height: '3px',
          background: 'white',
          'box-shadow': '0 0 6px rgba(255,255,255,0.4)',
          animation: 'shimmerFrost 4s ease-in-out infinite 2s',
        }}
      />
    </>
  )
}
