import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://docs.flaghoist.dev',
  integrations: [
    starlight({
      title: 'Flaghoist',
      description: 'Hoist your own feature flags — open-source, OpenFeature-native, self-hosted.',
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
          items: ['self-hosting', 'storage-adapters', 'auth'],
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
