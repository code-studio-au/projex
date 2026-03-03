import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tsconfigPaths(), tanstackStart(), react()],
});
