import { createSignal, createEffect, For, onMount, onCleanup } from 'solid-js'
import type { RenderResult } from '../../types'
import { ZOOM } from '../../constants'

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
        e.touches[0].clientY - e.touches[1].clientY
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
        e.touches[0].clientY - e.touches[1].clientY
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
    console.log('Image loaded:', imageRef?.naturalWidth, imageRef?.naturalHeight)
    if (imageRef && props.onModalResize) {
      props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight)
    }
  }

  // Handle cached images that are already loaded when switching variants
  createEffect(() => {
    // Track index changes to trigger effect
    void props.currentIndex
    // Use setTimeout to let the DOM update with new src
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

  return (
    <div class="avacar-result-view">
      <div class="avacar-header">
        <div class="avacar-header-left">
          <div class="avacar-header-thumb">
            {props.productImgUrl ? (
              <img src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div style={{ width: '44px', height: '44px', 'border-radius': '50%', background: 'linear-gradient(135deg, #888, #666)' }} />
            )}
          </div>
          <div class="avacar-header-info">
            <span class="avacar-header-brand">{props.brandName}</span>
            <span class="avacar-header-model">{props.modelName}</span>
          </div>
        </div>
        <button class="avacar-close-btn" aria-label="Close" onClick={props.onClose}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="avacar-result-content">
        <div
          ref={wrapperRef}
          class="avacar-result-image-wrapper"
          onWheel={handleWheel}
        >
          <button class="avacar-image-action-btn avacar-retry-btn" title="Try another photo" onClick={props.onRetry}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 4v6h6M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
            </svg>
          </button>
          <button class="avacar-image-action-btn avacar-fullscreen-btn" title="Fullscreen" onClick={props.onFullscreen}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>
          <button class="avacar-image-action-btn avacar-download-btn" title="Download" onClick={handleDownload}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
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
          />
        </div>

        <div class="avacar-color-carousel">
          <div class="avacar-color-strip">
            <For each={props.results}>
              {(result, i) => (
                <button
                  class={`avacar-color-thumb ${i() === props.currentIndex ? 'active' : ''}`}
                  style={{
                    'background-image': result.referenceImage ? `url(${result.referenceImage})` : undefined,
                    'background-color': !result.referenceImage ? (result.hexColor || '#fff') : undefined,
                  }}
                  title={result.label}
                  onClick={() => props.onSelectIndex(i())}
                />
              )}
            </For>
          </div>
        </div>

        <p class="avacar-color-label">
          {current()?.label.replace(' (Original)', '').toUpperCase()}
        </p>

        <div class="avacar-action-btn primary max-w-80">
          <button onClick={props.onQuote}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Request Quote
          </button>
        </div>
      </div>

      <div class="avacar-footer">Powered by <strong>Zeno</strong></div>
    </div>
  )
}
