import { Shell } from "../../../components/shell.tsx";

export default function DevicesPage() {
  return (
    <Shell title="Devices" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/devices", label: "Devices" }]}>
      <p className="text-sm text-mute max-w-xl">Trusted devices are listed from authentik WebAuthn credentials and sessions.</p>
    </Shell>
  );
}
