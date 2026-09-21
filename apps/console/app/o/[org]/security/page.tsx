import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";
import { Panel, Stat } from "../../../../components/shell.tsx";

export default async function SecurityPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return null;
  const org = await getBlakID().store.getOrganisationBySlug(slug);
  if (!org) return null;
  const users = await getBlakID().listUsers(principal, org.id);
  const dash = getBlakID().dashboard(users);
  const sessions = await getBlakID().listSessions(principal, org.id);
  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Users" value={String(dash.users)} />
        <Stat label="Privileged accounts" value={String(dash.privilegedAccounts)} />
        <Stat label="Suspended" value={String(dash.suspendedUsers)} tone={dash.suspendedUsers ? "warn" : "ok"} />
        <Stat label="Service accounts" value={String(dash.serviceAccounts)} />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <Panel title="Findings">
          <ul className="text-sm space-y-2 text-mute">
            <li>Passkey and MFA coverage is sourced from the organisation authentik deployment.</li>
            <li>Privileged administration requires phishing-resistant authentication in authentik policies.</li>
            <li>{sessions.length} tracked sessions in the identity engine.</li>
          </ul>
        </Panel>
        <Panel title="Sessions">
          <ul className="text-sm space-y-2">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id} className="flex justify-between">
                <span className="font-mono text-xs">{s.id}</span>
                <span className="text-mute">{s.sourceIp}</span>
              </li>
            ))}
            {sessions.length === 0 ? <li className="text-mute">No active sessions.</li> : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
