import { fetchJsonSafe } from './api.js'
import { clearBillingCache } from './useSubscription.js'

/** Receipt refresh is always bound to the authenticated account. */
export async function activateCheckoutSession(receiptId) {
  const id=String(receiptId??'').trim()
  if(!id) return {ok:false,error:'missing_receipt'}
  for(let attempt=0;attempt<10;attempt++) {
    const res=await fetchJsonSafe('/api/billing/activate',{method:'POST',body:{receiptId:id},timeoutMs:25000})
    if(res.status===401) {
      window.location.assign('/sign-in?reason=checkout_sign_in')
      return {ok:true,requiresSignIn:true}
    }
    if(res.ok && res.data?.active) {clearBillingCache();return {ok:true}}
    if(res.status===403) return {ok:false,error:'Use the same account as your checkout.'}
    if(!res.ok && res.status!==503 && res.status!==202) return {ok:false,error:res.data?.error??'activate_failed'}
    await new Promise(r=>setTimeout(r,1500))
  }
  return {ok:false,error:'activation_pending'}
}
