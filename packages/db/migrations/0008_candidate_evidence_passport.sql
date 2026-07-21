CREATE TABLE candidate_evidence_passport_drafts (
  candidate_ref text PRIMARY KEY,
  draft_version integer NOT NULL CHECK (draft_version > 0),
  evidence_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE candidate_evidence_passport_snapshots (
  snapshot_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  snapshot_version integer NOT NULL CHECK (snapshot_version > 0),
  draft_version integer NOT NULL CHECK (draft_version > 0),
  discovery_consent_version text NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  evidence_json jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (candidate_ref, snapshot_version),
  UNIQUE (candidate_ref, snapshot_hash)
);

CREATE TABLE candidate_discovery_signal_sets (
  signal_set_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  passport_snapshot_ref text NOT NULL
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  job_set_hash text NOT NULL CHECK (job_set_hash ~ '^sha256:[a-f0-9]{64}$'),
  ai_request_ref text UNIQUE,
  ai_output_ref text UNIQUE REFERENCES ai_outputs(id),
  status text NOT NULL CHECK (
    status IN ('GENERATING', 'READY', 'STALE', 'NEEDS_HUMAN', 'FAILED', 'SUPERSEDED')
  ),
  synthetic_preloaded boolean NOT NULL DEFAULT false,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK (
    (status = 'GENERATING' AND completed_at IS NULL)
    OR (status <> 'GENERATING' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX candidate_discovery_signal_sets_candidate_idx
  ON candidate_discovery_signal_sets(candidate_ref, created_at DESC, signal_set_ref);

CREATE TABLE candidate_job_discovery_signals (
  signal_ref text PRIMARY KEY,
  signal_set_ref text NOT NULL REFERENCES candidate_discovery_signal_sets(signal_set_ref),
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  opportunity_version integer NOT NULL CHECK (opportunity_version > 0),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  discovery_band text NOT NULL CHECK (
    discovery_band IN ('EVIDENCE_CONNECTED', 'ADJACENT', 'INSUFFICIENT_SOURCE')
  ),
  signal_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (signal_set_ref, opportunity_ref)
);

CREATE INDEX candidate_job_discovery_signals_opportunity_idx
  ON candidate_job_discovery_signals(opportunity_ref, signal_set_ref);

CREATE TABLE candidate_discovery_projections (
  candidate_ref text PRIMARY KEY,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT hiring_intelligence_requests_operation_check,
  ADD COLUMN candidate_passport_snapshot_ref text
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'buildAnswerEvidenceEdge',
    'recommendChallenges', 'compressEvidence', 'deriveCandidateJobSignals'
  ));

CREATE OR REPLACE FUNCTION reject_candidate_discovery_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER candidate_evidence_passport_snapshots_immutable
BEFORE UPDATE OR DELETE ON candidate_evidence_passport_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_candidate_discovery_immutable_mutation();

CREATE TRIGGER candidate_job_discovery_signals_immutable
BEFORE UPDATE OR DELETE ON candidate_job_discovery_signals
FOR EACH ROW EXECUTE FUNCTION reject_candidate_discovery_immutable_mutation();
