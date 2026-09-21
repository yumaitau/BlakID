import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";

export default async function EventsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return null;
  const org = await getBlakID().store.getOrganisationBySlug(slug);
  if (!org) return null;
  const events = await getBlakID().listEvents(principal, org.id);
  return (
    <div className="rounded-2xl border border-white/5 bg-surface overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-mute text-left">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Target</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.event_id} className="border-t border-white/5">
              <td className="px-4 py-2 font-mono">{event.timestamp}</td>
              <td>{event.action}</td>
              <td>{event.actor_id}</td>
              <td>
                {event.target_type}:{event.target_id}
              </td>
              <td>{event.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
