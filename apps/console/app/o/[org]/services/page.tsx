"use client";

import { useEffect, useState } from "react";

type Identity = { id: string; name: string; email: string; kind: string; attributes: Record<string, unknown> };

export default function ServicesPage() {
  const [rows, setRows] = useState<Identity[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const data = await fetch("/api/v1/service-accounts").then((r) => r.json());
    if (Array.isArray(data)) setRows(data);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      ownerId: form.get("ownerId"),
      purpose: form.get("purpose"),
      modelProvider: form.get("modelProvider") || "grok",
      permittedApplications: String(form.get("apps") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      allowedActions: String(form.get("actions") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const url = kind === "ai_agent" ? "/api/v1/agents" : "/api/v1/service-accounts";
    const body = kind === "ai_agent" ? payload : { ...payload, kind };
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    setMessage(response.ok ? `Created ${data.agent?.email ?? data.email}` : data.error);
    void reload();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-mute text-sm">
        Service and AI agent identities never inherit a human password. Hermes authenticates with its own client
        credentials.
      </p>
      <form onSubmit={create} className="rounded-2xl bg-surface border border-white/5 p-6 space-y-3">
        <select name="kind" className="w-full rounded-xl bg-raised px-3 py-2">
          <option value="service_account">Service account</option>
          <option value="ai_agent">AI / Hermes agent</option>
          <option value="workload">Workload</option>
        </select>
        <input name="name" placeholder="Name" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="email" type="email" placeholder="agent@org.test" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="ownerId" placeholder="Owner identity id" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="purpose" placeholder="Purpose" className="w-full rounded-xl bg-raised px-3 py-2" required />
        <input name="apps" placeholder="Permitted applications" className="w-full rounded-xl bg-raised px-3 py-2" />
        <input name="actions" defaultValue="blakid_list_users" className="w-full rounded-xl bg-raised px-3 py-2" />
        <button className="rounded-full bg-primary px-5 py-2 text-sm">Create identity</button>
      </form>
      <ul className="text-sm space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-surface border border-white/5 px-4 py-3">
            {row.name} · {row.kind} · {row.email}
          </li>
        ))}
      </ul>
      {message ? <p className="text-sand text-sm">{message}</p> : null}
    </div>
  );
}
