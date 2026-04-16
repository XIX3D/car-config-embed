import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Playground from './components/Playground.vue'
import JwtDecoder from './components/JwtDecoder.vue'
import CodeBlock from './components/CodeBlock.vue'
import RenderPlayground from './components/RenderPlayground.vue'
import UserPlayground from './components/UserPlayground.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Playground', Playground)
    app.component('JwtDecoder', JwtDecoder)
    app.component('CodeBlock', CodeBlock)
    app.component('RenderPlayground', RenderPlayground)
    app.component('UserPlayground', UserPlayground)
  },
} satisfies Theme
