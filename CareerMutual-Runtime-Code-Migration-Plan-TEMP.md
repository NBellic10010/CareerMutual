# CareerMutual Runtime Code Migration Plan (TEMP)

## Rolling blind-review runtime cutover

**Status:** Temporary implementation specification, not a new product authority source; Answer/Review/AI Analyst cutover completed, Advancement cutover pending
**Version:** 0.4
**Date:** 2026-07-20
**Deletion condition:** Delete or archive after the target vertical path passes PostgreSQL, role-isolated Playwright, Replay, offline Demo, and security acceptance, and after `HANDOFF.md` records the completed status.
**Priority:** If this document conflicts with `AGENTS.md`, `CareerMutual-Product-Doctrine.md`, `CareerMutual-Product-Plan.md`, `CareerMutual-Engineering-Design.md`, or `CareerMutual-AI-Engineering-Design.md`, the aforementioned authoritative documents take precedence.

---

## 1. Migration Goals

Historical regression code still retains the legacy Claim-first order:

```text
Candidate Interest + Claim Snapshot
→ typed Eligibility
→ GPT buildMatchEdge
→ Sarah chooses Candidate as Direct
→ deterministic Explore
→ Attention reservation
→ Candidate Stage A
→ Challenge / Stage B
```

The primary `/candidate` and `/employer` entry points have switched to:

```text
persistent synthetic SessionActor
→ PostgreSQL JobPost discovery
→ free Interest / deterministic Queue
→ backed reusable AnswerReviewSlot
→ versioned declarations + Candidate Credit consume
→ server-timed rich text / Voice Memo / disclosed platform GPT
→ private Object Storage + immutable AnswerSubmission
→ earliest-only anonymous Employer review
→ evidence-linked HumanAnswerReview
→ per-Slot settlement / next-offer request
```

This path has passed acceptance with role-isolated Playwright, PostgreSQL transactions, and MinIO integration. Candidate Credit is consumed only on Backed Offer Accept and does not participate in ranking; when the Employer Review SLA times out, Candidate Credit is returned, Employer Hold is forfeited, a reliability penalty is recorded, and the Slot is retired. `/prototype` is no longer a primary entry point or an acceptance substitute.

`buildAnswerEvidenceEdge` has been cut over as an optional Employer Evidence Analyst to immutable Submission, `AnswerProcessEvidence@2` behavioral severity, Good/Bad Answer and language analysis, Outbox Worker, and Employer Review Projection. Historical `@1` is not reclassified retroactively. Not yet cut over are `ADVANCE_ELIGIBLE → Resume Reveal pagination → Advancement Allocation → Deep Proof → Challenge`; legacy Matching/Golden Challenge may continue only as historical regression assets.

The old answer-first migration draft still contains one critical error: it treats the eight Answer Review Slots as a one-time quota for eight people, allocating eight Invitations from twenty Interests while leaving the remaining twelve people indefinitely on the Capacity waitlist. Although this does not filter by résumé, it still creates a boundary between “will be seen” and “will not be seen” before the Candidate produces evidence.

This migration changes to the sole active product path:

```text
Public Opportunity discovery
→ lightweight Candidate Interest + receipt
→ deterministic hard Eligibility
→ public non-profile Interest Queue
→ Sarah activates 8 reusable Answer Review Slots
→ each AVAILABLE Slot offers the next eligible Interest
→ Candidate accepts the full sealed work packet
→ Recorded Stage A Answer / immutable Application
→ GPT drafts AnswerEvidenceEdge from recorded work
→ Sarah records one HumanAnswerReview
→ that Obligation settles and the same Slot serves the next queued Interest
→ reviewed Answer joins an 8-answer Advancement Cohort
→ Cohort barrier opens only after 8/8 Reviews
→ Sarah advances one anonymous Answer as Direct
→ public-seed code selects Explore from the same Cohort
→ Deep Proof Slots + Credit Holds + ReviewWindows
→ existing Challenge recommendation / authorization / Stage B
```

The migration is not renaming `Choose as Direct`, nor packaging random allocation as fair selection. It changes two causal boundaries at the same time:

1. A formal Application is allowed only after a named review obligation has been held;
2. A Slot is reusable concurrent WIP, not a total Applicant cap over the lifetime of a role.

---

## 2. Terminology and Non-Confusable Boundaries

```text
Interest
= low-cost registration + queue receipt + closure receipt
≠ Application
≠ individual human review
≠ ability judgment

Application
= submitted Answer under a held named-review obligation
= Human Review Receipt or Employer Breach

AnswerReviewSlot
= reusable concurrent debt capacity
≠ permanently assigned Candidate seat
≠ total application quota

AdvancementCohort
= reviewed Answers grouped for post-answer comparison
≠ invitation pool
≠ Slot owner
```

Server-side invariants:

```text
No held blind-review obligation → No candidate answer
No recorded answer evidence → No candidate selection
No completed cohort reviews → No Direct / Explore allocation
No work evidence → No pedigree reveal
No settled human obligation → That review Slot cannot serve the next candidate
```

First-layer Slot Settlement and the Cohort barrier must be decoupled. After the first Answer Review is completed, the first Slot serves the next Interest; it cannot wait until `8/8` to release all eight Slots in a batch.

---

## 3. Completion Boundaries

### 3.1 This migration must complete

- Candidate can browse public Opportunities, express low-cost Interest, and receive a versioned Queue Receipt;
- when no backed Slot is available, the UI allows only `Register interest` and does not allow Answer submission or claim that the Application has been accepted;
- Employer receives no Candidate Card, Claim, Profile, MatchEdge, or GPT rationale before the Candidate answers;
- Sarah actually executes `ActivateBlindReviewCommitment`, atomically establishing eight reusable Answer Review Slots and the Credit policy;
- Queue Scheduler issues one backed offer for each AVAILABLE Slot without reading Profile, Claim, Private Label, Employer preference, or AI Output;
- Answer enters an immutable PostgreSQL manifest and private Object Storage through the real Application Command;
- `buildAnswerEvidenceEdge` consumes only recorded Answer Evidence;
- Sarah creates a named, Evidence-linked `HumanAnswerReview` Receipt for every submitted Application;
- the first Review Settlement atomically releases the Slot and issues a new backed offer to the ninth Interest;
- the server rejects Direct/Explore at `7/8` Cohort reviews and allows them only at `8/8`;
- Sarah selects Direct from the set of blindly reviewed Answers that passed; the Allocation DTO references only Answer Evidence and does not accept Resume score / AI rank; Explore is deterministically produced from the remaining valid Answers in the same Cohort;
- two Deep Proof ReviewWindows, two Credit Holds, Allocation, Event, Outbox, and Receipt are committed atomically;
- Golden Replay fixes only external inputs to GPT, Sandbox, and Verifier; it does not prewrite human authorization, Review Receipt, or Slot handoff;
- legacy `reserve-attention` Web API, Employer UI, and active Worker composition can no longer perform Candidate selection before answering.

### 3.2 This migration does not opportunistically expand scope

- Do not introduce microservices, Kafka, vector databases, Agents, or WebSockets;
- Do not implement Candidate-paid Bid, Boost, or core Reach;
- Do not introduce cash, blockchain, or tradable Tokens;
- Do not claim that every Interest will necessarily obtain a Slot before the Opportunity closes;
- Do not claim that Interest has already received individual human judgment;
- Do not make `compileContract`, `compressEvidence`, production IdP, or a real Docker Verifier prerequisites for this cutover;
- Do not add new functionality to legacy MatchEdge.
- Do not implement Candidate Application Credit as a Bid, Boost, Employer-visible weight, or queue-sorting input.

---

## 4. Candidate Visibility and Queue Experience

Candidate visibility uses an independent Projection and does not use one broad DTO with fields hidden by the frontend.

### 4.1 Public Opportunity

```text
opportunity_ref
title
organization_public_name
public_role_summary
employment_type
seniority_band
compensation_range
location_and_work_mode
public_hard_requirements
capability_area_preview
proof_format
maximum_candidate_minutes
candidate_ai_policy
human_review_sla
review_capacity_status
interest_status
```

The Public Projection does not include the exact Sealed Question, Starter Repo, Ticket, Tests, Stage B Challenge, other Candidates, Candidate ranking, or GPT fit rationale.

Interfaces:

```text
GET  /api/v1/candidate/opportunities
GET  /api/v1/candidate/opportunities/:id/public
POST /api/v1/opportunities/:id/interests
```

### 4.2 Interest Queue

Interest submits only necessary hard facts and the consent version; Cover Letter or Candidate Claim is not required. Statuses:

```text
INTEREST_RECEIVED
INELIGIBLE_HARD_REQUIREMENT
WAITING_FOR_BACKED_SLOT
BACKED_OFFERED
OPPORTUNITY_PAUSED
OPPORTUNITY_CLOSED
```

Candidate can see:

```text
queue_policy_version
own_queue_status
eligible_interests_ahead
commitment_status
last_status_change_at
offer_expiry_if_any
closure_receipt_if_closed
```

Candidate cannot see other people’s identities, Profiles, Answers, or Employer-only data. `eligible_interests_ahead` is a queue explanation, not an ability ranking.

### 4.3 Backed Offer and Application

Only after the corresponding Slot, Reviewer, SLA, and `CreditHold=HELD` have been established does the Candidate receive the complete work packet before Accept:

```text
named reviewer
review obligation and SLA
held Credit reference
exact sealed JD question
question version and hash
allowed assumptions
starter repo / ticket
visible tests
effort limit
workspace and monitoring boundaries
Candidate AI policy
decline-without-penalty notice
```

After Accept, the Candidate may begin the Answer. Decline/Offer Expiry returns the Hold, releases the Activity Lease, and allows the Slot to serve the next person in the queue; it does not produce Candidate Failure.

Interest is free. Accept must also record `terms_version`, `ai_disclosure_version`, and conditional Resume Reveal
consent, and in the same transaction change Candidate Application Credit `3→2` before creating AnswerSession. This Credit
does not enter the Employer Projection or Queue policy. Platform failures and Employer Review Breach return it; Candidate
abandonment or blank timeout after starting does not return it.

The current Answer Workspace uses TipTap JSON, MediaRecorder Voice Memo, two-second/on-blur autosave, and a
Worker-only disclosed GPT Sidecar. The Sidecar runs only when the Contract is
`PLATFORM_ASSISTANT_ALLOWED`; the browser has no Key, and the model has no tools/web/files/submit. The complete
`GPT_TRACE` and the original audio/derived Transcript are Sealed together. Undisclosed external AI remains prohibited.

### 4.4 Submitted, reviewed, and Deep Proof

Candidate can see only their own Answer Snapshot, Artifact refs, review deadline, Human Review Receipt, Evidence, `still_unknown`, and subsequent Challenge/Outcome. Candidate does not receive the Cohort pool, other Answers, `DIRECT | EXPLORE`, Employer internal Candidate ref, or Counterfactual labels.

If the Candidate accepts the versioned conditional Reveal terms at Backed Offer, the same Resume Snapshot is fixed and remains sealed until:

```text
anonymous Human Answer Review complete
→ Human decision = ADVANCE_ELIGIBLE
→ Human Review Receipt + Resume Reveal Authorization committed atomically
→ reviewer-scoped, one-Candidate-per-page Resume workspace
```

`NO_FURTHER_PROOF`, `INCONCLUSIVE`, withdrawal, Breach, and Platform Abort do not Reveal. Migration 0012 and
`RecordFunctionalHumanReview` have implemented this boundary: the Snapshot is pinned when the Offer is accepted, and at
`ADVANCE_ELIGIBLE`, Reveal is written in the same PostgreSQL transaction. Subsequent Deep Proof is no longer a prerequisite for the initial Resume Reveal.

---

## 5. Target Contracts

Add strict, versioned Schemas to `packages/contracts`:

```text
public-opportunity-projection@1
candidate-interest-command@1
candidate-interest-receipt@1
activate-blind-review-commitment-command@1
blind-review-commitment-receipt@1
backed-answer-offer@1
answer-invitation-decision-command@1
answer-invitation-decision-receipt@1
submit-blind-answer-command@1
blind-answer-submission-receipt@1
build-answer-evidence-edge-input@1
answer-evidence-edge-draft@1
human-answer-review-command@1
human-answer-review-receipt@1
answer-review-settlement-receipt@1
advancement-cohort-projection@1
allocate-post-answer-advancement-command@1
post-answer-advancement-receipt@1
employer-blind-review-projection@2
candidate-opportunity-projection@3
opportunity-closure-receipt@1
```

`HumanAnswerReview` decisions:

```text
ADVANCE_ELIGIBLE
NO_FURTHER_PROOF
INCONCLUSIVE
```

They describe only whether this Answer is worth continuing to validate; they do not equal Hire, Reject, a talent score, or a long-term ability prediction.

---

## 6. Target Domain

Add pure domain modules under `packages/domain/src/blind-answer/`:

```text
BlindReviewCommitment
InterestQueue
AnswerReviewSlot
AnswerReviewObligation
AnswerInvitation
AnswerSubmission
AnswerEvidenceEdge
HumanAnswerReview
AdvancementCohort
AdvancementCohortSeat
AdvancementAllocation
CandidateActivityLease
```

`BlindReviewCommitment`:

```text
DRAFT → ACTIVE ↔ PAUSED → CLOSING → CLOSED
                  └──────→ SUSPENDED
```

Only an `ACTIVE` Commitment issues new Offers. Pause/Close cannot cancel obligations that have already entered `ANSWER_ACTIVE | REVIEW_PENDING`.

`AnswerReviewSlot`:

```text
AVAILABLE
→ OFFERED
→ ANSWER_ACTIVE
→ REVIEW_PENDING
→ SETTLING
→ AVAILABLE

REVIEW_PENDING → BREACHED → REMEDIATING → RETIRED
OFFERED → AVAILABLE: declineOrExpiry
ANSWER_ACTIVE → AVAILABLE: withdrawalOrPlatformAbortSettlement
```

`AnswerReviewObligation` is a one-time binding between a Slot and a Candidate:

```text
INVITED → ANSWER_ACTIVE → REVIEW_PENDING → REVIEWED → SETTLED
```

Termination paths structurally distinguish Candidate Decline, Expiry, Withdrawal, Employer Breach, and Platform Abort.

`AdvancementCohort`:

```text
COLLECTING → REVIEWING → READY_FOR_ADVANCEMENT → ALLOCATED
                         └──────────────────────→ CLOSED_NO_ALLOCATION
```

A Cohort references only submitted and reviewed Answers. Cohort state does not own Answer Review Slots and cannot prevent Slot cycling.

`AdvancementCohortSeat` is fixed when the backed Offer is created:

```text
OPEN → RESERVED → ANSWER_SUBMITTED → REVIEWED
         └──────→ OPEN: declineOrOfferExpiryBeforeAnswer
```

The first eight Offers enter Cohort 1; after the first Review settles, the ninth Interest’s new Offer must enter Cohort 2 even if Cohort 1 has not yet reached `8/8`. After submission, Seat, Obligation, and Cohort are immutable, ensuring that Worker completion order does not change the comparison group.

The target `ReviewWindow` starts with post-answer Deep Proof:

```text
RESERVED
→ CHECKPOINT_PENDING: selected Candidate accepts Deep Proof
→ STAGE_B_ACTIVE: Sarah selects Challenge
```

It pins:

```text
answer_submission_id
answer_evidence_edge_id
stage_a_snapshot_id
advancement_cohort_id
contract_version_id
label_policy_version_id
proof_template_version_id
challenge_catalog_version_id
reviewer_id
```

---

## 7. PostgreSQL Migration

Add `packages/db/migrations/0003_blind_answer_first.sql` and an explicit down migration; do not rewrite already executed `0001/0002`.

Add tables:

```text
blind_review_commitments
answer_review_slots
answer_review_obligations
answer_invitations
answer_sessions
answer_submissions
answer_evidence_edges
human_answer_reviews
advancement_cohorts
advancement_cohort_seats
advancement_allocations
candidate_activity_leases
public_opportunity_projections
employer_blind_review_projections
candidate_answer_projections
blind_review_command_receipts
opportunity_closure_receipts
```

Extensions:

- `candidate_interests` adds eligibility/queue timestamps, status, and closure ref;
- `hiring_intelligence_requests` adds `buildAnswerEvidenceEdge`, Commitment, Cohort, Question, and Answer pins;
- `stage_a_evidence` supports `answer_submission_ref`;
- `review_windows` adds Cohort, Allocation, AnswerSubmission, and AnswerEvidenceEdge refs;
- `credit_holds` adds `ANSWER_REVIEW | DEEP_PROOF` purposes and subject ref;
- `attention_commitments` adds Answer Review WIP, Queue policy, review SLA, per-answer Credit, and status.

Database constraints:

- One Slot has at most one unsettled Obligation at a time;
- One Invitation has at most one immutable AnswerSubmission;
- One Answer has at most one current HumanAnswerReview;
- AnswerSubmission, AnswerEvidenceEdge, HumanAnswerReview, submitted Cohort Seat membership, and AdvancementAllocation are immutable;
- One Candidate has at most one Active Answer or ReviewWindow across roles;
- One Answer enters at most one current AdvancementAllocation;
- The transition from `SETTLING` back to `AVAILABLE` for a Slot, together with Settlement Receipt, Credit return, Event, and Outbox, occurs in one transaction;
- Cohort READY must not lock Slot rows;
- legacy ReviewWindow refs and target Answer-first refs use an explicit either/or CHECK;
- Event, Aggregate, Credit, Outbox, Projection, and Command Receipt either all succeed or all fail.

Demo Credit Policy:

```text
1 Credit × 8 concurrent reusable Answer Review Slots
10 Credits × 2 Deep Proof Windows
```

First-layer Credit is settled per Obligation and immediately recycled without waiting for the Cohort. Deep Proof uses an independent Hold and does not reuse an unsettled Answer Review Hold.

---

## 8. Queue Policy

Default version:

```text
onlyboth.interest-queue@1

eligible candidates =
  hard eligible
  + status WAITING_FOR_BACKED_SLOT
  - active CandidateActivityLease
  - expired or withdrawn Interest

order =
  ascending eligible_at
  then ascending interest_created_at
  then ascending sha256(seed | opportunity_ref | candidate_ref)
  then ascending candidate_ref
```

Scheduler must not read Candidate Claim, Profile, Private Label, MatchEdge, AI Output, Referral, or Employer preference. The public seed, policy version, input snapshot hash, and selected opaque Candidate ref are written to the event.

The Queue does not promise that every Interest will obtain a Slot before the role closes. It promises that while the Opportunity remains ACTIVE, each settled Slot continues processing the next person; the Employer cannot select, cut in line, or silently stop. Closure requires an explicit `CloseOpportunityIntake` Command and Closure Receipts for those waiting.

---

## 9. Application Commands and Transactions

### 9.1 `SubmitCandidateInterest`

Validates that the Opportunity accepts Interest, Candidate Session, hard-fact Schema, and consent; atomically writes Interest, Eligibility Job, Event, Outbox, and Candidate Projection. Interest does not create an Answer Session or call GPT.

### 9.2 `ActivateBlindReviewCommitment`

```text
lock Opportunity + AttentionCommitment + CreditAccount
→ authenticate named Reviewer
→ validate expected versions
→ create/update ACTIVE BlindReviewCommitment
→ create 8 reusable AVAILABLE AnswerReviewSlots
→ reserve Slot Credit policy
→ append BlindReviewCommitmentActivated
→ enqueue OfferNextQueuedInterest once per AVAILABLE Slot
→ persist Receipt
```

Demo reset must not pre-write Commitment, Slots, Holds, or Invitations.

### 9.3 `OfferNextQueuedInterest`

The Worker uses Queue Policy to select the next person. Transaction:

```text
lock one AVAILABLE Slot
→ lock next eligible Interest under policy snapshot
→ reserve the earliest OPEN AdvancementCohortSeat; create the next Cohort if needed
→ acquire CandidateActivityLease
→ create AnswerReviewObligation + CreditHold + Invitation
→ transition Slot AVAILABLE → OFFERED
→ transition Interest WAITING_FOR_BACKED_SLOT → BACKED_OFFERED
→ append Event + Outbox + projections
```

When there is no candidate, the Slot remains AVAILABLE; this is not an error.

### 9.4 `AcceptAnswerInvitation` / `DeclineAnswerInvitation`

Accept validates Reviewer, Slot, SLA, Hold, deadline, and `Q_i=1`, then creates an AnswerSession. Decline/Expiry atomically returns the Hold, releases the Lease, restores the Slot, and enqueues the next Offer; it does not produce a Candidate Failure.

### 9.5 `SubmitBlindAnswer`

```text
AnswerInvitationAccepted
→ AnswerSession
→ Replay/Docker Sandbox
→ SubmitBlindAnswer
→ immutable AnswerSubmission + Stage A Evidence
→ AnswerSubmitted
→ buildAnswerEvidenceEdge Outbox
```

When Sandbox retries are exhausted, execute `PlatformAbortAnswer`, return resources, and record neither Employer Breach nor Candidate Failure.

### 9.6 `RecordHumanAnswerReview`

Each anonymous Answer Card is processed independently:

```text
authenticate Sarah + CSRF
→ lock Obligation + Slot + Hold
→ validate expected versions and deadline
→ validate Evidence refs belong to this Answer
→ create immutable HumanAnswerReview
→ settle Obligation and return Credit
→ transition Slot to AVAILABLE
→ append HumanAnswerReviewed + AnswerReviewSettled
→ enqueue OfferNextQueuedInterest for this Slot
→ mark the Invitation's pinned AdvancementCohortSeat REVIEWED
→ update projections + Receipt
```

The same transaction must not directly create an Invitation for the next person, to avoid simultaneously locking the Review and the large Queue collection; the Outbox Worker idempotently executes the next Offer. In business terms, the Slot is already AVAILABLE and is not affected by the Cohort barrier. The next Offer reserves the next Cohort Seat, so Candidate 09 belongs to Cohort 2 and will not enter an incorrect comparison group because Cohort 1 is not yet complete.

No bulk review endpoint is provided. A page view, scroll, AI Draft, default selection, or generic template cannot complete the Command.

### 9.7 `AllocatePostAnswerAdvancement`

The transaction validates:

- The Cohort is `READY_FOR_ADVANCEMENT`;
- Direct belongs to this Cohort, has been submitted and reviewed, and is `ADVANCE_ELIGIBLE`;
- The Explore pool contains only the remaining `ADVANCE_ELIGIBLE` Answers in this Cohort;
- The Candidate has no other Active lease;
- Two Deep Proof Slots and Credits are available.

It then atomically creates the Allocation, Decisions, two Deep Proof Holds, two ReviewWindows, Activity Leases, Events, Outbox, Projections, and Receipt.

### 9.8 `PauseBlindReviewCommitment` / `CloseOpportunityIntake`

Pause only stops new Offers. Close must:

```text
show queued Interest count to Employer
→ require explicit expected version and closure reason
→ stop new Interest and Offer creation
→ preserve every active Obligation
→ create one Closure Receipt per still-waiting Interest
→ make Candidate Projection explicit: no Application was submitted, no ability judgment exists
```

---

## 10. AI Runtime Cutover

Primary `HiringIntelligencePort`:

```ts
interface HiringIntelligencePort {
  compileContract(input: CompileContractInput): Promise<ContractDraft>;
  buildAnswerEvidenceEdge(
    input: BuildAnswerEvidenceEdgeInputV1,
  ): Promise<AnswerEvidenceEdgeDraftV1>;
  recommendChallenges(input: RecommendChallengesInput): Promise<ChallengeRecommendation>;
  compressEvidence(input: CompressEvidenceInput): Promise<EvidenceCardDraft>;
}
```

Move `buildMatchEdge` into `legacy/`; the active Worker must not create a `MatchEdgeWorker`.

The current `buildAnswerEvidenceEdge` Assembler reads only the Sealed Contract/Question/Review Criteria, immutable
final Answer, Voice Transcript, disclosed GPT Trace, and deterministic Process Evidence when
the Policy is `ANSWER_PLUS_PROCESS`. The Composition root does not inject Candidate Claim, Focus Activity Repository,
Résumé, or Private Label Repository. The AI Request is created in `REVIEW_PENDING`; when a Human Review already exists,
it is directly marked `SUPERSEDED`, and it cannot block Slot settlement.

Post-processing validation:

- Each sealed Criterion has exactly one four-state Finding;
- All output refs belong to the input allowlist, and the exact quote resolves uniquely in the frozen Source;
- Summary, Good/Bad Verdict, Language Finding, and Criterion must not reference Process Source;
- Contract, Question, and Answer Submission pins are unchanged;
- No Candidate-wide score, rank, Hire/Reject, Direct/Explore, Queue decision, advancement recommendation,
  cheating/integrity/personality inference, or executable content; only a Good/Bad Verdict for the current sealed Answer
  and four source-linked language findings are allowed.

AI Output cannot update Queue, Slot, Review, Cohort barrier, or Allocation. A LIVE failure must never switch to Golden.

---

## 11. API and Role Projections

Add:

```text
GET  /api/v1/candidate/opportunities
GET  /api/v1/candidate/opportunities/:id/public
POST /api/v1/opportunities/:id/interests
POST /api/v1/opportunities/:id/blind-review-commitments/activate
POST /api/v1/opportunities/:id/blind-review-commitments/pause
POST /api/v1/opportunities/:id/intake/close
GET  /api/v1/employer/opportunities/:id/blind-review-commitment
POST /api/v1/answer-invitations/:id/accept
POST /api/v1/answer-invitations/:id/decline
POST /api/v1/answer-invitations/:id/submit
POST /api/v1/answer-review-obligations/:id/review
POST /api/v1/advancement-cohorts/:id/allocate
```

Continue reusing the existing ReviewWindow Challenge APIs. All Commands use role Session, CSRF, Idempotency-Key, expected version, database time, and versioned Receipt.

Employer pre-answer Projection:

```text
20 hard eligible Interests
8 reusable review Slots
8 backed offers active
12 waiting for next backed Slot
0 accepted Applications without a review Hold
Candidate profiles unavailable
Queue policy onlyboth.interest-queue@1
```

After answers, display anonymous Answer Cards, settlement/handoff for each Slot, and Cohort progress:

```text
Slot 1 review settled → next queued Interest offered
7/8 cohort reviews — selection locked
8/8 cohort reviews — selection unlocked
```

The CTA is `Advance this anonymous answer`. `Choose as Direct`, `Proofable Candidate`, `Validated MatchEdge`, and pre-answer Candidate cards must be removed.

Candidate Projection V3:

```text
INTEREST_RECEIVED
WAITING_FOR_BACKED_SLOT
BACKED_OFFERED
ANSWER_ACTIVE
REVIEW_PENDING
REVIEWED
DEEP_PROOF_RESERVED
CHECKPOINT_PENDING
STAGE_B_ACTIVE
OPPORTUNITY_PAUSED
OPPORTUNITY_CLOSED
RELEASED
PLATFORM_ABORT
```

---

## 12. Challenge Chain, Worker, and Replay

After answers, Allocation creates a ReviewWindow and pins AnswerSubmission, AnswerEvidenceEdge, Cohort, and Stage A Snapshot. After Deep Proof Accept, reuse:

```text
RESERVED
→ CHECKPOINT_PENDING
→ recommendChallenges
→ Sarah SelectHumanChallenge
→ STAGE_B_ACTIVE
```

Worker order:

```text
EligibilityWorker
→ InterestQueueWorker
→ BlindAnswerReplayWorker / SandboxWorker
→ AnswerEvidenceEdgeWorker
→ AnswerReviewSlaWorker
→ AdvancementCohortProjector
→ ChallengeRecommendationWorker
→ StageBReplayWorker
→ Settlement / Remediation Worker
```

The new `demo:reset:matching` creates only starting facts: Opportunity, sealed Contract/Question/Policy, Attention policy,
Credit Account, 20 Interests/hard facts, Interest Events/Outbox, and Judge-only synthetic labels.

Reset must not create Commitment, Slot, Hold, Invitation, Answer, Review, Cohort, Allocation, ReviewWindow, or HumanChallenge.

Golden may preload external results for Candidate Answer, GPT, Sandbox, and Verifier, but the following must execute live:

```text
ActivateBlindReviewCommitment
BackedAnswerOfferCreated
Candidate Accept / Submit
HumanAnswerReviewed
AnswerReviewSettled
NextQueuedInterestOffered
AdvancementAllocation
HumanChallengeSelected
```

Default Demo goals:

```text
20 hard eligible Interests
8 reusable Answer Review Slots
first 8 backed offers
12 WAITING_FOR_BACKED_SLOT initially
8 immutable Answers in Cohort 1
8 HumanAnswerReview Receipts
after first Receipt: Candidate 09 receives the recycled Slot offer
Direct  → Blind Answer 42
Explore → Blind Answer 17
Answer 42 → Redis failover
Answer 17 → Duplicate webhook
```

---

## 13. Legacy Cutover

Use additive migration + single active path:

1. New Domain, Schema, migration, and tests coexist with legacy first;
2. Before the new vertical is accepted, README/HANDOFF explicitly identifies the runtime as legacy;
3. After acceptance, switch Routes, Worker composition, and role projections once;
4. The active runtime must not use a feature flag to expose both product semantics simultaneously;
5. Legacy MatchEdge data remains temporarily read-only for regression;
6. Remove old Employer E2E behavioral expectations while retaining security and atomicity coverage;
7. Subsequent cleanup removes code with no readers.

Cutover conditions:

```text
Web has no ReserveMatchedAttentionHandler dependency
Worker has no active MatchEdgeWorker composition
Primary HiringIntelligencePort has no buildMatchEdge method
Employer routes cannot return pre-answer Candidate cards
Legacy reserve-attention endpoint cannot mutate business state
No target code treats initial Slot WIP as total Candidate cap
```

---

## 14. Implementation Batches

### Batch 0: Contract Tests and Version Locking

- Add Interest/Application distinction, reusable Slot, no-pre-answer payload, no-pre-answer AI, first-settlement queue handoff, `7/8` Cohort barrier, and legacy endpoint cutover tests;
- Correct the AI document's `AnswerSubmitted → buildAnswerEvidenceEdge → HumanReview` order;
- Freeze the Event, Command, Projection, Queue Policy, and migration version map.

### Batch 1: Discovery, Queue, Contracts, and Domain (Complete)

- Implement PublicOpportunityProjection, Interest API, and Candidate queue visibility;
- Implement BlindReviewCommitment, InterestQueue, AnswerReviewSlot, Obligation, Cohort, and ActivityLease;
- Implement the `onlyboth.interest-queue@1` pure policy.

### Batch 2: PostgreSQL and Rolling Attention Escrow (Complete)

- Add `0003` migration/down;
- Implement Activate, Offer, Accept/Decline/Expiry, per-Slot Hold, and Closure Receipt;
- Verify fresh migration, atomic activation of eight Slots, prohibition of Answer without a Hold, Q_i, and concurrency.

### Batch 3: Recorded Answer and Answer Evidence AI (Complete; LIVE eval blocked by missing Key)

- Change the Stage A Sandbox Worker to use Answer as its subject;
- Implement immutable AnswerSubmission;
- Implement the `buildAnswerEvidenceEdge` Prompt, Validator, explicit Synthetic/LIVE Adapter, and Worker;
- The pre-answer Candidate matching AI call count must be zero; a disclosed Sidecar is allowed within a Backed ACTIVE Session.

### Batch 4: Human Review, Slot Recycling, and Cohort Allocation (Review/SLA Complete, Allocation Pending)

- Implement the independent Human Review Command/Receipt;
- Implement Credit return, Breach/Remediation, Slot recycling, and Queue handoff;
- Implement the Advancement Cohort barrier, blind-pass-first Direct, and public-seed Explore;
- Gate: after the first Review, Candidate 09 receives an Offer; `7/8` allocation returns 422; `8/8` precisely produces Answer 42 / Answer 17.

### Batch 5: UI, Challenge Reuse, and Runtime Cutover

- Replace the Employer Matching Panel;
- Update Candidate Discovery, Queue, Offer, Answer, and Deep Proof UI;
- Connect both Answers to Challenge/Sandbox;
- Remove the active MatchEdge Worker, old APIs, and old UI;
- Update Cold Open, Replay Manifest, README, and HANDOFF.

### Batch 6: Acceptance and Cleanup

- Run PostgreSQL, Playwright, Replay, offline Demo, evals, and build;
- Scan payloads, logs, errors, and screenshots for sealed data;
- Clean up legacy source;
- Save test logs and update HANDOFF;
- Delete or archive this document upon completion.

---

## 15. Test Plan

### Unit

- Interest/Application terminology and state boundaries;
- Queue FIFO, hash tie-break, prohibition of Employer skip, empty Queue;
- Slot Offer, Accept, Decline, Expiry, Review, Settlement, Reuse, Breach, Retire;
- Commitment Pause/Close and active Obligation preservation;
- Cohort membership, `7/8` barrier, Direct membership, Explore seed;
- no-Hold Answer rejection, Q_i, Credit, and version races;
- AI schema/ref/policy/refusal/incomplete/stale.

### PostgreSQL

- Fresh `0001 → 0002 → 0003` and down compatibility;
- Activate + 8 reusable Slots + Event + Outbox + Receipt in one transaction;
- Queue lease/Inbox duplicate handling;
- First Review Settlement + Slot AVAILABLE + next-offer Outbox atomic consistency;
- After the first Review, Candidate 09's Offer pins Cohort 2; Cohort 1 membership does not drift with completion order;
- Concurrent Workers cannot offer one Slot to two people or skip the Queue head;
- Immutable Answer/Edge/Review/submitted Cohort Seat/Allocation;
- Deep Windows/Holds/Decisions all succeed or all fail;
- stale, double click, SLA race, cross-opportunity `Q_i=1`;
- Pause/Close and Closure Receipts;
- Breach notice, forfeit, compensation, WIP penalty, and retired Slot.

### Security

- The number of Candidate Card/Claim/MatchEdge/Profile/GPT rationale items in the Employer pre-answer payload is zero;
- The number of pre-answer OpenAI Candidate matching requests is zero;
- The Candidate Sidecar may run only in an ACTIVE backed Session, and the Trace must be Sealed and disclosed to the Reviewer;
- The Queue Scheduler dependency graph has no Claim/Private Label/AI repository;
- Candidates cannot read other Candidates, the Cohort pool, Direct/Explore, or Employer Edge;
- Employers cannot reorder or skip the Queue;
- Prompt Injection cannot change the Prompt, Queue, Eligibility, Review, or Allocation;
- Logs/errors contain no raw Answer, labels, Cookie, key, or database URL.

### Replay / Playwright

1. Candidate browses the Opportunity and expresses Interest;
2. An Application cannot be submitted when there is no backed Slot;
3. Sarah cannot see Candidate cards before answering;
4. Sarah activates eight reusable Slots;
5. The first eight receive backed offers, and the remaining twelve display waiting rather than Reject;
6. Eight Answers are submitted through Application Commands;
7. After the first Human Review settles, the ninth person receives an Offer within 2 seconds;
8. Eight independent Human Review Commands;
9. `7/8` locks Allocation in the UI/API while Slot recycling continues;
10. After `8/8`, Direct Answer 42 / Explore Answer 17;
11. Candidates 42/17 do not see the allocation kind;
12. The two Challenge branches are exactly consistent;
13. stale, duplicate, and legacy endpoint actions produce no additional Event;
14. Opportunity Close produces a Closure Receipt for those waiting;
15. When external connectivity is down and there is no OpenAI key, Golden passes the entire chain.

### LIVE eval

- 6 normal Answer Evidence cases, 3 insufficient-evidence cases, 3 Prompt Injection cases;
- 12/12 pass the Schema/ref/version/no-label/no-score hard gates;
- Missing key is recorded as `BLOCKED` and cannot be replaced with Golden.

## 16. Final Acceptance Matrix

| Gate                                                              | Required result                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Employer pre-answer Candidate cards                               | `0`                                                          |
| Pre-answer Employer-side Candidate selection AI requests          | `0`                                                          |
| Candidate-side Eligibility AI requests                            | audited, Candidate-only, and unable to rank or reorder Queue |
| Candidate Sidecar traces missing from submitted Artifact manifest | `0`                                                          |
| Reusable Answer Review Slots                                      | `8`                                                          |
| Slot WIP treated as total applicant cap                           | `0`                                                          |
| Accepted Applications without held Review                         | `0`                                                          |
| Immutable Cohort 1 Answer Submissions                             | `8`                                                          |
| Named Human Answer Review Receipts                                | `8`                                                          |
| Candidate 09 offer after first Review Settlement                  | present before Cohort `8/8`                                  |
| Allocation at Cohort `7/8`                                        | rejected                                                     |
| Allocation at Cohort `8/8`                                        | accepted                                                     |
| Direct source                                                     | Blind Answer 42 Evidence only                                |
| Explore source                                                    | Blind Answer 17 by public seed                               |
| Deep Proof Windows                                                | `2`, atomic                                                  |
| Candidate Direct/Explore fields                                   | `0`                                                          |
| Waiting Interest closure receipts                                 | `100%` on explicit close                                     |
| Legacy reserve endpoint mutations                                 | `0`                                                          |
| External requests in offline demo                                 | `0`                                                          |
| Sealed-label leakage hard gates                                   | `100%`                                                       |

The following must be run and the actual output saved:

```text
pnpm check
pnpm build
TEST_DATABASE_URL=<redacted> pnpm test:postgres
TEST_DATABASE_URL=<redacted> pnpm test:e2e
pnpm test:evals
pnpm replay:verify
pnpm demo:offline
git diff --check
rg -n "\.(only|skip)\(" tests apps packages
```

---

## 17. Deletion Checklist

This document may be deleted or archived only after all of the following questions have been answered “yes”:

1. Can the Candidate browse opportunities, express low-cost Interest, and clearly understand that Interest is not an Application?
2. Is submitting an Answer impossible without a backed Slot?
3. Is the Slot reusable WIP rather than a total quota for selecting eight people once from twenty?
4. Does the ninth Offer trigger immediately after the first Review Settlement, without waiting for `8/8`?
5. Is the Employer unable to read or reorder the pre-answer Candidate Queue?
6. Does every submitted Application have a Receipt or Breach?
7. Is the Employer pre-answer payload unable to represent a Candidate Card, Claim, or GPT rationale?
8. Has `buildMatchEdge` been removed from the main Port and the active Worker?
9. Does the `7/8` Cohort still reject Allocation?
10. Do Direct/Explore reference only anonymous Evidence from the same reviewed Cohort?
11. Does ReviewWindow pin AnswerSubmission, AnswerEvidenceEdge, and Cohort?
12. Can the Candidate not see Direct/Explore or other Candidates?
13. Does Opportunity Close notify everyone still waiting without generating a capability conclusion?
14. Does Golden fix only external inputs without pre-writing real-person actions or Slot handoffs?
15. Are PostgreSQL, Playwright, Replay, offline Demo, security tests, and reports all complete?

If any item is “no,” the runtime-code migration is not complete.
