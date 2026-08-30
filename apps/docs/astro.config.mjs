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
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://docs.flaghoist.dev/og.png' },
        },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: 'https://docs.flaghoist.dev/og.png' },
        },
        // Cloudflare Web Analytics. No cookies, so no consent banner, and the token is meant to be
        // public: it identifies the site, not the account. A client-side beacon means ad blockers
        // suppress some of it, so read the numbers as a floor rather than a count.
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': '{"token": "4384bd9f871d471b832661b3f690f11f"}',
          },
        },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/flaghoist/flaghoist' }],
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
          label: 'Deploying',
          items: ['deploy/overview', 'deploy/docker', 'deploy/render'],
        },
        {
          label: 'Read flags from your app',
          items: [
            'clients/overview',
            'clients/javascript',
            'clients/go',
            'clients/python',
            'clients/java',
            'clients/dotnet',
            'clients/ruby',
            'clients/rust',
          ],
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
