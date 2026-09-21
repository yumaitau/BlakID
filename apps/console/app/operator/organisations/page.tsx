import Link from "next/link";
import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function OrganisationsPage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const orgs = principal ? await getBlakID().listOrganisations(principal) : [];
  return (
    <Shell
      title="Organisations"
      nav={[
        { href: "/operator", label: "Overview" },
        { href: "/operator/organisations", label: "Organisations" },
        { href: "/operator/organisations/new", label: "Provision" },
      ]}
    >
      <div className="rounded-2xl border border-white/5 bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-mute text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th>Hostname</th>
              <th>Region</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr key={org.id} className="border-t border-white/5">
                <td className="px-4 py-3">
                  <Link href={`/operator/organisations/${org.id}`}>{org.name}</Link>
                </td>
                <td className="text-mute">{org.customDomain ?? org.hostname}</td>
                <td>{org.regionLabel}</td>
                <td>{org.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
