import { cookies } from "next/headers";
import { getBlakID } from "../../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../../lib/session.ts";

export default async function AccessPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  if (!principal?.organisationId) return null;
  const org = await getBlakID().store.getOrganisationBySlug(slug);
  if (!org) return null;
  const roles = await getBlakID().listRoles(principal, org.id);
  const requests = await getBlakID().listAccessRequests(principal, org.id);
  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="rounded-2xl bg-surface border border-white/5 p-6">
        <h2 className="text-sand text-sm uppercase tracking-[0.16em]">Roles</h2>
        <ul className="mt-4 text-sm space-y-2">
          {roles.map((role) => (
            <li key={role.id}>{role.name}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl bg-surface border border-white/5 p-6">
        <h2 className="text-sand text-sm uppercase tracking-[0.16em]">Access requests</h2>
        <ul className="mt-4 text-sm space-y-2">
          {requests.length === 0 ? <li className="text-mute">None pending.</li> : null}
          {requests.map((r) => (
            <li key={r.id}>
              {r.justification} — {r.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
