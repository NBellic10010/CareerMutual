DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM review_windows
     WHERE matching_cycle_ref IS NULL
       AND match_edge_ref IS NULL
       AND attention_slot_ref IS NOT NULL
       AND credit_hold_ref IS NOT NULL
       AND advancement_cohort_ref IS NOT NULL
       AND advancement_allocation_ref IS NOT NULL
       AND answer_submission_ref IS NOT NULL
       AND answer_evidence_edge_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'cannot roll back 0003 while answer-first Deep Proof ReviewWindows exist';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS advancement_cohort_seat_membership_immutable
  ON advancement_cohort_seats;
DROP FUNCTION IF EXISTS protect_submitted_advancement_cohort_seat();

DROP TRIGGER IF EXISTS domain_events_immutable ON domain_events;
DROP TRIGGER IF EXISTS blind_review_command_receipts_immutable
  ON blind_review_command_receipts;
DROP TRIGGER IF EXISTS opportunity_closure_receipts_immutable
  ON opportunity_closure_receipts;
DROP TRIGGER IF EXISTS advancement_allocations_immutable ON advancement_allocations;
DROP TRIGGER IF EXISTS human_answer_reviews_immutable ON human_answer_reviews;
DROP TRIGGER IF EXISTS answer_evidence_edges_immutable ON answer_evidence_edges;
DROP TRIGGER IF EXISTS answer_submissions_immutable ON answer_submissions;
DROP FUNCTION IF EXISTS reject_blind_review_immutable_mutation();

ALTER TABLE review_windows
  DROP CONSTRAINT IF EXISTS review_window_subject_shape,
  DROP COLUMN IF EXISTS answer_evidence_edge_ref,
  DROP COLUMN IF EXISTS answer_submission_ref,
  DROP COLUMN IF EXISTS advancement_allocation_ref,
  DROP COLUMN IF EXISTS advancement_cohort_ref;

ALTER TABLE review_windows
  ADD CONSTRAINT matching_review_window_refs_all_or_none CHECK (
    (matching_cycle_ref IS NULL AND match_edge_ref IS NULL AND attention_slot_ref IS NULL
      AND credit_hold_ref IS NULL AND allocation_kind IS NULL AND accept_by IS NULL)
    OR
    (matching_cycle_ref IS NOT NULL AND match_edge_ref IS NOT NULL AND attention_slot_ref IS NOT NULL
      AND credit_hold_ref IS NOT NULL AND allocation_kind IS NOT NULL AND accept_by IS NOT NULL)
  );

DELETE FROM hiring_intelligence_requests
 WHERE operation = 'buildAnswerEvidenceEdge';

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT IF EXISTS hiring_intelligence_requests_operation_check,
  DROP COLUMN IF EXISTS answer_submission_ref,
  DROP COLUMN IF EXISTS question_version_ref,
  DROP COLUMN IF EXISTS advancement_cohort_ref,
  DROP COLUMN IF EXISTS blind_review_commitment_ref,
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'recommendChallenges', 'compressEvidence'
  ));

DELETE FROM stage_a_evidence
 WHERE answer_submission_ref IS NOT NULL;

DROP INDEX IF EXISTS stage_a_evidence_answer_ordinal_idx;
ALTER TABLE stage_a_evidence
  DROP CONSTRAINT IF EXISTS stage_a_evidence_exactly_one_subject,
  DROP COLUMN IF EXISTS answer_submission_ref,
  ALTER COLUMN review_window_id SET NOT NULL;

ALTER TABLE candidate_interests
  DROP CONSTRAINT IF EXISTS candidate_interests_closure_receipt_fk;

DROP TABLE IF EXISTS candidate_answer_projections;
DROP TABLE IF EXISTS employer_blind_review_projections;
DROP TABLE IF EXISTS public_opportunity_projections;
DROP TABLE IF EXISTS blind_review_command_receipts;
DROP TABLE IF EXISTS opportunity_closure_receipts;

DROP INDEX IF EXISTS one_active_candidate_activity;
DROP TABLE IF EXISTS candidate_activity_leases;

DROP TABLE IF EXISTS advancement_allocations;

ALTER TABLE answer_review_obligations
  DROP CONSTRAINT IF EXISTS answer_review_obligations_human_review_fk,
  DROP CONSTRAINT IF EXISTS answer_review_obligations_submission_fk;
ALTER TABLE advancement_cohort_seats
  DROP CONSTRAINT IF EXISTS advancement_cohort_seats_human_review_fk,
  DROP CONSTRAINT IF EXISTS advancement_cohort_seats_submission_fk;

DROP TABLE IF EXISTS human_answer_reviews;
DROP TABLE IF EXISTS answer_evidence_edges;
DROP TABLE IF EXISTS answer_submissions;
DROP TABLE IF EXISTS answer_sessions;
DROP TABLE IF EXISTS answer_invitations;

ALTER TABLE answer_review_slots
  DROP CONSTRAINT IF EXISTS answer_review_slots_current_obligation_fk;
ALTER TABLE advancement_cohort_seats
  DROP CONSTRAINT IF EXISTS advancement_cohort_seats_obligation_fk;

DROP INDEX IF EXISTS one_unsettled_obligation_per_interest;
DROP INDEX IF EXISTS one_unsettled_obligation_per_answer_slot;
DROP TABLE IF EXISTS answer_review_obligations;
DROP TABLE IF EXISTS advancement_cohort_seats;
DROP TABLE IF EXISTS advancement_cohorts;
DROP TABLE IF EXISTS answer_review_slots;
DROP TABLE IF EXISTS blind_review_commitments;

DROP INDEX IF EXISTS one_answer_review_credit_hold_per_subject;
DELETE FROM credit_holds WHERE purpose = 'ANSWER_REVIEW';
ALTER TABLE credit_holds
  DROP CONSTRAINT IF EXISTS answer_review_credit_hold_shape,
  DROP COLUMN IF EXISTS settlement_ref,
  DROP COLUMN IF EXISTS subject_ref,
  DROP COLUMN IF EXISTS purpose;

ALTER TABLE credit_accounts
  DROP COLUMN IF EXISTS reserved_credits;

ALTER TABLE attention_commitments
  DROP COLUMN IF EXISTS blind_review_status,
  DROP COLUMN IF EXISTS credit_per_answer_review,
  DROP COLUMN IF EXISTS queue_public_seed,
  DROP COLUMN IF EXISTS queue_policy_version,
  DROP COLUMN IF EXISTS advancement_cohort_size,
  DROP COLUMN IF EXISTS answer_review_sla_hours,
  DROP COLUMN IF EXISTS answer_review_wip;

ALTER TABLE candidate_interests
  DROP CONSTRAINT IF EXISTS candidate_interests_eligibility_edge_fk;

DROP INDEX IF EXISTS one_target_eligibility_edge_per_interest;
DROP TRIGGER IF EXISTS eligibility_edges_immutable ON eligibility_edges;
ALTER TABLE eligibility_edges
  DROP CONSTRAINT IF EXISTS eligibility_edges_legacy_or_interest_check,
  DROP CONSTRAINT IF EXISTS eligibility_edges_interest_fk;
DELETE FROM eligibility_edges WHERE interest_ref IS NOT NULL;
ALTER TABLE eligibility_edges
  DROP COLUMN IF EXISTS interest_ref,
  DROP COLUMN IF EXISTS opportunity_ref,
  ALTER COLUMN claim_snapshot_ref SET NOT NULL,
  ALTER COLUMN matching_cycle_ref SET NOT NULL;
CREATE TRIGGER eligibility_edges_immutable
BEFORE UPDATE OR DELETE ON eligibility_edges
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();

DROP INDEX IF EXISTS candidate_interests_public_queue_idx;
ALTER TABLE candidate_interests
  DROP CONSTRAINT IF EXISTS candidate_interests_target_shape_check,
  DROP CONSTRAINT IF EXISTS candidate_interests_status_check;
DELETE FROM candidate_interests
 WHERE interest_schema_version <> 'candidate-interest@legacy';
ALTER TABLE candidate_interests
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS closure_receipt_ref,
  DROP COLUMN IF EXISTS queue_tie_break,
  DROP COLUMN IF EXISTS queue_policy_version,
  DROP COLUMN IF EXISTS interest_created_at,
  DROP COLUMN IF EXISTS eligible_at,
  DROP COLUMN IF EXISTS eligibility_edge_ref,
  DROP COLUMN IF EXISTS hard_facts_json,
  DROP COLUMN IF EXISTS consent_version,
  DROP COLUMN IF EXISTS interest_schema_version,
  ALTER COLUMN claim_snapshot_ref SET NOT NULL,
  ADD CONSTRAINT candidate_interests_status_check CHECK (
    status IN ('SUBMITTED', 'ELIGIBLE', 'INELIGIBLE')
  );

ALTER TABLE opportunities
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version;
