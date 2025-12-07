import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      include: '**/*.{jsx,tsx}',
    }),
    sveltekit(),
  ],
  build: {
    rollupOptions: {
      output: {
        // Minimize code splitting for IPFS compatibility
        // IPFS gateways can have issues with chunk loading, so bundle more together
        manualChunks: () => {
          // Return undefined to bundle everything into fewer chunks
          // This helps avoid module loading issues on IPFS
          return undefined;
        },
      },
    },
    // Increase chunk size limit to allow larger bundles
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: false, // Combine all CSS into one file
  },
});
