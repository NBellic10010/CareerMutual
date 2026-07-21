ALTER TABLE review_windows DROP CONSTRAINT IF EXISTS review_windows_state_check;
ALTER TABLE review_windows
  ADD CONSTRAINT review_windows_state_check CHECK (state IN (
    'RESERVED', 'RELEASED', 'STAGE_A_ACTIVE', 'CHECKPOINT_PENDING', 'STAGE_B_ACTIVE',
    'EVIDENCE_READY', 'OUTCOME_RECORDED', 'ASK_BACK_PENDING', 'REVEALED',
    'BREACHED', 'REMEDIATING', 'WITHDRAWN', 'PLATFORM_ABORT', 'SETTLING', 'SETTLED'
  ));

CREATE TABLE opportunities (
  id text PRIMARY KEY,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN', 'CLOSED')),
  reviewer_id text NOT NULL,
  current_contract_version_ref text NOT NULL,
  current_label_policy_version_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sealed_capability_contracts (
  contract_version_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  contract_hash text NOT NULL UNIQUE CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  contract_json jsonb NOT NULL,
  sealed_at timestamptz NOT NULL
);

CREATE TABLE label_policy_versions (
  label_policy_version_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  policy_hash text NOT NULL UNIQUE CHECK (policy_hash ~ '^sha256:[a-f0-9]{64}$'),
  policy_json jsonb NOT NULL,
  sealed_at timestamptz NOT NULL
);

CREATE TABLE candidate_claim_snapshots (
  claim_snapshot_ref text PRIMARY KEY,
  candidate_ref text NOT NULL,
  snapshot_version integer NOT NULL CHECK (snapshot_version > 0),
  consent_version text NOT NULL,
  hard_facts_json jsonb NOT NULL,
  claims_json jsonb NOT NULL,
  source_refs_json jsonb NOT NULL,
  snapshot_hash text NOT NULL UNIQUE CHECK (snapshot_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (candidate_ref, snapshot_version)
);

CREATE TABLE candidate_private_labels (
  candidate_ref text PRIMARY KEY,
  synthetic boolean NOT NULL DEFAULT false,
  encrypted_payload bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE candidate_interests (
  interest_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  candidate_ref text NOT NULL,
  claim_snapshot_ref text NOT NULL REFERENCES candidate_claim_snapshots(claim_snapshot_ref),
  status text NOT NULL CHECK (status IN ('SUBMITTED', 'ELIGIBLE', 'INELIGIBLE')),
  submitted_at timestamptz NOT NULL,
  UNIQUE (opportunity_ref, candidate_ref)
);

CREATE TABLE matching_cycles (
  matching_cycle_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  expected_interest_count integer NOT NULL CHECK (expected_interest_count > 0),
  eligible_count integer NOT NULL DEFAULT 0 CHECK (eligible_count >= 0),
  propose_count integer NOT NULL DEFAULT 0 CHECK (propose_count >= 0),
  abstain_count integer NOT NULL DEFAULT 0 CHECK (abstain_count >= 0),
  needs_human_count integer NOT NULL DEFAULT 0 CHECK (needs_human_count >= 0),
  state text NOT NULL CHECK (state IN (
    'EVALUATING', 'NEEDS_HUMAN', 'READY_FOR_DIRECT', 'ALLOCATED'
  )),
  version integer NOT NULL CHECK (version > 0),
  public_seed text NOT NULL,
  allocator_version text NOT NULL,
  runtime_mode text NOT NULL CHECK (runtime_mode IN ('LIVE', 'CACHED_AI', 'GOLDEN_REPLAY')),
  replay_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (opportunity_ref, contract_version_ref)
);

CREATE TABLE eligibility_edges (
  eligibility_edge_ref text PRIMARY KEY,
  matching_cycle_ref text NOT NULL REFERENCES matching_cycles(matching_cycle_ref),
  candidate_ref text NOT NULL,
  claim_snapshot_ref text NOT NULL REFERENCES candidate_claim_snapshots(claim_snapshot_ref),
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  eligible boolean NOT NULL,
  predicate_results_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (matching_cycle_ref, candidate_ref)
);

ALTER TABLE hiring_intelligence_requests
  ADD COLUMN matching_cycle_ref text REFERENCES matching_cycles(matching_cycle_ref),
  ADD COLUMN candidate_ref text,
  ADD COLUMN claim_snapshot_ref text REFERENCES candidate_claim_snapshots(claim_snapshot_ref);

CREATE TABLE match_edge_evaluations (
  matching_cycle_ref text NOT NULL REFERENCES matching_cycles(matching_cycle_ref),
  candidate_ref text NOT NULL,
  request_id text NOT NULL UNIQUE REFERENCES hiring_intelligence_requests(id),
  ai_output_ref text REFERENCES ai_outputs(id),
  decision text NOT NULL CHECK (decision IN ('PROPOSE', 'ABSTAIN', 'NEEDS_HUMAN')),
  reason_code text,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (matching_cycle_ref, candidate_ref)
);

CREATE TABLE match_edges (
  match_edge_ref text PRIMARY KEY,
  matching_cycle_ref text NOT NULL REFERENCES matching_cycles(matching_cycle_ref),
  matching_cycle_version integer NOT NULL CHECK (matching_cycle_version > 0),
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  candidate_ref text NOT NULL,
  contract_version_ref text NOT NULL REFERENCES sealed_capability_contracts(contract_version_ref),
  contract_hash text NOT NULL CHECK (contract_hash ~ '^sha256:[a-f0-9]{64}$'),
  claim_snapshot_ref text NOT NULL REFERENCES candidate_claim_snapshots(claim_snapshot_ref),
  claim_snapshot_version integer NOT NULL CHECK (claim_snapshot_version > 0),
  ai_output_ref text NOT NULL UNIQUE REFERENCES ai_outputs(id),
  uncertainty_ref text NOT NULL,
  claim_refs jsonb NOT NULL,
  proof_template_ref text NOT NULL,
  source_refs jsonb NOT NULL,
  edge_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (matching_cycle_ref, candidate_ref)
);

CREATE TABLE attention_commitments (
  commitment_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL UNIQUE REFERENCES opportunities(id),
  reviewer_ref text NOT NULL,
  active_wip integer NOT NULL CHECK (active_wip > 0),
  direct_slots integer NOT NULL CHECK (direct_slots >= 0),
  explore_slots integer NOT NULL CHECK (explore_slots >= 0),
  credit_per_window integer NOT NULL CHECK (credit_per_window > 0),
  accept_sla_hours integer NOT NULL CHECK (accept_sla_hours > 0),
  checkpoint_sla_seconds integer NOT NULL CHECK (checkpoint_sla_seconds > 0),
  final_review_sla_hours integer NOT NULL CHECK (final_review_sla_hours > 0),
  version integer NOT NULL CHECK (version > 0),
  CHECK (active_wip = direct_slots + explore_slots)
);

CREATE TABLE attention_slots (
  slot_ref text PRIMARY KEY,
  commitment_ref text NOT NULL REFERENCES attention_commitments(commitment_ref),
  slot_kind text NOT NULL CHECK (slot_kind IN ('DIRECT', 'EXPLORE')),
  status text NOT NULL CHECK (status IN ('AVAILABLE', 'HELD', 'RETIRED')),
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (commitment_ref, slot_kind)
);

CREATE TABLE credit_accounts (
  account_ref text PRIMARY KEY,
  opportunity_ref text NOT NULL UNIQUE REFERENCES opportunities(id),
  available_credits integer NOT NULL CHECK (available_credits >= 0),
  held_credits integer NOT NULL CHECK (held_credits >= 0),
  version integer NOT NULL CHECK (version > 0)
);

CREATE TABLE credit_holds (
  credit_hold_ref text PRIMARY KEY,
  account_ref text NOT NULL REFERENCES credit_accounts(account_ref),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('HELD', 'RETURNED', 'FORFEITED')),
  review_window_ref text UNIQUE,
  created_at timestamptz NOT NULL,
  settled_at timestamptz
);

CREATE TABLE credit_ledger_entries (
  ledger_entry_ref text PRIMARY KEY,
  account_ref text NOT NULL REFERENCES credit_accounts(account_ref),
  credit_hold_ref text NOT NULL REFERENCES credit_holds(credit_hold_ref),
  entry_type text NOT NULL CHECK (entry_type IN ('HOLD', 'RETURN', 'FORFEIT')),
  amount integer NOT NULL CHECK (amount > 0),
  occurred_at timestamptz NOT NULL
);

CREATE TABLE allocation_runs (
  allocation_run_ref text PRIMARY KEY,
  matching_cycle_ref text NOT NULL UNIQUE REFERENCES matching_cycles(matching_cycle_ref),
  matching_cycle_version integer NOT NULL,
  commitment_ref text NOT NULL REFERENCES attention_commitments(commitment_ref),
  commitment_version integer NOT NULL,
  algorithm_version text NOT NULL,
  public_seed text NOT NULL,
  direct_match_edge_ref text NOT NULL REFERENCES match_edges(match_edge_ref),
  created_at timestamptz NOT NULL
);

CREATE TABLE allocation_decisions (
  allocation_run_ref text NOT NULL REFERENCES allocation_runs(allocation_run_ref),
  allocation_kind text NOT NULL CHECK (allocation_kind IN ('DIRECT', 'EXPLORE')),
  candidate_ref text NOT NULL,
  match_edge_ref text NOT NULL REFERENCES match_edges(match_edge_ref),
  public_hash text,
  review_window_ref text NOT NULL UNIQUE,
  PRIMARY KEY (allocation_run_ref, allocation_kind),
  UNIQUE (allocation_run_ref, candidate_ref)
);

ALTER TABLE review_windows
  ADD COLUMN matching_cycle_ref text REFERENCES matching_cycles(matching_cycle_ref),
  ADD COLUMN match_edge_ref text REFERENCES match_edges(match_edge_ref),
  ADD COLUMN attention_slot_ref text REFERENCES attention_slots(slot_ref),
  ADD COLUMN credit_hold_ref text REFERENCES credit_holds(credit_hold_ref),
  ADD COLUMN allocation_kind text CHECK (allocation_kind IN ('DIRECT', 'EXPLORE')),
  ADD COLUMN accept_by timestamptz,
  ADD COLUMN release_reason text CHECK (release_reason IN ('CANDIDATE_DECLINED', 'PRESTART_EXPIRED')),
  ADD CONSTRAINT matching_review_window_refs_all_or_none CHECK (
    (matching_cycle_ref IS NULL AND match_edge_ref IS NULL AND attention_slot_ref IS NULL
      AND credit_hold_ref IS NULL AND allocation_kind IS NULL AND accept_by IS NULL)
    OR
    (matching_cycle_ref IS NOT NULL AND match_edge_ref IS NOT NULL AND attention_slot_ref IS NOT NULL
      AND credit_hold_ref IS NOT NULL AND allocation_kind IS NOT NULL AND accept_by IS NOT NULL)
  );

ALTER TABLE credit_holds
  ADD CONSTRAINT credit_holds_review_window_fk
  FOREIGN KEY (review_window_ref) REFERENCES review_windows(id);

CREATE UNIQUE INDEX one_unsettled_window_per_slot
  ON review_windows(attention_slot_ref)
  WHERE attention_slot_ref IS NOT NULL AND state NOT IN ('RELEASED', 'PLATFORM_ABORT', 'SETTLED');

CREATE UNIQUE INDEX one_active_window_per_candidate
  ON review_windows(candidate_id)
  WHERE state IN (
    'RESERVED', 'STAGE_A_ACTIVE', 'CHECKPOINT_PENDING', 'STAGE_B_ACTIVE',
    'EVIDENCE_READY', 'OUTCOME_RECORDED', 'ASK_BACK_PENDING', 'REVEALED',
    'BREACHED', 'REMEDIATING', 'WITHDRAWN', 'SETTLING'
  );

CREATE TABLE employer_matching_projections (
  opportunity_ref text PRIMARY KEY REFERENCES opportunities(id),
  reviewer_ref text NOT NULL,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE candidate_opportunity_projections (
  opportunity_ref text NOT NULL REFERENCES opportunities(id),
  candidate_ref text NOT NULL,
  projection_version integer NOT NULL CHECK (projection_version > 0),
  projection_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (opportunity_ref, candidate_ref)
);

CREATE TABLE matching_command_receipts (
  actor_ref text NOT NULL,
  idempotency_key text NOT NULL,
  command_fingerprint text NOT NULL,
  command_type text NOT NULL,
  receipt_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (actor_ref, idempotency_key)
);

CREATE OR REPLACE FUNCTION reject_matching_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER sealed_capability_contracts_immutable
BEFORE UPDATE OR DELETE ON sealed_capability_contracts
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER label_policy_versions_immutable
BEFORE UPDATE OR DELETE ON label_policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER candidate_claim_snapshots_immutable
BEFORE UPDATE OR DELETE ON candidate_claim_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER eligibility_edges_immutable
BEFORE UPDATE OR DELETE ON eligibility_edges
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER match_edges_immutable
BEFORE UPDATE OR DELETE ON match_edges
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER allocation_runs_immutable
BEFORE UPDATE OR DELETE ON allocation_runs
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER allocation_decisions_immutable
BEFORE UPDATE OR DELETE ON allocation_decisions
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
CREATE TRIGGER credit_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON credit_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_matching_immutable_mutation();
