"use client";

import { useState } from "react";

export function RequestSupport({ organisationId }: { organisationId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/support-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        reason: form.get("reason"),
        scopes: String(form.get("scopes") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        breakGlass: form.get("breakGlass") === "on",
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? `Requested ${data.id}` : data.error);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <textarea name="reason" required minLength={8} placeholder="Why this organisation needs Yuma help" className="w-full rounded-xl bg-raised px-3 py-2" />
      <input
        name="scopes"
        defaultValue="identity.users.read,audit.read"
        className="w-full rounded-xl bg-raised px-3 py-2"
      />
      <label className="flex items-center gap-2 text-mute">
        <input type="checkbox" name="breakGlass" /> Break-glass
      </label>
      <button className="rounded-full bg-primary px-4 py-2">Request support access</button>
      {message ? <p className="text-sand">{message}</p> : null}
    </form>
  );
}
