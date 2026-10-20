import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('react-router') || id.includes('/scheduler/')) {
            return 'vendor-react'
          }
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts'
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-editor'
          if (id.includes('dompurify') || id.includes('highlight.js')) return 'vendor-markdown'
          // Let Rollup split Lucide: the icon picker imports the full barrel,
          // while the rest of the app only needs the icons it references.
          if (id.includes('lucide-react')) return
          return 'vendor'
        },
      },
    },
  },
})
