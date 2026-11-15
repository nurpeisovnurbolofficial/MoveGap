BEGIN;
CREATE SCHEMA IF NOT EXISTS movegap_cloud;
REVOKE ALL ON SCHEMA movegap_cloud FROM PUBLIC;

CREATE TABLE IF NOT EXISTS movegap_cloud.plans (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  document jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  saved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_expiry ON movegap_cloud.plans(expires_at);

-- Non-reversible hashes only; prevents accidental key reuse after deletion/rotation.
CREATE TABLE IF NOT EXISTS movegap_cloud.used_keys (
  key_hash text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS movegap_cloud.receipts (
  key_hash text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','update','remove','rotate-key')),
  scope text NOT NULL,
  request_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  fingerprint text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(key_hash, operation, scope, request_id)
);
CREATE INDEX IF NOT EXISTS receipts_plan ON movegap_cloud.receipts(plan_id);
CREATE INDEX IF NOT EXISTS receipts_expiry ON movegap_cloud.receipts(expires_at);

CREATE TABLE IF NOT EXISTS movegap_cloud.rate_limits (
  bucket_key text NOT NULL,
  bucket bigint NOT NULL,
  hits integer NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(bucket_key, bucket)
);
REVOKE ALL ON ALL TABLES IN SCHEMA movegap_cloud FROM PUBLIC;
COMMIT;
