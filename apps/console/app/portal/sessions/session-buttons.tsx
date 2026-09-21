"use client";

export function SessionButtons({ userId }: { userId: string }) {
  async function everywhere() {
    await fetch(`/api/v1/users/${userId}/sessions/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/sign-in";
  }
  async function here() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/sign-in";
  }
  return (
    <div className="mt-6 flex gap-3">
      <button onClick={here} className="rounded-full border border-white/10 px-4 py-2 text-sm">
        Sign out this session
      </button>
      <button onClick={everywhere} className="rounded-full bg-primary px-4 py-2 text-sm">
        Sign out everywhere
      </button>
    </div>
  );
}
