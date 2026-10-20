import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs: the build works at the GitHub Pages path (/Axis-Selection/) as well as at a root.
  base: './',
  // Product data (Data/*.json) is bundled on purpose; it dominates the chunk size.
  build: { chunkSizeWarningLimit: 1000 },
  // The OpenCascade tessellation worker (src/cad/occt.worker.ts) loads its WebAssembly with dynamic imports.
  worker: { format: 'es' },
})
