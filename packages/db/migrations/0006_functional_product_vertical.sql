CREATE TABLE employer_attention_wallets (
  owner_ref text PRIMARY KEY,
  available_credits integer NOT NULL CHECK (available_credits >= 0),
  committed_credits integer NOT NULL CHECK (committed_credits >= 0),
  forfeited_credits integer NOT NULL DEFAULT 0 CHECK (forfeited_credits >= 0),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE employer_attention_wallet_ledger (
  ledger_entry_ref text PRIMARY KEY,
  owner_ref text NOT NULL REFERENCES employer_attention_wallets(owner_ref),
  entry_type text NOT NULL CHECK (entry_type IN ('GRANT', 'COMMIT', 'RETURN', 'FORFEIT')),
  amount integer NOT NULL CHECK (amount > 0),
  subject_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (owner_ref, entry_type, subject_ref)
);

CREATE TABLE job_post_drafts (
  draft_ref text PRIMARY KEY,
  owner_ref text NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT', 'PUBLISHED')),
  version integer NOT NULL CHECK (version > 0),
  draft_json jsonb NOT NULL,
  published_opportunity_ref text UNIQUE REFERENCES opportunities(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (state = 'DRAFT' AND published_opportunity_ref IS NULL)
    OR (state = 'PUBLISHED' AND published_opportunity_ref IS NOT NULL)
  )
);

CREATE TABLE candidate_credit_accounts (
  account_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  period_ref text NOT NULL,
  allowance integer NOT NULL CHECK (allowance >= 0),
  available_credits integer NOT NULL CHECK (available_credits >= 0),
  consumed_credits integer NOT NULL CHECK (consumed_credits >= 0),
  period_started_at timestamptz NOT NULL,
  period_ends_at timestamptz NOT NULL,
  state text NOT NULL CHECK (state IN ('ACTIVE', 'CLOSED')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (candidate_ref, period_ref),
  CHECK (period_ends_at > period_started_at),
  CHECK (available_credits + consumed_credits <= allowance)
);

CREATE TABLE candidate_credit_ledger_entries (
  ledger_entry_ref text PRIMARY KEY,
  account_ref text NOT NULL REFERENCES candidate_credit_accounts(account_ref),
  entry_type text NOT NULL CHECK (entry_type IN ('GRANT', 'CONSUME', 'RETURN')),
  amount integer NOT NULL CHECK (amount > 0),
  subject_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  UNIQUE (account_ref, entry_type, subject_ref)
);

CREATE TABLE answer_terms_acceptances (
  acceptance_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  invitation_ref text NOT NULL UNIQUE REFERENCES answer_invitations(invitation_ref),
  terms_version text NOT NULL,
  ai_disclosure_version text NOT NULL,
  conditional_reveal_consent_version text NOT NULL,
  accepted_at timestamptz NOT NULL
);

ALTER TABLE answer_sessions
  DROP CONSTRAINT answer_sessions_status_check,
  ADD COLUMN session_schema_version text NOT NULL DEFAULT 'answer-session@legacy',
  ADD COLUMN candidate_ref text,
  ADD COLUMN candidate_credit_account_ref text REFERENCES candidate_credit_accounts(account_ref),
  ADD COLUMN candidate_credit_ledger_ref text REFERENCES candidate_credit_ledger_entries(ledger_entry_ref),
  ADD COLUMN terms_acceptance_ref text REFERENCES answer_terms_acceptances(acceptance_ref),
  ADD COLUMN latest_rich_text_artifact_ref text,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN submission_source text CHECK (
    submission_source IS NULL OR submission_source IN ('MANUAL', 'DEADLINE_AUTO')
  );

UPDATE answer_sessions AS session
   SET candidate_ref = obligation.candidate_ref
  FROM answer_review_obligations AS obligation
 WHERE obligation.obligation_ref = session.obligation_ref
   AND session.candidate_ref IS NULL;

ALTER TABLE answer_sessions
  ALTER COLUMN candidate_ref SET NOT NULL,
  ADD CONSTRAINT answer_sessions_status_check CHECK (
    status IN ('ACTIVE', 'SUBMITTED', 'EXPIRED_EMPTY', 'WITHDRAWN', 'PLATFORM_ABORT')
  ),
  ADD CONSTRAINT functional_answer_session_shape CHECK (
    session_schema_version = 'answer-session@legacy'
    OR (
      session_schema_version = 'answer-session@1'
      AND candidate_credit_account_ref IS NOT NULL
      AND candidate_credit_ledger_ref IS NOT NULL
      AND terms_acceptance_ref IS NOT NULL
    )
  ),
  ADD CONSTRAINT answer_session_submission_shape CHECK (
    (status = 'ACTIVE' AND closed_at IS NULL AND submitted_at IS NULL AND submission_source IS NULL)
    OR
    (status = 'SUBMITTED' AND closed_at IS NOT NULL AND submitted_at IS NOT NULL
      AND submission_source IS NOT NULL)
    OR
    (status IN ('EXPIRED_EMPTY', 'WITHDRAWN', 'PLATFORM_ABORT') AND closed_at IS NOT NULL)
  );

CREATE TABLE answer_artifacts (
  artifact_ref text PRIMARY KEY,
  answer_session_ref text NOT NULL REFERENCES answer_sessions(answer_session_ref),
  candidate_ref text NOT NULL,
  kind text NOT NULL CHECK (
    kind IN ('RICH_TEXT', 'VOICE_MEMO', 'VOICE_TRANSCRIPT', 'GPT_TURN', 'GPT_TRACE')
  ),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  content_length integer NOT NULL CHECK (content_length >= 0 AND content_length <= 20971520),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^sha256:[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('UPLOAD_ISSUED', 'VERIFIED', 'SEALED', 'FAILED')),
  revision integer NOT NULL CHECK (revision > 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  sealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (answer_session_ref, kind, revision),
  CHECK (
    (state = 'UPLOAD_ISSUED' AND sha256 IS NULL AND verified_at IS NULL AND sealed_at IS NULL)
    OR
    (state = 'VERIFIED' AND sha256 IS NOT NULL AND verified_at IS NOT NULL AND sealed_at IS NULL)
    OR
    (state = 'SEALED' AND sha256 IS NOT NULL AND verified_at IS NOT NULL AND sealed_at IS NOT NULL)
    OR state = 'FAILED'
  )
);

ALTER TABLE answer_sessions
  ADD CONSTRAINT answer_sessions_latest_rich_text_artifact_fk
    FOREIGN KEY (latest_rich_text_artifact_ref) REFERENCES answer_artifacts(artifact_ref);

CREATE INDEX answer_artifacts_session_idx
  ON answer_artifacts(answer_session_ref, kind, revision);

CREATE TABLE candidate_assistant_exchanges (
  exchange_ref text PRIMARY KEY,
  answer_session_ref text NOT NULL REFERENCES answer_sessions(answer_session_ref),
  candidate_ref text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  user_artifact_ref text NOT NULL UNIQUE REFERENCES answer_artifacts(artifact_ref),
  assistant_artifact_ref text UNIQUE REFERENCES answer_artifacts(artifact_ref),
  status text NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  provider_response_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  UNIQUE (answer_session_ref, ordinal),
  CHECK (
    (status IN ('QUEUED', 'RUNNING') AND assistant_artifact_ref IS NULL AND completed_at IS NULL)
    OR
    (status = 'COMPLETED' AND assistant_artifact_ref IS NOT NULL AND completed_at IS NOT NULL)
    OR
    (status = 'FAILED' AND error_code IS NOT NULL AND completed_at IS NOT NULL)
  )
);

ALTER TABLE answer_submissions
  ADD COLUMN submission_source text NOT NULL DEFAULT 'LEGACY' CHECK (
    submission_source IN ('LEGACY', 'MANUAL', 'DEADLINE_AUTO')
  ),
  ADD COLUMN artifact_manifest_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE human_answer_reviews
  ADD COLUMN review_comment text;

UPDATE human_answer_reviews
   SET review_comment = 'Legacy review: no narrative comment was captured.'
 WHERE review_comment IS NULL;

ALTER TABLE human_answer_reviews
  ALTER COLUMN review_comment SET NOT NULL,
  ADD CONSTRAINT human_answer_reviews_comment_check CHECK (
    char_length(review_comment) BETWEEN 10 AND 4000
  );

CREATE INDEX answer_sessions_deadline_idx
  ON answer_sessions(answer_due_at, answer_session_ref)
  WHERE status = 'ACTIVE';

CREATE INDEX answer_review_pending_order_idx
  ON answer_submissions(submitted_at, answer_submission_ref);

CREATE OR REPLACE FUNCTION reject_functional_product_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER employer_attention_wallet_ledger_immutable
BEFORE UPDATE OR DELETE ON employer_attention_wallet_ledger
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();

CREATE TRIGGER candidate_credit_ledger_immutable
BEFORE UPDATE OR DELETE ON candidate_credit_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();

CREATE TRIGGER answer_terms_acceptances_immutable
BEFORE UPDATE OR DELETE ON answer_terms_acceptances
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();

CREATE OR REPLACE FUNCTION protect_sealed_answer_artifact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'SEALED' THEN
    RAISE EXCEPTION 'sealed answer artifacts are immutable';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.state IN ('VERIFIED', 'SEALED') THEN
    RAISE EXCEPTION 'verified answer artifacts cannot be deleted';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER answer_artifacts_sealed_immutable
BEFORE UPDATE OR DELETE ON answer_artifacts
FOR EACH ROW EXECUTE FUNCTION protect_sealed_answer_artifact();

