import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// MCO's Cast receiver page (cast-receiver/), published to GitHub Pages at
// RECEIVER_URL (see src/cast/receiverProtocol.ts) by
// .github/workflows/cast-receiver.yml. Relative asset paths, so it works
// from any sub-path.
export default defineConfig({
  root: resolve(__dirname, 'cast-receiver'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-pages/cast-receiver'),
    emptyOutDir: true,
  },
})
