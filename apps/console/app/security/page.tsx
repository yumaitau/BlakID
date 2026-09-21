export default function SecurityDisclosurePage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-16 text-sm leading-relaxed">
      <p className="text-sand text-xs uppercase tracking-[0.22em]">Yuma IT</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl">BlakID security</h1>
      <div className="mt-8 space-y-4 text-mute">
        <p>
          BlakID is identity infrastructure operated by Yuma IT. authentik performs authentication cryptography.
          Default production region is Australia — Sydney (AWS ap-southeast-2). Each organisation gets a dedicated
          authentik and PostgreSQL deployment.
        </p>
        <p>Subprocessors for the managed cloud: Amazon Web Services in ap-southeast-2, and the pinned authentik image.</p>
        <p>
          A BlakID does not prove Aboriginal or Torres Strait Islander identity. Membership and authority are
          organisation attributes with provenance. There is no global trust mesh.
        </p>
        <p>
          BlakID does not claim certification against the ISM, Essential Eight, ISO 27001, or SOC 2. Controls exist
          so an organisation can export evidence: MFA coverage, administrators, dormant accounts, backup status, and
          support sessions. Ask your administrator for <span className="text-sand">GET /api/v1/evidence</span>.
        </p>
        <p>
          Report vulnerabilities to security@yuma.example. Do not include customer identity data in the first message.
        </p>
      </div>
    </main>
  );
}
