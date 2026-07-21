ALTER TABLE candidate_interests
  DROP CONSTRAINT candidate_interests_status_check,
  DROP CONSTRAINT candidate_interests_target_shape_check,
  ADD CONSTRAINT candidate_interests_status_check CHECK (status IN (
    'SUBMITTED', 'ELIGIBLE', 'INELIGIBLE',
    'INTEREST_RECEIVED', 'INELIGIBLE_HARD_REQUIREMENT', 'WAITING_FOR_BACKED_SLOT',
    'BACKED_OFFERED', 'APPLICATION_ACTIVE', 'APPLICATION_SUBMITTED', 'REVIEWED',
    'EMPLOYER_BREACH', 'OFFER_DECLINED', 'OFFER_EXPIRED',
    'OPPORTUNITY_PAUSED', 'OPPORTUNITY_CLOSED'
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
            'APPLICATION_ACTIVE', 'APPLICATION_SUBMITTED', 'REVIEWED', 'EMPLOYER_BREACH',
            'OFFER_DECLINED', 'OFFER_EXPIRED', 'OPPORTUNITY_PAUSED', 'OPPORTUNITY_CLOSED'
          )
          AND eligibility_edge_ref IS NOT NULL
        )
      )
      AND (
        status NOT IN (
          'WAITING_FOR_BACKED_SLOT', 'BACKED_OFFERED', 'APPLICATION_ACTIVE',
          'APPLICATION_SUBMITTED', 'REVIEWED', 'EMPLOYER_BREACH'
        )
        OR (
          eligible_at IS NOT NULL
          AND queue_tie_break ~ '^sha256:[a-f0-9]{64}$'
        )
      )
    )
  );

ALTER TABLE advancement_cohort_seats
  DROP CONSTRAINT advancement_cohort_seats_status_check,
  ADD CONSTRAINT advancement_cohort_seats_status_check CHECK (
    status IN ('OPEN', 'RESERVED', 'ANSWER_SUBMITTED', 'REVIEWED', 'BREACH_SETTLED')
  );

CREATE TABLE employer_reliability_accounts (
  reviewer_ref text PRIMARY KEY,
  settled_breach_count integer NOT NULL DEFAULT 0 CHECK (settled_breach_count >= 0),
  penalty_points integer NOT NULL DEFAULT 0 CHECK (penalty_points >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE employer_review_breaches (
  breach_ref text PRIMARY KEY,
  obligation_ref text NOT NULL UNIQUE REFERENCES answer_review_obligations(obligation_ref),
  answer_submission_ref text NOT NULL REFERENCES answer_submissions(answer_submission_ref),
  candidate_ref text NOT NULL,
  reviewer_ref text NOT NULL REFERENCES employer_reliability_accounts(reviewer_ref),
  slot_ref text NOT NULL REFERENCES answer_review_slots(slot_ref),
  notice_code text NOT NULL CHECK (notice_code = 'HUMAN_REVIEW_SLA_EXPIRED'),
  candidate_credit_account_ref text NOT NULL REFERENCES candidate_credit_accounts(account_ref),
  candidate_credit_return_ledger_ref text NOT NULL UNIQUE
    REFERENCES candidate_credit_ledger_entries(ledger_entry_ref),
  employer_credit_hold_ref text NOT NULL UNIQUE REFERENCES credit_holds(credit_hold_ref),
  employer_credit_forfeit_ledger_ref text NOT NULL UNIQUE
    REFERENCES credit_ledger_entries(ledger_entry_ref),
  employer_wallet_forfeit_ledger_ref text NOT NULL UNIQUE
    REFERENCES employer_attention_wallet_ledger(ledger_entry_ref),
  reliability_penalty_points integer NOT NULL CHECK (reliability_penalty_points > 0),
  breached_at timestamptz NOT NULL
);

CREATE TRIGGER employer_review_breaches_immutable
BEFORE UPDATE OR DELETE ON employer_review_breaches
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();

CREATE INDEX answer_review_overdue_scan_idx
  ON answer_review_obligations (review_due_at, obligation_ref)
  WHERE status = 'REVIEW_PENDING';
