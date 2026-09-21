import { cookies } from "next/headers";
import Link from "next/link";
import { getBlakID } from "../../lib/blakid.ts";
import { unsealPrincipal } from "../../lib/session.ts";
import { Shell } from "../../components/shell.tsx";

export default async function PortalHome() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const apps =
    principal?.organisationId && principal
      ? await getBlakID().listApplications(principal, principal.organisationId)
      : [];
  const first = principal?.name.split(" ")[0] ?? "there";
  return (
    <Shell
      title={`Kaya, ${first}`}
      subtitle="Your applications"
      nav={[
        { href: "/portal", label: "Home" },
        { href: "/portal/applications", label: "Applications" },
        { href: "/portal/profile", label: "My profile" },
        { href: "/portal/security", label: "Security" },
        { href: "/portal/passkeys", label: "Passkeys" },
        { href: "/portal/mfa", label: "MFA" },
        { href: "/portal/sessions", label: "Sessions" },
        { href: "/portal/devices", label: "Devices" },
        { href: "/portal/connected", label: "Connected accounts" },
        { href: "/portal/activity", label: "Activity" },
        { href: "/portal/recovery", label: "Recovery" },
        { href: "/portal/privacy", label: "Privacy" },
      ]}
    >
      <div className="grid grid-cols-3 gap-4">
        {apps.map((app) => (
          <a
            key={app.id}
            href={app.redirectUris[0]}
            className="rounded-2xl bg-surface border border-white/5 p-6 hover:border-sand/40"
          >
            <p className="font-[family-name:var(--font-display)] text-xl">{app.name}</p>
            <p className="text-mute text-sm mt-2">OpenID Connect</p>
          </a>
        ))}
        {apps.length === 0 ? (
          <>
            <Tile name="Blak Workspace" />
            <Tile name="RangerOS" />
            <Tile name="Microsoft 365" />
          </>
        ) : null}
      </div>
      <p className="mt-8">
        <Link href="/portal/sessions" className="text-sand text-sm">
          Sign out this session, other sessions, or everywhere
        </Link>
      </p>
    </Shell>
  );
}

function Tile({ name }: { name: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-6">
      <p className="font-[family-name:var(--font-display)] text-xl">{name}</p>
      <p className="text-mute text-sm mt-2">Assigned when your organisation adds it</p>
    </div>
  );
}
