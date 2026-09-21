"use client";

import { useState } from "react";

export default function ProvisioningPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    const response = await fetch("/api/v1/scim/token", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error);
      return;
    }
    setToken(data.token);
  }

  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-6 max-w-2xl text-sm leading-relaxed space-y-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Provisioning</h2>
      <p>
        SCIM 2.0 pushes users into SaaS applications and, where supported, accepts inbound sync from Entra ID.
        Upstream removal never silently deletes a BlakID identity. Default lifecycle is active, then suspended, then
        archived, then deleted after retention.
      </p>
      <p className="text-mute text-xs">Inbound endpoint: /api/scim/v2/Users</p>
      <button onClick={issue} className="rounded-full bg-primary px-5 py-2 text-sm">
        Issue inbound SCIM token
      </button>
      {token ? <p className="font-mono text-sand break-all">{token}</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}
