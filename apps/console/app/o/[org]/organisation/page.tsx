import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";
import { Panel } from "../../../../components/shell.tsx";

export default async function OrganisationSettings({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal) return null;
  const org = await getBlakID().store.getOrganisationBySlug(slug);
  if (!org) return null;
  const sov = await getBlakID().sovereignty(principal, org.id);
  return (
    <div className="grid grid-cols-2 gap-6">
      <Panel title="Your BlakID environment">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-mute">Region</dt>
            <dd>{sov.region}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Deployment</dt>
            <dd>{sov.deployment}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Database</dt>
            <dd>{sov.database}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Encryption</dt>
            <dd>{sov.encryption}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Backups</dt>
            <dd>{sov.backups}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mute">Hostname</dt>
            <dd>{sov.hostname}</dd>
          </div>
        </dl>
      </Panel>
      <Panel title="Branding">
        <p className="text-sm text-mute">
          Dark-mode first. Warm charcoal, restrained orange, no fake cultural motifs, no padlock-heavy chrome.
        </p>
      </Panel>
    </div>
  );
}
