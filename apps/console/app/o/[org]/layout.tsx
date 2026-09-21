import { cookies } from "next/headers";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const base = `/o/${org}`;
  return (
    <Shell
      title={principal?.name ? `Kaya, ${principal.name.split(" ")[0]}` : "Organisation"}
      subtitle="Identities, applications and access for this organisation."
      nav={[
        { href: base, label: "Overview" },
        { href: `${base}/people`, label: "People" },
        { href: `${base}/services`, label: "Service identities" },
        { href: `${base}/applications`, label: "Applications" },
        { href: `${base}/applications/catalogue`, label: "App catalogue" },
        { href: `${base}/access`, label: "Access" },
        { href: `${base}/authentication`, label: "Authentication" },
        { href: `${base}/federation`, label: "Federation" },
        { href: `${base}/provisioning`, label: "Provisioning" },
        { href: `${base}/security`, label: "Security" },
        { href: `${base}/events`, label: "Audit" },
        { href: `${base}/support`, label: "Support access" },
        { href: `${base}/organisation`, label: "Organisation" },
      ]}
    >
      {children}
    </Shell>
  );
}
