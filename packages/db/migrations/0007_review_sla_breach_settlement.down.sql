DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM employer_review_breaches) THEN
    RAISE EXCEPTION 'cannot roll back 0007 while settled Employer Review breaches exist';
  END IF;
END;
$$;

DROP INDEX IF EXISTS answer_review_overdue_scan_idx;
DROP TRIGGER IF EXISTS employer_review_breaches_immutable ON employer_review_breaches;
DROP TABLE employer_review_breaches;
DROP TABLE employer_reliability_accounts;

ALTER TABLE advancement_cohort_seats
  DROP CONSTRAINT advancement_cohort_seats_status_check,
  ADD CONSTRAINT advancement_cohort_seats_status_check CHECK (
    status IN ('OPEN', 'RESERVED', 'ANSWER_SUBMITTED', 'REVIEWED')
  );

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_status_check,
  DROP CONSTRAINT candidate_interests_target_shape_check,
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
      AND contract_version_ref IS NOT NULL
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
