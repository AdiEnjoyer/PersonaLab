import { EngineClient, EngineStartError, type EngineTransport } from './client';
import { ENGINE_FILES } from './engineFiles';
/** URL of the Stockfish script under the app base (precached with the App_Shell, R55.1). */
export const engineScriptUrl = (base: string = import.meta.env.BASE_URL): string => `${base}engine/${ENGINE_FILES.script}`;
/**
 * Bootstrap of the single-threaded lite WASM build in a classic Web Worker. The script finds its `.wasm` next to
 * itself; the worker talks UCI as plain strings.
 */
export function createWorkerTransport(url: string = engineScriptUrl()): EngineTransport {
  if (typeof Worker === 'undefined') throw new EngineStartError('Web Workers are not available.');
  const worker = new Worker(url);
  return {
    post: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      worker.addEventListener('message', (e: MessageEvent) => {
        const data: unknown = e.data;
        if (typeof data === 'string') for (const line of data.split('\n')) if (line !== '') cb(line);
      });
    },
    onError: (cb) => {
      worker.addEventListener('error', (e) => cb(e));
      worker.addEventListener('messageerror', (e) => cb(e));
    },
    terminate: () => worker.terminate(),
  };
}
let shared: EngineClient | undefined;
/** The app-wide engine client: one worker at a time. */
export function getEngineClient(): EngineClient {
  shared ??= new EngineClient(() => createWorkerTransport());
  return shared;
}
