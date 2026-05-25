import type http from "node:http";
import type Stripe from "stripe";
import { getStripe } from "./config.js";
import { syncFromStripeSubscription } from "./store.js";

export async function handleBillingWebhook(req: http.IncomingMessage, res: http.ServerResponse, rawBody: Buffer) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("webhook_not_configured");
    return;
  }

  const sig = req.headers["stripe-signature"];
  if (!sig || Array.isArray(sig)) {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("missing_signature");
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.warn("[billing] webhook signature failed", err);
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("invalid_signature");
    return;
  }

  try {
    await dispatchStripeEvent(event);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error("[billing] webhook handler error", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("handler_error");
  }
}

async function dispatchStripeEvent(event: Stripe.Event) {
  const stripe = getStripe();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id || session.metadata?.supabase_user_id || null;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncFromStripeSubscription(sub, userId);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncFromStripeSubscription(sub, sub.metadata?.supabase_user_id ?? null);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncFromStripeSubscription(sub, sub.metadata?.supabase_user_id ?? null);
      break;
    }
    default:
      break;
  }
}
