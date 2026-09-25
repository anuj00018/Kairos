import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendPort = env.BACKEND_PORT || env.VITE_BACKEND_PORT || process.env.BACKEND_PORT || process.env.VITE_BACKEND_PORT || '8000'
  const backendUrl = env.BACKEND_URL || env.VITE_BACKEND_URL || process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || `http://127.0.0.1:${backendPort}`

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        }
      }
    }
  }
})

