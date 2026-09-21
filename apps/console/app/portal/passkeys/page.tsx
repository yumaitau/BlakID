import { Shell } from "../../../components/shell.tsx";

export default function PasskeysPage() {
  return (
    <Shell title="Passkeys" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/passkeys", label: "Passkeys" }]}>
      <p className="text-sm text-mute max-w-xl leading-relaxed">
        Register passkeys through authentik WebAuthn. BlakID does not implement custom authentication cryptography.
      </p>
    </Shell>
  );
}
