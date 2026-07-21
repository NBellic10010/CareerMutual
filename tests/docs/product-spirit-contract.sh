#!/usr/bin/env bash

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
doctrine="CareerMutual-Product-Doctrine.md"
migration_plan="CareerMutual-Runtime-Code-Migration-Plan-TEMP.md"
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

forbid_text() {
  local path="$1"
  local pattern="$2"
  local description="$3"

  if rg --quiet --fixed-strings "$pattern" "$repo_root/$path"; then
    fail "$description (forbidden text in $path: $pattern)"
  else
    pass "$description"
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

require_file "$doctrine" "normative blind-answer-first doctrine exists"
require_file "$migration_plan" "temporary runtime migration plan exists"
require_text "$doctrine" "No held blind-review obligation → No candidate answer" "doctrine binds review before Candidate work"
require_text "$doctrine" "No recorded answer evidence → No candidate selection" "doctrine forbids pre-answer selection"
require_text "$doctrine" "No completed cohort reviews → No Direct / Explore allocation" "doctrine requires the Advancement Cohort review barrier"
require_text "$doctrine" "No settled human obligation → That review Slot cannot serve the next candidate" "doctrine scopes backpressure to one reusable Slot"
require_text "$doctrine" "Advance this anonymous answer" "doctrine defines the post-answer Employer action"
require_text "$doctrine" "WAITING_FOR_BACKED_SLOT" "doctrine separates queue wait from ability conclusions"
require_text "$doctrine" "Interest is not an Application" "doctrine distinguishes interest from formal application"
require_text "$doctrine" "An Answer Review Slot is reusable concurrent capacity" "doctrine forbids treating Slot WIP as a total applicant cap"
require_text "$doctrine" "Every formal Application that the system permits to be submitted" "doctrine guarantees a disposition for every accepted Application"
require_text "$doctrine" "must not wait for the full Cohort barrier" "doctrine requires per-Slot recycling"
require_text "$doctrine" "buildAnswerEvidenceEdge" "doctrine moves GPT matching after recorded answers"
require_text "$doctrine" "Employer Evidence Analyst evaluates the Answer, not the résumé" "doctrine scopes AI judgment to anonymous answers"
require_text "$doctrine" "Good Answer | Bad Answer" "doctrine permits a verdict only for the sealed answer"
require_text "$doctrine" "onlyboth.answer-behavior-severity@1" "doctrine versions behavior severity rules"
require_text "$doctrine" "In exchange for the résumé-blind opportunity" "doctrine requires disclosed Candidate consent"
require_text "$doctrine" "external AI use cannot be proved by these records" "doctrine forbids treating behavior telemetry as proof"
require_text "$doctrine" "The AI Panel cannot prefill or submit Human Review" "doctrine preserves independent human judgment"
require_text "$doctrine" '`ADVANCE_ELIGIBLE` Human Review and Resume Reveal Authorization are submitted atomically' "doctrine binds positive anonymous review to Resume Reveal"
require_text "$doctrine" "independently paginated Recruiter Candidate Workspace" "doctrine isolates full Resume presentation"
require_text "$doctrine" 'the primary `/candidate` and `/employer` entry points execute the real persistent chain' "doctrine states the current runtime boundary"
require_text "$doctrine" "Candidate Application Credit is a frequency and concurrency constraint, not a Bid" "doctrine defines Candidate Credit as a rate limit"
require_text "$doctrine" '`PLATFORM_ASSISTANT_ALLOWED`' "doctrine permits only the disclosed platform assistant policy"
require_text "$doctrine" "Candidate Evidence Passport and job discovery" "doctrine defines Candidate-only Evidence Passport discovery"
require_text "$doctrine" '`OPEN_TO_ALL` or `EVIDENCE_MATCH_REQUIRED`' "doctrine defines the sealed Job access policy"
require_text "$doctrine" 'Legacy `deriveCandidateJobSignals` data remains for compatibility but no longer controls Feed visibility' "doctrine removes legacy discovery authority"
require_text "$doctrine" "at least one server-validated positive" "doctrine requires positive Evidence access for gated roles"
require_text "$doctrine" "Critical Challenge is a whole" "doctrine defines the role Challenge as one whole"
require_text "$doctrine" "TEXT + AUDIO + IMAGE + FILE" "doctrine permits all four Challenge part types"
require_text "$doctrine" "Before registering Interest or spending Credit" "doctrine reveals the full Challenge before Candidate commitment"

require_text "AGENTS.md" "$doctrine" "agent contract links the doctrine"
require_text "README.md" "$doctrine" "README links the doctrine"
require_text "CareerMutual-Product-Plan.md" "$doctrine" "product plan links the doctrine"
require_text "CareerMutual-Engineering-Design.md" "$doctrine" "engineering design links the doctrine"
require_text "CareerMutual-AI-Engineering-Design.md" "$doctrine" "AI design links the doctrine"
require_text "CareerMutual-Hackathon-Evaluation-and-Competitive-Research.md" "$doctrine" "competition research links the doctrine"

require_text "CareerMutual-Engineering-Design.md" "BlindReviewCommitment" "engineering design defines the rolling pre-answer Commitment"
require_text "CareerMutual-Engineering-Design.md" "InterestQueue" "engineering design defines the public non-profile queue"
require_text "CareerMutual-Engineering-Design.md" "AdvancementCohort" "engineering design separates comparison from Slot WIP"
require_text "CareerMutual-Engineering-Design.md" "AdvancementCohortSeat" "engineering design pins cohort membership independently of Slot completion order"
require_text "CareerMutual-Engineering-Design.md" "HumanAnswerReview" "engineering design defines per-answer human review"
require_text "CareerMutual-Engineering-Design.md" "AnswerEvidenceEdge" "engineering design binds selection to recorded evidence"
require_text "CareerMutual-Engineering-Design.md" "AnswerProcessEvidence@2" "engineering design freezes behavior severity at submission"
require_text "CareerMutual-Engineering-Design.md" '`ResumeRevealAuthorization`' "engineering design defines the reviewer-scoped Reveal aggregate"
require_text "CareerMutual-Engineering-Design.md" "Review Receipt, Reveal Authorization, Event, and Slot Settlement are atomically consistent" "engineering design makes review and Reveal atomic"
require_text "CareerMutual-Engineering-Design.md" "OfferNextQueuedInterest" "engineering design recycles each settled Slot"
require_text "CareerMutual-Engineering-Design.md" "GPT_TRACE" "engineering design seals the disclosed assistant trace"
require_text "CareerMutual-Engineering-Design.md" "critical-challenge@1" "engineering design versions the Critical Challenge manifest"
require_text "CareerMutual-Engineering-Design.md" "one primary engineering job, 20 cross-domain jobs, and 6 technical Match Lab jobs" "engineering design records the cross-domain and Match Lab seed"
require_text "CareerMutual-Product-Plan.md" "pinned résumé reveal in a separate Recruiter page" "product plan places full Resume after positive anonymous review"
require_text "CareerMutual-Product-Plan.md" "When the Review SLA times out, the Worker settles a Breach" "product plan defines overdue review settlement"
require_text "CareerMutual-AI-Engineering-Design.md" "there is no Employer-side Candidate selection AI request" "AI assembler has no pre-answer Employer candidate selection call"
require_text "CareerMutual-AI-Engineering-Design.md" "must not consume its output" "legacy Claim matching is quarantined"
require_text "CareerMutual-AI-Engineering-Design.md" "AI Output cannot complete Human Answer Review, reclaim a Slot, advance the Interest Queue" "AI cannot control the queue or impersonate review settlement"
require_text "CareerMutual-AI-Engineering-Design.md" "Candidate Discovery/Eligibility Assembler is a third isolated dependency" "AI design defines a separate Candidate discovery and Eligibility assembler"
require_text "README.md" "Runnable product slice" "README describes the persistent functional runtime"

forbid_text "CareerMutual-Product-Plan.md" "Direct: the Employer selects from a Label-blind Profile" "product plan removes Profile-first Direct"
forbid_text "CareerMutual-Engineering-Design.md" "Direct is selected by the Employer from a Veiled Profile" "engineering design removes Profile-first Direct"
forbid_text "AGENTS.md" 'GPT drafts only `uncertainty ↔ claim ↔ proof template`' "agent contract removes Claim-first matching authority"

require_text "$migration_plan" "Temporary implementation specification, not a new product authority source" "migration plan preserves authority order"
require_text "$migration_plan" "Public Opportunity discovery" "migration plan includes Candidate job discovery"
require_text "$migration_plan" "Interest" "migration plan distinguishes low-cost registration"
require_text "$migration_plan" "Application" "migration plan defines the backed formal submission"
require_text "$migration_plan" "AnswerReviewSlot" "migration plan defines reusable WIP"
require_text "$migration_plan" "AdvancementCohort" "migration plan separates post-answer comparison"
require_text "$migration_plan" "Candidate 09 belongs to Cohort 2" "migration plan prevents recycled Slot work from entering the wrong cohort"
require_text "$migration_plan" "Candidate 09 receives the recycled Slot offer" "migration plan proves the first Slot reaches the ninth Interest"
require_text "$migration_plan" 'Allocation at Cohort `7/8`' "migration plan preserves the Cohort review barrier"
require_text "$migration_plan" "buildAnswerEvidenceEdge" "migration plan moves GPT after recorded answers"
require_text "$migration_plan" "candidate_activity_leases" "migration plan carries cross-table Q_i consistency"
require_text "$migration_plan" "Legacy reserve-attention endpoint cannot mutate business state" "migration plan disables the legacy mutation endpoint"
require_text "$migration_plan" "Direct  → Blind Answer 42" "migration plan pins the target Direct answer"
require_text "$migration_plan" "Explore → Blind Answer 17" "migration plan pins deterministic Explore"
require_text "$migration_plan" "Reset must not create" "migration plan keeps Demo reset facts-only"
require_text "$migration_plan" "Pre-answer Employer-side Candidate selection AI requests" "migration plan has a no-pre-answer Employer selection AI gate"
require_text "$migration_plan" '`RecordFunctionalHumanReview` have implemented this boundary' "migration plan records the implemented Resume Reveal boundary"

forbid_text "$doctrine" "WAITLISTED_CAPACITY" "doctrine removes the finite-batch waitlist state"
forbid_text "CareerMutual-Product-Plan.md" "8 funded Answer Invitations" "product plan removes the one-shot eight-person cap"
forbid_text "CareerMutual-Engineering-Design.md" "BlindReviewBatch" "engineering design removes the one-shot Batch aggregate"
forbid_text "$migration_plan" "20 Candidate Interests and hard facts" "migration plan does not retain the old facts-only batch wording"

for path in \
  "$doctrine" \
  "CareerMutual-Product-Plan.md" \
  "CareerMutual-Engineering-Design.md" \
  "CareerMutual-AI-Engineering-Design.md" \
  "CareerMutual-Hackathon-Evaluation-and-Competitive-Research.md" \
  "$migration_plan"; do
  require_balanced_fences "$path"
done

printf 'RESULT: %d passed, %d failed\n' "$passes" "$failures"

if (( failures > 0 )); then
  exit 1
fi
