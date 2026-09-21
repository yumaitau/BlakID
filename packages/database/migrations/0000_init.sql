CREATE TABLE IF NOT EXISTS organisations (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  hostname text NOT NULL,
  custom_domain text,
  hosting_model text NOT NULL,
  region text NOT NULL,
  region_label text NOT NULL,
  status text NOT NULL,
  existing_idp text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  authentik_url text NOT NULL,
  authentik_version text NOT NULL,
  postgres_name text NOT NULL,
  compose_project text NOT NULL,
  status text NOT NULL,
  last_backup_at timestamptz,
  last_backup_status text,
  last_restore_test_at timestamptz,
  last_restore_test_status text,
  signing_key_created_at timestamptz,
  certificate_expires_at timestamptz,
  http_port text
);

CREATE TABLE IF NOT EXISTS organisation_members (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  authentik_user_id text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  organisation_id text NOT NULL REFERENCES organisations(id),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_access (
  id text PRIMARY KEY,
  organisation_id text NOT NULL,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id text PRIMARY KEY,
  timestamp timestamptz NOT NULL,
  organisation_id text NOT NULL,
  actor_id text NOT NULL,
  actor_type text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  source_ip text,
  user_agent text,
  session_id text,
  request_id text,
  result text NOT NULL,
  metadata jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS access_requests (
  id text PRIMARY KEY,
  organisation_id text NOT NULL,
  requester_id text NOT NULL,
  application_id text NOT NULL,
  requested_role text NOT NULL,
  justification text NOT NULL,
  status text NOT NULL,
  approver_id text,
  decided_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_accounts (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  password_hash text,
  created_at timestamptz NOT NULL
);
