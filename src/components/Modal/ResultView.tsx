import { createSignal, createEffect, For, onMount, onCleanup } from 'solid-js'
import type { RenderResult } from '../../types'
import { ZOOM } from '../../constants'
import { TruncatedTitle } from './TruncatedTitle'

interface ResultViewProps {
  productImgUrl: string
  brandName: string
  modelName: string
  results: RenderResult[]
  currentIndex: number
  zoomLevel: number
  panX: number
  panY: number
  onClose: () => void
  onRetry: () => void
  onFullscreen: () => void
  onQuote: () => void
  onSelectIndex: (index: number) => void
  onZoom: (level: number) => void
  onPan: (x: number, y: number) => void
  onModalResize?: (width: number, height: number) => void
}

export function ResultView(props: ResultViewProps) {
  let imageRef: HTMLImageElement | undefined
  let wrapperRef: HTMLDivElement | undefined
  const [isDragging, setIsDragging] = createSignal(false)
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 })
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 })
  const [lastTouchDist, setLastTouchDist] = createSignal(0)

  const current = () => props.results[props.currentIndex]

  const getFilename = () => {
    const c = current()

    if (!c) return 'my-wheel-build.jpg'
    const brand = props.brandName.replace(/[^a-z0-9]/gi, '')
    const model = props.modelName.replace(/[^a-z0-9]/gi, '')
    const finish = c.label.replace(' (Original)', '').replace(/[^a-z0-9]/gi, '')

    return `${brand}_${model}_${finish}_ZenoRender.jpg`
  }

  const handleDownload = () => {
    const c = current()

    if (!c?.image) return
    const link = document.createElement('a')

    link.href = c.image
    link.download = getFilename()
    link.click()
  }

  const clampPan = (x: number, y: number): { x: number; y: number } => {
    if (props.zoomLevel <= 1 || !imageRef) return { x: 0, y: 0 }
    const maxPanX = (imageRef.offsetWidth * (props.zoomLevel - 1)) / (2 * props.zoomLevel)
    const maxPanY = (imageRef.offsetHeight * (props.zoomLevel - 1)) / (2 * props.zoomLevel)

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM.step : ZOOM.step
    const newZoom = Math.max(ZOOM.min, Math.min(ZOOM.max, props.zoomLevel + delta))

    if (newZoom !== props.zoomLevel) {
      props.onZoom(newZoom)
      if (newZoom <= 1) {
        props.onPan(0, 0)
      } else {
        const clamped = clampPan(props.panX, props.panY)

        props.onPan(clamped.x, clamped.y)
      }
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (props.zoomLevel <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setPanStart({ x: props.panX, y: props.panY })
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return
    const dx = (e.clientX - dragStart().x) / props.zoomLevel
    const dy = (e.clientY - dragStart().y) / props.zoomLevel
    const clamped = clampPan(panStart().x + dx, panStart().y + dy)

    props.onPan(clamped.x, clamped.y)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )

      setLastTouchDist(dist)
    } else if (e.touches.length === 1 && props.zoomLevel > 1) {
      setIsDragging(true)
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY })
      setPanStart({ x: props.panX, y: props.panY })
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      )
      const scale = dist / lastTouchDist()
      const newZoom = Math.max(ZOOM.min, Math.min(ZOOM.max, props.zoomLevel * scale))

      props.onZoom(newZoom)
      setLastTouchDist(dist)
      const clamped = clampPan(props.panX, props.panY)

      props.onPan(clamped.x, clamped.y)
    } else if (e.touches.length === 1 && isDragging()) {
      e.preventDefault()
      const dx = (e.touches[0].clientX - dragStart().x) / props.zoomLevel
      const dy = (e.touches[0].clientY - dragStart().y) / props.zoomLevel
      const clamped = clampPan(panStart().x + dx, panStart().y + dy)

      props.onPan(clamped.x, clamped.y)
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    setLastTouchDist(0)
  }

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  })

  onCleanup(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  const handleImageLoad = () => {
    if (imageRef && props.onModalResize) {
      props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight)
    }
  }

  createEffect(() => {
    void props.currentIndex
    setTimeout(() => {
      if (imageRef && imageRef.complete && imageRef.naturalWidth > 0 && props.onModalResize) {
        props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight)
      }
    }, 0)
  })

  const transformStyle = () => ({
    transform: `scale(${props.zoomLevel}) translate(${props.panX}px, ${props.panY}px)`,
    cursor: props.zoomLevel > 1 ? (isDragging() ? 'grabbing' : 'grab') : 'zoom-in',
  })

  const handleClose = () => props.onClose()
  const handleRetry = () => props.onRetry()
  const handleFullscreen = () => props.onFullscreen()
  const handleQuote = () => props.onQuote()

  return (
    <div class="relative z-1 flex flex-col items-center p-6 min-h-[520px]">
      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp">
        <div class="flex items-center gap-3 mx-auto">
          <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {props.productImgUrl ? (
              <img class="w-11 h-11 rounded-full object-cover" src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div class="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
            )}
          </div>
          <div class="flex flex-col">
            <span class="text-[10px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle text={props.modelName} class="text-xl font-semibold text-white" />
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

      {/* Result Content */}
      <div class="flex flex-col items-center w-full">
        <div
          ref={wrapperRef}
          class="relative inline-block rounded-2xl overflow-hidden mb-4 max-w-full animate-fadeInUp"
          onWheel={handleWheel}
        >
          {/* Action Buttons */}
          <button
            class="absolute top-3 left-3 w-11 h-11 rounded-xl bg-black/50 backdrop-blur-sm border-none text-white cursor-pointer flex items-center justify-center transition-all z-5 hover:scale-[1.08] hover:bg-black/70"
            title="Try another photo"
            onClick={handleRetry}
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
          <button
            class="absolute top-3 right-15 w-11 h-11 rounded-xl bg-black/50 backdrop-blur-sm border-none text-white cursor-pointer flex items-center justify-center transition-all z-5 hover:scale-[1.08] hover:bg-black/70"
            title="Fullscreen"
            onClick={handleFullscreen}
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
          <button
            class="absolute top-3 right-3 w-11 h-11 rounded-xl bg-black/50 backdrop-blur-sm border-none text-white cursor-pointer flex items-center justify-center transition-all z-5 hover:scale-[1.08] hover:bg-black/70"
            title="Download"
            onClick={handleDownload}
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {current()?.loading ? (
            <div class="avacar-result-img flex items-center justify-center bg-black/20 rounded-2xl min-h-[300px]">
              <div class="flex flex-col items-center gap-3">
                <div class="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span class="text-white/50 text-sm">Rendering...</span>
              </div>
            </div>
          ) : (
            <img
              ref={imageRef}
              class="avacar-result-img"
              src={current()?.image || ''}
              alt="Preview"
              style={transformStyle()}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onLoad={handleImageLoad}
              draggable={false}
            />
          )}
        </div>

        {/* Color Carousel */}
        <div class="w-full animate-fadeInUp opacity-0 [animation-delay:0.2s]">
          <div class="flex items-center justify-center gap-3 overflow-x-auto py-2 pb-3 scrollbar-hide">
            <For each={props.results}>
              {(result, i) => (
                <button
                  class={`flex-shrink-0 w-14 h-14 rounded-xl border-none transition-all bg-white relative ${
                    result.loading
                      ? 'opacity-30 cursor-wait'
                      : result.success
                        ? i() === props.currentIndex
                          ? 'opacity-100 scale-[1.15] shadow-[0_0_0_2px_#fff,0_0_20px_rgba(255,255,255,0.2)] cursor-pointer'
                          : 'opacity-50 hover:opacity-80 hover:scale-105 cursor-pointer'
                        : 'opacity-20 cursor-not-allowed'
                  }`}
                  style={{
                    'background-image': result.referenceImage ? `url(${result.referenceImage})` : undefined,
                    'background-color': !result.referenceImage ? (result.hexColor || '#fff') : undefined,
                    'background-size': 'contain',
                    'background-repeat': 'no-repeat',
                    'background-position': 'center',
                  }}
                  title={result.loading ? `${result.label} (loading...)` : result.label}
                  onClick={() => result.success && !result.loading && props.onSelectIndex(i())}
                  disabled={result.loading || !result.success}
                >
                  {result.loading && (
                    <div class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                      <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                  {!result.loading && !result.success && (
                    <div class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
                      <svg class="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </button>
              )}
            </For>
          </div>
        </div>

        <p class="text-center text-xs uppercase tracking-[2px] text-white/40 mb-3">
          {current()?.label.replace(' (Original)', '').toUpperCase()}
        </p>

        {/* CTA Button */}
        <div class="relative w-full max-w-80 animate-fadeInUp">
          <button
            class="relative w-full py-4 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white text-zeno-card border-none hover:bg-gray-100 hover:scale-[1.01]"
            onClick={handleQuote}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Request Quote
          </button>
        </div>
      </div>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
