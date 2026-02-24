import { Show, Switch, Match, createEffect, createSignal, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { WidgetStore } from '../../stores/widget-store'
import type { ApiClient } from '../../utils/api'
import { UploadView } from './UploadView'
import { LoadingView } from './LoadingView'
import { ResultView } from './ResultView'
import { QuoteView } from './QuoteView'
import { SuccessView } from './SuccessView'
import { GlowOrbs } from './GlowOrbs'

interface ModalProps {
  store: WidgetStore
  api: ApiClient
}

export function Modal(props: ModalProps) {
  const { state, actions, getLoadingSteps, getBrandName, getModelName, getCurrentResult } = props.store
  let modalRef: HTMLDivElement | undefined
  const [modalStyle, setModalStyle] = createSignal<{ 'max-width'?: string; width?: string }>({})

  const productImgUrl = () =>
    state.product ? props.api.getProductThumbnailUrl(state.product.id) : ''

  const resizeModalForImage = (imgWidth: number, imgHeight: number) => {
    console.log('resizeModalForImage called:', imgWidth, imgHeight)
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

    console.log('Setting modal width to:', finalWidth, 'isMobile:', isMobile)
    setModalStyle({
      'max-width': `${finalWidth}px`,
      width: isMobile ? `${finalWidth}px` : undefined,
    })
  }

  const resetModalSize = () => {
    setModalStyle({})
  }

  createEffect(() => {
    if (state.view !== 'result') {
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

    const productThumbnail = state.product
      ? props.api.getProductThumbnailUrl(state.product.id)
      : null

    const renderRequests = [
      {
        label: state.product ? `${state.product.name} (Original)` : 'Original',
        variantId: null,
        hexColor: null,
        referenceImage: productThumbnail,
      },
      ...state.variants.map((v) => ({
        label: v.variant_name,
        variantId: v.id,
        hexColor: v.hex_color || null,
        referenceImage: v.reference_image
          ? props.api.getStorageUrl(v.reference_image)
          : null,
      })),
    ]

    const results = await Promise.all(
      renderRequests.map(async (req) => {
        const products = []
        if (state.selections?.wrap_id) {
          const p: { product_id: string; variant_id?: string } = { product_id: state.selections.wrap_id }
          if (req.variantId) p.variant_id = req.variantId
          products.push(p)
        }
        if (state.selections?.wheel_id) {
          const p: { product_id: string; variant_id?: string } = { product_id: state.selections.wheel_id }
          if (req.variantId) p.variant_id = req.variantId
          products.push(p)
        }

        const response = await props.api.render(file, products)
        console.log('Render response:', response)
        return {
          label: req.label,
          variantId: req.variantId,
          hexColor: req.hexColor,
          referenceImage: req.referenceImage,
          image: response.final_image,
          success: response.success,
          error: response.error,
          detectedVehicle: response.detected_vehicle,
        }
      })
    )

    console.log('All results:', results)
    const firstResult = results[0]
    console.log('First result:', firstResult)
    console.log('First result detectedVehicle:', firstResult?.detectedVehicle)
    actions.setResults(
      results.map((r) => ({
        label: r.label,
        variantId: r.variantId,
        hexColor: r.hexColor,
        referenceImage: r.referenceImage,
        image: r.image,
        success: r.success,
        error: r.error,
      })),
      firstResult?.detectedVehicle
    )
  }

  const handleQuoteSubmit = async (customer: { name: string; email: string; phone?: string; zip_code: string }, vehicle: string) => {
    const current = getCurrentResult()
    if (!current) throw new Error('No visualization available')

    const productId = state.selections?.wheel_id || state.selections?.wrap_id
    if (!productId) throw new Error('No product selected')

    const variantIds = state.interestedFinishes
      .map((i) => state.galleryResults[i]?.variantId)
      .filter((id): id is string => !!id)

    const response = await props.api.submitQuote({
      customer,
      vehicle,
      product_id: productId,
      variant_ids: variantIds,
      rendered_image: current.image || '',
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
      <Portal>
        <div class="avacar-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div
            ref={modalRef}
            class={`avacar-modal-v2 relative overflow-hidden ${state.view === 'result' ? 'avacar-expanded' : ''}`}
            style={modalStyle()}
          >
            <GlowOrbs />

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
                  onClose={handleClose}
                  onRetry={actions.resetToUpload}
                  onFullscreen={() => actions.toggleFullscreenModal(true)}
                  onQuote={actions.showQuote}
                  onSelectIndex={actions.setCurrentIndex}
                  onZoom={actions.setZoom}
                  onPan={(x, y) => actions.setPan(x, y)}
                  onModalResize={resizeModalForImage}
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
                  onClose={handleClose}
                  onBack={() => actions.setView('result')}
                  onToggleFinish={actions.toggleFinishInterest}
                  onSubmit={handleQuoteSubmit}
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
              <div class="avacar-error">{state.error}</div>
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
            onClose={() => actions.toggleFullscreenModal(false)}
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
      </Portal>
    </Show>
  )
}

function ExitModal(props: { onBack: () => void; onConfirm: () => void }) {
  return (
    <div class="avacar-exit-modal" onClick={(e) => e.target === e.currentTarget && props.onBack()}>
      <div class="avacar-exit-modal-content">
        <div class="avacar-exit-warning-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="avacar-exit-title">Do you want to save your pictures?</h3>
        <p class="avacar-exit-message">Your rendered images will be lost.</p>
        <div class="avacar-exit-actions">
          <button class="avacar-exit-back-btn" onClick={props.onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Go Back
          </button>
          <button class="avacar-exit-close-btn" onClick={props.onConfirm}>Close Anyway</button>
        </div>
      </div>
    </div>
  )
}

function FullscreenModal(props: { imageUrl: string; onClose: () => void }) {
  return (
    <div class="avacar-fullscreen-modal" onClick={props.onClose}>
      <img src={props.imageUrl} alt="Fullscreen view" />
      <button class="avacar-fullscreen-close">&times;</button>
    </div>
  )
}

function ShareModal(props: {
  result: { image?: string; label: string } | null
  brandName: string
  modelName: string
  onClose: () => void
}) {
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
    props.onClose()
  }

  const copyImage = async () => {
    if (!props.result?.image) return
    try {
      const response = await fetch(props.result.image)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      props.onClose()
    } catch (err) {
      console.error('Failed to copy image:', err)
    }
  }

  const buttonStyle = {
    width: '100%',
    padding: '14px 16px',
    'margin-bottom': '10px',
    background: '#2a2a2a',
    color: 'white',
    border: 'none',
    'border-radius': '8px',
    'font-size': '15px',
    'font-weight': '500',
    cursor: 'pointer',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    gap: '10px',
    transition: 'background 0.2s, transform 0.1s',
  }

  return (
    <div
      class="avacar-share-modal-overlay"
      style={{
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: 'rgba(0,0,0,0.75)',
        'z-index': '1000000',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'backdrop-filter': 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div
        class="avacar-share-modal"
        style={{
          background: '#1a1a1a',
          'border-radius': '16px',
          padding: '24px',
          'min-width': '320px',
          'max-width': '400px',
          'box-shadow': '0 8px 32px rgba(0,0,0,0.6)',
          animation: 'avacar-modal-appear 0.2s ease-out',
        }}
      >
        <h3
          style={{
            margin: '0 0 24px 0',
            'font-size': '20px',
            'font-weight': '600',
            color: 'white',
            'text-align': 'center',
          }}
        >
          Share Build
        </h3>

        <button
          style={buttonStyle}
          onClick={downloadImage}
          onMouseOver={(e) => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#2a2a2a')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Save Image
        </button>

        <button
          style={buttonStyle}
          onClick={copyImage}
          onMouseOver={(e) => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#2a2a2a')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy to Clipboard
        </button>

        <div style={{ height: '1px', background: '#333', margin: '14px 0' }} />

        <button
          style={buttonStyle}
          onClick={() => {
            window.open('https://www.facebook.com/sharer/sharer.php', '_blank')
            props.onClose()
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#2a2a2a')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          Share to Facebook
        </button>

        <button
          style={buttonStyle}
          onClick={() => {
            const text = encodeURIComponent('Check out these wheels on my car!')
            window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank')
            props.onClose()
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#2a2a2a')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
          Share to X
        </button>

        <button
          style={buttonStyle}
          onClick={() => {
            window.open('https://pinterest.com/pin/create/button/', '_blank')
            props.onClose()
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#3a3a3a')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#2a2a2a')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/>
          </svg>
          Share to Pinterest
        </button>

        <button
          style={{
            width: '100%',
            padding: '14px',
            'margin-top': '14px',
            background: 'transparent',
            color: '#888',
            border: '1px solid #444',
            'border-radius': '8px',
            'font-size': '15px',
            'font-weight': '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={props.onClose}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = '#666'
            e.currentTarget.style.color = '#aaa'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = '#444'
            e.currentTarget.style.color = '#888'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
