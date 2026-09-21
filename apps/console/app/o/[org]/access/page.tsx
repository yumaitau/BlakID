"use client";

import { useEffect, useState } from "react";

type RequestRow = {
  id: string;
  justification: string;
  status: string;
  requestedRole: string;
  applicationId: string;
};

export default function AccessPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);

  async function reload() {
    const [r, o] = await Promise.all([
      fetch("/api/v1/access-requests").then((res) => res.json()),
      fetch("/api/v1/roles").then((res) => res.json()),
    ]);
    if (Array.isArray(r)) setRequests(r);
    if (Array.isArray(o)) setRoles(o);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function decide(id: string, decision: "approved" | "denied") {
    await fetch(`/api/v1/access-requests/${id}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    void reload();
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await fetch("/api/v1/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: form.get("applicationId"),
        requestedRole: form.get("requestedRole"),
        justification: form.get("justification"),
        expiresAt: form.get("expiresAt") || null,
      }),
    });
    void reload();
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="rounded-2xl bg-surface border border-white/5 p-6">
        <h2 className="text-sand text-sm uppercase tracking-[0.16em]">Roles</h2>
        <ul className="mt-4 text-sm space-y-2">
          {roles.map((role) => (
            <li key={role.id}>{role.name}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl bg-surface border border-white/5 p-6">
        <h2 className="text-sand text-sm uppercase tracking-[0.16em]">Access requests</h2>
        <form onSubmit={create} className="mt-4 space-y-2">
          <input name="applicationId" placeholder="Application id" className="w-full rounded-xl bg-raised px-3 py-2" required />
          <input name="requestedRole" placeholder="Requested role" className="w-full rounded-xl bg-raised px-3 py-2" required />
          <input name="justification" placeholder="Reason" className="w-full rounded-xl bg-raised px-3 py-2" required />
          <input name="expiresAt" type="datetime-local" className="w-full rounded-xl bg-raised px-3 py-2" />
          <button className="rounded-full bg-primary px-4 py-2 text-xs">Request temporary access</button>
        </form>
        <ul className="mt-4 text-sm space-y-3">
          {requests.length === 0 ? <li className="text-mute">None pending.</li> : null}
          {requests.map((r) => (
            <li key={r.id} className="space-y-1">
              <p>
                {r.justification} — {r.requestedRole} ({r.status})
              </p>
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <button onClick={() => decide(r.id, "approved")} className="text-xs rounded-full bg-ok px-3 py-1 text-black">
                    Approve
                  </button>
                  <button onClick={() => decide(r.id, "denied")} className="text-xs rounded-full bg-danger px-3 py-1">
                    Deny
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
