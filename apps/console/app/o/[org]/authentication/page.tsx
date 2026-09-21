export default function AuthenticationPage() {
  return (
    <div className="rounded-2xl bg-surface border border-white/5 p-6 max-w-2xl space-y-4 text-sm leading-relaxed">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Login policies</h2>
      <p>BlakID is passwordless-first. authentik enforces the methods; this console sets the intent.</p>
      <ol className="list-decimal pl-5 space-y-2 text-mute">
        <li>Passkeys / WebAuthn</li>
        <li>Hardware security keys</li>
        <li>Authenticator applications</li>
        <li>TOTP</li>
        <li>Recovery mechanisms</li>
        <li>Passwords only where required</li>
      </ol>
      <p>
        Normal applications: passkey or password + MFA. Sensitive applications: passkey required. Privileged
        administration: phishing-resistant authentication required.
      </p>
    </div>
  );
}
