"use client";

import { useState } from "react";

export function PeopleActions({
  organisationId,
  userId,
  state,
  compact,
}: {
  organisationId: string;
  userId?: string;
  state?: string;
  compact?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    await fetch(`/api/v1/users?organisationId=${organisationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, organisationId, password: "temporary-passphrase-change" }),
    });
    window.location.reload();
  }

  async function act(path: string) {
    await fetch(`/api/v1/users/${userId}/${path}?organisationId=${organisationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisationId }),
    });
    window.location.reload();
  }

  if (compact && userId) {
    return (
      <div className="flex gap-2 justify-end">
        {state === "ACTIVE" ? (
          <button onClick={() => act("suspend")} className="text-xs text-warn">
            Suspend
          </button>
        ) : null}
        {state === "SUSPENDED" ? (
          <button onClick={() => act("restore")} className="text-xs text-ok">
            Restore
          </button>
        ) : null}
        {state !== "ARCHIVED" && state !== "DELETED" ? (
          <button onClick={() => act("terminate")} className="text-xs text-danger">
            Terminate
          </button>
        ) : null}
        <button onClick={() => act("sessions/revoke")} className="text-xs text-mute">
          Revoke sessions
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={invite} className="flex gap-3">
      <input
        className="rounded-xl bg-raised px-3 py-2 text-sm"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="rounded-xl bg-raised px-3 py-2 text-sm"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="rounded-full bg-primary px-4 py-2 text-sm">Invite</button>
    </form>
  );
}
