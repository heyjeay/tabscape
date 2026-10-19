/** Uploaded link images are shrunk to this many pixels square: sharp at icon size on high-density screens. */
const ICON_PX = 64
/** Refuse anything bigger than this before even trying to read it. */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Turn an image file into a small square icon, as a data URL that fits easily
 * in storage. The picture is centred and cropped to fill the square.
 */
export const imageFileToIcon = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error("That isn't an image"))
    if (file.size > MAX_FILE_BYTES) return reject(new Error('That image is too large (10 MB at most)'))

    const url = URL.createObjectURL(file)
    const img = new Image()
    const done = () => URL.revokeObjectURL(url)
    img.onload = () => {
      done()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = ICON_PX
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Images aren\'t supported here'))
      const w = img.naturalWidth || ICON_PX
      const h = img.naturalHeight || ICON_PX
      const scale = Math.max(ICON_PX / w, ICON_PX / h)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (ICON_PX - w * scale) / 2, (ICON_PX - h * scale) / 2, w * scale, h * scale)
      // WebP is far smaller; browsers that can't make it hand back PNG.
      resolve(canvas.toDataURL('image/webp', 0.9))
    }
    img.onerror = () => {
      done()
      reject(new Error("That image couldn't be read"))
    }
    img.src = url
  })
