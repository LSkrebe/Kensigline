import type http from "node:http";
import { unwrapWebhook } from "@whop/sdk/helpers";

import { syncFromWhopMembership, type WhopMembershipLike } from "./store.js";
import { createWebhookDeliveryProcessor } from './webhook-delivery.js';

const processDelivery = createWebhookDeliveryProcessor();

type WhopWebhookEvent = {
  type?: string;
  id?: string;
  data?: Record<string, unknown>;
};

export async function handleBillingWebhook(req: http.IncomingMessage, res: http.ServerResponse, rawBody: Buffer) {
  const secret = String(process.env.WHOP_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    res.writeHead(503, { "content-type": "text/plain" });
    res.end("webhook_not_configured");
    return;
  }

  const raw = rawBody.toString("utf8");
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k] = v;
    else if (Array.isArray(v) && v[0]) headers[k] = v[0];
  }

  let event: WhopWebhookEvent;
  try {
    event = unwrapWebhook<WhopWebhookEvent>(raw, { headers, key: secret });
  } catch (err) {
    console.warn("[billing] webhook signature failed", err);
    res.writeHead(401, { "content-type": "text/plain" });
    res.end("invalid_signature");
    return;
  }

  const deliveryId = headers["webhook-id"] ?? event.id ?? "";
  try {
    const duplicate = await processDelivery(deliveryId, () => dispatchWhopEvent(event));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ received: true, duplicate }));
  } catch (err) {
    console.error("[billing] webhook handler error", err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("handler_error");
  }
}

function asMembership(data: Record<string, unknown> | undefined): WhopMembershipLike | null {
  if (!data || typeof data !== "object") return null;
  if (typeof data.id !== "string") return null;
  return data as WhopMembershipLike;
}

function metaUserId(data: Record<string, unknown> | undefined): string | null {
  const meta = data?.metadata;
  if (!meta || typeof meta !== "object") return null;
  const uid = (meta as Record<string, unknown>).supabase_user_id;
  return typeof uid === "string" && uid.trim() ? uid.trim() : null;
}

async function dispatchWhopEvent(event: WhopWebhookEvent) {
  const type = String(event.type ?? "").trim();
  const data = event.data;

  switch (type) {
    case "payment.succeeded": {
      const userId = metaUserId(data);
      const membership = asMembership(data?.membership as Record<string, unknown> | undefined);
      if (membership) {
        await syncFromWhopMembership(membership, userId);
        return;
      }
      if (data && typeof data.membership_id === "string") {
        // Payment-only payload — refresh will pick up membership on next status poll.
        console.info("[billing] payment.succeeded", data.membership_id, userId ?? "no_user_hint");
      }
      break;
    }
    case "membership.activated":
    case "membership.deactivated":
    case "membership.updated": {
      const membership = asMembership(data);
      if (membership) {
        await syncFromWhopMembership(membership, metaUserId(data));
      }
      break;
    }
    default:
      break;
  }
}
