import { defineConfig } from 'vite';

// The ThoughtSpot SDK is intentionally NOT bundled — it is loaded at runtime via a
// dynamic import() from the jsDelivr CDN so the version can be switched in the UI
// (see src/sdk.ts). Vite leaves that import alone because of the /* @vite-ignore */.
export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
