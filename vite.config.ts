import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> }

// Static site on GitHub Pages under /landfall/. Everything is relative so the same build runs from any path.
// The service worker precaches the whole exercise (app, data, tiles, fonts): conference Wi-Fi is not a dependency.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      // our own worker (src/sw.ts): precache, wait to be asked before an update, and a one-time hand-over from the
      // earlier self-updating versions
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,json,png,pbf,svg,webp}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  // which build is running, shown on the setup page (so a cached older version is easy to spot)
  define: { __BUILD__: JSON.stringify({ time: new Date().toISOString(), sha: (process.env.GITHUB_SHA ?? '').slice(0, 7) }) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, assetsInlineLimit: 0 },
  server: { host: '127.0.0.1', port: 5290 },
})
