import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Zero-config Vercel deploy: build -> `dist`. No env, no backend.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
