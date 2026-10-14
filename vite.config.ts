import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// Static site on GitHub Pages under /landfall/. Everything is relative so the same build runs from any path.
// The service worker precaches the whole exercise (app, data, tiles, fonts): conference Wi-Fi is not a dependency.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,json,png,pbf,svg,webp}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: null,
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5290 },
})
