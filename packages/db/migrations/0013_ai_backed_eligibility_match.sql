CREATE TABLE eligibility_background_taxonomies (
  taxonomy_version text PRIMARY KEY,
  catalog_hash text NOT NULL CHECK (catalog_hash ~ '^sha256:[a-f0-9]{64}$'),
  tag_count integer NOT NULL CHECK (tag_count = 100),
  sealed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE eligibility_background_tags (
  taxonomy_version text NOT NULL REFERENCES eligibility_background_taxonomies(taxonomy_version),
  tag_ref text NOT NULL,
  tag_kind text NOT NULL CHECK (tag_kind IN ('EDUCATION_FIELD', 'WORK_DOMAIN')),
  public_name text NOT NULL CHECK (char_length(public_name) BETWEEN 2 AND 120),
  capability_ref text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  PRIMARY KEY (taxonomy_version, tag_ref),
  UNIQUE (taxonomy_version, ordinal),
  UNIQUE (taxonomy_version, tag_kind, public_name)
);

INSERT INTO eligibility_background_taxonomies (
  taxonomy_version, catalog_hash, tag_count
) VALUES (
  'eligibility-background-tags@1',
  'sha256:177f1cdc5796e068c565d1246ee37a968b35be3eee34c32864984a78361240d2',
  100
);

WITH education(public_name, ordinal) AS (
  SELECT public_name, ordinality::integer
    FROM unnest(ARRAY[
      'Accounting', 'Animation', 'Architecture', 'Biology', 'Business Administration',
      'Chemical Engineering', 'Civil Engineering', 'Communications', 'Computer Engineering',
      'Computer Science', 'Construction Management', 'Cybersecurity', 'Data Science',
      'Economics', 'Electrical Engineering', 'English', 'Environmental Science',
      'Film and Media Studies', 'Finance', 'Fine Arts', 'Game Design', 'Graphic Design',
      'Healthcare Administration', 'Human Resources Management', 'Illustration',
      'Industrial Design', 'Information Systems', 'Journalism', 'Law', 'Legal Studies',
      'Logistics', 'Marketing', 'Mathematics', 'Mechanical Engineering', 'Nursing',
      'Operations Management', 'Organizational Psychology', 'Physics', 'Product Design',
      'Psychology', 'Public Health', 'Public Relations', 'Sales Management', 'Sociology',
      'Software Engineering', 'Statistics', 'Supply Chain Management', 'Sustainability',
      'Technical Writing', 'Urban Planning'
    ]::text[]) WITH ORDINALITY AS item(public_name, ordinality)
),
work(public_name, ordinal) AS (
  SELECT public_name, (ordinality + 50)::integer
    FROM unnest(ARRAY[
      'Accounting Operations', 'Animation Production', 'Backend Engineering',
      'Brand Illustration', 'Business Development', 'Cloud Infrastructure',
      'Compliance Operations', 'Construction Project Management', 'Content Strategy',
      'Corporate Finance', 'Customer Success', 'Cybersecurity Operations', 'Data Engineering',
      'Data Privacy', 'Data Science and Analytics', 'Demand Generation', 'Distributed Systems',
      'Enterprise Partnerships', 'Enterprise Sales', 'Environmental Programs',
      'Financial Planning and Analysis', 'Game Art', 'Growth Marketing',
      'Healthcare Operations', 'Human Resources Operations',
      'Illustration and Visual Development', 'Information Technology Operations',
      'Legal Operations', 'Logistics Operations', 'Machine Learning Engineering',
      'Marketing Operations', 'Mobile Engineering', 'Operations Strategy',
      'Payments Engineering', 'People Operations', 'Product Design', 'Product Management',
      'Program Management', 'Quality Assurance Engineering', 'Recruiting Operations',
      'Regional Sales Leadership', 'Reliability Engineering', 'Revenue Operations',
      'Sales Enablement', 'Strategic Sourcing', 'Supply Chain Operations',
      'Sustainability Programs', 'Technical Program Management', 'User Experience Research',
      'Visual Identity Design'
    ]::text[]) WITH ORDINALITY AS item(public_name, ordinality)
),
catalog AS (
  SELECT public_name, ordinal, 'EDUCATION_FIELD'::text AS tag_kind, 'education'::text AS namespace
    FROM education
  UNION ALL
  SELECT public_name, ordinal, 'WORK_DOMAIN'::text, 'work'::text
    FROM work
)
INSERT INTO eligibility_background_tags (
  taxonomy_version, tag_ref, tag_kind, public_name, capability_ref, ordinal
)
SELECT 'eligibility-background-tags@1',
       'eligibility-tag:' || namespace || ':' ||
         trim(both '-' FROM regexp_replace(lower(public_name), '[^a-z0-9]+', '-', 'g')) || '@1',
       tag_kind,
       public_name,
       'background-capability:' || namespace || ':' ||
         trim(both '-' FROM regexp_replace(lower(public_name), '[^a-z0-9]+', '-', 'g')) || '@1',
       ordinal
  FROM catalog
 ORDER BY ordinal;

CREATE TABLE job_eligibility_match_policies (
  policy_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL UNIQUE REFERENCES opportunities(id),
  contract_version_ref text NOT NULL UNIQUE REFERENCES sealed_capability_contracts(contract_version_ref),
  policy_version text NOT NULL CHECK (policy_version = 'eligibility-match-policy@1'),
  access_mode text NOT NULL CHECK (access_mode IN ('OPEN_TO_ALL', 'EVIDENCE_MATCH_REQUIRED')),
  taxonomy_version text REFERENCES eligibility_background_taxonomies(taxonomy_version),
  accepted_tags_json jsonb NOT NULL,
  policy_hash text NOT NULL CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
  sealed_at timestamptz NOT NULL,
  CHECK (jsonb_typeof(accepted_tags_json) = 'array'),
  CHECK (jsonb_array_length(accepted_tags_json) <= 20),
  CHECK (
    (access_mode = 'OPEN_TO_ALL'
      AND taxonomy_version IS NULL
      AND jsonb_array_length(accepted_tags_json) = 0)
    OR
    (access_mode = 'EVIDENCE_MATCH_REQUIRED'
      AND taxonomy_version = 'eligibility-background-tags@1'
      AND jsonb_array_length(accepted_tags_json) BETWEEN 1 AND 20)
  ),
  CHECK (
    jsonb_array_length(
      jsonb_path_query_array(accepted_tags_json, '$[*] ? (@.source == "RECRUITER_CUSTOM")')
    ) <= 5
  )
);

CREATE INDEX job_eligibility_match_policies_hash_idx
  ON job_eligibility_match_policies(policy_hash);

INSERT INTO job_eligibility_match_policies (
  policy_ref, opportunity_ref, contract_version_ref, policy_version, access_mode,
  taxonomy_version, accepted_tags_json, policy_hash, sealed_at
)
SELECT 'eligibility-policy:legacy:' || contract.opportunity_ref,
       contract.opportunity_ref,
       contract.contract_version_ref,
       'eligibility-match-policy@1',
       'OPEN_TO_ALL',
       NULL,
       '[]'::jsonb,
       contract.contract_hash,
       contract.sealed_at
  FROM sealed_capability_contracts AS contract;

CREATE TABLE candidate_eligibility_match_sets (
  match_set_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  passport_snapshot_ref text NOT NULL
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  job_set_hash text NOT NULL CHECK (job_set_hash ~ '^sha256:[a-f0-9]{64}$'),
  ai_request_ref text UNIQUE REFERENCES hiring_intelligence_requests(id),
  ai_output_ref text UNIQUE REFERENCES ai_outputs(id),
  status text NOT NULL CHECK (
    status IN ('MATCHING', 'READY', 'PARTIAL', 'NEEDS_HUMAN', 'FAILED', 'STALE', 'SUPERSEDED')
  ),
  reason_code text,
  recorded_live boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK (
    (status = 'MATCHING' AND completed_at IS NULL)
    OR (status <> 'MATCHING' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX candidate_eligibility_match_sets_candidate_idx
  ON candidate_eligibility_match_sets(candidate_ref, created_at DESC, match_set_ref);

CREATE TABLE candidate_job_eligibility_matches (
  match_ref text PRIMARY KEY,
  match_set_ref text NOT NULL REFERENCES candidate_eligibility_match_sets(match_set_ref),
  candidate_ref text NOT NULL,
  passport_snapshot_ref text NOT NULL
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  opportunity_version integer NOT NULL CHECK (opportunity_version > 0),
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  policy_ref text NOT NULL REFERENCES job_eligibility_match_policies(policy_ref),
  state text NOT NULL CHECK (state IN ('POSITIVE_EVIDENCE', 'NO_POSITIVE_EVIDENCE')),
  match_json jsonb NOT NULL,
  output_hash text NOT NULL CHECK (output_hash ~ '^sha256:[a-f0-9]{64}$'),
  recorded_live boolean NOT NULL DEFAULT false,
  match_version integer NOT NULL DEFAULT 1 CHECK (match_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (match_set_ref, opportunity_ref)
);

CREATE INDEX candidate_job_eligibility_current_idx
  ON candidate_job_eligibility_matches(
    candidate_ref, passport_snapshot_ref, opportunity_ref, created_at DESC, match_ref
  );

CREATE TABLE candidate_eligibility_projections (
  candidate_ref text PRIMARY KEY,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  passport_snapshot_ref text REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  status text NOT NULL CHECK (status IN ('MATCHING', 'READY', 'PARTIAL', 'FAILED', 'STALE')),
  reason_code text,
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT hiring_intelligence_requests_operation_check,
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'buildAnswerEvidenceEdge',
    'recommendChallenges', 'compressEvidence', 'deriveCandidateJobSignals',
    'deriveCandidateEligibilityMatches'
  ));

ALTER TABLE eligibility_edges
  ADD COLUMN edge_schema_version text NOT NULL DEFAULT 'eligibility-edge@1',
  ADD COLUMN background_access_basis text CHECK (
    background_access_basis IS NULL
    OR background_access_basis IN ('OPEN_TO_ALL', 'AI_POSITIVE_EVIDENCE')
  ),
  ADD COLUMN eligibility_policy_ref text REFERENCES job_eligibility_match_policies(policy_ref),
  ADD COLUMN passport_snapshot_ref text
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  ADD COLUMN eligibility_match_ref text REFERENCES candidate_job_eligibility_matches(match_ref);

ALTER TABLE candidate_interests
  ADD COLUMN background_access_basis text CHECK (
    background_access_basis IS NULL
    OR background_access_basis IN ('OPEN_TO_ALL', 'AI_POSITIVE_EVIDENCE')
  ),
  ADD COLUMN passport_snapshot_ref text
    REFERENCES candidate_evidence_passport_snapshots(snapshot_ref),
  ADD COLUMN eligibility_match_ref text REFERENCES candidate_job_eligibility_matches(match_ref);

ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_target_shape_check,
  ADD CONSTRAINT candidate_interests_target_shape_check CHECK (
    interest_schema_version = 'candidate-interest@legacy'
    OR (
      interest_schema_version IN ('candidate-interest@1', 'candidate-interest@2')
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
      AND (
        interest_schema_version = 'candidate-interest@1'
        OR (
          background_access_basis IS NOT NULL
          AND (
            (background_access_basis = 'OPEN_TO_ALL'
              AND passport_snapshot_ref IS NULL AND eligibility_match_ref IS NULL)
            OR
            (background_access_basis = 'AI_POSITIVE_EVIDENCE'
              AND passport_snapshot_ref IS NOT NULL AND eligibility_match_ref IS NOT NULL)
          )
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION reject_candidate_eligibility_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER eligibility_background_taxonomies_immutable
BEFORE UPDATE OR DELETE ON eligibility_background_taxonomies
FOR EACH ROW EXECUTE FUNCTION reject_candidate_eligibility_immutable_mutation();

CREATE TRIGGER eligibility_background_tags_immutable
BEFORE UPDATE OR DELETE ON eligibility_background_tags
FOR EACH ROW EXECUTE FUNCTION reject_candidate_eligibility_immutable_mutation();

CREATE TRIGGER job_eligibility_match_policies_immutable
BEFORE UPDATE OR DELETE ON job_eligibility_match_policies
FOR EACH ROW EXECUTE FUNCTION reject_candidate_eligibility_immutable_mutation();

CREATE TRIGGER candidate_job_eligibility_matches_immutable
BEFORE UPDATE OR DELETE ON candidate_job_eligibility_matches
FOR EACH ROW EXECUTE FUNCTION reject_candidate_eligibility_immutable_mutation();
