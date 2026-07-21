DROP TRIGGER IF EXISTS answer_session_activity_events_immutable ON answer_session_activity_events;
DROP TABLE IF EXISTS answer_session_activity_events;
DROP TABLE IF EXISTS answer_session_focus_projections;

ALTER TABLE answer_submissions
  DROP CONSTRAINT answer_submissions_submission_source_check,
  ADD CONSTRAINT answer_submissions_submission_source_check CHECK (
    submission_source IN ('LEGACY', 'MANUAL', 'DEADLINE_AUTO')
  );

ALTER TABLE answer_sessions
  DROP CONSTRAINT answer_session_submission_shape,
  DROP CONSTRAINT answer_sessions_submission_source_check,
  DROP CONSTRAINT answer_sessions_status_check,
  ADD CONSTRAINT answer_sessions_status_check CHECK (
    status IN ('ACTIVE', 'SUBMITTED', 'EXPIRED_EMPTY', 'WITHDRAWN', 'PLATFORM_ABORT')
  ),
  ADD CONSTRAINT answer_sessions_submission_source_check CHECK (
    submission_source IS NULL OR submission_source IN ('MANUAL', 'DEADLINE_AUTO')
  ),
  ADD CONSTRAINT answer_session_submission_shape CHECK (
    (status = 'ACTIVE' AND closed_at IS NULL AND submitted_at IS NULL AND submission_source IS NULL)
    OR
    (status = 'SUBMITTED' AND closed_at IS NOT NULL AND submitted_at IS NOT NULL
      AND submission_source IS NOT NULL)
    OR
    (status IN ('EXPIRED_EMPTY', 'WITHDRAWN', 'PLATFORM_ABORT') AND closed_at IS NOT NULL)
  );

ALTER TABLE answer_terms_acceptances
  DROP COLUMN focus_tracking_disclosure_version,
  DROP COLUMN sandbox_focus_policy_version;
