DROP INDEX IF EXISTS answer_invitations_expiry_scan_idx;

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_target_shape_check,
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
  ),
  DROP COLUMN contract_version_ref;

ALTER TABLE opportunities
  DROP COLUMN required_interest_consent_version;
