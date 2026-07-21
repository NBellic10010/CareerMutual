DROP TRIGGER IF EXISTS employer_resume_reveals_immutable ON employer_resume_reveals;
DROP TRIGGER IF EXISTS candidate_resume_snapshots_immutable ON candidate_resume_snapshots;

UPDATE blind_review_command_receipts
   SET receipt_json = jsonb_set(
         receipt_json - 'resume_reveal_ref',
         '{schema_version}',
         '"functional-human-review-receipt@2"'::jsonb
       )
 WHERE command_type = 'RecordFunctionalHumanReview'
   AND receipt_json->>'schema_version' = 'functional-human-review-receipt@3';

DROP INDEX IF EXISTS employer_resume_reveals_reviewer_page_idx;
DROP TABLE IF EXISTS employer_resume_reveals;
ALTER TABLE answer_terms_acceptances DROP COLUMN IF EXISTS resume_snapshot_ref;
DROP TABLE IF EXISTS candidate_resume_snapshots;

UPDATE candidate_discovery_projections
   SET projection_json = jsonb_set(
     jsonb_set(
       (projection_json #- '{current_draft,education}'
         #- '{last_published_snapshot,education_ref}'),
       '{schema_version}',
       '"candidate-evidence-passport-projection@1"'::jsonb
     ),
     '{current_draft,schema_version}',
     '"candidate-evidence-passport-draft@1"'::jsonb
   ),
       updated_at = clock_timestamp();

ALTER TABLE candidate_evidence_passport_snapshots DROP COLUMN IF EXISTS education_json;
ALTER TABLE candidate_evidence_passport_drafts DROP COLUMN IF EXISTS education_json;
