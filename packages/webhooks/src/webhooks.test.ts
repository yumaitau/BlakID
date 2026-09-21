import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { deliverOnce, signWebhookBody, verifyWebhookSignature, type WebhookDelivery, type WebhookEndpoint } from "./index.ts";

describe("signed webhooks", () => {
  it("round-trips HMAC signatures", () => {
    const body = JSON.stringify({ event: "user.suspended" });
    const sig = signWebhookBody("secret", "1710000000", body);
    expect(verifyWebhookSignature("secret", "1710000000", body, sig)).toBe(true);
    expect(verifyWebhookSignature("other", "1710000000", body, sig)).toBe(false);
  });

  it("delivers with signature headers and retries on 500", async () => {
    let hits = 0;
    const seen: string[] = [];
    const server = createServer((req, res) => {
      hits += 1;
      seen.push(req.headers["x-blakid-signature"] as string);
      if (hits === 1) {
        res.statusCode = 500;
        res.end("no");
        return;
      }
      res.statusCode = 200;
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    const endpoint: WebhookEndpoint = {
      id: "wh-1",
      organisationId: "org-a",
      url: `http://127.0.0.1:${address.port}/hook`,
      secret: "s3cret",
      events: ["user.suspended"],
      createdAt: "2026-09-22T00:00:00Z",
    };
    const delivery: WebhookDelivery = {
      id: "del-1",
      webhookId: "wh-1",
      eventId: "evt-1",
      event: "user.suspended",
      status: "pending",
      attempts: 0,
      lastError: null,
      payload: JSON.stringify({ event: "user.suspended" }),
      createdAt: "2026-09-22T00:00:00Z",
    };
    try {
      const first = await deliverOnce(endpoint, delivery, "1710000000");
      expect(first.status).toBe("pending");
      expect(first.attempts).toBe(1);
      const second = await deliverOnce(endpoint, first, "1710000000");
      expect(second.status).toBe("delivered");
      expect(seen[0]).toBe(signWebhookBody("s3cret", "1710000000", delivery.payload));
    } finally {
      server.close();
    }
  });
});
