/** Test stand-in for the vite-plugin-pwa virtual module. */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => undefined;
}
