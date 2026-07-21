ALTER TABLE answer_terms_acceptances
  ADD COLUMN employer_ai_review_policy text NOT NULL DEFAULT 'OFF' CHECK (
    employer_ai_review_policy IN ('OFF', 'ANSWER_ONLY', 'ANSWER_PLUS_PROCESS')
  ),
  ADD COLUMN employer_ai_review_disclosure_version text NOT NULL
    DEFAULT 'employer-ai-review-disclosure@legacy-off';

CREATE TABLE answer_process_evidence (
  process_evidence_ref text PRIMARY KEY,
  answer_submission_ref text NOT NULL UNIQUE REFERENCES answer_submissions(answer_submission_ref)
    DEFERRABLE INITIALLY DEFERRED,
  answer_session_ref text NOT NULL UNIQUE REFERENCES answer_sessions(answer_session_ref),
  process_manifest_json jsonb NOT NULL,
  process_hash text NOT NULL UNIQUE CHECK (process_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL
);

ALTER TABLE answer_submissions
  ADD COLUMN process_evidence_ref text UNIQUE,
  ADD COLUMN process_capture_version text NOT NULL DEFAULT 'answer-process-evidence@legacy-untracked',
  ADD COLUMN process_manifest_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT answer_submissions_process_evidence_fk
    FOREIGN KEY (process_evidence_ref) REFERENCES answer_process_evidence(process_evidence_ref)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT answer_submissions_process_evidence_shape CHECK (
    process_capture_version = 'answer-process-evidence@legacy-untracked'
    OR (process_capture_version = 'answer-process-evidence@1' AND process_evidence_ref IS NOT NULL)
  );

CREATE TABLE employer_answer_review_projections (
  answer_submission_ref text PRIMARY KEY REFERENCES answer_submissions(answer_submission_ref),
  policy text NOT NULL CHECK (policy IN ('OFF', 'ANSWER_ONLY', 'ANSWER_PLUS_PROCESS')),
  status text NOT NULL CHECK (
    status IN ('DISABLED', 'ANALYZING', 'READY', 'NEEDS_HUMAN', 'FAILED', 'SUPERSEDED')
  ),
  process_evidence_ref text REFERENCES answer_process_evidence(process_evidence_ref),
  ai_request_ref text REFERENCES hiring_intelligence_requests(id),
  ai_output_ref text REFERENCES ai_outputs(id),
  answer_evidence_edge_ref text REFERENCES answer_evidence_edges(answer_evidence_edge_ref),
  projection_json jsonb,
  error_code text,
  synthetic boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (status = 'DISABLED' AND policy = 'OFF' AND ai_request_ref IS NULL AND ai_output_ref IS NULL)
    OR (status = 'ANALYZING' AND policy <> 'OFF' AND ai_output_ref IS NULL)
    OR (status = 'READY' AND policy <> 'OFF'
      AND ai_request_ref IS NOT NULL AND ai_output_ref IS NOT NULL
      AND answer_evidence_edge_ref IS NOT NULL AND projection_json IS NOT NULL)
    OR (status = 'NEEDS_HUMAN' AND policy <> 'OFF' AND (
      (ai_request_ref IS NOT NULL AND ai_output_ref IS NOT NULL
        AND answer_evidence_edge_ref IS NOT NULL AND projection_json IS NOT NULL)
      OR error_code IS NOT NULL
    ))
    OR (status = 'FAILED' AND policy <> 'OFF' AND error_code IS NOT NULL)
    OR (status = 'SUPERSEDED' AND policy <> 'OFF')
  )
);

CREATE INDEX employer_answer_review_projection_status_idx
  ON employer_answer_review_projections(status, updated_at, answer_submission_ref);

ALTER TABLE human_answer_reviews
  ADD COLUMN consulted_ai_output_ref text REFERENCES ai_outputs(id);

CREATE TRIGGER answer_process_evidence_immutable
BEFORE UPDATE OR DELETE ON answer_process_evidence
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();

CREATE OR REPLACE FUNCTION protect_sealed_answer_artifact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.state = 'VERIFIED' AND OLD.kind = 'RICH_TEXT'
     AND OLD.created_at <= clock_timestamp() - interval '24 hours'
     AND EXISTS (
       SELECT 1 FROM answer_submissions submission
        WHERE submission.answer_session_ref = OLD.answer_session_ref
          AND NOT submission.artifact_manifest_json ? OLD.artifact_ref
     ) THEN
    RETURN OLD;
  END IF;
  IF OLD.state = 'SEALED' THEN
    RAISE EXCEPTION 'sealed answer artifacts are immutable';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.state IN ('VERIFIED', 'SEALED') THEN
    RAISE EXCEPTION 'verified answer artifacts cannot be deleted';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
