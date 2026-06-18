import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Zero-config Vercel deploy: build -> `dist`. No env, no backend.
export default defineConfig({
  plugins: [react()],
  // Honor the PORT env var when provided (lets tooling assign a free port);
  // falls back to Vite's default for plain `npm run dev`.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  build: {
    outDir: 'dist',
  },
});
