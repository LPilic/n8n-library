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
  },
})
