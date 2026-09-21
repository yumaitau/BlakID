import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";
import { Panel, Shell, Stat } from "../../../../components/shell.tsx";

export default async function OrganisationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal) return null;
  const app = getBlakID();
  const org = await app.getOrganisation(principal, id);
  const sov = await app.sovereignty(principal, id);
  const deployment = await app.store.getDeployment(id);
  return (
    <Shell
      title={org.name}
      subtitle="Yuma can see infrastructure posture. Identity records stay in the organisation directory."
      nav={[
        { href: "/operator", label: "Overview" },
        { href: "/operator/organisations", label: "Organisations" },
        { href: "/operator/organisations/new", label: "Provision" },
      ]}
    >
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Region" value={sov.region} />
        <Stat label="Deployment" value={String(sov.deployment)} />
        <Stat label="Database" value="Dedicated" />
        <Stat label="Backups" value={String(sov.backups)} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <Panel title="Your BlakID environment">
          <dl className="space-y-2 text-sm">
            <Row label="Hostname" value={sov.hostname} />
            <Row label="Authentik" value={deployment?.authentikVersion ?? "pinned"} />
            <Row label="Last backup" value={deployment?.lastBackupAt ?? "pending"} />
            <Row label="Backup status" value={deployment?.lastBackupStatus ?? "unknown"} />
            <Row label="Restore test" value={deployment?.lastRestoreTestStatus ?? "not run"} />
            <Row label="Encryption" value={String(sov.encryption)} />
          </dl>
        </Panel>
        <Panel title="Operator boundary">
          <p className="text-sm text-mute leading-relaxed">
            Platform operators may patch infrastructure, monitor health, run backups and respond to incidents.
            They cannot impersonate users, read credentials, change memberships or grant application access
            unless the organisation approves a time-boxed support session.
          </p>
        </Panel>
      </div>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-mute">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
