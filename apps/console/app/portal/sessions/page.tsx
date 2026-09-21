import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";
import { SessionButtons } from "./session-buttons.tsx";

export default async function SessionsPage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const sessions =
    principal?.organisationId ? await getBlakID().listSessions(principal, principal.organisationId, principal.actorId) : [];
  return (
    <Shell title="Sessions" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/sessions", label: "Sessions" }]}>
      <ul className="space-y-3 text-sm">
        {sessions.map((s) => (
          <li key={s.id} className="rounded-xl bg-surface border border-white/5 p-4 flex justify-between">
            <span className="font-mono text-xs">{s.id}</span>
            <span className="text-mute">{s.sourceIp ?? "unknown ip"}</span>
          </li>
        ))}
      </ul>
      {principal ? <SessionButtons userId={principal.actorId} /> : null}
    </Shell>
  );
}
