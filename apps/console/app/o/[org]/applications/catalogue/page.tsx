"use client";

import { CATALOGUE } from "@blakid/integrations";
import { useState } from "react";

export default function CataloguePage() {
  const [message, setMessage] = useState<string | null>(null);

  async function configure(id: string, protocol: "oidc" | "saml") {
    const redirect = window.prompt("Redirect or ACS URL");
    if (!redirect) return;
    const response = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogueId: id,
        protocol,
        name: id,
        slug: id,
        redirectUris: [redirect],
        acsUrl: redirect,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? `${id} configured` : data.error);
  }

  return (
    <div className="grid gap-3">
      {CATALOGUE.map((item) => (
        <article key={item.id} className="rounded-2xl bg-surface border border-white/5 p-5">
          <div className="flex justify-between gap-4">
            <h3 className="font-[family-name:var(--font-display)] text-lg">{item.name}</h3>
            <span className="text-xs text-mute">{item.category}</span>
          </div>
          <p className="text-sm text-mute mt-2">{item.notes}</p>
          <p className="text-xs mt-3 text-sand">
            Auth: {item.authentication.join(", ")} · Provisioning: {item.provisioning.join(", ") || "none"} ·{" "}
            {item.requiredAttributes.join(", ")}
          </p>
          <div className="mt-4 flex gap-2">
            {item.authentication.includes("oidc") ? (
              <button onClick={() => configure(item.id, "oidc")} className="rounded-full bg-primary px-4 py-1.5 text-xs">
                Configure OIDC
              </button>
            ) : null}
            {item.authentication.includes("saml") ? (
              <button onClick={() => configure(item.id, "saml")} className="rounded-full bg-raised px-4 py-1.5 text-xs">
                Configure SAML
              </button>
            ) : null}
            {item.authentication.includes("ldap") ? (
              <span className="text-xs text-mute self-center">LDAP is a legacy integration</span>
            ) : null}
          </div>
        </article>
      ))}
      {message ? <p className="text-sand text-sm">{message}</p> : null}
    </div>
  );
}
