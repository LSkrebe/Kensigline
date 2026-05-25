import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..')
  const env = loadEnv(mode, repoRoot, '')

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''
  const supabaseAnon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  const apiBase =
    env.API_BASE_URL || env.VITE_BACKEND_URL || env.VITE_API_BASE_URL || 'http://localhost:3001'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': { target: apiBase, changeOrigin: true },
        '/health': { target: apiBase, changeOrigin: true },
      },
    },
    define: {
      'import.meta.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnon),
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBase),
    },
  }
})
