import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { PASSKEY_ENROL_SLUG } from "@blakid/config";
import { requireEnrolmentFlow } from "./passkey-setup.ts";

describe("requireEnrolmentFlow", () => {
  it("returns the authentik flow when the slug exists", async () => {
    const requested: string[] = [];
    const server = createServer((req, res) => {
      requested.push(req.url ?? "");
      if (req.url?.startsWith("/api/v3/flows/instances/")) {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            results: [{ pk: "flow-1", slug: PASSKEY_ENROL_SLUG, name: "BlakID passkey enrolment" }],
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no listen port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      const flow = await requireEnrolmentFlow(baseUrl, "token");
      expect(flow.slug).toBe(PASSKEY_ENROL_SLUG);
      expect(requested.some((url) => url.includes(`slug=${PASSKEY_ENROL_SLUG}`))).toBe(true);
    } finally {
      server.close();
    }
  });

  it("throws when the passkey enrolment flow is missing", async () => {
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ results: [{ pk: "other", slug: "default-authentication-flow" }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no listen port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    try {
      await expect(requireEnrolmentFlow(baseUrl, "token")).rejects.toThrow(/blakid-passkey-enrol is not present/);
    } finally {
      server.close();
    }
  });
});
