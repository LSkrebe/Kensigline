import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..')
  const env = loadEnv(mode, repoRoot, '')
  // Cloudflare Pages / CI inject process.env — local dev uses root `.env` via loadEnv.
  const pick = (key) => process.env[key] || env[key] || ''

  const supabaseUrl = pick('SUPABASE_URL') || pick('VITE_SUPABASE_URL')
  const supabaseAnon = pick('SUPABASE_ANON_KEY') || pick('VITE_SUPABASE_ANON_KEY')
  const apiBase =
    pick('API_BASE_URL') || pick('VITE_BACKEND_URL') || pick('VITE_API_BASE_URL') || 'http://localhost:3001'

  return {
    envDir: repoRoot,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Cloudflare / other dev tunnels use a random *.trycloudflare.com host each run.
      allowedHosts: true,
      proxy: {
        '/api': { target: apiBase, changeOrigin: true },
        '/health': { target: apiBase, changeOrigin: true },
      },
    },
    define: {
      'import.meta.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'import.meta.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnon),
      'import.meta.env.API_BASE_URL': JSON.stringify(apiBase),
      'import.meta.env.VITE_BILLING_GATE': JSON.stringify(pick('VITE_BILLING_GATE')),
      'import.meta.env.VITE_WAITLIST_MODE': JSON.stringify(pick('VITE_WAITLIST_MODE')),
      'import.meta.env.VITE_WHOP_COMPANY_ID': JSON.stringify(pick('VITE_WHOP_COMPANY_ID')),
      'import.meta.env.VITE_WHOP_ENV': JSON.stringify(
        pick('WHOP_SANDBOX') === '1' || pick('VITE_WHOP_ENV') === 'sandbox' ? 'sandbox' : 'production',
      ),
    },
  }
})
