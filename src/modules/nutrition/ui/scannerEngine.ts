import type { BarcodeFormat } from '../logic/barcode';

export interface ScanHandle {
  /** Stops decoding and every camera track. Safe to call more than once. */
  stop(): void;
}

/**
 * Starts the rear camera on `video` and reports every decoded EAN-13, EAN-8, UPC-A or UPC-E code (R33.1).
 * Rejects with the browser's camera error (`NotAllowedError`, `NotFoundError`, ...). The ZXing code loads on first use.
 */
export async function startScan(video: HTMLVideoElement, onDecode: (text: string, format: BarcodeFormat) => void): Promise<ScanHandle> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat: Z, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
  const names = new Map<number, BarcodeFormat>([
    [Z.EAN_13, 'EAN_13'],
    [Z.EAN_8, 'EAN_8'],
    [Z.UPC_A, 'UPC_A'],
    [Z.UPC_E, 'UPC_E'],
  ]);
  const hints = new Map<number, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [Z.EAN_13, Z.EAN_8, Z.UPC_A, Z.UPC_E]]]);
  const reader = new BrowserMultiFormatReader(hints);
  const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, (result) => {
    if (!result) return;
    const format = names.get(result.getBarcodeFormat());
    if (format !== undefined) onDecode(result.getText(), format);
  });
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        controls.stop();
      } finally {
        stopAllTracks(video);
      }
    },
  };
}

/** Stops every track of the stream attached to `video` and detaches it. */
export function stopAllTracks(video: HTMLVideoElement): void {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
