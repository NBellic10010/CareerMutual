ALTER TABLE candidate_evidence_passport_drafts
  ADD COLUMN education_json jsonb;

ALTER TABLE candidate_evidence_passport_snapshots
  ADD COLUMN education_json jsonb;

DROP TRIGGER candidate_evidence_passport_snapshots_immutable
  ON candidate_evidence_passport_snapshots;

UPDATE candidate_evidence_passport_drafts
   SET education_json = jsonb_build_object(
     'education_ref', 'education:' || candidate_ref || ':legacy-required',
     'level', 'BACHELOR',
     'status', 'GRADUATED',
     'institution_label', 'Synthetic Regional University',
     'field_of_study', 'Computer science',
     'graduation_date', '2025-05-15',
     'source_sha256', 'sha256:' || repeat('a', 64),
     'verification_state', 'SYNTHETIC_SOURCE_ATTACHED',
     'visibility', 'CANDIDATE_ONLY'
   )
 WHERE education_json IS NULL;

UPDATE candidate_evidence_passport_snapshots AS snapshot
   SET education_json = draft.education_json
  FROM candidate_evidence_passport_drafts AS draft
 WHERE draft.candidate_ref = snapshot.candidate_ref
   AND snapshot.education_json IS NULL;

ALTER TABLE candidate_evidence_passport_drafts
  ALTER COLUMN education_json SET NOT NULL;

ALTER TABLE candidate_evidence_passport_snapshots
  ALTER COLUMN education_json SET NOT NULL;

CREATE TRIGGER candidate_evidence_passport_snapshots_immutable
BEFORE UPDATE OR DELETE ON candidate_evidence_passport_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_candidate_discovery_immutable_mutation();

UPDATE candidate_discovery_projections AS projection
   SET projection_json = jsonb_set(
     jsonb_set(
       jsonb_set(
         jsonb_set(
           projection.projection_json,
           '{schema_version}',
           '"candidate-evidence-passport-projection@2"'::jsonb
         ),
         '{current_draft,schema_version}',
         '"candidate-evidence-passport-draft@2"'::jsonb
       ),
       '{current_draft,education}',
       draft.education_json,
       true
     ),
     '{last_published_snapshot,education_ref}',
     to_jsonb(draft.education_json ->> 'education_ref'),
     true
   ),
       updated_at = clock_timestamp()
  FROM candidate_evidence_passport_drafts AS draft
 WHERE draft.candidate_ref = projection.candidate_ref;

CREATE TABLE candidate_resume_snapshots (
  resume_snapshot_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  snapshot_version integer NOT NULL CHECK (snapshot_version > 0),
  resume_json jsonb NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  synthetic boolean NOT NULL DEFAULT false,
  sealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (candidate_ref, snapshot_version),
  UNIQUE (candidate_ref, source_sha256)
);

ALTER TABLE answer_terms_acceptances
  ADD COLUMN resume_snapshot_ref text REFERENCES candidate_resume_snapshots(resume_snapshot_ref);

CREATE TABLE employer_resume_reveals (
  reveal_ref text PRIMARY KEY,
  reviewer_ref text NOT NULL,
  candidate_ref text NOT NULL,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  answer_submission_ref text NOT NULL UNIQUE REFERENCES answer_submissions(answer_submission_ref),
  human_review_ref text NOT NULL UNIQUE REFERENCES human_answer_reviews(human_review_ref),
  resume_snapshot_ref text NOT NULL REFERENCES candidate_resume_snapshots(resume_snapshot_ref),
  authorization_reason text NOT NULL CHECK (
    authorization_reason = 'ADVANCE_ELIGIBLE_HUMAN_REVIEW'
  ),
  reveal_policy_version text NOT NULL,
  revealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (reviewer_ref, opportunity_ref, candidate_ref)
);

CREATE INDEX employer_resume_reveals_reviewer_page_idx
  ON employer_resume_reveals(reviewer_ref, revealed_at DESC, reveal_ref DESC);

UPDATE blind_review_command_receipts
   SET receipt_json = jsonb_set(
         jsonb_set(
           receipt_json,
           '{schema_version}',
           '"functional-human-review-receipt@3"'::jsonb
         ),
         '{resume_reveal_ref}',
         'null'::jsonb,
         true
       )
 WHERE command_type = 'RecordFunctionalHumanReview'
   AND receipt_json->>'schema_version' = 'functional-human-review-receipt@2';

CREATE TRIGGER candidate_resume_snapshots_immutable
BEFORE UPDATE OR DELETE ON candidate_resume_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_candidate_discovery_immutable_mutation();

CREATE TRIGGER employer_resume_reveals_immutable
BEFORE UPDATE OR DELETE ON employer_resume_reveals
FOR EACH ROW EXECUTE FUNCTION reject_candidate_discovery_immutable_mutation();
