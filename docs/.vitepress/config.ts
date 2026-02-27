import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AvaCar Widget',
  description: 'Embed car customization preview widgets on your site',
  base: '/car-config-embed/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'API', link: '/api/javascript-api' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Playground', link: '/playground' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'JavaScript API', link: '/api/javascript-api' },
          { text: 'TypeScript Types', link: '/api/types' },
        ],
      },
      {
        text: 'Integration',
        items: [
          { text: 'HTML Attributes', link: '/integration/html-attributes' },
          { text: 'JWT Structure', link: '/integration/jwt' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/XIX3D/car-config-embed' },
    ],

    footer: {
      message: 'AvaCar Widget Documentation',
    },
  },

  vite: {
    optimizeDeps: {
      include: ['monaco-editor'],
    },
    ssr: {
      external: ['monaco-editor'],
    },
  },
})
