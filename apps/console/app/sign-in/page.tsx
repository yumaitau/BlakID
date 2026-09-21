"use client";

import { useState } from "react";
import { Mark } from "../../components/mark.tsx";

export default function SignInPage() {
  const [email, setEmail] = useState("josh@yuma.example");
  const [password, setPassword] = useState("change-me-operator");
  const [organisationSlug, setOrganisationSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        organisationSlug: organisationSlug || undefined,
      }),
    });
    const data = (await response.json()) as { error?: string; redirect?: string };
    if (!response.ok) {
      setError(data.error ?? "Sign-in failed");
      return;
    }
    window.location.href = data.redirect ?? "/operator";
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-3xl bg-surface border border-white/5 p-8">
        <Mark className="h-10 w-10" />
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-2xl">Sign in to BlakID</h1>
        <p className="mt-2 text-sm text-mute">
          Operators leave organisation blank. Organisation administrators enter their slug.
        </p>
        <label className="mt-6 block text-xs uppercase tracking-[0.16em] text-mute">
          Email
          <input
            className="mt-2 w-full rounded-xl bg-raised px-3 py-2 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-xs uppercase tracking-[0.16em] text-mute">
          Password
          <input
            type="password"
            className="mt-2 w-full rounded-xl bg-raised px-3 py-2 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-xs uppercase tracking-[0.16em] text-mute">
          Organisation slug
          <input
            className="mt-2 w-full rounded-xl bg-raised px-3 py-2 outline-none"
            placeholder="community-a"
            value={organisationSlug}
            onChange={(e) => setOrganisationSlug(e.target.value)}
          />
        </label>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        <button className="mt-6 w-full rounded-full bg-primary py-3 text-sm">Continue</button>
      </form>
    </div>
  );
}
