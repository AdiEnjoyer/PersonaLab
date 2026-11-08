import { reportUnreachable } from '../../../core/net/online';
import { CHESS_SETTING_KEYS } from '../settings';
import { createChessComClient, type ChessComClient } from '../net/chesscom';

let shared: ChessComClient | undefined;

/** The app-wide Chess.com client (one request at a time for the whole app, R46.1). The database is loaded lazily. */
export function getChessComClient(): ChessComClient {
  shared ??= createChessComClient({
    fetch: (input, init) => globalThis.fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    proxyUrl: async () => {
      const { readSetting } = await import('../../../core/settings/repo');
      return readSetting<string>(CHESS_SETTING_KEYS.proxyUrl);
    },
    now: () => Date.now(),
    onUnreachable: reportUnreachable,
  });
  return shared;
}

/** Called when the proxy URL changes: the next request goes directly to Chess.com first (R46.7). */
export function resetChessComRoute(): void {
  shared?.resetRoute();
}
