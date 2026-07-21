DROP TRIGGER IF EXISTS candidate_job_discovery_signals_immutable
  ON candidate_job_discovery_signals;
DROP TRIGGER IF EXISTS candidate_evidence_passport_snapshots_immutable
  ON candidate_evidence_passport_snapshots;

DROP FUNCTION IF EXISTS reject_candidate_discovery_immutable_mutation();

DROP TABLE IF EXISTS candidate_discovery_projections;
DROP TABLE IF EXISTS candidate_job_discovery_signals;
DROP TABLE IF EXISTS candidate_discovery_signal_sets;

DROP TRIGGER IF EXISTS ai_outputs_immutable ON ai_outputs;
DELETE FROM hiring_intelligence_requests
 WHERE operation = 'deriveCandidateJobSignals';
CREATE TRIGGER ai_outputs_immutable
BEFORE UPDATE OR DELETE ON ai_outputs
FOR EACH ROW EXECUTE FUNCTION reject_ai_output_mutation();

ALTER TABLE hiring_intelligence_requests
  DROP CONSTRAINT IF EXISTS hiring_intelligence_requests_operation_check,
  DROP COLUMN IF EXISTS candidate_passport_snapshot_ref,
  ADD CONSTRAINT hiring_intelligence_requests_operation_check CHECK (operation IN (
    'compileContract', 'buildMatchEdge', 'buildAnswerEvidenceEdge',
    'recommendChallenges', 'compressEvidence'
  ));

DROP TABLE IF EXISTS candidate_evidence_passport_snapshots;
DROP TABLE IF EXISTS candidate_evidence_passport_drafts;
