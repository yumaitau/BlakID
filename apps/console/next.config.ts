import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["jose"],
  transpilePackages: [
    "@blakid/api-client",
    "@blakid/audit",
    "@blakid/authentik",
    "@blakid/authz",
    "@blakid/config",
    "@blakid/control-plane",
    "@blakid/federation",
    "@blakid/identity",
    "@blakid/integrations",
    "@blakid/mcp",
    "@blakid/provisioning",
    "@blakid/scim",
    "@blakid/support-access",
    "@blakid/ui",
    "@blakid/webhooks",
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
