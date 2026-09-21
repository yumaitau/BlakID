import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function ActivityPage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const events =
    principal?.organisationId ? await getBlakID().listEvents(principal, principal.organisationId) : [];
  const mine = events.filter((e) => e.actor_id === principal?.actorId);
  return (
    <Shell title="Activity" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/activity", label: "Activity" }]}>
      <ul className="text-sm space-y-2">
        {mine.map((e) => (
          <li key={e.event_id}>
            {e.action} · {e.timestamp}
          </li>
        ))}
        {mine.length === 0 ? <li className="text-mute">No personal events visible.</li> : null}
      </ul>
    </Shell>
  );
}
