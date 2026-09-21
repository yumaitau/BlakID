export class StepUpRequired extends Error {
  readonly code = "step_up_required" as const;
  constructor() {
    super("Privileged action requires a fresh passkey step-up");
    this.name = "StepUpRequired";
  }
}

const PRIVILEGED = new Set([
  "users.suspend",
  "applications.create",
  "support.approve",
  "federation.issue",
  "agents.create",
]);

export function privilegedAction(input: {
  resource: string;
  id?: string;
  extra?: string;
  method: string;
}): string | null {
  if (input.method !== "POST") return null;
  if (input.resource === "users" && input.extra === "suspend") return "users.suspend";
  if (input.resource === "applications" && !input.id) return "applications.create";
  if (input.resource === "support-access" && input.extra === "approve") return "support.approve";
  if (input.resource === "federation" && input.id === "assertions" && !input.extra) return "federation.issue";
  if (input.resource === "agents" && !input.id) return "agents.create";
  return null;
}

export function stepUpFresh(stepUpUntil: string | null | undefined, now: Date): boolean {
  if (!stepUpUntil) return false;
  return new Date(stepUpUntil).getTime() > now.getTime();
}

export function assertStepUp(action: string | null, stepUpUntil: string | null | undefined, now: Date): void {
  if (!action || !PRIVILEGED.has(action)) return;
  if (!stepUpFresh(stepUpUntil, now)) throw new StepUpRequired();
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now = Date.now()): { ok: boolean; retryAfterMs: number } {
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (recent.length >= this.limit) {
      const retryAfterMs = recent[0]! + this.windowMs - now;
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { ok: true, retryAfterMs: 0 };
  }
}

const g = globalThis as typeof globalThis & { __blakidRate?: RateLimiter };

export function sharedRateLimiter(): RateLimiter {
  if (!g.__blakidRate) g.__blakidRate = new RateLimiter(20, 10 * 60_000);
  return g.__blakidRate;
}
