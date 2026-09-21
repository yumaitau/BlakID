import Link from "next/link";
import { cookies } from "next/headers";
import { getBlakID } from "../../lib/blakid.ts";
import { unsealPrincipal } from "../../lib/session.ts";
import { Panel, Shell, Stat } from "../../components/shell.tsx";

export default async function OperatorHome() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const app = getBlakID();
  const orgs = principal?.role === "YUMA_PLATFORM_OPERATOR" ? await app.listOrganisations(principal) : [];
  const health = await app.health();

  return (
    <Shell
      title={`Good morning, ${principal?.name ?? "operator"}.`}
      subtitle="Yuma operates infrastructure. Organisations govern their people."
      nav={[
        { href: "/operator", label: "Overview" },
        { href: "/operator/organisations", label: "Organisations" },
        { href: "/operator/organisations/new", label: "Provision" },
      ]}
    >
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Organisations" value={String(orgs.length)} />
        <Stat label="Dedicated stacks" value={String(orgs.length)} />
        <Stat label="Region" value="Sydney" />
        <Stat label="Engine" value="authentik" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-6">
        <Panel title="Environments">
          <ul className="space-y-3 text-sm">
            {orgs.length === 0 ? <li className="text-mute">No organisations yet.</li> : null}
            {orgs.map((org) => (
              <li key={org.id} className="flex justify-between">
                <Link href={`/operator/organisations/${org.id}`} className="text-sand">
                  {org.name}
                </Link>
                <span className="text-mute">{org.hostname}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Platform health">
          <ul className="space-y-3 text-sm">
            {health.tenants.length === 0 ? <li className="text-ok">Control plane ready. No tenant stacks yet.</li> : null}
            {health.tenants.map((t) => (
              <li key={t.organisationId} className="flex justify-between">
                <span>{t.slug}</span>
                <span className={t.ready ? "text-ok" : "text-danger"}>{t.ready ? "ready" : "down"}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Shell>
  );
}
