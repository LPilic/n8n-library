import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { N8nPlugin } from '@n8n/design-system/plugin'
import { IconBodyLoaderKey, loadLucideIconBody } from '@n8n/design-system/icons/lucide'

// Design system first, app overrides after
import '@n8n/design-system/theme.css'
import '@n8n/design-system/style.css'
import './index.css'

import App from './App.vue'
import router from './router'
import { useThemeStore } from '@/stores/theme'
import { useBrandingStore } from '@/stores/branding'

const app = createApp(App)
app.use(N8nPlugin, {})
app.provide(IconBodyLoaderKey, loadLucideIconBody)
app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1 },
    },
  },
})

// Theme + branding before mount so there is no flash of unstyled theme
const theme = useThemeStore()
theme.init()
const branding = useBrandingStore()
branding.applyBrandingCss()
branding.loadBranding()

app.mount('#app')