import type { ChessComError } from './chesscom';

const OFFLINE_MESSAGE = 'You are offline. Chess.com needs a connection.';

/** Owner-facing text for each Chess.com failure (R40.5, R46.2 to R46.9). */
export function chessComMessage(error: ChessComError): string {
  switch (error.kind) {
    case 'offline':
      return OFFLINE_MESSAGE;
    case 'not-found':
      return 'Chess.com user not found';
    case 'rate-limited':
      return 'Chess.com is limiting requests. Try again later.';
    case 'timeout':
      return 'Chess.com did not respond. Try again later.';
    case 'server':
      return `Chess.com is unavailable (HTTP ${error.status}). Try again later.`;
    case 'http':
      return `Chess.com answered with an unexpected status (HTTP ${error.status}).`;
    case 'unreadable':
      return 'Chess.com sent an unreadable response.';
    case 'network-direct-no-proxy':
      return 'Could not reach Chess.com. You may be offline, or this browser blocks direct requests to Chess.com and a CORS proxy is needed.';
    case 'network-proxy':
      return `${OFFLINE_MESSAGE} If you are online, check the CORS proxy URL in Settings.`;
  }
}

export const PROXY_GUIDE_URL = 'https://github.com/AdiEnjoyer/PersonaLab/blob/main/worker/README.md';
