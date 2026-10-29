import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/templates': 'http://localhost:3100',
      '/workflows': 'http://localhost:3100',
      '/health': 'http://localhost:3100',
      '/mcp': 'http://localhost:3100',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/node_modules\/(vue|vue-router|pinia|\.bin)\//.test(id) || id.includes('@vue/')) {
            return 'vendor-vue'
          }
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('chart.js') || id.includes('vue-chartjs')) return 'vendor-charts'
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor'
          if (id.includes('dompurify') || id.includes('highlight.js')) return 'vendor-markdown'
          if (id.includes('lucide-vue-next')) return 'vendor-lucide'
          if (id.includes('element-plus') || id.includes('@element-plus')) return 'vendor-element'
          if (id.includes('@n8n/design-system')) return 'vendor-design-system'
          return 'vendor'
        },
      },
    },
  },
})