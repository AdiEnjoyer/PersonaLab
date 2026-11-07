import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// CI sets BASE_PATH to `/${repo}/`; the PWA plugin is added in task 9.1.
const base = process.env.BASE_PATH ?? '/PersonalLab/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
});
