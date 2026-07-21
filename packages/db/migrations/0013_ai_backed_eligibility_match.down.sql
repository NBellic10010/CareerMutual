DROP TRIGGER IF EXISTS candidate_job_eligibility_matches_immutable
  ON candidate_job_eligibility_matches;
DROP TRIGGER IF EXISTS job_eligibility_match_policies_immutable
  ON job_eligibility_match_policies;
DROP TRIGGER IF EXISTS eligibility_background_tags_immutable
  ON eligibility_background_tags;
DROP TRIGGER IF EXISTS eligibility_background_taxonomies_immutable
  ON eligibility_background_taxonomies;
DROP FUNCTION IF EXISTS reject_candidate_eligibility_immutable_mutation();

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_target_shape_check;

ALTER TABLE candidate_interests
  DROP COLUMN IF EXISTS eligibility_match_ref,
  DROP COLUMN IF EXISTS passport_snapshot_ref,
  DROP COLUMN IF EXISTS background_access_basis;

ALTER TABLE candidate_interests
  ADD CONSTRAINT candidate_interests_target_shape_check CHECK (
    interest_schema_version = 'candidate-interest@legacy'
    OR (
      interest_schema_version = 'candidate-interest@1'
      AND consent_version IS NOT NULL
      AND hard_facts_json IS NOT NULL
      AND contract_version_ref IS NOT NULL
      AND queue_policy_version = 'onlyboth.interest-queue@1'
      AND eligibility_edge_ref IS NOT NULL
      AND (
        status NOT IN (
          'WAITING_FOR_BACKED_SLOT', 'BACKED_OFFERED', 'APPLICATION_ACTIVE',
          'APPLICATION_SUBMITTED', 'REVIEWED'
        )
        OR (eligible_at IS NOT NULL AND queue_tie_break ~ '^sha256:[a-f0-9]{64}$')
      )
    )
  );

ALTER TABLE eligibility_edges
  DROP COLUMN IF EXISTS eligibility_match_ref,
  DROP COLUMN IF EXISTS passport_snapshot_ref,
  DROP COLUMN IF EXISTS eligibility_policy_ref,
  DROP COLUMN IF EXISTS background_access_basis,
  DROP COLUMN IF EXISTS edge_schema_version;

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT hiring_intelligence_requests_operation_check,
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'buildAnswerEvidenceEdge',
    'recommendChallenges', 'compressEvidence', 'deriveCandidateJobSignals'
  ));

DROP TABLE IF EXISTS candidate_eligibility_projections;
DROP TABLE IF EXISTS candidate_job_eligibility_matches;
DROP TABLE IF EXISTS candidate_eligibility_match_sets;
DROP TABLE IF EXISTS job_eligibility_match_policies;
DROP TABLE IF EXISTS eligibility_background_tags;
DROP TABLE IF EXISTS eligibility_background_taxonomies;
