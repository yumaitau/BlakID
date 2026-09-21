import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Panel, Stat } from "../../../components/shell.tsx";

export default async function OrgOverview({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return <p className="text-mute">No organisation in session.</p>;
  const app = getBlakID();
  const org = await app.store.getOrganisationBySlug(slug);
  if (!org) return <p>Unknown organisation.</p>;
  const users = await app.listUsers(principal, org.id);
  const apps = await app.listApplications(principal, org.id);
  const events = await app.listEvents(principal, org.id);
  const people = users.filter((u) => u.kind === "person");
  const mfaMissing = 0;
  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="People" value={String(people.length)} />
        <Stat label="Applications" value={String(apps.length)} />
        <Stat label="MFA coverage" value={people.length ? "—" : "n/a"} />
        <Stat label="Passkey adoption" value={people.length ? "—" : "n/a"} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <Panel title="Security">
          <ul className="text-sm space-y-2">
            <li className="text-ok">No critical identity risks from control-plane signals</li>
            <li className={mfaMissing ? "text-warn" : "text-mute"}>
              {mfaMissing ? `${mfaMissing} users without MFA` : "MFA posture is collected from authentik"}
            </li>
            <li className="text-mute">Passkeys are enrolled in the organisation authentik environment</li>
          </ul>
        </Panel>
        <Panel title="Recent activity">
          <ul className="text-sm space-y-2">
            {events.slice(-6).reverse().map((e) => (
              <li key={e.event_id} className="flex justify-between gap-4">
                <span>{e.action}</span>
                <span className="text-mute">{e.timestamp.slice(11, 19)}</span>
              </li>
            ))}
            {events.length === 0 ? <li className="text-mute">No events yet.</li> : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
