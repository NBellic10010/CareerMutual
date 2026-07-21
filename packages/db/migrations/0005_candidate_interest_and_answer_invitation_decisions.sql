ALTER TABLE opportunities
  ADD COLUMN required_interest_consent_version text NOT NULL
    DEFAULT 'candidate-interest-consent@1'
    CHECK (char_length(required_interest_consent_version) BETWEEN 1 AND 200);

ALTER TABLE candidate_interests
  ADD COLUMN contract_version_ref text
    REFERENCES sealed_capability_contracts(contract_version_ref);

UPDATE candidate_interests AS interest
   SET contract_version_ref = edge.contract_version_ref
  FROM eligibility_edges AS edge
 WHERE interest.interest_schema_version = 'candidate-interest@1'
   AND edge.eligibility_edge_ref = interest.eligibility_edge_ref
   AND interest.contract_version_ref IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM candidate_interests
     WHERE interest_schema_version = 'candidate-interest@1'
       AND contract_version_ref IS NULL
  ) THEN
    RAISE EXCEPTION
      'cannot apply 0005 while a target Candidate Interest lacks its sealed Contract pin';
  END IF;
END;
$$;

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_target_shape_check,
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

CREATE INDEX answer_invitations_expiry_scan_idx
  ON answer_invitations (offer_expires_at, invitation_ref)
  WHERE status = 'OFFERED';
