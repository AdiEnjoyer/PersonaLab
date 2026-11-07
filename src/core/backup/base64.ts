import { BASE64_PATTERN, type BackupImage } from './schema';

/** Bytes per `String.fromCharCode` call; keeps the argument list well below engine limits. */
const CHUNK = 0x8000;

/** A stored image (`{module}_images` tables). The bytes are an `ArrayBuffer`, never base64 (design). */
export interface ImageRecord {
  id: string;
  mime: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

/** The text is not strict, padded base64. */
export class Base64DecodeError extends Error {
  override readonly name = 'Base64DecodeError';
  constructor() {
    super('The text is not valid base64');
  }
}

/** A stored image could not be read for a Backup_File; the export reports the part `images` (R6.10). */
export class ImageExportError extends Error {
  override readonly name = 'ImageExportError';
  constructor(
    readonly imageId: string,
    options?: { cause?: unknown },
  ) {
    super(`The stored image ${imageId} could not be read`, options);
  }
}

/** True for an `ArrayBuffer` (from any realm) or a typed-array / DataView. */
export function isBinary(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value) || Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

function bytesOf(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
}

/** The bytes of `data` as strict, padded base64 (R6.2). */
export function toBase64(data: ArrayBuffer | ArrayBufferView): string {
  const bytes = bytesOf(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decodes strict, padded base64 into a new `ArrayBuffer`; throws `Base64DecodeError` for any other text. */
export function fromBase64(text: string): ArrayBuffer {
  if (!BASE64_PATTERN.test(text)) throw new Base64DecodeError();
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * A stored image as it appears in a Backup_File. Throws `ImageExportError` when the record has no readable
 * bytes, so the export stops and names the part `images` (R6.10).
 */
export function imageToBackup(record: ImageRecord): BackupImage {
  if (!isBinary(record.bytes)) throw new ImageExportError(record.id);
  try {
    return { id: record.id, mime: record.mime, base64: toBase64(record.bytes), width: record.width, height: record.height };
  } catch (error) {
    throw new ImageExportError(record.id, { cause: error });
  }
}

/** The stored image record of a validated Backup_File image. */
export function imageFromBackup(image: BackupImage): ImageRecord {
  return { id: image.id, mime: image.mime, bytes: fromBase64(image.base64), width: image.width, height: image.height };
}
