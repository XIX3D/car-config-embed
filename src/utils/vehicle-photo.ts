// The customer's car photo, shrunk the way render.xix3D's storefront shrinks it before upload
// (avacar-dashboard src/lib/image.ts, prepareVehiclePhoto): 2048px on the long edge, JPEG 0.86.
//
// The two-pass pipeline works at 2048 (compositor.MaxWorkingEdge) and discards every pixel above
// it, but it decodes the full upload first. A 24 MP phone photo sent whole peaked the server at
// 524 MB, over production's 512 MB container limit; the same render from a 2048 photo is the one
// render.xix3D already serves. Also a tenth of the upload on a phone.

const VEHICLE_LONG_EDGE = 2048
const VEHICLE_QUALITY = 0.86
// Under this, a re-encode costs a generation of quality and saves nothing worth having.
const VEHICLE_SKIP_BYTES = 900 * 1024

// One photo is rendered once per finish; shrink it once.
const prepared = new WeakMap<File, Promise<File>>()

/** Never throws: if decoding or encoding fails, the original goes up as before. */
export function prepareVehiclePhoto(file: File): Promise<File> {
  let photo = prepared.get(file)

  if (!photo) {
    photo = shrink(file)
    prepared.set(file, photo)
  }

  return photo
}

async function shrink(file: File): Promise<File> {
  try {
    // imageOrientation, because a canvas re-encode drops EXIF: a portrait phone photo would
    // otherwise reach the renderer lying on its side.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const longest = Math.max(bmp.width, bmp.height)

    if (longest <= VEHICLE_LONG_EDGE && file.size <= VEHICLE_SKIP_BYTES) {
      bmp.close()

      return file
    }

    const scale = longest > VEHICLE_LONG_EDGE ? VEHICLE_LONG_EDGE / longest : 1
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const blob = await encode(bmp, w, h)

    bmp.close()

    // A smaller file at twice the dimensions is the wrong trade; only an already-small photo may
    // keep its original bytes.
    if (longest <= VEHICLE_LONG_EDGE && blob.size >= file.size) return file

    const name = `${file.name.replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`

    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

async function encode(bmp: ImageBitmap, w: number, h: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')

    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bmp, 0, 0, w, h)

    return canvas.convertToBlob({ type: 'image/jpeg', quality: VEHICLE_QUALITY })
  }

  // Safari without OffscreenCanvas
  const canvas = document.createElement('canvas')

  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')

  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(bmp, 0, 0, w, h)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', VEHICLE_QUALITY)
  })
}
