import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const AUDIT_ACTIONS = [
  "identity.login.success",
  "identity.login.failed",
  "identity.created",
  "identity.invited",
  "identity.activated",
  "identity.suspended",
  "identity.restored",
  "identity.locked",
  "identity.archived",
  "identity.deleted",
  "group.member.added",
  "group.member.removed",
  "application.created",
  "application.updated",
  "role.assigned",
  "role.revoked",
  "credential.created",
  "credential.revoked",
  "session.revoked",
  "support.access.requested",
  "support.access.approved",
  "support.access.denied",
  "support.access.started",
  "support.access.ended",
  "organisation.provisioned",
  "organisation.updated",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEvent = {
  event_id: string;
  timestamp: string;
  organisation_id: string;
  actor_id: string;
  actor_type: string;
  action: AuditAction | string;
  target_type: string;
  target_id: string;
  source_ip: string | null;
  user_agent: string | null;
  session_id: string | null;
  request_id: string | null;
  result: "success" | "denied" | "failure";
  metadata: Record<string, unknown>;
};

export type NewAuditEvent = Omit<AuditEvent, "event_id" | "timestamp"> & {
  event_id?: string;
  timestamp?: string;
};

export interface AuditStore {
  append(event: AuditEvent): Promise<AuditEvent>;
  list(organisationId: string): Promise<AuditEvent[]>;
  get(eventId: string): Promise<AuditEvent | null>;
}

export class ImmutableAuditLog {
  constructor(
    private readonly store: AuditStore,
    private readonly ids: () => string,
    private readonly now: () => Date,
  ) {}

  async record(input: NewAuditEvent): Promise<AuditEvent> {
    const event: AuditEvent = {
      event_id: input.event_id ?? this.ids(),
      timestamp: input.timestamp ?? this.now().toISOString(),
      organisation_id: input.organisation_id,
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id,
      source_ip: input.source_ip,
      user_agent: input.user_agent,
      session_id: input.session_id,
      request_id: input.request_id,
      result: input.result,
      metadata: { ...input.metadata },
    };
    return this.store.append(event);
  }
}

export function toSyslog(events: AuditEvent[], host = "blakid"): string {
  return events
    .map((event) => {
      const ts = event.timestamp.replace(/\.\d+Z$/, "Z");
      const msg = `${event.action} ${event.target_type}=${event.target_id} result=${event.result}`;
      return `<134>1 ${ts} ${host} blakid - ${event.event_id} [blakid org="${event.organisation_id}" actor="${event.actor_id}"] ${msg}`;
    })
    .join("\n");
}

export function toCsv(events: AuditEvent[]): string {
  const header = [
    "event_id",
    "timestamp",
    "organisation_id",
    "actor_id",
    "actor_type",
    "action",
    "target_type",
    "target_id",
    "source_ip",
    "user_agent",
    "session_id",
    "request_id",
    "result",
    "metadata",
  ];
  const rows = events.map((e) =>
    [
      e.event_id,
      e.timestamp,
      e.organisation_id,
      e.actor_id,
      e.actor_type,
      e.action,
      e.target_type,
      e.target_id,
      e.source_ip ?? "",
      e.user_agent ?? "",
      e.session_id ?? "",
      e.request_id ?? "",
      e.result,
      JSON.stringify(e.metadata),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Write-once audit copy. A second write of the same event id is rejected. */
export class AppendOnlyAuditSink {
  readonly records: AuditEvent[] = [];
  private readonly seen = new Set<string>();

  async append(event: AuditEvent): Promise<void> {
    if (this.seen.has(event.event_id)) {
      throw new Error("Audit sink refuses rewrite");
    }
    this.seen.add(event.event_id);
    this.records.push(Object.freeze({ ...event }));
  }
}

export class FileAuditSink extends AppendOnlyAuditSink {
  constructor(private readonly dir: string) {
    super();
    mkdirSync(dir, { recursive: true });
  }

  override async append(event: AuditEvent): Promise<void> {
    await super.append(event);
    appendFileSync(join(this.dir, "audit.jsonl"), `${JSON.stringify(event)}\n`, { flag: "a" });
  }
}

export class MemoryAuditStore implements AuditStore {
  readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<AuditEvent> {
    if (this.events.some((e) => e.event_id === event.event_id)) {
      throw new Error("Audit events are immutable; duplicate event_id");
    }
    this.events.push(Object.freeze({ ...event, metadata: Object.freeze({ ...event.metadata }) }));
    return event;
  }

  async list(organisationId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.organisation_id === organisationId);
  }

  async get(eventId: string): Promise<AuditEvent | null> {
    return this.events.find((e) => e.event_id === eventId) ?? null;
  }

  async update(): Promise<never> {
    throw new Error("Audit events are immutable");
  }

  async remove(): Promise<never> {
    throw new Error("Audit events are immutable");
  }
}
