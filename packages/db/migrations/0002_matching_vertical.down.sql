DROP TRIGGER IF EXISTS credit_ledger_entries_immutable ON credit_ledger_entries;
DROP TRIGGER IF EXISTS allocation_decisions_immutable ON allocation_decisions;
DROP TRIGGER IF EXISTS allocation_runs_immutable ON allocation_runs;
DROP TRIGGER IF EXISTS match_edges_immutable ON match_edges;
DROP TRIGGER IF EXISTS eligibility_edges_immutable ON eligibility_edges;
DROP TRIGGER IF EXISTS candidate_claim_snapshots_immutable ON candidate_claim_snapshots;
DROP TRIGGER IF EXISTS label_policy_versions_immutable ON label_policy_versions;
DROP TRIGGER IF EXISTS sealed_capability_contracts_immutable ON sealed_capability_contracts;
DROP FUNCTION IF EXISTS reject_matching_immutable_mutation();

DROP TABLE IF EXISTS matching_command_receipts;
DROP TABLE IF EXISTS candidate_opportunity_projections;
DROP TABLE IF EXISTS employer_matching_projections;
DROP INDEX IF EXISTS one_active_window_per_candidate;
DROP INDEX IF EXISTS one_unsettled_window_per_slot;
ALTER TABLE credit_holds DROP CONSTRAINT IF EXISTS credit_holds_review_window_fk;
ALTER TABLE review_windows
  DROP CONSTRAINT IF EXISTS matching_review_window_refs_all_or_none,
  DROP COLUMN IF EXISTS release_reason,
  DROP COLUMN IF EXISTS accept_by,
  DROP COLUMN IF EXISTS allocation_kind,
  DROP COLUMN IF EXISTS credit_hold_ref,
  DROP COLUMN IF EXISTS attention_slot_ref,
  DROP COLUMN IF EXISTS match_edge_ref,
  DROP COLUMN IF EXISTS matching_cycle_ref;
DROP TABLE IF EXISTS allocation_decisions;
DROP TABLE IF EXISTS allocation_runs;
DROP TABLE IF EXISTS credit_ledger_entries;
DROP TABLE IF EXISTS credit_holds;
DROP TABLE IF EXISTS credit_accounts;
DROP TABLE IF EXISTS attention_slots;
DROP TABLE IF EXISTS attention_commitments;
DROP TABLE IF EXISTS match_edges;
DROP TABLE IF EXISTS match_edge_evaluations;
ALTER TABLE hiring_intelligence_requests
  DROP COLUMN IF EXISTS claim_snapshot_ref,
  DROP COLUMN IF EXISTS candidate_ref,
  DROP COLUMN IF EXISTS matching_cycle_ref;
DROP TABLE IF EXISTS eligibility_edges;
DROP TABLE IF EXISTS matching_cycles;
DROP TABLE IF EXISTS candidate_interests;
DROP TABLE IF EXISTS candidate_private_labels;
DROP TABLE IF EXISTS candidate_claim_snapshots;
DROP TABLE IF EXISTS label_policy_versions;
DROP TABLE IF EXISTS sealed_capability_contracts;
DROP TABLE IF EXISTS opportunities;

ALTER TABLE review_windows DROP CONSTRAINT IF EXISTS review_windows_state_check;
ALTER TABLE review_windows
  ADD CONSTRAINT review_windows_state_check CHECK (state IN (
    'RESERVED', 'STAGE_A_ACTIVE', 'CHECKPOINT_PENDING', 'STAGE_B_ACTIVE',
    'EVIDENCE_READY', 'OUTCOME_RECORDED', 'ASK_BACK_PENDING', 'REVEALED',
    'BREACHED', 'REMEDIATING', 'WITHDRAWN', 'PLATFORM_ABORT', 'SETTLING', 'SETTLED'
  ));
