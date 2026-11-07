import { decode, isBlurhashValid } from 'blurhash';

const MAX_ENTRIES = 200;
const SIZE = 32;
const cache = new Map<string, string | null>();

/** Decodes a BlurHash once to a 32 x 32 PNG data URL; `null` when the hash or the canvas is unusable. */
export function blurhashDataUrl(hash: string): string | null {
  const hit = cache.get(hash);
  if (hit !== undefined) {
    cache.delete(hash); // refresh recency
    cache.set(hash, hit);
    return hit;
  }
  let url: string | null = null;
  try {
    if (isBlurhashValid(hash).result) {
      const pixels = decode(hash, SIZE, SIZE);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const image = ctx.createImageData(SIZE, SIZE);
        image.data.set(pixels);
        ctx.putImageData(image, 0, 0);
        url = canvas.toDataURL();
      }
    }
  } catch {
    url = null;
  }
  cache.set(hash, url);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return url;
}
