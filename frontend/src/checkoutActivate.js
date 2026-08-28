import { fetchJsonSafe, setAuthTokenCache } from './api.js'
import { supabase } from './supabaseClient.js'
import { clearBillingCache } from './useSubscription.js'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * After Whop checkout: provision account server-side and sign in without email click.
 * Retries while Whop membership is still activating.
 */
export async function activateCheckoutSession(receiptId) {
  const id = String(receiptId ?? '').trim()
  if (!id) return { ok: false, error: 'missing_receipt' }
  if (!supabase) return { ok: false, error: 'supabase_not_configured' }

  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetchJsonSafe('/api/billing/activate', {
      method: 'POST',
      body: { receiptId: id },
      timeoutMs: 25_000,
    })

    if (res.status === 202 || res.data?.pending) {
      await sleep(Math.min(2500, 800 + attempt * 300))
      continue
    }

    if (!res.ok || !res.data?.token_hash) {
      return {
        ok: false,
        error: res.data?.error ?? 'activate_failed',
        status: res.status,
      }
    }

    const { error, data } = await supabase.auth.verifyOtp({
      token_hash: res.data.token_hash,
      type: 'email',
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    if (data?.session?.access_token) {
      setAuthTokenCache(data.session.access_token)
    }

    const userId = res.data.user_id ?? data?.user?.id ?? null
    if (userId) clearBillingCache(userId)

    return { ok: true, userId }
  }

  return { ok: false, error: 'activate_timeout' }
}
