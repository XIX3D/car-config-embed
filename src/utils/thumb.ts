/*
 * A WHEEL PICTURE AT THE SIZE IT IS DRAWN (dealer notes, 18 November: "thumbnails need to load faster", "these wheel
 * images in suggested don't load"). The catalogue's photos are the renderer's own, 1024 to 2048 px square and 90 KB to
 * over 1 MB each; a tile is about 110 px. A brand's page drew up to ninety of them at once: tens of megabytes to fetch
 * and a gigabyte of pixels to decode on a phone, which is the freeze after a photo or a brand. render.xix3D draws the
 * same photos through the wsrv.nl resizer (its lib/imageProxy), WebP at the slot's size, cached at the edge; the
 * window does the same, and falls back to the original if the resizer cannot be reached.
 */
export function thumb(url: string, width: number): string {
  if (!url || !/^https?:\/\//.test(url) || url.includes("wsrv.nl/")) return url;

  return `https://wsrv.nl/?${new URLSearchParams({ url, w: String(width), output: "webp", q: "82" }).toString()}`;
}

/** On an error, once: the original picture. */
export const thumbFallback = (raw: string) => (e: Event) => {
  const img = e.currentTarget as HTMLImageElement;

  if (img.dataset.raw === "1" || !raw) return;
  img.dataset.raw = "1";
  img.src = raw;
};
