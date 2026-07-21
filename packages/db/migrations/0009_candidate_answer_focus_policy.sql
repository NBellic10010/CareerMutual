ALTER TABLE answer_terms_acceptances
  ADD COLUMN sandbox_focus_policy_version text NOT NULL
    DEFAULT 'sandbox-focus-policy@legacy-unmonitored',
  ADD COLUMN focus_tracking_disclosure_version text NOT NULL
    DEFAULT 'sandbox-focus-disclosure@legacy-unmonitored';

ALTER TABLE answer_sessions
  DROP CONSTRAINT answer_sessions_status_check,
  DROP CONSTRAINT answer_session_submission_shape,
  DROP CONSTRAINT answer_sessions_submission_source_check,
  ADD CONSTRAINT answer_sessions_status_check CHECK (
    status IN (
      'ACTIVE', 'SUBMITTED', 'EXPIRED_EMPTY', 'FOCUS_POLICY_TERMINATED_EMPTY',
      'WITHDRAWN', 'PLATFORM_ABORT'
    )
  ),
  ADD CONSTRAINT answer_sessions_submission_source_check CHECK (
    submission_source IS NULL
    OR submission_source IN ('MANUAL', 'DEADLINE_AUTO', 'FOCUS_POLICY_AUTO')
  ),
  ADD CONSTRAINT answer_session_submission_shape CHECK (
    (status = 'ACTIVE' AND closed_at IS NULL AND submitted_at IS NULL AND submission_source IS NULL)
    OR
    (status = 'SUBMITTED' AND closed_at IS NOT NULL AND submitted_at IS NOT NULL
      AND submission_source IS NOT NULL)
    OR
    (status IN (
      'EXPIRED_EMPTY', 'FOCUS_POLICY_TERMINATED_EMPTY', 'WITHDRAWN', 'PLATFORM_ABORT'
    ) AND closed_at IS NOT NULL)
  );

ALTER TABLE answer_submissions
  DROP CONSTRAINT answer_submissions_submission_source_check,
  ADD CONSTRAINT answer_submissions_submission_source_check CHECK (
    submission_source IN ('LEGACY', 'MANUAL', 'DEADLINE_AUTO', 'FOCUS_POLICY_AUTO')
  );

CREATE TABLE answer_session_focus_projections (
  answer_session_ref text PRIMARY KEY REFERENCES answer_sessions(answer_session_ref),
  candidate_ref text NOT NULL,
  policy_version text NOT NULL CHECK (
    policy_version IN ('sandbox-focus-policy@1', 'sandbox-focus-policy@legacy-unmonitored')
  ),
  disclosure_version text NOT NULL,
  policy_state text NOT NULL CHECK (
    policy_state IN ('ACTIVE', 'WARNED', 'AUTO_SUBMIT_PENDING', 'AUTO_SUBMITTED')
  ),
  document_visibility text NOT NULL CHECK (document_visibility IN ('VISIBLE', 'HIDDEN')),
  window_focus text NOT NULL CHECK (window_focus IN ('FOCUSED', 'BLURRED')),
  away_started_at timestamptz,
  countable_away_count integer NOT NULL DEFAULT 0 CHECK (countable_away_count >= 0),
  cumulative_away_ms integer NOT NULL DEFAULT 0 CHECK (cumulative_away_ms >= 0),
  system_dialog_used boolean NOT NULL DEFAULT false,
  system_dialog_until timestamptz,
  auto_submit_requested_at timestamptz,
  platform_settlement_due_at timestamptz,
  auto_submitted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (policy_state IN ('ACTIVE', 'WARNED') AND auto_submit_requested_at IS NULL
      AND platform_settlement_due_at IS NULL AND auto_submitted_at IS NULL)
    OR
    (policy_state = 'AUTO_SUBMIT_PENDING' AND auto_submit_requested_at IS NOT NULL
      AND platform_settlement_due_at IS NOT NULL AND auto_submitted_at IS NULL)
    OR
    (policy_state = 'AUTO_SUBMITTED' AND auto_submit_requested_at IS NOT NULL
      AND platform_settlement_due_at IS NOT NULL AND auto_submitted_at IS NOT NULL)
  )
);

INSERT INTO answer_session_focus_projections (
  answer_session_ref, candidate_ref, policy_version, disclosure_version,
  policy_state, document_visibility, window_focus, updated_at
)
SELECT answer_session_ref, candidate_ref, 'sandbox-focus-policy@legacy-unmonitored',
       'sandbox-focus-disclosure@legacy-unmonitored', 'ACTIVE', 'VISIBLE', 'FOCUSED',
       updated_at
  FROM answer_sessions;

CREATE TABLE answer_session_activity_events (
  event_ref text PRIMARY KEY,
  answer_session_ref text NOT NULL REFERENCES answer_sessions(answer_session_ref),
  candidate_ref text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'VISIBILITY_HIDDEN', 'VISIBILITY_VISIBLE', 'WINDOW_BLURRED', 'WINDOW_FOCUSED',
      'SYSTEM_DIALOG_STARTED', 'SYSTEM_DIALOG_ENDED'
    )
  ),
  system_dialog_type text CHECK (system_dialog_type IS NULL OR system_dialog_type = 'MIC_PERMISSION'),
  client_sequence integer NOT NULL CHECK (client_sequence >= 0),
  client_monotonic_ms double precision NOT NULL CHECK (client_monotonic_ms >= 0),
  policy_version text NOT NULL CHECK (policy_version = 'sandbox-focus-policy@1'),
  recorded_at timestamptz NOT NULL,
  CHECK (
    (event_type IN ('SYSTEM_DIALOG_STARTED', 'SYSTEM_DIALOG_ENDED')
      AND system_dialog_type = 'MIC_PERMISSION')
    OR
    (event_type NOT IN ('SYSTEM_DIALOG_STARTED', 'SYSTEM_DIALOG_ENDED')
      AND system_dialog_type IS NULL)
  )
);

CREATE INDEX answer_session_activity_timeline_idx
  ON answer_session_activity_events(answer_session_ref, recorded_at, event_ref);

CREATE INDEX answer_session_focus_worker_idx
  ON answer_session_focus_projections(policy_state, platform_settlement_due_at, answer_session_ref)
  WHERE policy_state = 'AUTO_SUBMIT_PENDING';

CREATE TRIGGER answer_session_activity_events_immutable
BEFORE UPDATE OR DELETE ON answer_session_activity_events
FOR EACH ROW EXECUTE FUNCTION reject_functional_product_immutable_mutation();
