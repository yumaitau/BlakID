import { Shell } from "../../../components/shell.tsx";

export default function MfaPage() {
  return (
    <Shell title="MFA" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/mfa", label: "MFA" }]}>
      <p className="text-sm text-mute max-w-xl">
        Authenticator apps and TOTP are enrolled in authentik. Prefer a passkey when your organisation allows it.
      </p>
    </Shell>
  );
}
