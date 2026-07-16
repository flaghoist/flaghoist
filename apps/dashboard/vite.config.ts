import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The single-file build inlines all JS/CSS into one index.html, so the server can serve the
// whole dashboard at /admin from a single embedded string.
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
})
