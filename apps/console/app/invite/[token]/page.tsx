"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/v1/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Could not accept invitation");
      return;
    }
    window.location.href = "/sign-in";
  }

  return (
    <form onSubmit={onSubmit} className="min-h-screen grid place-items-center">
      <div className="w-full max-w-md rounded-3xl bg-surface border border-white/5 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl">Accept invitation</h1>
        <input
          type="password"
          className="mt-6 w-full rounded-xl bg-raised px-3 py-2"
          placeholder="Choose a password (passkeys come next)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-danger text-sm mt-3">{error}</p> : null}
        <button className="mt-6 w-full rounded-full bg-primary py-3 text-sm">Activate identity</button>
      </div>
    </form>
  );
}
