#!/usr/bin/env bash

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
document="OnlyBoth-AI工程设计.md"
passes=0
failures=0

pass() {
  printf 'PASS: %s\n' "$1"
  passes=$((passes + 1))
}

fail() {
  printf 'FAIL: %s\n' "$1"
  failures=$((failures + 1))
}

require_file() {
  local path="$1"
  local description="$2"

  if [[ -f "$repo_root/$path" ]]; then
    pass "$description"
  else
    fail "$description (missing: $path)"
  fi
}

require_text() {
  local path="$1"
  local pattern="$2"
  local description="$3"

  if rg --quiet --fixed-strings "$pattern" "$repo_root/$path"; then
    pass "$description"
  else
    fail "$description (missing text in $path: $pattern)"
  fi
}

require_balanced_fences() {
  local path="$1"
  local count
  count="$(awk '/^```/{count++} END{print count+0}' "$repo_root/$path")"

  if (( count % 2 == 0 )); then
    pass "$path has balanced Markdown fences"
  else
    fail "$path has unbalanced Markdown fences ($count)"
  fi
}

require_file "$document" "AI engineering design exists"
require_text "$document" "compileContract" "design defines contract compilation"
require_text "$document" "buildAnswerEvidenceEdge" "design defines post-answer Evidence Edge drafting"
require_text "$document" "EmployerReviewAnalystPort" "design defines the narrowed Employer analyst port"
require_text "$document" "SUPPORTED | CONTRADICTED | NOT_ADDRESSED" "design limits findings to criterion-local states"
require_text "$document" "gpt-5.6-sol" "design pins the Employer analyst model"
require_text "$document" "Process Source 只能" "design separates process sources from capability findings"
require_text "$document" "answer-evidence-edge-draft@2" "design versions the bounded answer verdict and language analysis"
require_text "$document" "onlyboth.answer-behavior-severity@1" "design pins deterministic behavior severity"
require_text "$document" "PLATFORM_KILL_SWITCH_OFF" "design records the fail-closed analyst kill switch"
require_text "$document" 'Legacy `buildMatchEdge' "design quarantines the pre-answer Claim operation"
require_text "$document" "No Candidate matching AI request" "design forbids pre-answer Candidate AI matching"
require_text "$document" "HumanAnswerReview" "design preserves mandatory named answer review"
require_text "$document" "recommendChallenges" "design defines Challenge recommendation"
require_text "$document" "compressEvidence" "design defines Evidence compression"
require_text "$document" "permits_tools = false" "design forbids AI tools"
require_text "$document" "store: false" "design disables Responses application-state storage"
require_text "$document" "text.format" "design uses Responses Structured Outputs"
require_text "$document" "X-Client-Request-Id" "design specifies provider request correlation"
require_text "$document" "AI_REFUSED" "design defines typed refusal handling"
require_text "$document" "AI_STALE_RESULT" "design defines stale-result handling"
require_text "$document" "SUPERSEDED" "design defines superseded requests"
require_text "$document" "HumanChallengeSelected" "design preserves human Challenge authority"
require_text "$document" "candidate_private_labels" "design explicitly protects private labels"
require_text "$document" "GOLDEN_REPLAY" "design specifies Replay parity"
require_text "$document" "multi-agent business workflow" "design rejects an MVP multi-agent workflow"
require_text "$document" "CandidateAnswerAssistantPort" "design defines the disclosed Candidate assistant boundary"
require_text "$document" "VoiceTranscriptionPort" "design defines the Voice Memo transcription boundary"
require_text "$document" "deriveCandidateJobSignals" "design defines Candidate-only job discovery"
require_text "$document" "gpt-5.6-luna" "design pins the Candidate discovery model"
require_text "$document" "所有开放岗位始终可见" "design forbids discovery-based job hiding"
require_text "$document" "绝不自动切回预载 Snapshot 或 Golden Fixture" "design requires LIVE discovery to fail closed"
require_text "$document" "gpt-5.6-terra" "design pins the Candidate assistant model"
require_text "$document" "gpt-4o-mini-transcribe" "design pins the transcription model"
require_text "$document" 'independent sealed `GPT_TRACE` Artifact' "design requires a sealed complete assistant trace"
require_text "OnlyBoth-工程设计.md" "OnlyBoth-AI工程设计.md" "authoritative engineering design links the AI design"
require_text "README.md" "OnlyBoth-AI工程设计.md" "root README links the AI design"
require_balanced_fences "$document"

printf 'RESULT: %d passed, %d failed\n' "$passes" "$failures"

if (( failures > 0 )); then
  exit 1
fi
