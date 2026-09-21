export default function FederationPage() {
  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-6 max-w-2xl text-sm leading-relaxed space-y-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Federation</h2>
      <p>
        An organisation may keep Microsoft or Google credentials and place BlakID in front of community applications,
        or make BlakID the primary identity provider. Trust between BlakID organisations is always explicit — never
        global.
      </p>
      <ul className="text-mute space-y-1">
        <li>Microsoft Entra ID</li>
        <li>Google Workspace</li>
        <li>Other OIDC</li>
        <li>SAML</li>
        <li>Local identity</li>
      </ul>
      <p className="text-xs text-mute">Inbound connectors ship in Milestone 2. The trust model is in ADR 0010.</p>
    </div>
  );
}
