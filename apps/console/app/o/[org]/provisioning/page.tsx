export default function ProvisioningPage() {
  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-6 max-w-2xl text-sm leading-relaxed space-y-4">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Provisioning</h2>
      <p>
        SCIM 2.0 will push users into SaaS applications and, where supported, accept inbound sync from Entra ID.
        Upstream removal never silently deletes a BlakID identity. Default lifecycle is active → suspended → archived
        → deleted after retention.
      </p>
      <p className="text-mute text-xs">Directory sync and SCIM connectors are Milestone 2. The lifecycle rules are enforced now.</p>
    </div>
  );
}
