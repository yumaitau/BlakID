"use client";

import { useEffect, useState } from "react";

type Source = { id: string; name: string; slug: string; type: string };
type Trust = { id: string; peerName: string; acceptAttributes: string[]; rejectAttributes: string[] };

export default function FederationPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [trusts, setTrusts] = useState<Trust[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const [s, t] = await Promise.all([
      fetch("/api/v1/federation").then((r) => r.json()),
      fetch("/api/v1/federation/trusts").then((r) => r.json()),
    ]);
    if (Array.isArray(s)) setSources(s);
    if (Array.isArray(t)) setTrusts(t);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/federation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        slug: form.get("slug"),
        type: form.get("type"),
        clientId: form.get("clientId") || undefined,
        clientSecret: form.get("clientSecret") || undefined,
        wellKnownUrl: form.get("wellKnownUrl") || undefined,
        ssoUrl: form.get("ssoUrl") || undefined,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Source ${data.slug} ready` : data.error);
    if (response.ok) void reload();
  }

  async function addTrust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/federation/trusts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        peerOrganisationId: form.get("peerOrganisationId"),
        peerName: form.get("peerName"),
        acceptAttributes: String(form.get("accept") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        rejectAttributes: String(form.get("reject") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Pairwise trust saved" : data.error);
    if (response.ok) void reload();
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <p className="text-mute text-sm">
        Keep Microsoft or Google credentials and place BlakID in front of community applications, or make BlakID
        primary. Trust between BlakID organisations is pairwise and explicit.
      </p>
      <form onSubmit={addSource} className="rounded-2xl bg-surface border border-white/5 p-6 space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Inbound identity provider</h2>
        <select name="type" className="w-full rounded-xl bg-raised px-3 py-2">
          <option value="entra">Microsoft Entra ID</option>
          <option value="google">Google Workspace</option>
          <option value="oidc">Other OIDC</option>
          <option value="saml">SAML</option>
        </select>
        <input name="name" placeholder="Name" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="slug" placeholder="slug" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="clientId" placeholder="Client ID" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="clientSecret" placeholder="Client secret" type="password" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="wellKnownUrl" placeholder="OIDC discovery URL" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="ssoUrl" placeholder="SAML SSO URL" className="w-full rounded-xl bg-raised px-3 py-2" />
        <button className="rounded-full bg-primary px-5 py-2 text-sm">Add source</button>
      </form>
      <ul className="text-sm space-y-2">
        {sources.map((s) => (
          <li key={s.id} className="rounded-xl bg-surface border border-white/5 px-4 py-3">
            {s.name} · {s.type}
          </li>
        ))}
      </ul>
      <form onSubmit={addTrust} className="rounded-2xl bg-surface border border-white/5 p-6 space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">BlakID Federation trust</h2>
        <input name="peerName" placeholder="Peer organisation name" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="peerOrganisationId" placeholder="Peer organisation id" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="accept" defaultValue="identity,email,organisation_membership" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="reject" defaultValue="administrator_role,financial_authority,employment_role" className="w-full rounded-xl bg-raised px-3 py-2" />
        <button className="rounded-full bg-primary px-5 py-2 text-sm">Trust this organisation</button>
      </form>
      <ul className="text-sm space-y-2">
        {trusts.map((t) => (
          <li key={t.id} className="rounded-xl bg-surface border border-white/5 px-4 py-3">
            {t.peerName}: accept {t.acceptAttributes.join(", ")}
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const response = await fetch("/api/v1/federation/assertions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audienceOrgId: form.get("audienceOrgId"),
              subject: form.get("subject"),
              name: form.get("subjectName") || undefined,
              attributes: [
                {
                  attribute: "email",
                  value: form.get("subject"),
                  issuer: form.get("issuer") || "this organisation",
                  issued_at: new Date().toISOString(),
                  expires_at: null,
                  assurance: "organisation_verified",
                },
              ],
            }),
          });
          const data = await response.json();
          setMessage(response.ok ? data.token : data.error);
        }}
        className="rounded-2xl bg-surface border border-white/5 p-6 space-y-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Issue signed assertion</h2>
        <input name="audienceOrgId" placeholder="Audience organisation id" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="subject" placeholder="Subject email" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="subjectName" placeholder="Name" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="issuer" placeholder="Issuer display name" className="w-full rounded-xl bg-raised px-3 py-2" />
        <button className="rounded-full bg-primary px-5 py-2 text-sm">Sign assertion</button>
      </form>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const response = await fetch("/api/v1/federation/assertions/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: form.get("token") }),
          });
          const data = await response.json();
          setMessage(JSON.stringify(data, null, 2));
        }}
        className="rounded-2xl bg-surface border border-white/5 p-6 space-y-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Verify peer assertion</h2>
        <textarea name="token" rows={4} className="w-full rounded-xl bg-raised px-3 py-2 font-mono text-xs" required />
        <button className="rounded-full bg-primary px-5 py-2 text-sm">Verify</button>
      </form>
      {message ? <pre className="text-sand text-xs whitespace-pre-wrap break-all">{message}</pre> : null}
    </div>
  );
}
