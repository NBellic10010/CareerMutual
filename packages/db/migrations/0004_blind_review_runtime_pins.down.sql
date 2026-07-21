DO $$
BEGIN
  IF EXISTS (
    SELECT cohort_seat_ref
      FROM answer_invitations
     GROUP BY cohort_seat_ref
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'cannot roll back 0004 after an Advancement Cohort Seat has been reused';
  END IF;
END;
$$;

DROP INDEX IF EXISTS one_active_invitation_per_cohort_seat;
ALTER TABLE answer_invitations
  ADD CONSTRAINT answer_invitations_cohort_seat_ref_key UNIQUE (cohort_seat_ref);

DROP INDEX IF EXISTS one_answer_review_hold_per_reservation;
ALTER TABLE credit_holds
  DROP CONSTRAINT IF EXISTS answer_review_credit_hold_shape,
  DROP CONSTRAINT IF EXISTS credit_holds_answer_review_reservation_fk,
  DROP COLUMN IF EXISTS reservation_ref,
  ADD CONSTRAINT answer_review_credit_hold_shape CHECK (
    purpose <> 'ANSWER_REVIEW'
    OR (subject_ref IS NOT NULL AND review_window_ref IS NULL)
  );

DROP TABLE IF EXISTS answer_review_slot_credit_reservations;

ALTER TABLE attention_commitments
  DROP COLUMN IF EXISTS question_hash,
  DROP COLUMN IF EXISTS question_version_ref,
  DROP COLUMN IF EXISTS reviewer_display_name;

ALTER TABLE opportunities
  DROP COLUMN IF EXISTS synthetic,
  DROP COLUMN IF EXISTS runtime_mode;
