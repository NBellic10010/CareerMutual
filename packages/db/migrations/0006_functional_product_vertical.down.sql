DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM answer_sessions WHERE session_schema_version = 'answer-session@1'
  ) THEN
    RAISE EXCEPTION 'cannot roll back 0006 while functional Answer Sessions exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS answer_artifacts_sealed_immutable ON answer_artifacts;
DROP FUNCTION IF EXISTS protect_sealed_answer_artifact();
DROP TRIGGER IF EXISTS answer_terms_acceptances_immutable ON answer_terms_acceptances;
DROP TRIGGER IF EXISTS candidate_credit_ledger_immutable ON candidate_credit_ledger_entries;
DROP TRIGGER IF EXISTS employer_attention_wallet_ledger_immutable ON employer_attention_wallet_ledger;
DROP FUNCTION IF EXISTS reject_functional_product_immutable_mutation();

DROP INDEX IF EXISTS answer_review_pending_order_idx;
DROP INDEX IF EXISTS answer_sessions_deadline_idx;

ALTER TABLE human_answer_reviews
  DROP CONSTRAINT IF EXISTS human_answer_reviews_comment_check,
  DROP COLUMN review_comment;

ALTER TABLE answer_submissions
  DROP COLUMN artifact_manifest_json,
  DROP COLUMN submission_source;

DROP TABLE candidate_assistant_exchanges;

ALTER TABLE answer_sessions
  DROP CONSTRAINT answer_sessions_latest_rich_text_artifact_fk;
DROP TABLE answer_artifacts;

ALTER TABLE answer_sessions
  DROP CONSTRAINT answer_session_submission_shape,
  DROP CONSTRAINT functional_answer_session_shape,
  DROP CONSTRAINT answer_sessions_status_check,
  DROP COLUMN submission_source,
  DROP COLUMN submitted_at,
  DROP COLUMN latest_rich_text_artifact_ref,
  DROP COLUMN terms_acceptance_ref,
  DROP COLUMN candidate_credit_ledger_ref,
  DROP COLUMN candidate_credit_account_ref,
  DROP COLUMN candidate_ref,
  DROP COLUMN session_schema_version,
  ADD CONSTRAINT answer_sessions_status_check CHECK (
    status IN ('ACTIVE', 'SUBMITTED', 'WITHDRAWN', 'PLATFORM_ABORT')
  );

DROP TABLE answer_terms_acceptances;
DROP TABLE candidate_credit_ledger_entries;
DROP TABLE candidate_credit_accounts;
DROP TABLE job_post_drafts;
DROP TABLE employer_attention_wallet_ledger;
DROP TABLE employer_attention_wallets;
