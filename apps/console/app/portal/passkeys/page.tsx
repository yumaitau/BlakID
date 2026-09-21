import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function PasskeysPage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const enrolment =
    principal?.organisationId
      ? await getBlakID().passkeyEnrolment(principal, principal.organisationId)
      : null;
  return (
    <Shell title="Passkeys" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/passkeys", label: "Passkeys" }]}>
      <p className="text-sm text-mute max-w-xl leading-relaxed">
        Passkeys are enrolled in your organisation&apos;s authentik environment. BlakID does not implement WebAuthn
        cryptography.
      </p>
      {enrolment ? (
        <p className="mt-6">
          <a href={enrolment.url} className="rounded-full bg-primary px-5 py-3 text-sm">
            Register a passkey
          </a>
        </p>
      ) : (
        <p className="mt-6 text-sm text-mute">Sign in to enrol a passkey.</p>
      )}
    </Shell>
  );
}
