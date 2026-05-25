import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    // Dev: forward /api/* to the Express backend so the browser stays same-origin.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/Trees_logo.jpeg'],
      manifest: {
        name: 'Trees Engineering — Recruiter Workspace',
        short_name: 'Trees',
        description: 'Recruiter workspace for Trees Engineering',
        theme_color: '#0a1628',
        background_color: '#0a1628',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/Trees_logo.jpeg',
            sizes: 'any',
            type: 'image/jpeg',
            // Horizontal wordmark — OS will letterbox at square sizes.
            // A square crop of just the tree symbol would be ideal as a follow-up.
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Never let the service worker intercept backend calls.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5,
              },
            },
          },
        ],
      },
    }),
  ],
})
