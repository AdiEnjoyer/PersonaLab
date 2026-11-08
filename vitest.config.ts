import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// All date logic is tested in the Owner's time zone (DST changes included).
process.env.TZ = 'Asia/Jerusalem';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        resolve: { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/test/stubs/pwa-register.ts', import.meta.url)) } },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          testTimeout: 20000,
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'worker',
          environment: 'node',
          include: ['worker/test/**/*.test.ts'],
        },
      },
    ],
  },
});
