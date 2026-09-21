import Link from "next/link";
import { Mark } from "./mark.tsx";

export function Shell({
  title,
  subtitle,
  nav,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-[16rem_1fr]">
      <aside className="border-r border-white/5 bg-surface px-5 py-6 flex flex-col gap-8">
        <Link href="/" className="flex items-center gap-3">
          <Mark className="h-9 w-9" />
          <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">BlakID</span>
        </Link>
        <nav className="flex flex-col gap-1 text-sm text-mute">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 hover:bg-raised hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post" className="mt-auto">
          <button className="text-xs text-mute hover:text-sand">Sign out</button>
        </form>
      </aside>
      <main className="px-10 py-8">
        <header className="mb-8">
          <p className="text-mute text-sm">BlakID</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl mt-1">{title}</h1>
          {subtitle ? <p className="text-mute mt-2 max-w-2xl">{subtitle}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const color =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-5">
      <p className="text-mute text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className={`mt-3 text-3xl font-[family-name:var(--font-display)] ${color}`}>{value}</p>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface border border-white/5 p-6">
      <h2 className="text-sand text-sm uppercase tracking-[0.16em] mb-4">{title}</h2>
      {children}
    </section>
  );
}
