import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Familien-Wochenplan',
        short_name: 'Wochenplan',
        description: 'Wochenplan fuer das Mittagessen und automatische Einkaufsliste.',
        lang: 'de-DE',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#fbf7f0',
        theme_color: '#e07a5f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Auf allen Netzwerkschnittstellen lauschen, damit iPad und iPhone im
    // selben WLAN zugreifen koennen.
    host: '0.0.0.0',
    port: 5173,
    /*
     * Vite lehnt Anfragen mit unbekanntem Host-Namen ab (Schutz vor
     * DNS-Rebinding). IP-Adressen sind ohnehin erlaubt; zusaetzlich wird hier
     * der Bonjour-Name des Rechners freigegeben ("Timos-MacBook.local").
     * Der ist im Heimnetz stabil, waehrend die IP sich per DHCP aendern kann.
     * Bewusst nur dieses eine Suffix statt allowedHosts: true.
     */
    allowedHosts: ['.local'],
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
