import sitemap from '@astrojs/sitemap'
import { defineConfig } from 'astro/config'

// `site` gives absolute URLs to the sitemap and canonical tags. The sitemap integration emits
// /sitemap-index.xml at build, which robots.txt points search engines at.
export default defineConfig({
  site: 'https://flaghoist.dev',
  integrations: [sitemap()],
})
