import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/mtmcopy-app/',
  build: {
    outDir: path.resolve(__dirname, '../../../../public/mtmcopy-app'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api/mtmcopy/engine': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mtmcopy\/engine/, ''),
      },
    },
  },
})
