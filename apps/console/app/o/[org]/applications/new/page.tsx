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
    const protocol = String(form.get("protocol") || "oidc");
    const response = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol,
        name: form.get("name"),
        slug: form.get("slug"),
        redirectUris: [form.get("redirectUri")],
        logoutUri: form.get("logoutUri") || undefined,
        acsUrl: form.get("acsUrl") || undefined,
        metadataXml: form.get("metadataXml") || undefined,
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
        {created.clientId ? <Row label="Client ID" value={created.clientId} /> : null}
        {created.clientSecret ? <Row label="Client Secret" value={created.clientSecret} /> : null}
        {created.issuerUrl ? <Row label="Issuer URL" value={created.issuerUrl} /> : null}
        {created.discoveryUrl ? <Row label="Discovery URL" value={created.discoveryUrl} /> : null}
        {created.metadataUrl ? <Row label="IdP metadata URL" value={created.metadataUrl} /> : null}
        {created.acsUrl ? <Row label="ACS URL" value={created.acsUrl} /> : null}
        <Row label="Redirect URI" value={(created.redirectUris as unknown as string[])?.[0] ?? ""} />
        {created.logoutUri ? <Row label="Logout URI" value={created.logoutUri} /> : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-2xl bg-surface border border-white/5 p-6">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Add application</h2>
      <p className="text-mute text-sm">How does the application authenticate? OpenID Connect for this wizard.</p>
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">Protocol</label>
      <select name="protocol" className="w-full rounded-xl bg-raised px-3 py-2">
        <option value="oidc">OpenID Connect</option>
        <option value="saml">SAML</option>
        <option value="ldap">LDAP (legacy)</option>
      </select>
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">SAML ACS URL</label>
      <input name="acsUrl" placeholder="https://sp.example/saml/acs" className="w-full rounded-xl bg-raised px-3 py-2" />
      <label className="block text-xs uppercase tracking-[0.16em] text-mute">SP metadata XML</label>
      <textarea name="metadataXml" rows={4} className="w-full rounded-xl bg-raised px-3 py-2 font-mono text-xs" />
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
