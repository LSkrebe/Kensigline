import { createClient } from '@supabase/supabase-js'

/* Direct `import.meta.env.*` so Vite `define` replaces from repo root `.env`. */
const url = import.meta.env.SUPABASE_URL
const anon = import.meta.env.SUPABASE_ANON_KEY

/** Null when env vars are missing — app still runs; auth UI explains what to set. */
export const supabase =
  url && anon && String(url).trim() && String(anon).trim()
    ? createClient(String(url).trim(), String(anon).trim())
    : null
