# AGENTS.md

This file applies to the repository root and every descendant directory. Every agent working in this repository MUST follow it.

## 1. Required reading before work

Before changing the repository, read these sources in order:

1. `AGENTS.md`: stable execution rules for this repository;
2. `OnlyBoth-产品精神.md`: normative blind-answer-first product doctrine;
3. `OnlyBoth-产品方案.md`: authoritative product semantics and product invariants;
4. the complete relevant sections of `OnlyBoth-工程设计.md`: architecture, domain, privacy, and demo behavior;
5. `HANDOFF.md`: current implementation state, unresolved work, recent verification, and risks;
6. all source files, tests, migrations, prompts, fixtures, and test reports relevant to the task.

Do not revive or implement the dating, social, Shared Table, or generic AI-interviewer directions that the product plan has overridden.

## 2. Project mission

OnlyBoth is a label-blind proof and Attention Escrow mechanism for hiring. It addresses two errors produced by resume-first screening:

- **False Positive:** strong resume labels consume expensive human interview time even when the candidate cannot handle the role-specific risk;
- **False Negative:** a non-traditional candidate loses access before producing relevant work evidence.

The runnable spine uses Senior Backend Engineer hiring as its primary acceptance scenario. The
synthetic catalog also includes twenty cross-domain roles to verify that the mechanism is not a
code-test-specific trick, plus six technology Match Lab roles that exercise distinct Candidate-only
Eligibility feeds for the six engineering-oriented synthetic Candidates.

The product sequence is fixed:

```text
Seal the versioned Critical Challenge and labels
→ Activate reusable named-review slots
→ Queue eligible interests without profiles
→ Offer each available slot to the next interest
→ Record candidate answers
→ Complete evidence-linked human reviews
→ Authorize the pinned résumé snapshot for each ADVANCE_ELIGIBLE answer
→ Show authorized résumés only in the separately paginated Recruiter workspace
→ Recycle each settled slot to the next queued interest
→ Select the passed answer set with evidence-linked receipts
→ Commit optional Deep Proof attention
→ Human challenge
→ Evidence-linked outcome
→ Candidate continuation and settlement
```

GPT primarily operates on the demand and institutional side. A sealed Job Contract MAY also allow
the disclosed platform Candidate assistant. That assistant is a bounded drafting instrument: its
complete trace is frozen with the Answer, it cannot submit, and it never receives an OpenAI key in
the browser. External Candidate AI remains outside the controlled workspace. Neither AI surface may
create a pre-answer candidate-selection edge from a profile or self-asserted claim.

A Candidate may optionally publish a private Evidence Passport for Candidate-side JobPost access.
`deriveCandidateEligibilityMatches` may unlock an evidence-gated JobPost only when a validated
positive connection binds an input Evidence ref to one Recruiter-sealed background tag. It is an
OR-shaped access hypothesis, not a score, rank, verification claim, Employer candidate list, or
Attention decision. A Candidate without a published Passport sees only `OPEN_TO_ALL` roles. GPT
failure remains `MATCHING | PARTIAL | FAILED | STALE`, never an ineligibility conclusion, and
`OPEN_TO_ALL` roles remain accessible. The older `deriveCandidateJobSignals` data is retained for
compatibility but has no Feed-visibility authority. The Passport MUST contain an explicit highest-education record, including the valid
`NO_FORMAL_DEGREE` pathway. Discovery uses deterministic precedence rather than a score: education
precedes work/credential evidence through the inclusive two-year graduation boundary; after that,
work/credentials precede education. Institution identity is excluded from the AI input, and absence
of a formal degree MUST NOT create a negative quality conclusion.

A JobPost's `CriticalChallenge` is one ordered, versioned whole composed of one to twelve
`TEXT | AUDIO | IMAGE | FILE` parts. Candidate and Employer views MUST resolve the same sealed
manifest. Candidates MUST be able to inspect the complete Challenge before registering Interest or
spending Credit. Media assets require immutable refs, MIME, bytes, SHA-256, same-origin paths, and
accessible metadata; synthetic fixtures MUST be disclosed as synthetic. Challenge parts MUST NOT
be scored, allocated, or treated as independent pre-answer selection opportunities.

## 3. Authority and conflict resolution

Resolve conflicts in this order:

1. the user’s explicit requirements for the current task;
2. this `AGENTS.md`;
3. the blind-answer-first doctrine in `OnlyBoth-产品精神.md`;
4. product invariants and confirmed decisions in `OnlyBoth-产品方案.md`;
5. engineering boundaries in `OnlyBoth-工程设计.md`;
6. current implementation state recorded in `HANDOFF.md`;
7. the behavior of the existing code, tests, and fixtures.

Do not silently choose between conflicting code and documentation. Confirm the intended behavior, then update the implementation, tests, and relevant documentation together. Record the decision in `HANDOFF.md`.

Any change to reveal conditions, breach responsibility, GPT authority, candidate rights, or other product semantics MUST also update the product plan, engineering design, and any required ADR. Do not let a code-only change redefine the product.

When choosing among otherwise valid engineering options, use this priority:

```text
Product invariants
→ privacy, authorization, and high-risk hiring boundaries
→ state-machine and ledger consistency
→ demo truthfulness
→ engineering completeness
→ extensibility
```

## 4. Non-negotiable product invariants

```text
No held blind-review obligation → No candidate answer
No recorded answer evidence → No candidate selection
No completed cohort reviews → No Direct / Explore allocation
No work evidence → No pedigree reveal
No settled human obligation → That review Slot cannot serve the next candidate
```

The server MUST enforce all of the following:

- A formal answer cannot start without a named reviewer, an available Answer Review Slot, a review SLA, and `CreditHold=HELD`.
- Employer selection before an answer MUST NOT use candidate claims, profile text, résumé labels, source packaging, or GPT rationale.
- Candidate-side background access may use only a validated positive Passport-Evidence-to-Job-tag
  connection or an immutable `OPEN_TO_ALL` policy. It cannot produce Employer-visible candidate
  cards, ranking, Queue order, or a negative ability conclusion.
- Answer Review Slots are reusable concurrent obligations, not a total applicant cap.
- Answer Invitations are scheduled by deterministic hard Eligibility and a versioned public non-profile queue policy; the Employer does not pick or reorder candidates before they answer.
- Every submitted formal Application must receive one named human Review Receipt or enter visible Employer Breach.
- A settled Answer Review Slot must serve the next queued Interest without waiting for a cohort-wide barrier.
- Direct can be selected only from Answers that already received an `ADVANCE_ELIGIBLE` anonymous
  Human Review after every required review in the current Advancement Cohort has a Receipt. The
  Allocation Command may reference Answer Evidence, not résumé scores or AI candidate ranks; the
  product no longer claims the Reviewer has not seen an already authorized Resume at this later step.
- Explore can be selected only by deterministic public-seed code from the remaining valid answers in that same Cohort.
- Page views, dwell time, scrolling, AI summaries, and bulk rejection do not fulfill a Human Answer Review obligation.
- One Attention Slot can bind at most one unsettled Review Window at a time.
- Candidate Stage A submission creates an immutable snapshot.
- GPT can recommend only versioned Challenge Catalog IDs.
- Only a named reviewer’s `HumanChallengeSelected` command can unlock Stage B.
- The selected challenge must actually alter the Stage B scenario or verifier.
- A window cannot settle normally without an evidence-linked human outcome.
- Backpressure is enforced per Slot, not as a job-wide or Advancement Cohort barrier.
- Résumé Reveal requires an immutable anonymous Human Answer Review with decision
  `ADVANCE_ELIGIBLE`, the Candidate's versioned conditional consent, and the exact Resume Snapshot
  pinned when the backed Answer Offer was accepted. The Review and Reveal authorization MUST commit
  atomically.
- Authorized résumé fields MUST appear only in the reviewer-scoped, separately paginated Recruiter
  Candidate workspace. They MUST NOT enter the sequential anonymous Answer Review projection, AI
  analysis input, Queue, Eligibility, Invitation, or Candidate discovery output.
- `NO_FURTHER_PROOF`, `INCONCLUSIVE`, withdrawal, Employer Breach, and Platform Abort MUST NOT reveal
  a Candidate’s labels.
- Employer Breach must record notice, Credit forfeiture, compensation, reliability penalty, and Slot retirement before settlement.
- Platform failure MUST NOT be recorded as Employer Breach or candidate failure.
- A candidate can hold at most one Active Window across all opportunities in the MVP: `Q_i = 1`.
- A used Ask Back must be answered or explicitly marked undisclosable before normal settlement.
- Ask Back submission and answer periods must be finite so a Slot cannot remain occupied forever.
- Candidate Answer focus and process monitoring MUST be versioned and disclosed before Credit
  consumption. The MVP may record only browser visibility/window focus plus server-side revision,
  platform GPT/Voice, and submission metadata; never URLs, application names, keystrokes, pointer
  paths, camera, biometrics, or emotion. Focus-triggered automatic submission MUST reuse the normal
  immutable Submission path. Versioned behavior severity may inform the bounded Human Review but
  MUST NOT create an AI-cheating probability or automatic hiring decision.
- Browser focus telemetry is client-reported and cannot prove absence of a second device. Missing
  telemetry caused by platform or network failure MUST NOT be attributed to the Candidate.

## 5. Authoritative engineering shape

Use a TypeScript `pnpm` monorepo, a modular monolith, and two runtime processes by default:

```text
Next.js Web / Command API
Background Worker
PostgreSQL + Event Log + Transactional Outbox
Private Object Storage (MinIO locally; S3-compatible port)
```

The intended logical packages are:

```text
apps/web
apps/worker
packages/domain
packages/application
packages/projections
packages/contracts
packages/db
packages/ai
packages/challenge-catalog
packages/sandbox
packages/demo-replay
packages/ui
packages/testkit
```

Unless the user explicitly changes scope, do not introduce microservices, Kafka, a vector database, multi-agent business workflows, a full cloud IDE, or WebSocket infrastructure.

## 6. Dependency and state-mutation rules

The allowed dependency direction is:

```text
apps
→ application
→ pure domain

db / ai / sandbox / projection adapters
→ application ports + contracts
```

The following rules are mandatory:

- Domain code MUST NOT import Next.js, an ORM, a database driver, the OpenAI SDK, the Docker SDK, or environment variables.
- Application services load aggregates through repositories, invoke pure domain behavior, and then persist the result.
- Business changes initiated by the Worker must use the same Application Commands as Web-initiated changes.
- UI code, routes, workers, AI adapters, and Replay drivers MUST NOT directly mutate business-state tables.
- Do not expose a generic `PATCH { status }` endpoint. One business intention maps to one explicit Command.
- A Command transaction performs authentication, authorization, state and deadline validation, aggregate persistence, Domain Event append, and Outbox write atomically.
- Use Aggregate Version, Idempotency Key, and optimistic concurrency to handle duplicate clicks and SLA races.
- Persist deadlines using database time. A browser timer has no authority over state.
- Background jobs, Outbox consumers, settlements, Credit operations, and projection updates must be idempotent.
- PostgreSQL stores private Artifact metadata and immutable hashes; rich text, original audio,
  transcripts, and disclosed GPT traces live in private Object Storage. Presigned uploads are
  short-lived, owner-bound in the database, checksum-verified, append-only from the first PUT, and
  cleaned if abandoned. Presigned uploads and server writes MUST use an atomic create-only
  condition rather than a race-prone read-before-write check.

A Review Window MUST pin these references when it is created:

```text
contract_version_id
label_policy_version_id
proof_template_version_id
challenge_catalog_version_id
answer_submission_id
answer_evidence_edge_id
reviewer_id
```

Sealed objects are immutable. A rule change creates a new version and never rewrites a Window that has already started.

## 7. Label Veil, authorization, and data boundaries

- Physically separate `candidate_private_labels`, `candidate_claims`, and recorded answer evidence.
- Before Candidate answers exist, Sarah receives no Candidate Profile, Passport, Match, connection,
  or Claim DTO. `EligibilityEdge@2` exposes only an opaque access basis plus deterministic hard-fact
  result to the allocation service.
- After answers exist, Sarah and GPT may read only role-specific anonymous Answer Evidence DTOs.
- Name, photo, school, previous employer, referral source, and counterfactual rank MUST NOT appear in first-round Employer payloads, GPT inputs, ordinary logs, or error messages.
- Candidate, Employer, and Synthetic Judge use separate server-side projections and endpoints.
- Candidate Evidence Passport Drafts, immutable Snapshots, and discovery signals are Candidate-only.
  Employer queries and pre-answer GPT paths MUST NOT read them.
- Judge Counterfactual access is limited to explicitly marked synthetic data.
- CSS, client-side conditional rendering, and prompt instructions are not privacy boundaries.
- Reveal requires domain authorization. The Event Log stores a `LabelRevealAuthorized` reference, not the label values.
- The Reveal Materializer reads only authorized fields from the Private Label Vault and writes only the corresponding Employer Reveal View.
- Never write API keys, cookies, sessions, private labels, or real candidate material to logs, fixtures, screenshots, test reports, or handoffs.

## 8. Blind answers, Attention, and optional Reach

The target product has two attention stages and must never select a candidate from a pre-answer
profile or claim:

```text
Stage 1: Rolling Blind Answer Review
sealed question + named reviewer + reusable review slot + credit hold
→ public non-profile queue offer
→ recorded answer
→ evidence-linked human review receipt
→ per-slot settlement and next queue offer

Stage 2: Deep Proof Window
reviewed anonymous answer evidence in a completed Advancement Cohort
→ post-answer Direct selection + deterministic Explore
→ Challenge + outcome + settlement
```

- Eligibility has two separated layers: GPT may establish Candidate-only background access through
  one validated positive Evidence-to-tag connection; deterministic code alone evaluates legal,
  language, timezone, and other typed hard predicates. Neither layer grants the Employer profile access.
- The Employer activates bounded reusable Blind Answer Review WIP before any formal Application is accepted.
- Lightweight Interest is a queue registration, not an Application or a claim of individual human review.
- Candidate Application Credit is a non-transferable rate limit, never a bid, ranking signal, or
  Employer-visible boost. Registering Interest is free. One Credit is consumed only when the
  Candidate accepts an already-backed Offer and the server atomically starts the Answer Session.
- Employer Review Breach and Platform Abort return the consumed Candidate Credit without a negative
  capability inference. Candidate abandonment after the Answer starts and an empty deadline expiry
  do not return it.
- Candidate claims may support candidate-side routing or later audit, but they are not an Employer selection input and are not verified ability evidence.
- Candidate-side Eligibility matching may link sanitized Passport source refs to Recruiter-sealed
  education/work-domain tags as a bounded access hypothesis. The Feed returns only a current
  positive Evidence match, `OPEN_TO_ALL`, or an already pinned active Journey. An unmatched role's
  Feed, detail, and Interest surfaces must all return the same not-found boundary. Matching cannot
  reorder Interests, allocate Slots, create Employer candidate lists, or describe
  `SYNTHETIC_SOURCE_ATTACHED` as independently verified.
- Demo actor switching MUST issue a signed allowlisted actor Session; changing a client-side label
  is not authentication. Each synthetic Candidate must retain an independent Credit account,
  Passport, discovery projection, and Resume Snapshot. The operator-only identity chooser must not
  enter the Recruiter pre-answer projection.
- GPT structures only recorded Answer Evidence and must reference real answer, event, artifact,
  process-signal, diff, or verification IDs.
- GPT may output `GOOD_ANSWER | BAD_ANSWER` only for one sealed Challenge plus source-linked language
  findings. It does not output a Candidate-wide Fit/Talent Score, candidate ranking, Direct/Explore
  decision, or hiring recommendation.
- Employer Evidence Analyst policy and Review Criteria are sealed before Candidate consent. The
  policy defaults to `OFF`; historical Answers MUST NOT be analyzed retroactively.
- Employer Evidence Analyst criterion findings are limited to `SUPPORTED`, `CONTRADICTED`,
  `NOT_ADDRESSED`, or `INSUFFICIENT_EVIDENCE`; its language findings are limited to the sealed
  Answer's logic, clarity, consistency, and responsiveness. It MUST NOT produce a Candidate-wide
  score, ranking, advancement recommendation, or draft/submit the Human Answer Review.
- `AnswerProcessEvidence@2` deterministically classifies disclosed database-recorded revision,
  platform GPT/Voice, submission, and platform-failure metadata with a versioned green/yellow/red
  rule set at Submission time. It MUST NOT consume raw Focus timelines, intermediate draft text in
  Employer/AI projections, keystrokes, clipboard data, camera data, or biometrics.
- Process sources MUST NOT support or contradict an AI capability criterion or change the AI's
  Good/Bad Answer verdict. The named Reviewer may cite immutable process-signal refs in the bounded
  Human Review, but severity is not proof of inactivity, intent, integrity, or external AI use.
- `DISABLED`, `ANALYZING`, `NEEDS_HUMAN`, `FAILED`, and `SUPERSEDED` analysis states MUST NOT block
  Human Review, Slot settlement, Employer breach handling, or the next queue offer.
- A valid Candidate without a current Slot is `WAITING_FOR_BACKED_SLOT`, not `abstain`, unqualified, rejected, or an unread applicant.
- Deterministic code owns queue order, invitations, Explore, WIP, Credit, and public-seed allocation. The named reviewer owns only the post-answer Direct decision and later human outcomes.
- The pre-answer `buildMatchEdge` Claim path is legacy compatibility behavior and MUST NOT be extended as the target product architecture.
- Attention concepts remain separate:

```text
AttentionCommitment = reviewer capacity and SLA policy
AttentionSlot       = one reusable WIP unit
ReviewWindow        = one Slot-to-candidate binding
CreditHold          = platform Credit frozen for that Window
```

Candidate Reach is optional and is not required for the main demo. If implemented:

- Reach is limited, free, and non-transferable; it is not a bid or boost.
- Return the Reach Hold when no reviewer-backed reservation is created.
- Consume Reach only after the candidate accepts a formal reviewer-backed Window.
- Reach never bypasses Eligibility, deterministic Invitation allocation, Employer WIP, or a held Blind Answer Review obligation.
- Changing Reach from an optional mechanism to a core product path requires a product-plan update.

## 9. GPT boundary

The target application exposes eight narrow AI operations:

```text
compileContract
deriveCandidateJobSignals
deriveCandidateEligibilityMatches
buildAnswerEvidenceEdge
recommendChallenges
compressEvidence
assistCandidateAnswer
transcribeVoiceMemo
```

`deriveCandidateJobSignals` is a Candidate-owned discovery operation, not Employer matching. Its
input excludes identity labels, former-employer names, raw locator tokens, contact details, and the
Private Label Vault; its output contains only input-bound opportunity/capability/evidence refs,
bounded reasons, and `still_unknown`.

`deriveCandidateEligibilityMatches` is the only AI operation with Candidate Feed access authority.
It receives no identity, school name, former-employer name, contact detail, Resume, Private Label,
or raw locator. Every positive result must bind input Opportunity, tag, Evidence, and source refs;
education can connect only to education tags and all other evidence only to work-domain tags. It
cannot rank, score, hide `OPEN_TO_ALL`, alter Queue order, or create an Employer-visible match list.

The currently implemented `buildMatchEdge` operation is a deprecated compatibility surface until
the blind-answer migration is complete; it must not be treated as authority for target product behavior.

Implementation requirements:

- Use the OpenAI Responses API and strict Structured Outputs.
- Keep prompts in the repository and version them.
- Use `store: false` by default and do not depend on remote conversation state.
- Treat candidate text, job descriptions, code, and logs as untrusted user data.
- Validate AI output against schemas, source references, Catalog allowlists, version pins, and authorization rules.
- Route refusals, incomplete responses, invalid references, and invalid Catalog IDs to explicit human handling. Do not degrade them into free-text business decisions.
- The AI adapter has no business-state mutation tools.
- GPT cannot read the Private Label Vault, select the final challenge, impersonate Sarah, release a Token, reveal labels, or automatically Advance or Close.
- GPT cannot allocate Answer Invitations, fulfill Human Answer Reviews, select Direct or Explore, or transform a self-asserted Claim into verified ability evidence.
- Candidate browsers, routes, and Sandboxes never receive an OpenAI key. When the sealed policy is
  `PLATFORM_ASSISTANT_ALLOWED`, a Candidate Command stores the message as a private Artifact and a
  Worker performs `assistCandidateAnswer`; the complete user/assistant/error trace is sealed with
  the submission and disclosed to the named reviewer.
- The Candidate assistant receives only the sealed question, allowed assumptions, current draft,
  and this Session's disclosed prior turns. It has no tools, web, files, private labels, résumé,
  business-state mutation, final-submit, or hiring-decision authority.
- A Voice Memo's original private audio object is authoritative. `transcribeVoiceMemo` creates a
  derived Artifact; transcription failure is a platform condition, not Candidate failure, and does
  not prevent submission of the verified source audio.
- Never execute GPT-generated code, commands, paths, or environment variables.

## 10. Challenge Catalog, Sandbox, and Verifier

- Runtime code loads scenarios only by pre-validated, versioned Catalog ID.
- In the MVP, Sarah selects a Catalog ID and cannot freely edit a challenge.
- Any later parameterization may alter only manifest-declared allowlisted parameters and must produce a new validated hash.
- The Stage A snapshot is immutable. Stage B is rebuilt from that snapshot and the selected scenario.
- Candidate Sandboxes are non-root, resource-limited, secret-free, and deny public-network access by default.
- Hidden tests never enter the Candidate Sandbox.
- Sandbox and Verifier are separate isolation boundaries connected by an Artifact or Snapshot reference.
- Common Verifier results provide a comparable baseline within one Contract.
- Scenario Verifier results explain behavior under a selected challenge and MUST NOT be used to rank raw pass counts across different scenarios.
- `DockerSandboxAdapter` and `ReplaySandboxAdapter` implement the same `SandboxPort`.

## 11. Golden Replay and demo truthfulness

Golden Replay means:

```text
Fixed external or nondeterministic GPT, Sandbox, and Verifier inputs
≠ a recorded UI video
≠ bypassing Commands, authorization, the state machine, or projections
```

The implementation MUST guarantee:

- The first 30 seconds do not depend on OpenAI, a remote database, a remote Sandbox, a CDN, analytics, feature flags, DNS, or any other external network service.
- Localhost communication between local processes is allowed.
- The Judge UI clearly displays `Synthetic — Pre-recorded external inputs`.
- Replay may preload Candidate Answer, GPT, Sandbox, and Verifier external outputs, but it MUST NOT preload final business authorization as if a human had acted.
- The interactive blind-answer Replay executes `ActivateBlindReviewCommitment`, Candidate Answer state changes, every `HumanAnswerReviewed` Command, at least one real Slot-settlement-to-next-offer handoff, the post-answer Direct decision, and deterministic Explore through the real application path.
- Replay pauses at each required human boundary, including the Answer Review barrier and `CHECKPOINT_PENDING`.
- Sarah’s challenge click follows the real Command, authentication, transaction, and state-transition path.
- Candidate UI changes come from the `HumanChallengeSelected` event and Candidate Projection.
- Selecting a different Catalog ID produces the corresponding different Stage B on the Candidate side.
- `LIVE`, `CACHED_AI`, and `GOLDEN_REPLAY` reuse the same Commands, Domain, Event schemas, projections, and UI. Only adapters differ.
- A Replay Manifest pins the Contract, Catalog, seed, fixtures, and projection hashes.
- Demo Reset exists only in a Demo build or local script and is never a production state-machine backdoor.
- The six-minute proof is clearly described as recorded input and is never presented as having happened live inside a three-minute demo.

## 12. Coding and operational conventions

- Use TypeScript strict mode. Avoid `any`; validate all boundary data with a schema.
- Use explicit business names in Domain code. Avoid vague names such as `process`, `handleData`, or numeric states.
- Explicitly version every Domain Event, Command contract, AI schema, Catalog manifest, and Replay format.
- Every Evidence statement references an Event, Artifact, Diff, Command, or Verification Run.
- Do not output black-box Candidate-wide scores, personality or emotion inferences, integrity
  scores, or AI-cheating probabilities. A versioned Good/Bad verdict scoped to one sealed Answer
  and transparent rule-based behavior severity are permitted only with pre-application disclosure.
- Inject Clock, ID, seeded randomness, AI, and Sandbox through replaceable ports so tests remain deterministic.
- Explain the need for a new dependency before adding it. Prefer existing dependencies and the standard library.
- Preserve unrelated user changes and do not modify files outside the current scope.
- Do not use destructive Git commands. Do not rewrite history or discard changes without explicit user authorization.
- `AGENTS.md`, `HANDOFF.md`, and every `README.md` in this repository MUST be written in English.
- Code, identifiers, comments, test names, test reports, ADRs, and operational documentation should be written in English unless a user-facing product requirement explicitly requires another language.

### 12.1 Structured operational logs

Web, Worker, AI, and Sandbox adapters use one structured logger. Do not scatter `console.log(dto)` calls. Record these fields when applicable:

```text
timestamp
level
service
runtime_mode
trace_id
correlation_id
command_or_job
aggregate_type
aggregate_id
aggregate_version
actor_role
event_id
outcome
duration_ms
error_code
synthetic
```

Use opaque actor IDs. Operational logs are diagnostic only and MUST NOT drive business state; `domain_events` are the audit truth for state changes. API, Outbox, Worker, AI, Sandbox, and Verifier flows should carry the same `correlation_id`.

Operational logs MUST NOT contain:

- private labels or complete Candidate / Employer DTOs;
- raw prompts, full model responses, candidate text, source code, diffs, or terminal output;
- API keys, cookies, Authorization headers, database URLs, or other secrets;
- hidden tests, private Catalog fixtures, or complete database rows;
- unredacted Replay inputs.

Prefer IDs, hashes, byte counts, states, and `artifact_ref` values. Classify errors at least as `USER_INPUT | AUTHORIZATION | DOMAIN_CONFLICT | EXTERNAL_AI | SANDBOX | PLATFORM | TIMEOUT` so platform failures cannot be attributed to either participant.

### 12.2 Explicit prohibitions

- Do not implement `PATCH /review-windows/:id { status }`.
- Do not let UI code, routes, workers, AI adapters, or Replay drivers directly write business-state tables.
- Do not construct one full-field DTO and hide fields in the client.
- Do not let Candidate routes import Judge or Audit projections.
- Do not execute shell commands generated by GPT or a candidate.
- Do not store business truth in a browser timer, React state, or recorded animation.
- Do not change a Catalog or Replay without updating its version, manifest, and hashes.
- Do not make tests pass by deleting assertions, expanding authorization, adding `.only`, or adding an unexplained `.skip`.
- Do not claim that a remote proof has been “proven AI-free.”
- Do not use real hiring data, cash escrow, or transferable tokens without explicit user authorization.

## 13. Mandatory development completion protocol

This protocol applies to every repository-changing development task, including source code, schemas, migrations, prompts, Catalog entries, fixtures, Replay data, configuration, scripts, and behavior-defining documentation.

### 13.1 Before implementation

1. Read this file, the product plan, the relevant engineering-design sections, and `HANDOFF.md`.
2. Inspect `git status` and preserve existing user changes.
3. Locate the existing tests and root `package.json` scripts; do not invent commands.
4. Identify the affected invariants, role projections, runtime modes, and security boundaries.

### 13.2 During implementation

1. Implement the smallest complete vertical slice.
2. Every behavior change MUST add or update automated tests in the same change.
3. Do not disable, delete, skip, or weaken a failing test to make an implementation pass.
4. Prompt, Catalog, or Replay changes must also update versions, fixtures, and evals.
5. State-machine changes must test the success path, illegal transitions, duplicate commands, and relevant races.

### 13.3 Mandatory gate after implementation

Every development task MUST complete these steps in order:

```text
Add or update tests
→ run affected tests
→ run appropriate regression checks
→ persist actual test output under test-reports/
→ update HANDOFF.md
→ only then report completion
```

A task is incomplete if it has no tests, no persisted test report, or no `HANDOFF.md` update.

Documentation-only changes still require proportionate automated validation, such as a contract test, Markdown structure check, link check, or schema-example parse. If no automated check is applicable, record `N/A` and a concrete reason in the report; never fabricate a pass.

## 14. Test requirements

### 14.1 Minimum tests by change type

| Change                         | Minimum required verification                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Domain / state machine         | Unit tests for success, invalid state, idempotency, and concurrency version           |
| Command / API                  | Integration tests for authentication, schema, transaction, and Outbox                 |
| Label / projection             | Leakage and RBAC tests covering payloads, logs, and errors                            |
| GPT / prompt                   | Structured Output tests, source-ref validation, and prompt-injection evals            |
| Catalog                        | Manifest, allowlist, version/hash, and challenge-branch tests                         |
| Sandbox / Verifier             | Isolation, timeout, no-network, secret, hidden-test, and determinism tests            |
| Replay                         | Integrity, branch parity, role projection, and offline E2E                            |
| UI                             | Component or Playwright tests for critical interactions                               |
| Migration                      | Fresh up migration, constraints, and necessary rollback or compatibility verification |
| Documentation / agent contract | Required clauses, structure, links, and example-consistency checks                    |

### 14.2 Stable root commands

Inspect the actual `package.json` before running commands. Once the application scaffold exists, maintain these stable root entry points wherever applicable:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm test:evals
pnpm replay:verify
pnpm demo:offline
pnpm check
```

`pnpm check` must aggregate at least format checking, lint, type checking, unit tests, integration tests, and security tests. Do not claim that a nonexistent command was run. If the current task creates the scaffold, create the relevant scripts; before the scaffold exists, run and record equivalent commands.

Before handoff, also run:

```text
git diff --check
rg -n "\\.(only|skip)\\(" tests apps packages
```

Record missing directories honestly. Explain pre-existing skips and never add an unexplained skip.

### 14.3 Failures and blockers

- Preserve real failing output; do not delete failure evidence.
- Distinguish regressions introduced by the current change from pre-existing failures and environment blockers.
- If dependencies, secrets, or services are unavailable, run every check that can still run.
- Record `BLOCKED`, the failed command, exit code, reason, and recovery steps in both the report and `HANDOFF.md`.
- Never report Not Run, Skipped, or Blocked checks as Passed.
- Do not mark a handoff Complete when required tests failed or were not run.

## 15. Test report logs

Persist every development task’s actual test output under:

```text
test-reports/YYYYMMDDTHHMMSSZ-<short-scope>.log
```

Use UTC and a short kebab-case scope. Each report MUST include:

```text
Timestamp (UTC)
Scope
Git branch / commit, when available
Environment / runtime mode
Exact commands executed
Exit code for every command
Raw or complete relevant output
Passed / Failed / Skipped / Blocked summary
Known pre-existing failures
```

Rules:

- Preserve actual output; do not rewrite it into a fictional success.
- Link every report from `HANDOFF.md`.
- Multiple suites may share one report, but record every command and exit code separately.
- Do not commit large binary artifacts; retain a text report and an external artifact reference.
- Remove secrets, tokens, cookies, personal information, and private labels before saving.
- Keep failure logs. A fix creates a new report and never overwrites historical evidence.
- `test-reports/README.md` is the authoritative report-format reference.

## 16. HANDOFF.md requirements

Every development task MUST update the root `HANDOFF.md` before completion. Put the newest entry first and preserve unresolved risks and historical failures.

During parallel agent work, only the primary integration agent may update the root `HANDOFF.md` and final test-report index. Subagents return changed files, verification results, and risks to the primary agent so concurrent handoff edits cannot overwrite each other.

Every handoff entry MUST include:

```text
Date and status
Goal
Actual outcome
Files changed
Product or engineering decisions
Tests added or updated
Exact verification commands and results
Test-report path
Checks not run and why
Known issues, risks, and blockers
Migration or environment-variable changes
One explicit next action
```

Handoff rules:

- Record only work that actually happened.
- Use `Complete`, `Partial`, or `Blocked`.
- `Complete` requires tests, a persisted report, and an updated handoff.
- Highlight compatibility impact from API, schema, state-machine, prompt, Catalog, or Replay-format changes.
- Link failing reports and identify whether the current change introduced the failure.
- Compare runtime-mode parity using a versioned event normalizer that ignores nondeterministic Event IDs, timestamps, and external run IDs.
- Do not describe planned work as completed work.

## 17. Definition of Done

A development task is complete only when all of the following are true:

- The implementation satisfies the current user request, product plan, and engineering design.
- Core product invariants remain intact.
- New behavior has automated tests and existing tests were not weakened improperly.
- Affected tests and reasonable regressions were actually run.
- Actual test output is stored under `test-reports/`.
- Failures, skips, and blockers are recorded honestly.
- `HANDOFF.md` is updated and links the test report.
- Related product, engineering, API, or operating documentation is synchronized.
- The diff was reviewed and does not overwrite unrelated user work or expose sensitive data.

The final delivery message must concisely state the outcome, test result, report location, and remaining risks.
