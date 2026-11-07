import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// All date logic is tested in the Owner's time zone (DST changes included).
process.env.TZ = 'Asia/Jerusalem';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
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
    ],
  },
});
