# Settings / billing

Frontend: **Settings** side tab (`activeTab=settings`).

Whop checkout (embedded), membership status, webhooks, and referral tracking (`?r=`). Auth identity lives in `core/supabase-auth.ts`.

Attribution funnel (`?r=` / short links `/yt` `/twt` `/ig` → signups → checkouts → paid) lives in `../attribution/` and `billing_accounts.referral_ref`. Organic traffic is logged as `direct`. Daily owner email: `scripts/send-attribution-daily.ts` / `scripts/run-attribution-report.sh`.

Apply DB migrations after `billing.sql`:

```bash
psql "$DATABASE_URL" -f backend/db/billing-whop.sql
psql "$DATABASE_URL" -f backend/db/attribution.sql
```

Owner-only summary: `GET /api/attribution/summary` (Bearer token with `billing_exempt` / owner role).

Whop dashboard setup:

1. Create product + monthly/yearly plans → copy `plan_` IDs into env.
2. Developer → Webhooks → `https://api.mercerline.com/api/billing/webhook` with `payment.succeeded`, `membership.activated`, `membership.deactivated`.
3. Copy API key + webhook secret + company ID (`biz_`) into server `.env`.
4. Set `VITE_WHOP_COMPANY_ID` for the Whop pixel in frontend builds.
