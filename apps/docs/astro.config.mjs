import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://docs.flaghoist.dev',
  integrations: [
    starlight({
      title: 'Flaghoist',
      description: 'Hoist your own feature flags: open-source, OpenFeature-native, self-hosted.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        alt: 'Flaghoist',
      },
      customCss: ['./src/styles/custom.css'],
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.flaghoist.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://docs.flaghoist.dev/og.png' } },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/flaghoist/flaghoist' },
      ],
      sidebar: [
        {
          label: 'Start here',
          items: ['index', 'quickstart', 'architecture'],
        },
        {
          label: 'Self-hosting',
          items: ['self-hosting', 'storage-adapters', 'auth', 'dashboard'],
        },
        {
          label: 'Reference',
          items: ['api-reference', 'cli'],
        },
        {
          label: 'Project',
          items: ['contributing'],
        },
      ],
    }),
  ],
})
