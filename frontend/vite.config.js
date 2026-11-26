import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative paths so the built site works on GitHub Pages
  // (https://<user>.github.io/<repo>/) as well as locally.
  base: './',
  server: {
    port: 5173,
    // Locally, requests to /api are forwarded to the FastAPI backend on port 8000.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
