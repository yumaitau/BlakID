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
