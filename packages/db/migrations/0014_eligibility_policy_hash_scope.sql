ALTER TABLE job_eligibility_match_policies
  DROP CONSTRAINT IF EXISTS job_eligibility_match_policies_policy_hash_key;

CREATE INDEX IF NOT EXISTS job_eligibility_match_policies_hash_idx
  ON job_eligibility_match_policies(policy_hash);
