"use client";

import { useState } from "react";

export default function SupportPage() {
  const [id, setId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function act(path: string) {
    const response = await fetch(`/api/v1/support-access/${id}/${path}`, { method: "POST" });
    const data = await response.json();
    setMessage(JSON.stringify(data, null, 2));
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-mute text-sm">
        Yuma never has standing super-admin rights over your people. Approve a scoped, expiring session instead.
      </p>
      <input
        className="w-full rounded-xl bg-raised px-3 py-2"
        placeholder="Support request id"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <div className="flex gap-3">
        <button onClick={() => act("approve")} className="rounded-full bg-ok px-4 py-2 text-sm text-black">
          Approve
        </button>
        <button onClick={() => act("deny")} className="rounded-full bg-danger px-4 py-2 text-sm">
          Deny
        </button>
      </div>
      {message ? <pre className="text-xs bg-raised p-4 rounded-xl overflow-auto">{message}</pre> : null}
    </div>
  );
}
