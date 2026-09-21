import { Shell } from "../../../components/shell.tsx";

export default function ConnectedPage() {
  return (
    <Shell
      title="Connected accounts"
      nav={[{ href: "/portal", label: "Home" }, { href: "/portal/connected", label: "Connected accounts" }]}
    >
      <p className="text-sm text-mute max-w-xl">
        External IdPs (Entra, Google, other OIDC/SAML) appear here when your organisation enables inbound federation.
      </p>
    </Shell>
  );
}
