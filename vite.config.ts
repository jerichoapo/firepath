/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Playwright writes artifacts into the project tree while tests run against this
    // server — keep them out of the watcher so test runs can't trigger reloads.
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
