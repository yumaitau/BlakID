import { Shell } from "../../../components/shell.tsx";

export default function PrivacyPage() {
  return (
    <Shell title="Privacy" nav={[{ href: "/portal", label: "Home" }, { href: "/portal/privacy", label: "Privacy" }]}>
      <p className="text-sm text-mute max-w-xl leading-relaxed">
        BlakID collects the minimum identity data required to authenticate you. Cultural and demographic attributes
        are not collected unless your organisation defines a legitimate need. You can ask your organisation
        administrator for an export or deletion after retention.
      </p>
    </Shell>
  );
}
