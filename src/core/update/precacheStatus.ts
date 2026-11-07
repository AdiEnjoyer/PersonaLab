/** True when the service worker reports every precache entry cached (R1.7); false when unknown or unsupported. */
export async function getOfflineReady(timeoutMs = 3000): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = navigator.serviceWorker.controller ?? registration?.active;
    if (!worker) return false;
    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(false), timeoutMs);
      channel.port1.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        resolve(event.data === true);
      };
      worker.postMessage({ type: 'PRECACHE_STATUS' }, [channel.port2]);
    });
  } catch {
    return false;
  }
}