import Link from "next/link";
import { Mark } from "../components/mark.tsx";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="font-[family-name:var(--font-display)] text-xl">BlakID</span>
        </div>
        <Link href="/sign-in" className="rounded-full bg-primary px-5 py-2 text-sm">
          Sign in
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-20">
        <p className="text-sand text-sm uppercase tracking-[0.22em]">Yuma IT</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-[1.1] max-w-3xl">
          Community-controlled identity.
          <span className="text-sand"> Australian-hosted infrastructure.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-mute">
          BlakID is a sovereign identity provider for Indigenous organisations, ranger groups, health services,
          schools and trusted community institutions. authentik powers the protocols. Your organisation governs
          the people.
        </p>
        <div className="mt-10 flex gap-4">
          <Link href="/sign-in" className="rounded-full bg-primary px-6 py-3 text-sm">
            Open control plane
          </Link>
          <Link href="/sign-in" className="rounded-full border border-white/10 px-6 py-3 text-sm text-sand">
            Organisation sign-in
          </Link>
        </div>
        <dl className="mt-20 grid grid-cols-3 gap-6 text-sm">
          <div className="rounded-2xl bg-surface p-6 border border-white/5">
            <dt className="text-mute">Hosting default</dt>
            <dd className="mt-2 text-lg">Australia — Sydney</dd>
          </div>
          <div className="rounded-2xl bg-surface p-6 border border-white/5">
            <dt className="text-mute">Identity engine</dt>
            <dd className="mt-2 text-lg">Upstream authentik</dd>
          </div>
          <div className="rounded-2xl bg-surface p-6 border border-white/5">
            <dt className="text-mute">Tenant model</dt>
            <dd className="mt-2 text-lg">Dedicated stack per organisation</dd>
          </div>
        </dl>
        <p className="mt-16 max-w-2xl text-mute text-sm">
          Possessing a BlakID never proves Aboriginal or Torres Strait Islander identity. Membership, affiliation
          and cultural authority stay with the organisations that issue them.
        </p>
      </main>
    </div>
  );
}
