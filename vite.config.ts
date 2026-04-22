import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    react(),
  ],
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
