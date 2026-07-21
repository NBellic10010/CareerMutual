CREATE TABLE IF NOT EXISTS review_windows (
  id text PRIMARY KEY,
  candidate_id text NOT NULL,
  opportunity_id text NOT NULL,
  reviewer_id text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'RESERVED', 'STAGE_A_ACTIVE', 'CHECKPOINT_PENDING', 'STAGE_B_ACTIVE',
    'EVIDENCE_READY', 'OUTCOME_RECORDED', 'ASK_BACK_PENDING', 'REVEALED',
    'BREACHED', 'REMEDIATING', 'WITHDRAWN', 'PLATFORM_ABORT', 'SETTLING', 'SETTLED'
  )),
  version integer NOT NULL CHECK (version > 0),
  contract_version_id text NOT NULL,
  label_policy_version_id text NOT NULL,
  proof_template_version_id text NOT NULL,
  challenge_catalog_version_id text NOT NULL,
  stage_a_snapshot_id text,
  aggregate_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS proof_sessions (
  id text PRIMARY KEY,
  review_window_id text NOT NULL UNIQUE REFERENCES review_windows(id) ON DELETE CASCADE,
  runtime_mode text NOT NULL CHECK (runtime_mode IN ('LIVE', 'CACHED_AI', 'GOLDEN_REPLAY')),
  replay_id text,
  sandbox_session_ref text NOT NULL,
  replay_session_key text,
  recommendation_request_ref text NOT NULL,
  capability_refs jsonb NOT NULL,
  base_snapshot_version text NOT NULL,
  stage_a_patch_ref text NOT NULL,
  stage_a_artifact_ref text NOT NULL,
  stage_a_snapshot_ref text NOT NULL,
  remaining_time_seconds integer NOT NULL CHECK (remaining_time_seconds > 0),
  selected_challenge_ref text,
  sandbox_branch_ref text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS stage_a_evidence (
  evidence_ref text PRIMARY KEY,
  review_window_id text NOT NULL REFERENCES review_windows(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  evidence_type text NOT NULL CHECK (evidence_type IN ('event', 'artifact', 'diff', 'command', 'verification')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 4000),
  sha256 text NOT NULL CHECK (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (review_window_id, ordinal)
);

CREATE INDEX IF NOT EXISTS stage_a_evidence_window_idx
  ON stage_a_evidence (review_window_id, ordinal);

CREATE TABLE IF NOT EXISTS hiring_intelligence_requests (
  id text PRIMARY KEY,
  operation text NOT NULL CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'recommendChallenges', 'compressEvidence'
  )),
  review_window_id text REFERENCES review_windows(id) ON DELETE CASCADE,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  runtime_mode text NOT NULL CHECK (runtime_mode IN ('LIVE', 'CACHED_AI', 'GOLDEN_REPLAY')),
  replay_id text,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL,
  prompt_hash text NOT NULL CHECK (prompt_hash ~ '^sha256:[a-f0-9]{64}$'),
  input_schema_version text NOT NULL,
  output_schema_version text NOT NULL,
  catalog_ref text,
  catalog_hash text,
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  input_json jsonb NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN (
    'QUEUED', 'RUNNING', 'SUCCEEDED', 'NEEDS_HUMAN', 'RETRYABLE',
    'FAILED_PERMANENT', 'SUPERSEDED', 'CANCELLED'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS hiring_intelligence_requests_ready_idx
  ON hiring_intelligence_requests (status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS ai_model_runs (
  id text PRIMARY KEY,
  request_id text NOT NULL REFERENCES hiring_intelligence_requests(id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt > 0),
  adapter_id text NOT NULL,
  requested_model text,
  resolved_model text,
  prompt_id text NOT NULL,
  prompt_version text NOT NULL,
  prompt_hash text NOT NULL,
  input_schema_version text NOT NULL,
  output_schema_version text NOT NULL,
  client_request_id text,
  provider_response_id text,
  provider_request_id text,
  status text NOT NULL CHECK (status IN (
    'RUNNING', 'SUCCEEDED', 'NEEDS_HUMAN', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'
  )),
  error_code text,
  refusal_present boolean NOT NULL DEFAULT false,
  incomplete_reason text,
  input_bytes integer NOT NULL CHECK (input_bytes >= 0),
  output_bytes integer CHECK (output_bytes >= 0),
  duration_ms integer CHECK (duration_ms >= 0),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE (request_id, attempt),
  UNIQUE (client_request_id)
);

CREATE TABLE IF NOT EXISTS ai_source_refs (
  request_id text NOT NULL REFERENCES hiring_intelligence_requests(id) ON DELETE CASCADE,
  source_ref text NOT NULL,
  source_kind text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY (request_id, source_ref)
);

CREATE TABLE IF NOT EXISTS ai_outputs (
  id text PRIMARY KEY,
  request_id text NOT NULL UNIQUE REFERENCES hiring_intelligence_requests(id) ON DELETE CASCADE,
  output_schema_version text NOT NULL,
  validated_json jsonb NOT NULL,
  output_hash text NOT NULL CHECK (output_hash ~ '^sha256:[a-f0-9]{64}$'),
  validation_policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS ai_output_consumptions (
  output_id text PRIMARY KEY REFERENCES ai_outputs(id) ON DELETE CASCADE,
  command_id text NOT NULL UNIQUE,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION reject_ai_output_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ai_outputs are immutable';
END;
$$;

DROP TRIGGER IF EXISTS ai_outputs_immutable ON ai_outputs;
CREATE TRIGGER ai_outputs_immutable
BEFORE UPDATE OR DELETE ON ai_outputs
FOR EACH ROW EXECUTE FUNCTION reject_ai_output_mutation();

CREATE TABLE IF NOT EXISTS domain_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_version integer NOT NULL CHECK (event_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (aggregate_type, aggregate_id, aggregate_version)
);

CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx
  ON domain_events (aggregate_type, aggregate_id, aggregate_version);

CREATE TABLE IF NOT EXISTS outbox_messages (
  message_id text PRIMARY KEY,
  message_type text NOT NULL,
  message_version integer NOT NULL CHECK (message_version > 0),
  event_id text NOT NULL REFERENCES domain_events(event_id),
  idempotency_key text NOT NULL UNIQUE,
  correlation_id text NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS outbox_messages_claim_idx
  ON outbox_messages (processed_at, available_at, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS inbox_messages (
  consumer text NOT NULL,
  message_id text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  result_json jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (consumer, message_id),
  UNIQUE (consumer, idempotency_key)
);

CREATE TABLE IF NOT EXISTS employer_review_window_projections (
  review_window_id text PRIMARY KEY REFERENCES review_windows(id) ON DELETE CASCADE,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS candidate_review_window_projections (
  review_window_id text PRIMARY KEY REFERENCES review_windows(id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS candidate_review_window_projection_candidate_idx
  ON candidate_review_window_projections (candidate_id, review_window_id);
