import { encode } from 'blurhash';
import { round } from '../math/round';

/**
 * Shared image pipeline for Custom_Exercise photos (maxSide 1024, quality 0.85),
 * meal estimates (1024, 0.8; R36.2) and meal thumbnails (256, 0.8; R37.7).
 *
 * 1. Decode with EXIF orientation applied to the pixels.
 * 2. Scale with `scaleDims` and re-encode from a canvas as JPEG. A canvas
 *    re-encode carries no EXIF, GPS or other metadata (R15.3, R36.2).
 * 3. Compute a 4 × 3 component BlurHash from a 32 × 32 copy of the result
 *    (R15.3, R66.1).
 */

export interface ProcessImageOptions {
  /** Longest side of the output in px; smaller images are not enlarged. */
  maxSide: number;
  /** JPEG quality, 0–1. */
  quality: number;
}

export interface ProcessedImage {
  bytes: ArrayBuffer;
  mime: 'image/jpeg';
  width: number;
  height: number;
  blurhash: string;
}

/** The file could not be decoded as an image. */
export class ImageDecodeError extends Error {
  constructor(message = 'The photo could not be read as an image.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImageDecodeError';
  }
}

const BLURHASH_SIZE = 32;
const BLURHASH_X = 4;
const BLURHASH_Y = 3;

/**
 * Output size for an image of `w` × `h` px: unchanged when the longest side is
 * at most `maxSide`; otherwise the longest side becomes `maxSide` and the short
 * side `round(short × maxSide / long)`.
 */
export function scaleDims(w: number, h: number, maxSide: number): { width: number; height: number } {
  for (const [name, v] of [['w', w], ['h', h], ['maxSide', maxSide]] as const) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`scaleDims: ${name} must be a positive finite number, got ${v}`);
    }
  }
  const long = Math.max(w, h);
  if (long <= maxSide) return { width: w, height: h };
  const short = round((Math.min(w, h) * maxSide) / long);
  return w >= h ? { width: maxSide, height: short } : { width: short, height: maxSide };
}

/** Decode, scale, re-encode as JPEG and compute the BlurHash of `file`. */
export async function processImage(file: Blob, o: ProcessImageOptions): Promise<ProcessedImage> {
  const decoded = await decodeImage(file);
  try {
    const dims = scaleDims(decoded.width, decoded.height, o.maxSide);
    // A canvas needs at least 1 px per side; only extreme aspect ratios round to 0.
    const width = Math.max(1, dims.width);
    const height = Math.max(1, dims.height);

    const canvas = createCanvas(width, height);
    const ctx = get2d(canvas);
    // JPEG has no alpha: paint transparent areas white rather than black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const blob = await canvasToJpeg(canvas, o.quality);
    const blurhash = blurhashOf(canvas);
    const bytes = await blob.arrayBuffer();
    return { bytes, mime: 'image/jpeg', width, height, blurhash };
  } finally {
    decoded.release();
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  let bitmapError: unknown;
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width > 0 && bitmap.height > 0) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      }
      bitmap.close();
    } catch (e) {
      // Older Safari versions reject the options bag or some formats; try <img>.
      bitmapError = e;
    }
  }
  try {
    return await decodeWithImageElement(file);
  } catch (e) {
    throw new ImageDecodeError(undefined, { cause: bitmapError ?? e });
  }
}

/** `<img>` fallback; browsers apply EXIF orientation to `<img>` by default. */
function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  return new Promise<DecodedImage>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      if (width > 0 && height > 0) {
        resolve({ source: img, width, height, release: () => URL.revokeObjectURL(url) });
      } else {
        URL.revokeObjectURL(url);
        reject(new Error('The image has no pixels.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image element could not decode the file.'));
    };
    img.src = url;
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D drawing is not available.');
  return ctx;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('The photo could not be encoded as JPEG.'));
        else if (blob.type !== 'image/jpeg') reject(new Error(`JPEG encoding is not supported (got ${blob.type || 'unknown type'}).`));
        else resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function blurhashOf(source: HTMLCanvasElement): string {
  const small = createCanvas(BLURHASH_SIZE, BLURHASH_SIZE);
  const ctx = get2d(small);
  ctx.drawImage(source, 0, 0, BLURHASH_SIZE, BLURHASH_SIZE);
  const { data } = ctx.getImageData(0, 0, BLURHASH_SIZE, BLURHASH_SIZE);
  return encode(data, BLURHASH_SIZE, BLURHASH_SIZE, BLURHASH_X, BLURHASH_Y);
}
