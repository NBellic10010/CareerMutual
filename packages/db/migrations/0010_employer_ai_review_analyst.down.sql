ALTER TABLE human_answer_reviews DROP COLUMN IF EXISTS consulted_ai_output_ref;
DROP TABLE IF EXISTS employer_answer_review_projections;
ALTER TABLE answer_submissions
  DROP CONSTRAINT IF EXISTS answer_submissions_process_evidence_shape,
  DROP CONSTRAINT IF EXISTS answer_submissions_process_evidence_fk,
  DROP COLUMN IF EXISTS process_manifest_json,
  DROP COLUMN IF EXISTS process_capture_version,
  DROP COLUMN IF EXISTS process_evidence_ref;
DROP TRIGGER IF EXISTS answer_process_evidence_immutable ON answer_process_evidence;
DROP TABLE IF EXISTS answer_process_evidence;
ALTER TABLE answer_terms_acceptances
  DROP COLUMN IF EXISTS employer_ai_review_disclosure_version,
  DROP COLUMN IF EXISTS employer_ai_review_policy;

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
