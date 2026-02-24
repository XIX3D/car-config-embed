import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    cssInjectedByJsPlugin()
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'CarConfigEmbed',
      fileName: 'car-config-embed',
      formats: ['iife']
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    },
    minify: 'terser',
    terserOptions: { compress: { drop_console: true } }
  }
})
