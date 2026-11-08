import { readSetting } from '../../../core/settings/repo';
import { GEMINI_TIMEOUT_MS, GEMINI_URL } from '../constants';
import { buildRequestBody, extractText, httpErrorKind, validateEstimate, type Estimate, type GeminiErrorKind } from '../logic/gemini';
import { NUTRITION_SETTING_KEYS } from '../settings';

export type EstimateOutcome =
  | { kind: 'ok'; estimate: Estimate }
  | { kind: 'unusable' }
  | { kind: GeminiErrorKind }
  /** The caller aborted (Cancel or leaving the screen); nothing is shown. */
  | { kind: 'aborted' };

export interface EstimateRequest {
  /** Sent only in the `x-goog-api-key` header. Never logged, never part of a result. */
  key: string;
  imageBase64: string;
  /** Aborts the request without an error message (R36.10). */
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * One `generateContent` request (R36.3) to the model named by the `nutrition.geminiModel` setting, read per request. The outcome carries only fixed kinds: no error object, response text
 * or URL is returned or logged, so the key cannot reach a message (R36.5). A timeout counts as `service`.
 */
export async function requestEstimate({ key, imageBase64, signal, timeoutMs = GEMINI_TIMEOUT_MS, fetchImpl = fetch }: EstimateRequest): Promise<EstimateOutcome> {
  if (signal?.aborted) return { kind: 'aborted' };
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const model = await readSetting<string>(NUTRITION_SETTING_KEYS.geminiModel);
    const response = await fetchImpl(GEMINI_URL(model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildRequestBody(imageBase64)),
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) return { kind: httpErrorKind(response.status) };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal?.aborted) return { kind: 'aborted' };
      return controller.signal.aborted ? { kind: 'service' } : { kind: 'unusable' };
    }
    if (signal?.aborted) return { kind: 'aborted' };
    const estimate = validateEstimate(extractText(body));
    return estimate === null ? { kind: 'unusable' } : { kind: 'ok', estimate };
  } catch {
    return signal?.aborted ? { kind: 'aborted' } : { kind: 'service' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
