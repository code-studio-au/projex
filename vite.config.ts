import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [tanstackStart(), react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/dbIntegration*.test.ts'],
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          if (
            id.includes('node_modules/@mantine/') ||
            id.includes('node_modules/@emotion/')
          ) {
            return 'vendor-ui';
          }

          if (id.includes('node_modules/@tabler/')) {
            return 'vendor-icons';
          }

          return undefined;
        },
      },
    },
  },
  optimizeDeps:
    command === 'serve'
      ? {
          exclude: [
            '@tanstack/react-start',
            '@tanstack/react-start/client',
            '@tanstack/react-start/server',
            '@tanstack/react-start-client',
            '@tanstack/react-start-server',
            '@tanstack/start-client-core',
            '@tanstack/start-server-core',
          ],
        }
      : undefined,
}));
