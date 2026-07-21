ALTER TABLE opportunities
  ADD COLUMN runtime_mode text NOT NULL DEFAULT 'LIVE' CHECK (
    runtime_mode IN ('LIVE', 'CACHED_AI', 'GOLDEN_REPLAY')
  ),
  ADD COLUMN synthetic boolean NOT NULL DEFAULT false;

ALTER TABLE attention_commitments
  ADD COLUMN reviewer_display_name text,
  ADD COLUMN question_version_ref text,
  ADD COLUMN question_hash text CHECK (
    question_hash IS NULL OR question_hash ~ '^sha256:[a-f0-9]{64}$'
  );

CREATE TABLE answer_review_slot_credit_reservations (
  reservation_ref text PRIMARY KEY,
  slot_ref text NOT NULL UNIQUE REFERENCES answer_review_slots(slot_ref),
  account_ref text NOT NULL REFERENCES credit_accounts(account_ref),
  amount integer NOT NULL CHECK (amount > 0),
  state text NOT NULL CHECK (state IN ('RESERVED', 'BOUND', 'RELEASED')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE credit_holds
  DROP CONSTRAINT answer_review_credit_hold_shape,
  ADD COLUMN reservation_ref text,
  ADD CONSTRAINT credit_holds_answer_review_reservation_fk
    FOREIGN KEY (reservation_ref)
    REFERENCES answer_review_slot_credit_reservations(reservation_ref),
  ADD CONSTRAINT answer_review_credit_hold_shape CHECK (
    purpose <> 'ANSWER_REVIEW'
    OR (
      subject_ref IS NOT NULL
      AND reservation_ref IS NOT NULL
      AND review_window_ref IS NULL
    )
  );

CREATE UNIQUE INDEX one_answer_review_hold_per_reservation
  ON credit_holds(reservation_ref)
  WHERE purpose = 'ANSWER_REVIEW' AND status = 'HELD';

ALTER TABLE answer_invitations
  DROP CONSTRAINT answer_invitations_cohort_seat_ref_key;

CREATE UNIQUE INDEX one_active_invitation_per_cohort_seat
  ON answer_invitations(cohort_seat_ref)
  WHERE status IN ('OFFERED', 'ACCEPTED');
