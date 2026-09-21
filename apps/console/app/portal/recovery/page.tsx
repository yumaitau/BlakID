import { Shell } from "../../../components/shell.tsx";

export default function RecoveryPage() {
  return (
    <Shell title="Recovery" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/recovery", label: "Recovery" }]}>
      <p className="text-sm text-mute max-w-xl">
        Recovery codes and account recovery flows are issued by authentik. BlakID never stores recovery secrets in the
        control plane.
      </p>
    </Shell>
  );
}
