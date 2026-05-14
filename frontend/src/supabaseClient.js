import { createClient } from '@supabase/supabase-js'

const url = typeof import.meta !== 'undefined' ? import.meta.env?.SUPABASE_URL : null
const anon = typeof import.meta !== 'undefined' ? import.meta.env?.SUPABASE_ANON_KEY : null

/** Null when env vars are missing — app still runs; auth UI explains what to set. */
export const supabase =
  url && anon && String(url).trim() && String(anon).trim()
    ? createClient(String(url).trim(), String(anon).trim())
    : null
