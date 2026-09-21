import { cookies } from "next/headers";
import { getBlakID } from "../../../lib/blakid.ts";
import { unsealPrincipal } from "../../../lib/session.ts";
import { Shell } from "../../../components/shell.tsx";

export default async function MfaPage() {
  const token = (await cookies()).get("blakid_session")?.value;
  const principal = token ? await unsealPrincipal(token) : null;
  const enrolment =
    principal?.organisationId
      ? await getBlakID().passkeyEnrolment(principal, principal.organisationId)
      : null;
  return (
    <Shell title="MFA" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/mfa", label: "MFA" }]}>
      <p className="text-sm text-mute max-w-xl leading-relaxed">
        Authenticator apps (TOTP) are enrolled through authentik. Prefer a passkey when your organisation allows it.
      </p>
      {enrolment ? (
        <p className="mt-6">
          <a href={enrolment.totpUrl} className="rounded-full bg-primary px-5 py-3 text-sm">
            Register an authenticator app
          </a>
        </p>
      ) : null}
    </Shell>
  );
}
