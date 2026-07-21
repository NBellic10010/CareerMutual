ALTER TABLE opportunities
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_status_check,
  ALTER COLUMN claim_snapshot_ref DROP NOT NULL,
  ADD COLUMN interest_schema_version text NOT NULL DEFAULT 'candidate-interest@legacy',
  ADD COLUMN consent_version text,
  ADD COLUMN hard_facts_json jsonb,
  ADD COLUMN eligibility_edge_ref text,
  ADD COLUMN eligible_at timestamptz,
  ADD COLUMN interest_created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN queue_policy_version text,
  ADD COLUMN queue_tie_break text,
  ADD COLUMN closure_receipt_ref text,
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

UPDATE candidate_interests
   SET interest_schema_version = 'candidate-interest@legacy',
       interest_created_at = submitted_at
 WHERE interest_schema_version IS NULL;

ALTER TABLE candidate_interests
  ADD CONSTRAINT candidate_interests_status_check CHECK (status IN (
    'SUBMITTED', 'ELIGIBLE', 'INELIGIBLE',
    'INTEREST_RECEIVED', 'INELIGIBLE_HARD_REQUIREMENT', 'WAITING_FOR_BACKED_SLOT',
    'BACKED_OFFERED', 'APPLICATION_ACTIVE', 'APPLICATION_SUBMITTED', 'REVIEWED',
    'OFFER_DECLINED', 'OFFER_EXPIRED', 'OPPORTUNITY_PAUSED', 'OPPORTUNITY_CLOSED'
  )),
  ADD CONSTRAINT candidate_interests_target_shape_check CHECK (
    interest_schema_version = 'candidate-interest@legacy'
    OR (
      interest_schema_version = 'candidate-interest@1'
      AND consent_version IS NOT NULL
      AND hard_facts_json IS NOT NULL
      AND queue_policy_version = 'onlyboth.interest-queue@1'
      AND (
        status = 'INTEREST_RECEIVED'
        OR (
          status IN (
            'INELIGIBLE_HARD_REQUIREMENT', 'WAITING_FOR_BACKED_SLOT', 'BACKED_OFFERED',
            'APPLICATION_ACTIVE', 'APPLICATION_SUBMITTED', 'REVIEWED', 'OFFER_DECLINED',
            'OFFER_EXPIRED', 'OPPORTUNITY_PAUSED', 'OPPORTUNITY_CLOSED'
          )
          AND eligibility_edge_ref IS NOT NULL
        )
      )
      AND (
        status NOT IN (
          'WAITING_FOR_BACKED_SLOT', 'BACKED_OFFERED', 'APPLICATION_ACTIVE',
          'APPLICATION_SUBMITTED', 'REVIEWED'
        )
        OR (
          eligible_at IS NOT NULL
          AND queue_tie_break ~ '^sha256:[a-f0-9]{64}$'
        )
      )
    )
  );

CREATE INDEX candidate_interests_public_queue_idx
  ON candidate_interests (
    opportunity_ref, status, eligible_at, interest_created_at, queue_tie_break, candidate_ref
  );

ALTER TABLE eligibility_edges
  ALTER COLUMN matching_cycle_ref DROP NOT NULL,
  ALTER COLUMN claim_snapshot_ref DROP NOT NULL,
  ADD COLUMN opportunity_ref text REFERENCES opportunities(id),
  ADD COLUMN interest_ref text;

ALTER TABLE eligibility_edges
  ADD CONSTRAINT eligibility_edges_interest_fk
    FOREIGN KEY (interest_ref) REFERENCES candidate_interests(interest_ref)
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT eligibility_edges_legacy_or_interest_check CHECK (
    (
      matching_cycle_ref IS NOT NULL
      AND claim_snapshot_ref IS NOT NULL
      AND opportunity_ref IS NULL
      AND interest_ref IS NULL
    )
    OR
    (
      matching_cycle_ref IS NULL
      AND claim_snapshot_ref IS NULL
      AND opportunity_ref IS NOT NULL
      AND interest_ref IS NOT NULL
    )
  );

CREATE UNIQUE INDEX one_target_eligibility_edge_per_interest
  ON eligibility_edges(interest_ref)
  WHERE interest_ref IS NOT NULL;

ALTER TABLE candidate_interests
  ADD CONSTRAINT candidate_interests_eligibility_edge_fk
    FOREIGN KEY (eligibility_edge_ref) REFERENCES eligibility_edges(eligibility_edge_ref)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE attention_commitments
  ADD COLUMN answer_review_wip integer CHECK (answer_review_wip > 0),
  ADD COLUMN answer_review_sla_hours integer CHECK (answer_review_sla_hours > 0),
  ADD COLUMN advancement_cohort_size integer CHECK (advancement_cohort_size > 1),
  ADD COLUMN queue_policy_version text CHECK (
    queue_policy_version IS NULL OR queue_policy_version = 'onlyboth.interest-queue@1'
  ),
  ADD COLUMN queue_public_seed text,
  ADD COLUMN credit_per_answer_review integer CHECK (credit_per_answer_review > 0),
  ADD COLUMN blind_review_status text NOT NULL DEFAULT 'LEGACY' CHECK (
    blind_review_status IN ('LEGACY', 'DRAFT', 'ACTIVE', 'PAUSED', 'CLOSING', 'CLOSED', 'SUSPENDED')
  );

ALTER TABLE credit_accounts
  ADD COLUMN reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0);

ALTER TABLE credit_holds
  ADD COLUMN purpose text NOT NULL DEFAULT 'DEEP_PROOF' CHECK (
    purpose IN ('ANSWER_REVIEW', 'DEEP_PROOF')
  ),
  ADD COLUMN subject_ref text,
  ADD COLUMN settlement_ref text,
  ADD CONSTRAINT answer_review_credit_hold_shape CHECK (
    purpose <> 'ANSWER_REVIEW'
    OR (subject_ref IS NOT NULL AND review_window_ref IS NULL)
  );

CREATE UNIQUE INDEX one_answer_review_credit_hold_per_subject
  ON credit_holds(subject_ref)
  WHERE purpose = 'ANSWER_REVIEW';

CREATE TABLE blind_review_commitments (
  commitment_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL UNIQUE REFERENCES opportunities(id),
  source_attention_commitment_ref text NOT NULL UNIQUE REFERENCES attention_commitments(commitment_ref),
  credit_account_ref text NOT NULL REFERENCES credit_accounts(account_ref),
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  question_version_ref text NOT NULL,
  question_hash text NOT NULL CHECK (question_hash ~ '^sha256:[a-f0-9]{64}$'),
  reviewer_ref text NOT NULL,
  answer_review_wip integer NOT NULL CHECK (answer_review_wip > 0),
  answer_review_sla_hours integer NOT NULL CHECK (answer_review_sla_hours > 0),
  advancement_cohort_size integer NOT NULL CHECK (advancement_cohort_size > 1),
  queue_policy_version text NOT NULL CHECK (queue_policy_version = 'onlyboth.interest-queue@1'),
  queue_public_seed text NOT NULL,
  credit_per_answer_review integer NOT NULL CHECK (credit_per_answer_review > 0),
  reserved_credit_amount integer NOT NULL CHECK (reserved_credit_amount > 0),
  state text NOT NULL CHECK (
    state IN ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSING', 'CLOSED', 'SUSPENDED')
  ),
  version integer NOT NULL CHECK (version > 0),
  aggregate_json jsonb NOT NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (reserved_credit_amount = answer_review_wip * credit_per_answer_review),
  CHECK ((state = 'DRAFT' AND activated_at IS NULL) OR (state <> 'DRAFT' AND activated_at IS NOT NULL))
);

CREATE TABLE answer_review_slots (
  slot_ref text PRIMARY KEY,
  commitment_ref text NOT NULL REFERENCES blind_review_commitments(commitment_ref),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  status text NOT NULL CHECK (status IN (
    'AVAILABLE', 'OFFERED', 'ANSWER_ACTIVE', 'REVIEW_PENDING', 'SETTLING',
    'BREACHED', 'REMEDIATING', 'RETIRED'
  )),
  current_obligation_ref text,
  reserved_credit_amount integer NOT NULL CHECK (reserved_credit_amount > 0),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (commitment_ref, ordinal),
  UNIQUE (current_obligation_ref),
  UNIQUE (slot_ref, commitment_ref),
  CHECK (
    (status IN ('AVAILABLE', 'RETIRED') AND current_obligation_ref IS NULL)
    OR
    (status NOT IN ('AVAILABLE', 'RETIRED') AND current_obligation_ref IS NOT NULL)
  )
);

CREATE TABLE advancement_cohorts (
  cohort_ref text PRIMARY KEY,
  commitment_ref text NOT NULL REFERENCES blind_review_commitments(commitment_ref),
  sequence integer NOT NULL CHECK (sequence > 0),
  target_size integer NOT NULL CHECK (target_size > 1),
  submitted_count integer NOT NULL DEFAULT 0 CHECK (submitted_count >= 0),
  reviewed_count integer NOT NULL DEFAULT 0 CHECK (reviewed_count >= 0),
  state text NOT NULL CHECK (
    state IN ('COLLECTING', 'REVIEWING', 'READY_FOR_ADVANCEMENT', 'ALLOCATED', 'CLOSED_NO_ALLOCATION')
  ),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (commitment_ref, sequence),
  UNIQUE (cohort_ref, commitment_ref),
  CHECK (reviewed_count <= submitted_count AND submitted_count <= target_size),
  CHECK (state <> 'READY_FOR_ADVANCEMENT' OR reviewed_count = target_size)
);

CREATE TABLE advancement_cohort_seats (
  cohort_seat_ref text PRIMARY KEY,
  cohort_ref text NOT NULL REFERENCES advancement_cohorts(cohort_ref),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'RESERVED', 'ANSWER_SUBMITTED', 'REVIEWED')),
  obligation_ref text,
  answer_submission_ref text,
  human_review_ref text,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (cohort_ref, ordinal),
  UNIQUE (obligation_ref),
  UNIQUE (cohort_seat_ref, cohort_ref),
  CHECK (
    (status = 'OPEN' AND obligation_ref IS NULL)
    OR
    (status <> 'OPEN' AND obligation_ref IS NOT NULL)
  ),
  CHECK (status NOT IN ('ANSWER_SUBMITTED', 'REVIEWED') OR answer_submission_ref IS NOT NULL),
  CHECK (status <> 'REVIEWED' OR human_review_ref IS NOT NULL)
);

CREATE TABLE answer_review_obligations (
  obligation_ref text PRIMARY KEY,
  commitment_ref text NOT NULL REFERENCES blind_review_commitments(commitment_ref),
  slot_ref text NOT NULL,
  interest_ref text NOT NULL REFERENCES candidate_interests(interest_ref),
  candidate_ref text NOT NULL,
  cohort_ref text NOT NULL,
  cohort_seat_ref text NOT NULL,
  credit_hold_ref text NOT NULL UNIQUE REFERENCES credit_holds(credit_hold_ref),
  status text NOT NULL CHECK (status IN (
    'INVITED', 'ANSWER_ACTIVE', 'REVIEW_PENDING', 'REVIEWED', 'SETTLING', 'SETTLED',
    'DECLINED', 'EXPIRED', 'WITHDRAWN', 'BREACHED', 'REMEDIATING',
    'PLATFORM_ABORT', 'BREACH_SETTLED'
  )),
  offer_expires_at timestamptz NOT NULL,
  review_due_at timestamptz,
  answer_submission_ref text,
  human_review_ref text,
  closed_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (obligation_ref, slot_ref),
  FOREIGN KEY (slot_ref, commitment_ref)
    REFERENCES answer_review_slots(slot_ref, commitment_ref),
  FOREIGN KEY (cohort_ref, commitment_ref)
    REFERENCES advancement_cohorts(cohort_ref, commitment_ref),
  FOREIGN KEY (cohort_seat_ref, cohort_ref)
    REFERENCES advancement_cohort_seats(cohort_seat_ref, cohort_ref)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (
      status IN ('SETTLED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'PLATFORM_ABORT', 'BREACH_SETTLED')
      AND closed_at IS NOT NULL
    )
    OR
    (
      status NOT IN ('SETTLED', 'DECLINED', 'EXPIRED', 'WITHDRAWN', 'PLATFORM_ABORT', 'BREACH_SETTLED')
      AND closed_at IS NULL
    )
  )
);

CREATE UNIQUE INDEX one_unsettled_obligation_per_answer_slot
  ON answer_review_obligations(slot_ref)
  WHERE closed_at IS NULL;

CREATE UNIQUE INDEX one_unsettled_obligation_per_interest
  ON answer_review_obligations(interest_ref)
  WHERE closed_at IS NULL;

ALTER TABLE answer_review_slots
  ADD CONSTRAINT answer_review_slots_current_obligation_fk
    FOREIGN KEY (current_obligation_ref, slot_ref)
    REFERENCES answer_review_obligations(obligation_ref, slot_ref)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE advancement_cohort_seats
  ADD CONSTRAINT advancement_cohort_seats_obligation_fk
    FOREIGN KEY (obligation_ref) REFERENCES answer_review_obligations(obligation_ref)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE answer_invitations (
  invitation_ref text PRIMARY KEY,
  obligation_ref text NOT NULL UNIQUE REFERENCES answer_review_obligations(obligation_ref),
  interest_ref text NOT NULL REFERENCES candidate_interests(interest_ref),
  candidate_ref text NOT NULL,
  cohort_ref text NOT NULL REFERENCES advancement_cohorts(cohort_ref),
  cohort_seat_ref text NOT NULL UNIQUE REFERENCES advancement_cohort_seats(cohort_seat_ref),
  question_version_ref text NOT NULL,
  question_hash text NOT NULL CHECK (question_hash ~ '^sha256:[a-f0-9]{64}$'),
  queue_policy_version text NOT NULL CHECK (queue_policy_version = 'onlyboth.interest-queue@1'),
  queue_snapshot_hash text NOT NULL CHECK (queue_snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  public_tie_break text NOT NULL CHECK (public_tie_break ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED')),
  offered_at timestamptz NOT NULL,
  offer_expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (offer_expires_at > offered_at),
  CHECK (
    (status = 'OFFERED' AND decided_at IS NULL)
    OR
    (status <> 'OFFERED' AND decided_at IS NOT NULL)
  )
);

CREATE TABLE answer_sessions (
  answer_session_ref text PRIMARY KEY,
  invitation_ref text NOT NULL UNIQUE REFERENCES answer_invitations(invitation_ref),
  obligation_ref text NOT NULL UNIQUE REFERENCES answer_review_obligations(obligation_ref),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUBMITTED', 'WITHDRAWN', 'PLATFORM_ABORT')),
  started_at timestamptz NOT NULL,
  answer_due_at timestamptz NOT NULL,
  closed_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (answer_due_at > started_at),
  CHECK ((status = 'ACTIVE' AND closed_at IS NULL) OR (status <> 'ACTIVE' AND closed_at IS NOT NULL))
);

CREATE TABLE answer_submissions (
  answer_submission_ref text PRIMARY KEY,
  answer_session_ref text NOT NULL UNIQUE REFERENCES answer_sessions(answer_session_ref),
  invitation_ref text NOT NULL UNIQUE REFERENCES answer_invitations(invitation_ref),
  obligation_ref text NOT NULL UNIQUE REFERENCES answer_review_obligations(obligation_ref),
  interest_ref text NOT NULL REFERENCES candidate_interests(interest_ref),
  candidate_ref text NOT NULL,
  cohort_ref text NOT NULL REFERENCES advancement_cohorts(cohort_ref),
  cohort_seat_ref text NOT NULL UNIQUE REFERENCES advancement_cohort_seats(cohort_seat_ref),
  snapshot_ref text NOT NULL UNIQUE,
  artifact_refs jsonb NOT NULL,
  event_refs jsonb NOT NULL,
  submission_hash text NOT NULL UNIQUE CHECK (submission_hash ~ '^sha256:[a-f0-9]{64}$'),
  submitted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE answer_review_obligations
  ADD CONSTRAINT answer_review_obligations_submission_fk
    FOREIGN KEY (answer_submission_ref) REFERENCES answer_submissions(answer_submission_ref)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE advancement_cohort_seats
  ADD CONSTRAINT advancement_cohort_seats_submission_fk
    FOREIGN KEY (answer_submission_ref) REFERENCES answer_submissions(answer_submission_ref)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE answer_evidence_edges (
  answer_evidence_edge_ref text PRIMARY KEY,
  answer_submission_ref text NOT NULL UNIQUE REFERENCES answer_submissions(answer_submission_ref),
  ai_output_ref text NOT NULL UNIQUE REFERENCES ai_outputs(id),
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  uncertainty_ref text NOT NULL,
  evidence_refs jsonb NOT NULL,
  proof_template_ref text NOT NULL,
  still_unknown jsonb NOT NULL,
  edge_json jsonb NOT NULL,
  edge_hash text NOT NULL UNIQUE CHECK (edge_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE human_answer_reviews (
  human_review_ref text PRIMARY KEY,
  answer_submission_ref text NOT NULL UNIQUE REFERENCES answer_submissions(answer_submission_ref),
  obligation_ref text NOT NULL UNIQUE REFERENCES answer_review_obligations(obligation_ref),
  reviewer_ref text NOT NULL,
  decision text NOT NULL CHECK (decision IN (
    'ADVANCE_ELIGIBLE', 'NO_FURTHER_PROOF', 'INCONCLUSIVE'
  )),
  evidence_refs jsonb NOT NULL,
  still_unknown jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE answer_review_obligations
  ADD CONSTRAINT answer_review_obligations_human_review_fk
    FOREIGN KEY (human_review_ref) REFERENCES human_answer_reviews(human_review_ref)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE advancement_cohort_seats
  ADD CONSTRAINT advancement_cohort_seats_human_review_fk
    FOREIGN KEY (human_review_ref) REFERENCES human_answer_reviews(human_review_ref)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE advancement_allocations (
  advancement_allocation_ref text PRIMARY KEY,
  cohort_ref text NOT NULL UNIQUE REFERENCES advancement_cohorts(cohort_ref),
  direct_answer_submission_ref text NOT NULL REFERENCES answer_submissions(answer_submission_ref),
  explore_answer_submission_ref text NOT NULL REFERENCES answer_submissions(answer_submission_ref),
  public_seed text NOT NULL,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (direct_answer_submission_ref <> explore_answer_submission_ref)
);

CREATE TABLE candidate_activity_leases (
  lease_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  subject_type text NOT NULL CHECK (
    subject_type IN ('ANSWER_REVIEW_OBLIGATION', 'DEEP_PROOF_REVIEW_WINDOW')
  ),
  subject_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'RELEASED')),
  acquired_at timestamptz NOT NULL,
  released_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (subject_type, subject_ref),
  CHECK (
    (status = 'ACTIVE' AND released_at IS NULL)
    OR
    (status = 'RELEASED' AND released_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX one_active_candidate_activity
  ON candidate_activity_leases(candidate_ref)
  WHERE status = 'ACTIVE';

INSERT INTO candidate_activity_leases (
  lease_ref, candidate_ref, opportunity_ref, subject_type, subject_ref,
  status, acquired_at, version
)
SELECT 'activity-lease:legacy-review-window:' || review_window.id,
       review_window.candidate_id,
       review_window.opportunity_id,
       'DEEP_PROOF_REVIEW_WINDOW',
       review_window.id,
       'ACTIVE',
       review_window.created_at,
       1
  FROM review_windows AS review_window
  JOIN opportunities AS opportunity ON opportunity.id = review_window.opportunity_id
 WHERE review_window.state IN (
   'RESERVED', 'STAGE_A_ACTIVE', 'CHECKPOINT_PENDING', 'STAGE_B_ACTIVE',
   'EVIDENCE_READY', 'OUTCOME_RECORDED', 'ASK_BACK_PENDING', 'REVEALED',
   'BREACHED', 'REMEDIATING', 'WITHDRAWN', 'SETTLING'
 );

CREATE TABLE public_opportunity_projections (
  opportunity_ref text PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE employer_blind_review_projections (
  opportunity_ref text PRIMARY KEY REFERENCES opportunities(id) ON DELETE CASCADE,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE candidate_answer_projections (
  opportunity_ref text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  candidate_ref text NOT NULL,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (opportunity_ref, candidate_ref)
);

CREATE TABLE blind_review_command_receipts (
  actor_ref text NOT NULL,
  idempotency_key text NOT NULL,
  command_id text NOT NULL UNIQUE,
  command_fingerprint text NOT NULL,
  command_type text NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (actor_ref, idempotency_key)
);

CREATE TABLE opportunity_closure_receipts (
  closure_receipt_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  interest_ref text NOT NULL UNIQUE REFERENCES candidate_interests(interest_ref),
  candidate_ref text NOT NULL,
  closure_reason_ref text NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE candidate_interests
  ADD CONSTRAINT candidate_interests_closure_receipt_fk
    FOREIGN KEY (closure_receipt_ref)
    REFERENCES opportunity_closure_receipts(closure_receipt_ref)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE stage_a_evidence
  ALTER COLUMN review_window_id DROP NOT NULL,
  ADD COLUMN answer_submission_ref text REFERENCES answer_submissions(answer_submission_ref),
  ADD CONSTRAINT stage_a_evidence_exactly_one_subject CHECK (
    (review_window_id IS NOT NULL)::integer + (answer_submission_ref IS NOT NULL)::integer = 1
  );

CREATE UNIQUE INDEX stage_a_evidence_answer_ordinal_idx
  ON stage_a_evidence(answer_submission_ref, ordinal)
  WHERE answer_submission_ref IS NOT NULL;

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT hiring_intelligence_requests_operation_check,
  ADD COLUMN blind_review_commitment_ref text
    REFERENCES blind_review_commitments(commitment_ref),
  ADD COLUMN advancement_cohort_ref text REFERENCES advancement_cohorts(cohort_ref),
  ADD COLUMN question_version_ref text,
  ADD COLUMN answer_submission_ref text REFERENCES answer_submissions(answer_submission_ref),
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'buildAnswerEvidenceEdge',
    'recommendChallenges', 'compressEvidence'
  ));

ALTER TABLE review_windows
  DROP CONSTRAINT matching_review_window_refs_all_or_none,
  ADD COLUMN advancement_cohort_ref text REFERENCES advancement_cohorts(cohort_ref),
  ADD COLUMN advancement_allocation_ref text REFERENCES advancement_allocations(advancement_allocation_ref),
  ADD COLUMN answer_submission_ref text REFERENCES answer_submissions(answer_submission_ref),
  ADD COLUMN answer_evidence_edge_ref text REFERENCES answer_evidence_edges(answer_evidence_edge_ref),
  ADD CONSTRAINT review_window_subject_shape CHECK (
    (
      matching_cycle_ref IS NULL AND match_edge_ref IS NULL
      AND attention_slot_ref IS NULL AND credit_hold_ref IS NULL
      AND allocation_kind IS NULL AND accept_by IS NULL
      AND advancement_cohort_ref IS NULL AND advancement_allocation_ref IS NULL
      AND answer_submission_ref IS NULL AND answer_evidence_edge_ref IS NULL
    )
    OR
    (
      matching_cycle_ref IS NOT NULL AND match_edge_ref IS NOT NULL
      AND attention_slot_ref IS NOT NULL AND credit_hold_ref IS NOT NULL
      AND allocation_kind IS NOT NULL AND accept_by IS NOT NULL
      AND advancement_cohort_ref IS NULL AND advancement_allocation_ref IS NULL
      AND answer_submission_ref IS NULL AND answer_evidence_edge_ref IS NULL
    )
    OR
    (
      matching_cycle_ref IS NULL AND match_edge_ref IS NULL
      AND attention_slot_ref IS NOT NULL AND credit_hold_ref IS NOT NULL
      AND allocation_kind IS NOT NULL AND accept_by IS NOT NULL
      AND advancement_cohort_ref IS NOT NULL AND advancement_allocation_ref IS NOT NULL
      AND answer_submission_ref IS NOT NULL AND answer_evidence_edge_ref IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION reject_blind_review_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER answer_submissions_immutable
BEFORE UPDATE OR DELETE ON answer_submissions
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER answer_evidence_edges_immutable
BEFORE UPDATE OR DELETE ON answer_evidence_edges
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER human_answer_reviews_immutable
BEFORE UPDATE OR DELETE ON human_answer_reviews
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER advancement_allocations_immutable
BEFORE UPDATE OR DELETE ON advancement_allocations
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER opportunity_closure_receipts_immutable
BEFORE UPDATE OR DELETE ON opportunity_closure_receipts
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER blind_review_command_receipts_immutable
BEFORE UPDATE OR DELETE ON blind_review_command_receipts
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE TRIGGER domain_events_immutable
BEFORE UPDATE OR DELETE ON domain_events
FOR EACH ROW EXECUTE FUNCTION reject_blind_review_immutable_mutation();

CREATE OR REPLACE FUNCTION protect_submitted_advancement_cohort_seat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('ANSWER_SUBMITTED', 'REVIEWED') THEN
    RAISE EXCEPTION 'submitted Advancement Cohort Seat membership is immutable';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('ANSWER_SUBMITTED', 'REVIEWED')
     AND (
       NEW.cohort_ref IS DISTINCT FROM OLD.cohort_ref
       OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
       OR NEW.obligation_ref IS DISTINCT FROM OLD.obligation_ref
       OR NEW.answer_submission_ref IS DISTINCT FROM OLD.answer_submission_ref
     ) THEN
    RAISE EXCEPTION 'submitted Advancement Cohort Seat membership is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER advancement_cohort_seat_membership_immutable
BEFORE UPDATE OR DELETE ON advancement_cohort_seats
FOR EACH ROW EXECUTE FUNCTION protect_submitted_advancement_cohort_seat();
