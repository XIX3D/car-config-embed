import { Show, Switch, Match, createEffect, createSignal, onCleanup, onMount, For } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { WidgetStore } from '../../stores/widget-store'
import type { ApiClient } from '../../utils/api'
import { UploadView } from './UploadView'
import { LoadingView } from './LoadingView'
import { ResultView } from './ResultView'
import { QuoteView } from './QuoteView'
import { SuccessView } from './SuccessView'
import { GlowOrbs } from './GlowOrbs'
import { AmbientParticles } from './AmbientParticles'

interface ModalProps {
  store: WidgetStore
  api: ApiClient
  shadowRoot: ShadowRoot
}

export function Modal(props: ModalProps) {
  // eslint-disable-next-line solid/reactivity
  const { state, actions, getLoadingSteps, getBrandName, getModelName, getCurrentResult } = props.store
  let modalRef: HTMLDivElement | undefined
  const [modalStyle, setModalStyle] = createSignal<{ 'max-width'?: string; width?: string }>({})

  const productImgUrl = () =>
    state.product?.reference_image_paths?.[0] || ''

  const resizeModalForImage = (imgWidth: number, imgHeight: number) => {
    if (!imgWidth || !imgHeight) return

    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const isMobile = viewportWidth < 768
    const reservedHeight = 380
    const maxImgHeight = viewportHeight * 0.95 - reservedHeight
    const maxImgWidth = viewportWidth * 0.92

    const aspectRatio = imgWidth / imgHeight
    let displayHeight = Math.min(imgHeight, maxImgHeight)
    let displayWidth = displayHeight * aspectRatio

    if (displayWidth > maxImgWidth) {
      displayWidth = maxImgWidth
      displayHeight = displayWidth / aspectRatio
    }

    const modalPadding = 48
    const neededModalWidth = displayWidth + modalPadding
    const minWidth = isMobile ? 280 : 480
    const maxWidth = viewportWidth * 0.92
    const finalWidth = Math.max(minWidth, Math.min(neededModalWidth, maxWidth))

    setModalStyle({
      'max-width': `${finalWidth}px`,
      width: isMobile ? `${finalWidth}px` : undefined,
    })
  }

  const resetModalSize = () => {
    setModalStyle({})
  }

  createEffect(() => {
    if (state.view !== 'result' && state.view !== 'loading') {
      resetModalSize()
    }
  })

  const handleFileSelect = async (file: File) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      actions.setFile(file, e.target?.result as string)
      startVisualization(file)
    }
    reader.readAsDataURL(file)
  }

  const startVisualization = async (file: File) => {
    actions.startLoading()

    const productThumbnail = state.product?.reference_image_paths?.[0] || null
    const selections = state.selections

    const renderRequests = [
      {
        label: state.product ? `${state.product.name} (Original)` : 'Original',
        variantId: null,
        hexColor: null,
        referenceImage: productThumbnail,
      },
      ...(state.variants || []).map((v) => {
        const refImg = v.reference_image_paths?.[0] || v.reference_image
        return {
          label: v.variant_name,
          variantId: v.id,
          hexColor: v.hex_color || null,
          referenceImage: refImg || null,
        }
      }),
    ]

    const initialResults = renderRequests.map((req) => ({
      label: req.label,
      variantId: req.variantId,
      hexColor: req.hexColor,
      referenceImage: req.referenceImage,
      success: false,
      loading: true,
    }))
    actions.initResults(initialResults)

    renderRequests.forEach((req, index) => {
      const products: Array<{ product_id: string; variant_id?: string }> = []

      if (selections?.wrap_id) {
        const p: { product_id: string; variant_id?: string } = { product_id: selections.wrap_id }
        if (req.variantId) p.variant_id = req.variantId
        products.push(p)
      }
      if (selections?.wheel_id) {
        const p: { product_id: string; variant_id?: string } = { product_id: selections.wheel_id }
        if (req.variantId) p.variant_id = req.variantId
        products.push(p)
      }

      props.api.renderStream(file, products, {
        onVehicleDetected: (data) => {
          const vehicle = `${data.year} ${data.make} ${data.model}`
          actions.setDetectedVehicle(vehicle)
        },
        onComplete: (data) => {
          actions.updateResult(index, {
            image: `data:image/png;base64,${data.image_b64}`,
            success: true,
            loading: false,
          })
        },
        onError: (msg) => {
          console.error(`[SSE:${index}] Error:`, msg)
          actions.updateResult(index, {
            error: msg,
            success: false,
            loading: false,
          })
        },
      })
    })
  }

  const handleRerender = async (index: number) => {
    if (!state.selectedFile || state.rerenderingIndex !== null) return

    const result = state.galleryResults[index]
    if (!result) return

    const requestId = `${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    actions.setRerenderingIndex(index, requestId)

    const selections = state.selections
    const products: Array<{ product_id: string; variant_id?: string }> = []

    if (selections?.wrap_id) {
      const p: { product_id: string; variant_id?: string } = { product_id: selections.wrap_id }
      if (result.variantId) p.variant_id = result.variantId
      products.push(p)
    }
    if (selections?.wheel_id) {
      const p: { product_id: string; variant_id?: string } = { product_id: selections.wheel_id }
      if (result.variantId) p.variant_id = result.variantId
      products.push(p)
    }

    props.api.renderSingleVariant(state.selectedFile, products, {
      onComplete: (data) => {
        actions.updateSingleResult(index, {
          image: `data:image/png;base64,${data.image_b64}`,
          success: true,
          loading: false,
        }, requestId)
      },
      onError: (msg) => {
        console.error(`[Re-render:${index}] Error:`, msg)
        actions.updateSingleResult(index, {
          error: msg,
          success: false,
          loading: false,
        }, requestId)
      },
    })
  }

  const handleQuoteSubmit = async (
    customer: { name: string; email: string; phone?: string },
    _vehicle: string,
  ) => {
    if (!state.product) throw new Error('No product selected')

    const productIds: number[] = []
    if (state.selections?.wheel_id) {
      productIds.push(parseInt(state.selections.wheel_id, 10))
    }
    if (state.selections?.wrap_id) {
      productIds.push(parseInt(state.selections.wrap_id, 10))
    }

    if (productIds.length === 0) throw new Error('No product selected')

    const images = state.interestedFinishes
      .map((i) => state.galleryResults[i]?.image)
      .filter((img): img is string => !!img)

    const response = await props.api.submitQuote({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      product_ids: productIds,
      images,
      manufacturer_id: state.product.manufacturer_id,
    })

    if (!response.success) {
      throw new Error(response.error || 'Failed to submit quote')
    }

    actions.showSuccess()
  }

  const handleClose = () => {
    if (state.hasRendered && (state.view === 'result' || state.view === 'quote')) {
      actions.toggleExitModal(true)
    } else {
      actions.close()
    }
  }

  const handleShare = () => {
    actions.toggleShareModal(true)
  }

  const getFilename = (result: { label: string }) => {
    const brand = getBrandName().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    const model = getModelName().replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    const finish = result.label.replace(' (Original)', '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    return `${brand}_${model}_${finish}_ZenoRender.jpg`
  }

  const handleDownloadCurrent = () => {
    const current = getCurrentResult()
    if (!current?.image) return
    const link = document.createElement('a')
    link.href = current.image
    link.download = getFilename(current)
    link.click()
  }

  const handleDownloadAll = () => {
    const successfulResults = state.galleryResults.filter(r => r.success && r.image)

    successfulResults.forEach((result) => {
      const link = document.createElement('a')
      link.href = result.image!
      link.download = getFilename(result)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  const handleRestart = () => {
    if (state.hasRendered) {
      actions.toggleRestartModal(true)
    } else {
      actions.resetToUpload()
    }
  }

  createEffect(() => {
    if (state.isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
  })

  onCleanup(() => {
    document.body.style.overflow = ''
  })

  return (
    <Show when={state.isOpen}>
      <Portal mount={props.shadowRoot}>
        <div
          class="fixed inset-0 w-full h-full bg-black/85 backdrop-blur-sm flex items-center justify-center z-[999999] font-franie font-light"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div
            ref={modalRef}
            class={`relative bg-zeno-card rounded-[40px] max-w-md w-[92%] max-h-[90vh] overflow-hidden text-white flex flex-col transition-all duration-300 ${state.view === 'result' || state.view === 'loading' ? 'avacar-expanded' : ''}`}
            style={modalStyle()}
          >
            <GlowOrbs />
            <AmbientParticles count={12} />

            <Switch>
              <Match when={state.view === 'upload'}>
                <UploadView
                  productImgUrl={productImgUrl()}
                  brandName={getBrandName()}
                  modelName={getModelName()}
                  isWraps={state.isWraps}
                  onClose={handleClose}
                  onFileSelect={handleFileSelect}
                  onError={actions.setError}
                />
              </Match>

              <Match when={state.view === 'loading'}>
                <LoadingView
                  productImgUrl={productImgUrl()}
                  brandName={getBrandName()}
                  modelName={getModelName()}
                  previewDataUrl={state.previewDataUrl}
                  loadingSteps={getLoadingSteps()}
                  currentStep={state.loadingStep}
                  onClose={handleClose}
                  onModalResize={resizeModalForImage}
                />
              </Match>

              <Match when={state.view === 'result'}>
                <ResultView
                  productImgUrl={productImgUrl()}
                  brandName={getBrandName()}
                  modelName={getModelName()}
                  results={state.galleryResults}
                  currentIndex={state.currentIndex}
                  zoomLevel={state.zoomLevel}
                  panX={state.panX}
                  panY={state.panY}
                  interestedFinishes={state.interestedFinishes}
                  onClose={handleClose}
                  onRetry={handleRestart}
                  onFullscreen={() => actions.toggleFullscreenModal(true)}
                  onQuote={actions.showQuote}
                  onSelectIndex={actions.setCurrentIndex}
                  onZoom={actions.setZoom}
                  onPan={(x, y) => actions.setPan(x, y)}
                  onModalResize={resizeModalForImage}
                  onToggleInterest={actions.toggleFinishInterest}
                  onRerender={handleRerender}
                  rerenderingIndex={state.rerenderingIndex ?? undefined}
                  onDownloadMenu={() => actions.toggleDownloadMenu(true)}
                />
              </Match>

              <Match when={state.view === 'quote'}>
                <QuoteView
                  productImgUrl={productImgUrl()}
                  brandName={getBrandName()}
                  modelName={getModelName()}
                  results={state.galleryResults}
                  interestedFinishes={state.interestedFinishes}
                  detectedVehicle={state.detectedVehicle}
                  quoteViewIndex={state.quoteViewIndex}
                  onClose={handleClose}
                  onBack={() => actions.setView('result')}
                  onToggleFinish={actions.toggleFinishInterest}
                  onSubmit={handleQuoteSubmit}
                  onQuoteViewIndexChange={actions.setQuoteViewIndex}
                  onFullscreen={() => actions.toggleFullscreenModal(true)}
                />
              </Match>

              <Match when={state.view === 'success'}>
                <SuccessView
                  productImgUrl={productImgUrl()}
                  brandName={getBrandName()}
                  modelName={getModelName()}
                  isWraps={state.isWraps}
                  results={state.galleryResults}
                  interestedFinishes={state.interestedFinishes}
                  onClose={actions.close}
                  onShare={handleShare}
                />
              </Match>
            </Switch>

            <Show when={state.error}>
              <div class="text-red-500 text-center p-5 relative z-1">{state.error}</div>
            </Show>
          </div>
        </div>

        <Show when={state.showExitModal}>
          <ExitModal
            onBack={() => actions.toggleExitModal(false)}
            onConfirm={actions.close}
          />
        </Show>

        <Show when={state.showFullscreenModal}>
          <FullscreenModal
            imageUrl={getCurrentResult()?.image || ''}
            finishes={state.galleryResults}
            currentIndex={state.currentIndex}
            interestedIds={state.interestedFinishes}
            brandName={getBrandName()}
            modelName={getModelName()}
            onClose={() => actions.toggleFullscreenModal(false)}
            onIndexChange={actions.setCurrentIndex}
            onDownload={handleDownloadCurrent}
            onLike={actions.toggleFinishInterest}
          />
        </Show>

        <Show when={state.showShareModal}>
          <ShareModal
            result={getCurrentResult()}
            brandName={getBrandName()}
            modelName={getModelName()}
            onClose={() => actions.toggleShareModal(false)}
          />
        </Show>

        <Show when={state.showRestartModal}>
          <RestartModal
            onCancel={() => actions.toggleRestartModal(false)}
            onConfirm={() => {
              actions.toggleRestartModal(false)
              actions.resetToUpload()
            }}
          />
        </Show>

        <Show when={state.showDownloadMenu}>
          <DownloadMenu
            currentFinishName={getCurrentResult()?.label.replace(' (Original)', '') || 'Current'}
            totalCount={state.galleryResults.filter(r => r.success && r.image).length}
            onDownloadCurrent={handleDownloadCurrent}
            onDownloadAll={handleDownloadAll}
            onClose={() => actions.toggleDownloadMenu(false)}
          />
        </Show>
      </Portal>
    </Show>
  )
}

function ExitModal(props: { onBack: () => void; onConfirm: () => void }) {
  const handleBack = () => props.onBack()
  const handleConfirm = () => props.onConfirm()
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) handleBack()
  }

  return (
    <div
      class="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[1000000] p-3 sm:p-4"
      onClick={handleOverlayClick}
    >
      <div class="relative bg-zeno-card rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-sm w-full text-center overflow-hidden animate-fadeInUp">
        {/* Gradient background */}
        <div
          class="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 50% 0%, rgba(147,197,253,0.15) 0%, transparent 60%),
              radial-gradient(ellipse 80% 50% at 50% 100%, rgba(224,231,255,0.12) 0%, transparent 60%)
            `,
          }}
        />

        <AmbientParticles count={6} />

        {/* Close button */}
        <button
          class="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-95 transition-all z-20"
          onClick={handleBack}
          aria-label="Close"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div class="relative z-10">
          {/* Image with X icon */}
          <div
            class="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6"
            style={{ background: 'rgba(239,68,68,0.12)', border: '2px solid rgba(239,68,68,0.25)' }}
          >
            <svg
              class="w-7 h-7 sm:w-8 sm:h-8"
              style={{ color: '#f87171', animation: 'imageFade 2.5s ease-in-out infinite' }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
              <line x1="2" y1="2" x2="22" y2="22" stroke-width="2.5" />
            </svg>
          </div>

          <h3 class="text-white text-xl sm:text-2xl font-semibold mb-2">Leaving without saving?</h3>
          <p class="text-white/40 text-sm sm:text-base mb-6 sm:mb-8">Your rendered images will be lost.</p>

          <div class="flex gap-3 sm:gap-4">
            {/* Go Back button */}
            <button
              class="flex-1 py-3 sm:py-4 rounded-2xl text-sm sm:text-base font-medium text-white border flex items-center justify-center gap-2 transition-all bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30 hover:scale-[1.02] active:scale-[0.97]"
              onClick={handleBack}
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>Go Back</span>
            </button>

            {/* Leave button */}
            <button
              class="flex-1 py-3 sm:py-4 rounded-2xl text-sm sm:text-base font-medium transition-all hover:scale-[1.02] active:scale-[0.97]"
              style={{
                background: 'rgba(255,100,100,0.15)',
                border: '1px solid rgba(255,100,100,0.3)',
                color: '#ff6b6b',
              }}
              onClick={handleConfirm}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RestartModal(props: { onCancel: () => void; onConfirm: () => void }) {
  const handleCancel = () => props.onCancel()
  const handleConfirm = () => props.onConfirm()
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) handleCancel()
  }

  return (
    <div
      class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[1000000] p-4"
      onClick={handleOverlayClick}
    >
      <div class="relative bg-zeno-card rounded-3xl p-8 max-w-[360px] w-full text-center overflow-hidden animate-fadeInUp">
        <div class="w-16 h-16 rounded-full bg-zeno-electric/15 border-2 border-zeno-electric/30 flex items-center justify-center mx-auto mb-6" style={{ animation: 'refreshSpin 3s ease-in-out infinite' }}>
          <svg class="w-8 h-8 text-zeno-electric" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </div>
        <h3 class="text-2xl font-semibold text-white m-0 mb-2">Starting over?</h3>
        <p class="text-sm text-white/40 m-0 mb-8">Your current renders will be lost.</p>
        <div class="flex gap-4">
          <button
            class="flex-1 py-4 rounded-xl bg-white/5 border border-white/20 text-white text-[15px] font-medium cursor-pointer flex items-center justify-center gap-2 transition-all hover:bg-white/10 hover:border-white/30"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            class="flex-1 py-4 rounded-xl bg-zeno-electric/15 border border-zeno-electric/30 text-zeno-cyan text-[15px] font-medium cursor-pointer transition-all hover:scale-[1.02] hover:bg-zeno-electric/20"
            onClick={handleConfirm}
          >
            Start Over
          </button>
        </div>
      </div>
    </div>
  )
}

function DownloadMenu(props: {
  currentFinishName: string
  totalCount: number
  onDownloadCurrent: () => void
  onDownloadAll: () => void
  onClose: () => void
}) {
  const handleClose = () => props.onClose()
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }

  return (
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000000] p-4"
      onClick={handleOverlayClick}
    >
      <div class="bg-zeno-card rounded-2xl p-5 min-w-[280px] max-w-[340px] shadow-xl animate-fadeInUp">
        <h3 class="text-lg font-semibold text-white mb-4 text-center">Download Options</h3>
        <button
          class="w-full py-3.5 px-4 mb-3 bg-white/5 border border-white/10 text-white rounded-xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-2.5 transition-all hover:bg-white/10 hover:border-white/20"
          onClick={() => { props.onDownloadCurrent(); handleClose() }}
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download {props.currentFinishName}
        </button>
        <div class="h-px bg-white/10 my-3" />
        <button
          class="w-full py-3.5 px-4 bg-white/5 border border-white/10 text-white rounded-xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-2.5 transition-all hover:bg-white/10 hover:border-white/20"
          onClick={() => { props.onDownloadAll(); handleClose() }}
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download All ({props.totalCount})
        </button>
      </div>
    </div>
  )
}

interface FullscreenModalProps {
  imageUrl: string
  finishes: { label: string; image?: string; hexColor?: string | null; referenceImage?: string | null; success: boolean }[]
  currentIndex: number
  interestedIds: number[]
  brandName: string
  modelName: string
  onClose: () => void
  onIndexChange: (index: number) => void
  onDownload: () => void
  onLike: (index: number) => void
}

function FullscreenModal(props: FullscreenModalProps) {
  const [zoomLevel, setZoomLevel] = createSignal(1)
  const [panX, setPanX] = createSignal(0)
  const [panY, setPanY] = createSignal(0)
  const [isDragging, setIsDragging] = createSignal(false)
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 })
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 })
  let imageRef: HTMLImageElement | undefined

  const currentResult = () => props.finishes[props.currentIndex]
  const isLiked = (index: number) => props.interestedIds.includes(index)

  const clampPan = (x: number, y: number) => {
    if (zoomLevel() <= 1 || !imageRef) return { x: 0, y: 0 }
    const maxPanX = (imageRef.offsetWidth * (zoomLevel() - 1)) / (2 * zoomLevel())
    const maxPanY = (imageRef.offsetHeight * (zoomLevel() - 1)) / (2 * zoomLevel())
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.25 : 0.25
    const newZoom = Math.max(1, Math.min(4, zoomLevel() + delta))
    setZoomLevel(newZoom)
    if (newZoom <= 1) {
      setPanX(0)
      setPanY(0)
    } else {
      const clamped = clampPan(panX(), panY())
      setPanX(clamped.x)
      setPanY(clamped.y)
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (zoomLevel() <= 1) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setPanStart({ x: panX(), y: panY() })
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return
    const dx = (e.clientX - dragStart().x) / zoomLevel()
    const dy = (e.clientY - dragStart().y) / zoomLevel()
    const clamped = clampPan(panStart().x + dx, panStart().y + dy)
    setPanX(clamped.x)
    setPanY(clamped.y)
  }

  const handleMouseUp = () => setIsDragging(false)

  const resetZoom = () => {
    setZoomLevel(1)
    setPanX(0)
    setPanY(0)
  }

  const findNextValidIndex = (startIndex: number, direction: 1 | -1): number => {
    const len = props.finishes.length
    let index = startIndex

    for (let i = 0; i < len; i++) {
      index = (index + direction + len) % len
      const result = props.finishes[index]

      if (result.success && result.image) {
        return index
      }
    }

    return props.currentIndex
  }

  const handlePrev = () => {
    const newIndex = findNextValidIndex(props.currentIndex, -1)
    props.onIndexChange(newIndex)
    resetZoom()
  }

  const handleNext = () => {
    const newIndex = findNextValidIndex(props.currentIndex, 1)
    props.onIndexChange(newIndex)
    resetZoom()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose()
    else if (e.key === 'ArrowLeft') handlePrev()
    else if (e.key === 'ArrowRight') handleNext()
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  const handleBackdropClick = (e: MouseEvent) => {
    if (isDragging()) return
    if (e.target === e.currentTarget) props.onClose()
  }

  const getFilename = () => {
    const c = currentResult()
    if (!c) return 'render.jpg'
    const brand = props.brandName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    const model = props.modelName.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    const finish = c.label.replace(' (Original)', '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '')
    return `${brand}_${model}_${finish}_ZenoRender.jpg`
  }

  const handleDownload = () => {
    const c = currentResult()
    if (!c?.image) return
    const link = document.createElement('a')
    link.href = c.image
    link.download = getFilename()
    link.click()
  }

  return (
    <div
      class="fixed inset-0 bg-black/95 backdrop-blur-sm flex flex-col z-[1000000] animate-fadeIn"
      onClick={handleBackdropClick}
    >
      {/* Top bar */}
      <div class="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-20">
        {/* Like button */}
        <button
          class="w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { e.stopPropagation(); props.onLike(props.currentIndex) }}
        >
          {isLiked(props.currentIndex) ? (
            <svg class="w-6 h-6" style={{ color: '#ff6b6b' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          ) : (
            <svg class="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          )}
        </button>

        {/* Download button */}
        <button
          class="w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { e.stopPropagation(); handleDownload() }}
        >
          <svg class="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Main image area */}
      <div class="flex-1 flex items-center justify-center relative" onClick={handleBackdropClick}>
        {/* Navigation arrows */}
        <Show when={props.finishes.length > 1}>
          <button
            class="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center text-white/80 transition-all z-10 hover:scale-110 hover:bg-black/60 active:scale-95"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => { e.stopPropagation(); handlePrev() }}
          >
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            class="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center text-white/80 transition-all z-10 hover:scale-110 hover:bg-black/60 active:scale-95"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => { e.stopPropagation(); handleNext() }}
          >
            <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </Show>

        {/* Image */}
        <Show when={currentResult()?.image}>
          <img
            ref={imageRef}
            class="max-w-[90vw] max-h-[70vh] object-contain rounded-lg transition-transform duration-100"
            src={currentResult()?.image}
            alt="Fullscreen view"
            style={{
              transform: `scale(${zoomLevel()}) translate(${panX()}px, ${panY()}px)`,
              cursor: zoomLevel() > 1 ? (isDragging() ? 'grabbing' : 'grab') : 'default',
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            draggable={false}
          />
        </Show>
        <Show when={!currentResult()?.image}>
          <div class="flex flex-col items-center justify-center text-white/50 gap-4">
            <svg class="w-16 h-16 text-red-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span class="text-lg">Image unavailable</span>
          </div>
        </Show>

        {/* Reset zoom button */}
        <Show when={zoomLevel() > 1.05}>
          <button
            class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 transition-colors hover:bg-black/80 z-10"
            onClick={(e) => { e.stopPropagation(); resetZoom() }}
          >
            <svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span class="text-white text-sm font-medium">Reset Zoom</span>
          </button>
        </Show>
      </div>

      {/* Bottom bar with swatches */}
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-8 z-20">
        {/* Finish name */}
        <p class="text-center text-white/70 text-sm mb-3">
          {currentResult()?.label.replace(' (Original)', '')}
        </p>

        {/* Color swatches */}
        <div class="flex items-center justify-center gap-2 flex-wrap max-h-24 overflow-y-auto scrollbar-hide pb-2">
          <For each={props.finishes}>
            {(result, i) => {
              const isSelected = () => i() === props.currentIndex
              const isInterested = () => isLiked(i())
              const hasImage = () => result.success && result.image

              return (
                <div class="relative">
                  <button
                    class={`w-12 h-12 rounded-xl border-2 transition-all ${
                      hasImage() ? 'cursor-pointer' : 'opacity-30 cursor-not-allowed'
                    }`}
                    style={{
                      'background-image': result.referenceImage ? `url(${result.referenceImage})` : undefined,
                      'background-color': !result.referenceImage ? (result.hexColor || '#fff') : undefined,
                      'background-size': 'contain',
                      'background-repeat': 'no-repeat',
                      'background-position': 'center',
                      'border-color': isSelected() ? '#fff' : 'transparent',
                      transform: isSelected() ? 'scale(1.15)' : 'scale(1)',
                      'box-shadow': isSelected() ? '0 0 15px rgba(255,255,255,0.3)' : 'none',
                    }}
                    onClick={(e) => { e.stopPropagation(); hasImage() && props.onIndexChange(i()); resetZoom() }}
                    disabled={!hasImage()}
                  />
                  {/* Interest indicator */}
                  <Show when={isInterested() && hasImage()}>
                    <div
                      class="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.7)' }}
                    >
                      <svg class="w-2.5 h-2.5" style={{ color: '#ff6b6b' }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                      </svg>
                    </div>
                  </Show>
                  {/* Like button below swatch */}
                  <Show when={hasImage()}>
                    <button
                      class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110"
                      style={{ background: isInterested() ? 'rgba(255,107,107,0.3)' : 'rgba(0,0,0,0.6)' }}
                      onClick={(e) => { e.stopPropagation(); props.onLike(i()) }}
                    >
                      <svg class="w-3 h-3" style={{ color: isInterested() ? '#ff6b6b' : 'rgba(255,255,255,0.6)' }} viewBox="0 0 24 24" fill={isInterested() ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Minimize/exit button - bottom right */}
      <button
        class="absolute bottom-20 right-4 w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center transition-all hover:scale-110 active:scale-95 z-30"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={props.onClose}
      >
        <svg class="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
        </svg>
      </button>
    </div>
  )
}

function ShareModal(props: {
  result: { image?: string; label: string } | null
  brandName: string
  modelName: string
  onClose: () => void
}) {
  const handleClose = () => props.onClose()
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }

  const getFilename = () => {
    if (!props.result) return 'my-wheel-build.png'
    const brand = props.brandName.replace(/[^a-z0-9]/gi, '')
    const model = props.modelName.replace(/[^a-z0-9]/gi, '')
    const finish = props.result.label.replace(' (Original)', '').replace(/[^a-z0-9]/gi, '')

    return `${brand}_${model}_${finish}_ZenoRender.jpg`
  }

  const downloadImage = () => {
    if (!props.result?.image) return
    const link = document.createElement('a')

    link.href = props.result.image
    link.download = getFilename()
    link.click()
    handleClose()
  }

  const copyImage = async () => {
    if (!props.result?.image) return
    try {
      const response = await fetch(props.result.image)
      const blob = await response.blob()

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      handleClose()
    } catch (err) {
      console.error('Failed to copy image:', err)
    }
  }

  const handleShareFacebook = () => {
    window.open('https://www.facebook.com/sharer/sharer.php', '_blank')
    handleClose()
  }

  const handleShareTwitter = () => {
    const text = encodeURIComponent('Check out these wheels on my car!')

    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank')
    handleClose()
  }

  const handleSharePinterest = () => {
    window.open('https://pinterest.com/pin/create/button/', '_blank')
    handleClose()
  }

  const btnClass = 'w-full py-3.5 px-4 mb-2.5 bg-[#2a2a2a] text-white border-none rounded-lg text-[15px] font-medium cursor-pointer flex items-center justify-center gap-2.5 transition-colors hover:bg-[#3a3a3a]'

  return (
    <div
      class="fixed inset-0 bg-black/75 z-[1000000] flex items-center justify-center backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div class="bg-zeno-card rounded-2xl p-6 min-w-[320px] max-w-[400px] shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-fadeInUp font-franie">
        <h3 class="m-0 mb-6 text-xl font-semibold text-white text-center">Share Build</h3>

        <button class={btnClass} onClick={downloadImage}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save Image
        </button>

        <button class={btnClass} onClick={copyImage}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy to Clipboard
        </button>

        <div class="h-px bg-[#333] my-3.5" />

        <button class={btnClass} onClick={handleShareFacebook}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Share to Facebook
        </button>

        <button class={btnClass} onClick={handleShareTwitter}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Share to X
        </button>

        <button class={btnClass} onClick={handleSharePinterest}>
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
          </svg>
          Share to Pinterest
        </button>

        <button
          class="w-full py-3.5 mt-3.5 bg-transparent text-[#888] border border-[#444] rounded-lg text-[15px] font-medium cursor-pointer transition-all hover:border-[#666] hover:text-[#aaa]"
          onClick={handleClose}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
