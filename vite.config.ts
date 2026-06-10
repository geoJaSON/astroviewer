import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3001,
    allowedHosts: ['astro.geojay.net', '.geojay.net'],
    hmr: {
      host: 'astro.geojay.net',
      protocol: 'wss',
      clientPort: 443,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3001,
    allowedHosts: ['astro.geojay.net', '.geojay.net'],
  },
})
