import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'
  return { base, plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['icon.svg', 'apple-touch-icon.png'],
    manifest: { id: base, name: 'Together — Plans & Memories', short_name: 'Together', description: 'Private plans, date ideas and memories for your people.', theme_color: '#17161a', background_color: '#17161a', display: 'standalone', start_url: base, scope: base, icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: `${base}icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ] },
    workbox: { navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], runtimeCaching: [{ urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\//, handler: 'CacheFirst', options: { cacheName: 'map-tiles', expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 7 } } }] }
  })], test: { environment: 'node' } }
})
