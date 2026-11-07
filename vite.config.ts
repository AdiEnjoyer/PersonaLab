import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { gitShortSha } from './scripts/lib/buildVersion.ts';
import { versionJsonPlugin } from './scripts/lib/versionJson.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const appVersion = `${pkg.version}+${gitShortSha()}`;

// CI sets BASE_PATH to `/${repo}/`. Normalised so it always starts and ends with a slash.
const rawBase = process.env.BASE_PATH ?? '/PersonalLab/';
const base = `/${rawBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'PersonalLab',
        short_name: 'PersonalLab',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: 'icons/icon-180.png', sizes: '180x180', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,wasm,m4a}'],
        globIgnores: ['exercises/img/**', 'version.json', '404.html'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
    versionJsonPlugin(appVersion),
  ],
});