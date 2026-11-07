import type { Plugin } from 'vite';

/** The content of `version.json`: only the app version, no Owner data. */
export function versionJsonContent(version: string): string {
  return JSON.stringify({ version });
}

/** Vite plugin that emits `version.json` into the build output. */
export function versionJsonPlugin(version: string): Plugin {
  return {
    name: 'personallab-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: versionJsonContent(version) });
    },
  };
}