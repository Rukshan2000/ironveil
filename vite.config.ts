/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rapier ships its WASM inlined in JS (~4 MB), so the default 500 kB warning is noise.
  build: { chunkSizeWarningLimit: 6000 },
  // listen on all interfaces so other devices on the same network can play (http://<this-machine-ip>:port)
  server: { host: true },
  preview: { host: true },
  test: { environment: 'node' },
})
