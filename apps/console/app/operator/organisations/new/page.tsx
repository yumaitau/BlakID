"use client";

import { useState } from "react";
import { Shell } from "../../../../components/shell.tsx";

export default function NewOrganisationPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/organisations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        slug: form.get("slug"),
        customDomain: form.get("customDomain") || undefined,
        hostingModel: form.get("hostingModel"),
        existingIdp: form.get("existingIdp") || null,
        adminEmail: form.get("adminEmail"),
        adminName: form.get("adminName"),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Provisioning failed");
      setBusy(false);
      return;
    }
    window.location.href = `/operator/organisations/${data.organisation.id}`;
  }

  return (
    <Shell
      title="Create identity environment"
      subtitle="Welcome to BlakID. Provision a dedicated authentik stack for the organisation."
      nav={[
        { href: "/operator", label: "Overview" },
        { href: "/operator/organisations", label: "Organisations" },
        { href: "/operator/organisations/new", label: "Provision" },
      ]}
    >
      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-2xl bg-surface border border-white/5 p-6">
        <Field name="name" label="Organisation" placeholder="Example Aboriginal Corporation" />
        <Field name="slug" label="Slug" placeholder="example-ac" />
        <Field name="customDomain" label="Customer domain (optional)" placeholder="id.community.org.au" />
        <label className="block text-xs uppercase tracking-[0.16em] text-mute">Hosting</label>
        <select name="hostingModel" className="w-full rounded-xl bg-raised px-3 py-2" defaultValue="blakid_australian_cloud">
          <option value="blakid_australian_cloud">BlakID Australian Cloud</option>
          <option value="customer_aws">Our AWS account</option>
          <option value="self_hosted">Self-hosted</option>
        </select>
        <label className="block text-xs uppercase tracking-[0.16em] text-mute">Existing identity provider?</label>
        <select name="existingIdp" className="w-full rounded-xl bg-raised px-3 py-2" defaultValue="">
          <option value="">None</option>
          <option value="entra">Microsoft Entra ID</option>
          <option value="google">Google Workspace</option>
          <option value="oidc">Another OIDC</option>
        </select>
        <Field name="adminName" label="Organisation administrator" placeholder="Sarah" />
        <Field name="adminEmail" label="Administrator email" placeholder="sarah@community.org.au" />
        {error ? <p className="text-danger text-sm">{error}</p> : null}
        <button disabled={busy} className="rounded-full bg-primary px-6 py-3 text-sm">
          {busy ? "Provisioning…" : "Create BlakID"}
        </button>
      </form>
    </Shell>
  );
}

function Field({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.16em] text-mute">{label}</span>
      <input name={name} placeholder={placeholder} className="mt-2 w-full rounded-xl bg-raised px-3 py-2" required={name !== "customDomain"} />
    </label>
  );
}
