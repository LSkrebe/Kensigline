# Settings / billing

Frontend: **Settings** side tab (`activeTab=settings`).

Whop checkout (embedded), membership status, webhooks, and referral tracking (`?r=`). Auth identity lives in `core/supabase-auth.ts`.

Attribution funnel (`?r=` / short links `/yt` `/twt` `/ig` → signups → checkouts → paid) lives in `../attribution/` and `billing_accounts.referral_ref`. Organic traffic is logged as `direct`. Daily owner email rolls up to YouTube / Instagram / Twitter / Other: `scripts/send-attribution-daily.ts` / `scripts/run-attribution-report.sh`.

Apply DB migrations after `billing.sql`:

```bash
psql "$DATABASE_URL" -f backend/db/billing-whop.sql
psql "$DATABASE_URL" -f backend/db/attribution.sql
```

Owner-only summary: `GET /api/attribution/summary` (Bearer token with `billing_exempt` / owner role).

Whop dashboard setup:

1. Create product + PPP plans (amounts must match `ppp.ts` / Tier table) → copy `plan_` IDs into env:
   - Tier 1: `WHOP_PLAN_ID_MONTHLY` / `WHOP_PLAN_ID_YEARLY` ($48.40 / $484)
   - Tier 2: `WHOP_PLAN_ID_T2_*` ($37.60 / $376)
   - Tier 3: `WHOP_PLAN_ID_T3_*` ($26.40 / $264)
   - Tier 4: `WHOP_PLAN_ID_T4_*` ($14.80 / $148)
2. Keep any legacy plan IDs in env so existing memberships still sync.
3. Developer → Webhooks → `https://api.mercerline.com/api/billing/webhook` with `payment.succeeded`, `membership.activated`, `membership.deactivated`.
4. Copy API key + webhook secret + company ID (`biz_`) into server `.env`.
5. Set `VITE_WHOP_COMPANY_ID` for the Whop pixel in frontend builds.

PPP geo: server reads `CF-IPCountry` (Cloudflare). Country → tier map lives in `ppp.ts`. Missing tier plan IDs fall back to Tier 1 for both display and checkout. Existing subscribers are never repriced.
