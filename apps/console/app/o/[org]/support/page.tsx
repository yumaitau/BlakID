"use client";

import { useEffect, useState } from "react";

type SupportRow = {
  id: string;
  reason: string;
  status: string;
  requesterEmail: string;
  scopes: string[];
  expiresAt: string | null;
  breakGlass: boolean;
};

export default function SupportPage() {
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/v1/support-access");
    const data = await response.json();
    if (Array.isArray(data)) setRows(data);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function act(id: string, path: string) {
    const response = await fetch(`/api/v1/support-access/${id}/${path}`, { method: "POST" });
    const data = await response.json();
    setMessage(response.ok ? `${path} ${data.status ?? "ok"}` : data.error);
    void reload();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-mute text-sm">
        Yuma never has standing super-admin rights over your people. Approve a scoped, expiring session instead.
      </p>
      <ul className="space-y-3">
        {rows.length === 0 ? <li className="text-mute text-sm">No support requests.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface border border-white/5 p-4 space-y-2">
            <p className="text-sm">{row.reason}</p>
            <p className="text-xs text-mute">
              {row.requesterEmail} · {row.status}
              {row.breakGlass ? " · break-glass" : ""} · {row.scopes.join(", ")}
              {row.expiresAt ? ` · expires ${row.expiresAt}` : ""}
            </p>
            <div className="flex gap-2">
              {row.status === "requested" ? (
                <>
                  <button onClick={() => act(row.id, "approve")} className="rounded-full bg-ok px-3 py-1 text-xs text-black">
                    Approve
                  </button>
                  <button onClick={() => act(row.id, "deny")} className="rounded-full bg-danger px-3 py-1 text-xs">
                    Deny
                  </button>
                </>
              ) : null}
              {row.status === "approved" || row.status === "active" ? (
                <button onClick={() => act(row.id, "end")} className="rounded-full bg-raised px-3 py-1 text-xs">
                  End
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {message ? <p className="text-sand text-sm">{message}</p> : null}
    </div>
  );
}
