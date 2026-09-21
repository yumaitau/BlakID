import Link from "next/link";
import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";

export default async function ApplicationsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return null;
  const org = await getBlakID().store.getOrganisationBySlug(slug);
  if (!org) return null;
  const apps = await getBlakID().listApplications(principal, org.id);
  return (
    <div>
      <Link href={`/o/${slug}/applications/new`} className="rounded-full bg-primary px-4 py-2 text-sm">
        Add application
      </Link>
      <ul className="mt-6 grid gap-4">
        {apps.map((app) => (
          <li key={app.id} className="rounded-2xl bg-surface border border-white/5 p-5">
            <p className="font-[family-name:var(--font-display)] text-lg">{app.name}</p>
            <p className="text-mute text-sm mt-1">OIDC · {app.slug}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div>Client ID</div>
              <div className="font-mono text-sand">{app.clientId}</div>
              <div>Issuer</div>
              <div className="font-mono text-sand break-all">{app.issuerUrl}</div>
              <div>Discovery</div>
              <div className="font-mono text-sand break-all">{app.discoveryUrl}</div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
