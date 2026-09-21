import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";
import { PeopleActions } from "./people-actions.tsx";

export default async function PeoplePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return null;
  const app = getBlakID();
  const org = await app.store.getOrganisationBySlug(slug);
  if (!org) return null;
  const users = await app.listUsers(principal, org.id);
  return (
    <div>
      <PeopleActions organisationId={org.id} />
      <div className="mt-6 rounded-2xl border border-white/5 bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-mute text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th>Email</th>
              <th>State</th>
              <th>Kind</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/5">
                <td className="px-4 py-3">{user.name}</td>
                <td className="text-mute">{user.email}</td>
                <td>{user.state}</td>
                <td>{user.kind}</td>
                <td className="pr-4 text-right">
                  <PeopleActions organisationId={org.id} userId={user.id} state={user.state} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
