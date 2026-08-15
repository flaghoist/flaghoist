import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    // The App tests mount real components and touch localStorage and matchMedia, so they need a DOM.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
})
