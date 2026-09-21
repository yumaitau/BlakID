import { cookies } from "next/headers";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function ProfilePage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  return (
    <Shell title="My profile" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/profile", label: "My profile" }]}>
      <dl className="max-w-lg space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-mute">Name</dt>
          <dd>{principal?.name}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Email</dt>
          <dd>{principal?.email}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Role</dt>
          <dd>{principal?.role}</dd>
        </div>
      </dl>
    </Shell>
  );
}
