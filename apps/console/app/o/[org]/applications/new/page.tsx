"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

export default function NewApplicationPage() {
  const params = useParams<{ org: string }>();
  const [created, setCreated] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        slug: form.get("slug"),
        redirectUris: [form.get("redirectUri")],
        logoutUri: form.get("logoutUri") || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Could not create application");
      return;
    }
    setCreated(data);
  }

  if (created) {
    return (
      <div className="rounded-2xl bg-surface border border-white/5 p-6 max-w-2xl space-y-3 text-sm">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Application ready</h2>
        <Row label="Client ID" value={created.clientId} />
        <Row label="Client Secret" value={created.clientSecret} />
        <Row label="Issuer URL" value={created.issuerUrl} />
        <Row label="Discovery URL" value={created.discoveryUrl} />
        <Row label="Redirect URI" value={(created.redirectUris as unknown as string[])?.[0] ?? ""} />
        <Row label="Logout URI" value={created.logoutUri} />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-2xl bg-surface border border-white/5 p-6">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Add application</h2>
      <p className="text-mute text-sm">How does the application authenticate? OpenID Connect for this wizard.</p>
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Protocol</label>
      <div className="space-y-1 text-sm">
        <p>● OpenID Connect</p>
        <p className="text-mute">○ SAML · LDAP (legacy) · Proxy · Catalogue</p>
      </div>
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Application name</label>
      <input name="name" defaultValue="RangerOS" className="w-full rounded-xl bg-raised px-3 py-2" />
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Slug</label>
      <input name="slug" defaultValue="rangeros" className="w-full rounded-xl bg-raised px-3 py-2" />
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Redirect URL</label>
      <input
        name="redirectUri"
        defaultValue="https://app.rangeros.com.au/auth/callback"
        className="w-full rounded-xl bg-raised px-3 py-2"
      />
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Logout URL</label>
      <input
        name="logoutUri"
        defaultValue="https://app.rangeros.com.au/auth/logout"
        className="w-full rounded-xl bg-raised px-3 py-2"
      />
      {error ? <p className="text-danger text-sm">{error}</p> : null}
      <button className="rounded-full bg-primary px-6 py-3 text-sm">Create</button>
      <p className="text-xs text-mute">Organisation {params.org}</p>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-mute text-xs uppercase tracking-[0.16em]">{label}</p>
      <p className="font-mono text-sand break-all mt-1">{value}</p>
    </div>
  );
}
