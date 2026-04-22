export async function downloadRenderImage(imageUrl: string, filename: string): Promise<void> {
  const anchorFallback = () => {
    const link = document.createElement('a')

    link.href = imageUrl
    link.download = filename
    link.click()
  }

  try {
    const res = await fetch(imageUrl)
    const blob = await res.blob()
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean
    }

    if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename })

        return
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
      }
    }

    anchorFallback()
  } catch {
    anchorFallback()
  }
}
