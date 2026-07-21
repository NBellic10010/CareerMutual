ALTER TABLE answer_submissions
  DROP CONSTRAINT answer_submissions_process_evidence_shape,
  ADD CONSTRAINT answer_submissions_process_evidence_shape CHECK (
    process_capture_version = 'answer-process-evidence@legacy-untracked'
    OR (
      process_capture_version = 'answer-process-evidence@1'
      AND process_evidence_ref IS NOT NULL
    )
  );

