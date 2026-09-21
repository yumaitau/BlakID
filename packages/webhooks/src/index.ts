import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_EVENTS = [
  "user.created",
  "user.updated",
  "user.suspended",
  "user.deleted",
  "group.updated",
  "login.success",
  "login.failed",
  "session.created",
  "session.revoked",
  "application.access.granted",
  "application.access.revoked",
  "security.finding.created",
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export type WebhookEndpoint = {
  id: string;
  organisationId: string;
  url: string;
  secret: string;
  events: WebhookEventName[];
  createdAt: string;
};

export type WebhookDelivery = {
  id: string;
  webhookId: string;
  eventId: string;
  event: WebhookEventName;
  status: "pending" | "delivered" | "dead";
  attempts: number;
  lastError: string | null;
  payload: string;
  createdAt: string;
};

export const AUDIT_TO_WEBHOOK: Record<string, WebhookEventName> = {
  "identity.created": "user.created",
  "identity.invited": "user.created",
  "identity.activated": "user.updated",
  "identity.suspended": "user.suspended",
  "identity.deleted": "user.deleted",
  "identity.archived": "user.updated",
  "group.member.added": "group.updated",
  "group.member.removed": "group.updated",
  "identity.login.success": "login.success",
  "identity.login.failed": "login.failed",
  "session.revoked": "session.revoked",
};

export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyWebhookSignature(secret: string, timestamp: string, body: string, signature: string): boolean {
  const expected = signWebhookBody(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function webhookHeaders(secret: string, timestamp: string, body: string, deliveryId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-blakid-timestamp": timestamp,
    "x-blakid-signature": signWebhookBody(secret, timestamp, body),
    "x-blakid-delivery": deliveryId,
    "x-blakid-idempotency-key": deliveryId,
  };
}

export async function deliverOnce(
  endpoint: WebhookEndpoint,
  delivery: WebhookDelivery,
  timestamp: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WebhookDelivery> {
  try {
    const response = await fetchImpl(endpoint.url, {
      method: "POST",
      headers: webhookHeaders(endpoint.secret, timestamp, delivery.payload, delivery.id),
      body: delivery.payload,
    });
    if (response.ok) {
      return { ...delivery, status: "delivered", attempts: delivery.attempts + 1, lastError: null };
    }
    const err = `HTTP ${response.status}`;
    const attempts = delivery.attempts + 1;
    return { ...delivery, attempts, lastError: err, status: attempts >= 5 ? "dead" : "pending" };
  } catch (error) {
    const attempts = delivery.attempts + 1;
    return {
      ...delivery,
      attempts,
      lastError: error instanceof Error ? error.message : String(error),
      status: attempts >= 5 ? "dead" : "pending",
    };
  }
}
