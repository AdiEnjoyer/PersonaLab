import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isBlurhashValid } from 'blurhash';
import { ImageDecodeError, processImage, scaleDims } from '../processImage';

// jsdom has no canvas, no image decoding and no createImageBitmap, so these
// tests replace them with small fakes that record how they were used.

interface FakeContext {
  canvas: HTMLCanvasElement;
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  getImageData: ReturnType<typeof vi.fn>;
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

let contexts: FakeContext[];
let toBlobCalls: { canvas: HTMLCanvasElement; type: string | undefined; quality: unknown }[];
let toBlobResult: (type: string | undefined) => Blob | null;

function installCanvasFakes() {
  contexts = [];
  toBlobCalls = [];
  toBlobResult = (type) => new Blob([JPEG_BYTES], { type: type ?? 'image/png' });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    const canvas = this;
    const ctx: FakeContext = {
      canvas,
      fillStyle: '#000000',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
        // A left-to-right gradient so the BlurHash has real content.
        const data = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            data[i] = (x * 255) / (w - 1);
            data[i + 1] = 120;
            data[i + 2] = (y * 255) / (h - 1);
            data[i + 3] = 255;
          }
        }
        return { data, width: w, height: h };
      }),
    };
    contexts.push(ctx);
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext']);

  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: unknown,
  ) {
    toBlobCalls.push({ canvas: this, type, quality });
    const blob = toBlobResult(type);
    queueMicrotask(() => callback(blob));
  });
}

function fakeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
}

/** Stand-in for `Image` that loads or fails as soon as `src` is set. */
function installFakeImage(outcome: { width: number; height: number } | 'error') {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = 'auto';
    naturalWidth = 0;
    naturalHeight = 0;
    set src(_url: string) {
      queueMicrotask(() => {
        if (outcome === 'error') {
          this.onerror?.();
        } else {
          this.naturalWidth = outcome.width;
          this.naturalHeight = outcome.height;
          this.onload?.();
        }
      });
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  installCanvasFakes();
  createObjectURL = vi.fn(() => 'blob:fake-url');
  revokeObjectURL = vi.fn();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const photo = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/heic' });

describe('scaleDims', () => {
  it('keeps images whose longest side is within the limit', () => {
    expect(scaleDims(800, 600, 1024)).toEqual({ width: 800, height: 600 });
    expect(scaleDims(1024, 1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('scales the longest side to the limit and rounds the short side', () => {
    expect(scaleDims(3000, 2000, 1024)).toEqual({ width: 1024, height: 683 });
    expect(scaleDims(2000, 4000, 1024)).toEqual({ width: 512, height: 1024 });
    expect(scaleDims(1200, 900, 600)).toEqual({ width: 600, height: 450 });
    expect(scaleDims(4032, 3024, 256)).toEqual({ width: 256, height: 192 });
  });

  it('rejects sizes that are not positive', () => {
    expect(() => scaleDims(0, 10, 256)).toThrow(RangeError);
    expect(() => scaleDims(10, 10, 0)).toThrow(RangeError);
  });
});

describe('processImage', () => {
  it('decodes with EXIF orientation and returns a scaled JPEG with a BlurHash', async () => {
    const bitmap = fakeBitmap(3000, 2000);
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const file = photo();

    const out = await processImage(file, { maxSide: 1024, quality: 0.85 });

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(out.mime).toBe('image/jpeg');
    expect(out.width).toBe(1024);
    expect(out.height).toBe(683);
    expect(new Uint8Array(out.bytes)).toEqual(JPEG_BYTES);

    // The output canvas has the scaled size and is encoded as JPEG at the requested quality.
    expect(toBlobCalls).toHaveLength(1);
    expect(toBlobCalls[0]!.type).toBe('image/jpeg');
    expect(toBlobCalls[0]!.quality).toBe(0.85);
    expect(toBlobCalls[0]!.canvas.width).toBe(1024);
    expect(toBlobCalls[0]!.canvas.height).toBe(683);
    const main = contexts.find((c) => c.canvas === toBlobCalls[0]!.canvas)!;
    expect(main.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 683);
    expect(main.fillRect).toHaveBeenCalledWith(0, 0, 1024, 683);

    // The BlurHash comes from a 32 × 32 copy of the result with 4 × 3 components.
    const small = contexts.find((c) => c.canvas.width === 32 && c.canvas.height === 32)!;
    expect(small.drawImage).toHaveBeenCalledWith(toBlobCalls[0]!.canvas, 0, 0, 32, 32);
    expect(small.getImageData).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(isBlurhashValid(out.blurhash).result).toBe(true);
    expect(out.blurhash[0]).toBe('L'); // size flag (4 − 1) + (3 − 1) × 9 = 21 → 'L'

    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('does not enlarge small images', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap(200, 150)));

    const out = await processImage(photo(), { maxSide: 256, quality: 0.8 });

    expect(out).toMatchObject({ width: 200, height: 150, mime: 'image/jpeg' });
    expect(toBlobCalls[0]!.quality).toBe(0.8);
  });

  it('falls back to an <img> element when createImageBitmap is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    installFakeImage({ width: 2000, height: 4000 });
    const file = photo();

    const out = await processImage(file, { maxSide: 1024, quality: 0.8 });

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(out).toMatchObject({ width: 512, height: 1024, mime: 'image/jpeg' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('falls back to an <img> element when createImageBitmap rejects', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new TypeError('unsupported option'))));
    installFakeImage({ width: 640, height: 480 });

    const out = await processImage(photo(), { maxSide: 1024, quality: 0.8 });

    expect(out).toMatchObject({ width: 640, height: 480 });
  });

  it('throws ImageDecodeError when the file cannot be decoded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new DOMException('bad image', 'InvalidStateError'))));
    installFakeImage('error');

    const result = processImage(photo(), { maxSide: 1024, quality: 0.8 });

    await expect(result).rejects.toBeInstanceOf(ImageDecodeError);
    await expect(result).rejects.toMatchObject({ name: 'ImageDecodeError' });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(toBlobCalls).toHaveLength(0);
  });

  it('throws ImageDecodeError when no decoder is available and the <img> fails', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    installFakeImage('error');

    await expect(processImage(photo(), { maxSide: 256, quality: 0.8 })).rejects.toBeInstanceOf(ImageDecodeError);
  });

  it('rejects when the canvas cannot produce a JPEG, and still releases the bitmap', async () => {
    const bitmap = fakeBitmap(100, 100);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    toBlobResult = () => null;

    const result = processImage(photo(), { maxSide: 256, quality: 0.8 });

    await expect(result).rejects.toThrow('could not be encoded as JPEG');
    await expect(result).rejects.not.toBeInstanceOf(ImageDecodeError);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('rejects when the browser encodes another format instead of JPEG', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => fakeBitmap(100, 100)));
    toBlobResult = () => new Blob([JPEG_BYTES], { type: 'image/png' });

    await expect(processImage(photo(), { maxSide: 256, quality: 0.8 })).rejects.toThrow('JPEG encoding is not supported');
  });
});
