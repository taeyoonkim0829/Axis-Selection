import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Product data (Data/*.json) is bundled on purpose; it dominates the chunk size.
  build: { chunkSizeWarningLimit: 1000 },
})
