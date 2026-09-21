import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const organisations = pgTable(
  "organisations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    hostname: text("hostname").notNull(),
    customDomain: text("custom_domain"),
    hostingModel: text("hosting_model").notNull(),
    region: text("region").notNull(),
    regionLabel: text("region_label").notNull(),
    status: text("status").notNull(),
    existingIdp: text("existing_idp"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("organisations_slug_idx").on(t.slug)],
);

export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    authentikUrl: text("authentik_url").notNull(),
    authentikVersion: text("authentik_version").notNull(),
    postgresName: text("postgres_name").notNull(),
    composeProject: text("compose_project").notNull(),
    status: text("status").notNull(),
    lastBackupAt: timestamp("last_backup_at", { withTimezone: true, mode: "string" }),
    lastBackupStatus: text("last_backup_status"),
    lastRestoreTestAt: timestamp("last_restore_test_at", { withTimezone: true, mode: "string" }),
    lastRestoreTestStatus: text("last_restore_test_status"),
    signingKeyCreatedAt: timestamp("signing_key_created_at", { withTimezone: true, mode: "string" }),
    certificateExpiresAt: timestamp("certificate_expires_at", { withTimezone: true, mode: "string" }),
    httpPort: text("http_port"),
  },
  (t) => [index("deployments_org_idx").on(t.organisationId)],
);

export const organisationMembers = pgTable(
  "organisation_members",
  {
    id: text("id").primaryKey(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    authentikUserId: text("authentik_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [index("org_members_org_idx").on(t.organisationId)],
);

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id")
    .notNull()
    .references(() => organisations.id),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
});

export const supportAccess = pgTable("support_access", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  payload: jsonb("payload").notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    eventId: text("event_id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }).notNull(),
    organisationId: text("organisation_id").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    sessionId: text("session_id"),
    requestId: text("request_id"),
    result: text("result").notNull(),
    metadata: jsonb("metadata").notNull(),
  },
  (t) => [index("audit_org_idx").on(t.organisationId), index("audit_time_idx").on(t.timestamp)],
);

export const accessRequests = pgTable("access_requests", {
  id: text("id").primaryKey(),
  organisationId: text("organisation_id").notNull(),
  requesterId: text("requester_id").notNull(),
  applicationId: text("application_id").notNull(),
  requestedRole: text("requested_role").notNull(),
  justification: text("justification").notNull(),
  status: text("status").notNull(),
  approverId: text("approver_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const operatorAccounts = pgTable("operator_accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const schema = {
  organisations,
  deployments,
  organisationMembers,
  invitations,
  supportAccess,
  auditEvents,
  accessRequests,
  operatorAccounts,
};
