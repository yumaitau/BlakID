import { Shell } from "../../../components/shell.tsx";

export default function PortalSecurity() {
  return (
    <Shell title="Security" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/security", label: "Security" }]}>
      <p className="text-sm text-mute max-w-xl leading-relaxed">
        Authentication methods live in your organisation&apos;s authentik environment. Prefer a passkey. Passwords
        remain available only when your organisation requires them.
      </p>
    </Shell>
  );
}
