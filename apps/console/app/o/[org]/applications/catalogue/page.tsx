import { CATALOGUE } from "@blakid/integrations";

export default function CataloguePage() {
  return (
    <div className="grid gap-3">
      {CATALOGUE.map((item) => (
        <article key={item.id} className="rounded-2xl bg-surface border border-white/5 p-5">
          <div className="flex justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-lg">{item.name}</h3>
            <span className="text-xs text-mute">Milestone {item.milestone}</span>
          </div>
          <p className="text-sm text-mute mt-2">{item.notes}</p>
          <p className="text-xs mt-3 text-sand">
            Auth: {item.authentication.join(", ")} · Provisioning: {item.provisioning.join(", ") || "none"}
          </p>
        </article>
      ))}
    </div>
  );
}
