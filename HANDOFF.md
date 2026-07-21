# HANDOFF

This file records OnlyBoth’s current implementation state and development handoffs. Put the newest entry first.

## Current state

- Phase: the main Candidate and Employer routes now run the persistent blind-answer-first product
  slice through mandatory anonymous Human Review and per-Slot settlement. The Claim-first
  Matching flow is retained only as a historical regression surface.
- Authoritative product doctrine: `OnlyBoth-产品精神.md`.
- Authoritative product document: `OnlyBoth-产品方案.md`.
- Authoritative engineering document: `OnlyBoth-工程设计.md`.
- AI implementation blueprint: `OnlyBoth-AI工程设计.md`.
- Temporary runtime cutover plan: `OnlyBoth-运行代码迁移计划-TEMP.md`.
- Agent execution contract: `AGENTS.md`.
- Runnable causal order: demo-only persistent role session; PostgreSQL JobPost and free Interest;
  funded reusable Attention Slot; versioned Candidate consent and Application Credit consumption;
  six-minute server-timed full-screen Answer Session; TipTap rich text, original Voice Memo,
  Candidate-inserted transcript, disclosed platform GPT, and versioned browser Focus activity;
  append-only private objects and immutable Submission; optional asynchronous source-linked
  Employer Evidence Analyst; earliest-answer-only Employer query; mandatory independent
  evidence-linked Human Review; atomic ADVANCE_ELIGIBLE Resume Reveal authorization; reviewer-only
  one-Candidate-per-page Resume workspace; atomic hold settlement, Slot release, and next-Interest
  scheduling.
- The functional demo now has seven allowlisted synthetic Candidate actors plus Sarah. `Start as`
  issues a distinct signed Session for the selected actor; each Candidate has an independent Credit
  account, Evidence Passport, immutable Snapshot, Candidate-only discovery projection, and Resume
  Snapshot. The Candidate Feed now defaults to an evidence-linked `Matched for you` layer and keeps
  every open Job accessible through `Explore all jobs`; active Candidate journeys remain pinned in
  the default layer. Employer, Eligibility, Queue, Invitation, and Attention paths cannot read these
  signals. Highest education is required, with an explicit no-formal-degree path.
- The functional seed now publishes one primary engineering role and twenty additional synthetic
  cross-domain roles across twelve categories. Every Contract contains one ordered
  `critical-challenge@1` manifest; the corpus covers text, audio, image, and file Parts. Candidate
  detail, Answer Session, and Recruiter review resolve that same sealed manifest.
- `/candidate`, `/candidate/jobs/:ref`, and `/candidate/answer-sessions/:ref` are real projections
  and Commands. `/employer` supports JobPost Draft/Publish and funded slots; the review route can
  never prefetch the next anonymous answer before the current review Receipt commits.
- PostgreSQL migrations `0006` and `0007` add the functional product, private Artifact metadata,
  Candidate Credit ledger, Answer/GPT/Voice state, strict review settlement, and database-time
  Employer Review Breach settlement. The breach returns Candidate Credit, forfeits the Employer
  hold, records a reliability penalty, retires the affected Slot, and emits no Candidate Failure.
- Migration `0008` adds versioned Candidate-only Passport Drafts, immutable Snapshots, Signal Sets,
  per-Job discovery signals, projections, and AI request audit linkage.
- Migration `0009` adds versioned Answer consent pins, an immutable browser Activity timeline, and
  a separate Focus Projection. Activity append never increments the Answer Session version.
- Migration `0010` adds sealed Employer AI review consent pins, immutable Answer Process Evidence,
  Employer analysis projections, consulted-output audit linkage, and the bounded 24-hour cleanup
  path for non-final rich-text revisions.
- Migration `0011` permits consent-gated `AnswerProcessEvidence@2` while preserving historical
  `@1` rows. V2 freezes six deterministic green/yellow/red behavior signals under
  `onlyboth.answer-behavior-severity@1`; OFF, ANSWER_ONLY, and disclosure versions before
  `employer-ai-review-disclosure@2` remain neutral and unclassified.
- Migration `0012` adds required Passport education, immutable Candidate Resume Snapshots, the
  Resume Snapshot pin on Answer consent, and immutable reviewer-scoped Resume Reveal records.
  Existing Review Receipt V2 rows are upgraded to V3 with a null Reveal ref; they do not gain
  retrospective access.
- MinIO is the local `ObjectStorePort` adapter. Presigned and server writes are create-only,
  owner-bound, MIME/size/SHA-256 verified, and sealed by immutable refs. Orphans are cleaned by the
  Worker after 24 hours.
- Candidate GPT uses Worker-only `gpt-5.6-terra`, low reasoning, `store:false`, and no tools; Voice
  Memo transcription uses `gpt-4o-mini-transcribe`. The original audio remains authoritative and
  a complete independent `GPT_TRACE`, including failures, is disclosed to the reviewer.
- The continuous normal Worker now consumes functional assistant, transcription, Employer
  Evidence Analyst, answer deadline, database-time Focus automatic submission, Employer review
  breach, and orphan-cleanup work alongside the retained legacy workers.
- Employer Evidence Analyst is sealed per JobPost as `OFF`, `ANSWER_ONLY`, or
  `ANSWER_PLUS_PROCESS`; default and platform kill switch are both closed. Output V2 adds a
  source-linked Good/Bad verdict scoped to one sealed Answer plus logic, clarity, consistency, and
  responsiveness findings. It still cannot rank Candidates, recommend advancement, prove cheating,
  or complete the Human Review. All AI states leave Human Review and Slot settlement open.
- `/prototype` and `/demo` remain static references and are absent from primary navigation. They
  are not functional acceptance evidence.
- A Puppeteer acceptance now controls Candidate 17 through Interest, backed Slot, multi-revision
  Answer behavior, immutable Submit, LIVE Luna Employer analysis, Sarah's independent Human Review,
  and post-review Resume Reveal. It uses a test database and removes the OpenAI key from Web.
- A second Puppeteer acceptance controls Candidate 27 through the `Senior Brand Illustrator`
  discovery, Interest, backed Slot, disclosed revision/focus behavior, Focus Policy auto-submit,
  LIVE Luna `BAD_ANSWER`, and Sarah's independent `NO_FURTHER_PROOF` Review. Its pinned Resume
  remains sealed and the Recruiter Resume workspace remains empty.
- Local acceptance services are healthy PostgreSQL 16 and MinIO containers on loopback. A
  synthetic-only GPT-5.4 mini connectivity canary passes with available API quota, but repeated
  semantic runs do not pass the release gates: Candidate discovery produced an unrelated-source
  false connection on a later run, and Employer Analyst case 21 echoed prohibited rank language.
  The current Key is not present in the old unreachable Git Blob. Employer Analyst V2 now passes
  on explicitly selected `gpt-5.6-luna` with 30/30 validated outputs, macro-F1 1.0, process
  invariance, and a real Candidate Submit → Worker → PostgreSQL → Employer `READY` browser
  vertical. The production default remains `gpt-5.6-sol`, its acceptance is not reported, and the
  kill switch remains closed by default.
- Immediate next step: run the updated `answer-evidence-edge-draft@2` source-linked Employer
  Analyst smoke and calibrated 30-case release gate on the exact production-default
  `gpt-5.6-sol` configuration. Completed-cohort allocation and Deep Proof attention remain the next
  product slice; post-Review Resume Reveal is now implemented.

---

## 2026-07-21 — Candidate two-layer opportunity feed

**Status:** Complete for the Candidate discovery presentation; structured forward-looking intent
preferences remain a separate future slice

### Goal

Replace the misleading all-jobs-only Candidate homepage with a two-layer feed: an evidence-linked
default view that feels genuinely matched, plus an explicit complete-market view that preserves the
Candidate's access to every funded open JobPost.

### Actual outcome

- `/candidate` now opens on `Matched for you`. It includes `EVIDENCE_CONNECTED`, `ADJACENT`, stale
  signals that retain source/capability refs, and every active Interest/Application journey.
- `Explore all jobs` exposes the complete open feed. Switching layers resets the role category to
  `All`, preserves the text query, updates counts and accessible tab state, and remounts the result
  panel with a reduced-motion-safe transition.
- Empty matched results provide a direct route to the complete market instead of implying rejection
  or lack of ability.
- The selector is Candidate-side presentation only. The API continues returning the complete
  Candidate-owned projection; GPT still has no Eligibility, Queue, Invitation, Attention, Employer,
  or access-control authority.

### Files changed

- `apps/web/src/components/functional/candidate-home.tsx`
- `apps/web/src/components/functional/candidate-discovery-ui.test.tsx`
- `apps/web/app/globals.css`
- `AGENTS.md`
- `README.md`
- `OnlyBoth-产品精神.md`
- `OnlyBoth-产品方案.md`
- `OnlyBoth-工程设计.md`
- `OnlyBoth-AI工程设计.md`
- `tests/docs/agents-contract.sh`
- `tests/docs/ai-engineering-design-contract.sh`
- `tests/docs/product-spirit-contract.sh`
- `test-reports/20260721T121010Z-two-layer-candidate-feed.log`
- `HANDOFF.md`

### Product and engineering decisions

- Discovery may reduce first-screen noise without removing access: `Matched for you` is the default
  layer and `Explore all jobs` is the complete secondary layer.
- A discovery signal remains Candidate-private guidance, not hard Eligibility, Employer matching,
  Queue ordering, or an AI ranking.
- Ongoing Candidate journeys remain in the default layer even if the underlying discovery signal is
  missing or stale, so a presentation filter cannot strand an application.

### Tests added or updated

- Updated the Candidate discovery component test to assert that an insufficient-source job is absent
  from the default rendered panel while the complete-market tab remains visible.
- Added selector tests for connected, stale-source, active-journey, insufficient-source, matched, and
  all-jobs behavior.
- Updated documentation contracts to require complete JobPost access through the secondary feed.

### Verification and report

- `pnpm --filter @onlyboth/web typecheck` — passed.
- `pnpm --filter @onlyboth/web test` — 13 files and 43 tests passed.
- `pnpm test:docs` — 48 + 38 + 86 assertions passed.
- `pnpm check` — passed: 233 Unit, 39 Integration, 25 Security, and 7 Replay tests; two pre-existing
  conditional Integration tests remained skipped.
- `pnpm build` — passed with the Next.js optimized production build.
- `git diff --check` — passed.
- `rg -n "\.(only|skip)\(" tests apps packages` — no matches.
- Complete report: `test-reports/20260721T121010Z-two-layer-candidate-feed.log`.

### Checks not run and remaining risk

- PostgreSQL destructive suites, MinIO integration, Playwright, and LIVE AI evals were not rerun
  because this slice changes Candidate-side presentation and documentation only.
- `Matched for you` currently represents Evidence Passport connections, not a complete
  forward-looking Candidate Intent Profile. Calling it intention matching beyond this bounded
  evidence meaning would overstate the current data model.
- No migration, API schema, environment variable, Worker mode, AI prompt, or provider model changed.

### Next action

Design a versioned Candidate Intent Profile for desired role direction, work mode, location,
compensation, and explicit exclusions, then combine its deterministic constraints with the existing
evidence-linked explanation without giving GPT access-control authority.

---

## 2026-07-21 — Repository hygiene and initial root commit

**Status:** Complete for the local Git repository; no remote was configured or pushed

### Goal

Commit the complete OnlyBoth workspace as one coherent repository snapshot while keeping local
credentials, sessions, private keys, database copies, browser authentication state, and runtime
volumes outside Git.

### Actual outcome

- Confirmed the workspace is an initialized Git repository on `main` with no parent commit and no
  configured remote. The complete current product, documentation, migrations, tests, synthetic
  fixtures, screenshots, and required test reports are included in the initial root commit.
- Expanded `.gitignore` beyond `.env*` and build outputs to cover `.envrc`, `.direnv`, secret
  directories, provider credential exports, PEM/private-key and keystore formats, browser cookies
  and storage-state files, local infrastructure data, database dumps/SQLite files, and editor state.
  `.env.example` remains intentionally reviewable and contains only local placeholders.
- Added a permanent workspace-shape assertion for the sensitive-file ignore contract.
- A filename-only working-tree audit found no real key material among commit candidates. Git object
  inspection found one credential-shaped unreachable Blob from an earlier staged `.env.example`;
  it was not reachable from a commit. After the root commit, immediate pruning removes that local
  object and a second object audit must report zero credential-shaped unreachable Blobs.
- Git resolves the author as `tatar <tatar@tatardeMacBook-Pro.local>`. The task does not invent or
  overwrite repository/global author configuration.

### Files changed

- `.gitignore`
- `tests/integration/workspace-shape.test.ts`
- `test-reports/20260721T112500Z-repository-initial-commit.log`
- `HANDOFF.md`

### Product and engineering decisions

- Synthetic screenshots and mandatory text reports remain versioned because they are acceptance
  artifacts, not secrets. Real Candidate material, credentials, cookies, session captures, and
  local database/object-store state remain excluded.
- The repository is committed locally only. Creating a hosted repository, adding a remote, and
  pushing require a destination chosen by the user.

### Tests added or updated

- `workspace-shape.test.ts` now protects environment examples, secret directories, signing files,
  browser auth state, infrastructure volumes, and database copies from accidental tracking.
- The acceptance procedure uses `git check-ignore`, a staged-index key-pattern scan, object-database
  reachability scan, `pnpm check`, `git diff --check`, and a post-commit clean-tree check.

### Verification and report

- Complete raw output: `test-reports/20260721T112500Z-repository-initial-commit.log`.
- The commit hash is reported by `git log -1` after the content-addressed root commit is created.

### Checks not run and remaining risk

- No Git hosting remote exists, so nothing was pushed and no GitHub/GitLab secret-scanning service
  ran. The local audit covers common provider-key, private-key, browser-auth, and environment-file
  patterns but is not a substitute for a hosted secret scanner.
- `.env.local` remains on the local machine by design. Credential rotation, provider-side revocation,
  and OS-level disk security are outside Git ignore behavior.

### Next action

Choose a private hosted repository, enable its secret scanning and branch protection, then add the
remote and push the existing `main` root commit.

---

## 2026-07-21 — Poor-Creative Candidate Puppeteer LIVE witness

**Status:** Complete for the synthetic Brand Illustration scenario and explicitly selected
GPT-5.6 Luna; production IdP and production-default Sol release remain out of scope

### Goal

Use a Puppeteer-controlled Candidate Session to witness one deliberately poor response to a visual
design JobPost, capture the disclosed process signals, show the Employer's source-linked AI aid,
record an independent Human Review, and preserve the Resume Reveal boundary.

### Actual outcome

- Added Candidate 27, Avery Stone, as a seventh allowlisted synthetic Candidate with an independent
  Session, Credit account, Education record, Evidence Passport, Resume Snapshot, and a Candidate-only
  discovery signal targeting `Senior Brand Illustrator`. The résumé is plausible synthetic data;
  the demo describes only this Answer as poor and never creates a permanent low-quality label.
- The Brand Illustrator Contract now seals three role-specific Review Criteria: one grounded visual
  direction, cross-channel system adaptation, and concrete creative rationale. Additional synthetic
  JobPosts inherit the explicit `DEMO_EMPLOYER_AI_REVIEW_POLICY`; the default remains `OFF`, so no
  analysis is enabled accidentally.
- Added `test:e2e:puppeteer:poor-creative`. Puppeteer signs in as Avery, registers free Interest,
  receives the real reusable Slot, accepts all seven disclosures, consumes Credit `3→2`, records a
  large deletion and two disclosed focus departures, and lets the second departure invoke the real
  Focus Policy auto-submit path.
- The Worker produced `FOCUS_POLICY_PROGRESS` followed by `EMPLOYER_ANALYSIS_PROCESSED`. GPT-5.6
  Luna returned `READY / BAD_ANSWER`, with all three sealed criteria contradicted and red language
  findings grounded in exact final-answer quotes. Deterministic Process Evidence independently
  recorded `REVISION_VOLATILITY=RED` and `SUBMISSION_PRESSURE=RED`; neither signal changed the AI
  verdict.
- Sarah selected `NO_FURTHER_PROOF`, wrote her own evidence-linked comment and unknown, and released
  the Slot. PostgreSQL proved `submission_source=FOCUS_POLICY_AUTO`, zero Resume Reveals, and no
  Candidate identity in the anonymous Recruiter review. Ten key screenshots were saved under
  `test-reports/puppeteer-poor-creative-demo/`.

### Files changed

- `packages/demo-fixtures/src/index.ts`
- `scripts/functional-demo-job-fixtures.ts`
- `scripts/reset-functional-demo.ts`
- `tests/puppeteer/poor-creative-candidate-live-demo.ts`
- `tests/puppeteer/multi-candidate-live-demo.ts`
- `tests/unit/synthetic-demo-fixtures.test.ts`
- `tests/integration/workspace-shape.test.ts`
- `package.json`, `README.md`, `OnlyBoth-产品方案.md`, `OnlyBoth-工程设计.md`, and `HANDOFF.md`

### Product and engineering decisions

- “Poor Candidate” is not persisted as a Candidate-wide label. The bounded Answer, language
  findings, deterministic disclosed Process Evidence, and Sarah's Human Review are the only
  authorities in this scenario.
- A `NO_FURTHER_PROOF` Review never authorizes Resume Reveal. Synthetic operator identity is visible
  only in the Candidate Session/login context; it does not enter the pre-review Employer payload.
- Browser focus is client-reported and cannot prove cheating, external-tool use, intent, or what
  happened off-page. The screenshot and UI retain this caveat.

### Tests added or updated

- Synthetic fixture tests now require seven distinct Candidate identities and Avery's Creative
  discovery target.
- Cross-domain fixture tests require the three sealed Brand Illustrator criteria.
- The new Puppeteer acceptance asserts Credit, auto-submit source, `READY / BAD_ANSWER`, two red
  deterministic signals, `NO_FURTHER_PROOF`, and zero Resume Reveals in PostgreSQL.

### Verification and report

- `pnpm test:unit -- tests/unit/synthetic-demo-fixtures.test.ts`: passed; Vitest ran the complete
  Unit configuration, 232/232.
- `pnpm test:integration -- tests/integration/workspace-shape.test.ts`: passed; Vitest ran the
  complete environment-neutral Integration configuration, 38 passed with 2 conditional skips.
- `pnpm typecheck && pnpm build`: passed.
- `pnpm test:e2e:puppeteer:poor-creative`: passed after two preserved read-only assertion-query
  fixes; final state was Credit 2, `BAD_ANSWER`, `NO_FURTHER_PROOF`, `FOCUS_POLICY_AUTO`, and zero
  Resume Reveals.
- Full regression commands and raw output: `test-reports/20260721T104000Z-poor-creative-puppeteer-live.log`.
- Visual evidence: `test-reports/puppeteer-poor-creative-demo/`.

### Checks not run and remaining risk

- The exact production-default `gpt-5.6-sol` model was not exercised; this acceptance explicitly
  pins the already accepted `gpt-5.6-luna`. The platform kill switch remains closed by default.
- All Candidate, Job, Answer, Resume, and screenshots are synthetic Hackathon data. This is not a
  validity, fairness, accessibility, or legal study for real employment use.

### Next action

Use screenshots 05–10 in the demo narrative, then run the calibrated Employer Analyst release gate
on the exact production-default Sol configuration before enabling it outside this synthetic path.

---

## 2026-07-21 — Multi-Candidate sessions and Puppeteer LIVE review witness

**Status:** Complete for synthetic demo identities and the explicit GPT-5.6 Luna acceptance path;
production IdP and production-default Sol release remain out of scope

### Goal

Create a batch of synthetic Candidates with distinct persisted profiles, make `Start as` issue a
real actor-bound Session for each Candidate, and use Puppeteer to witness one complete Candidate 17
Interest → Answer → behavior evidence → LIVE AI analysis → Sarah Human Review → Resume Reveal chain.

### Actual outcome

- Added `@onlyboth/demo-fixtures` with six distinct Candidates and Sarah. Candidate 03, 08, 11, 17,
  19, and 42 each have a unique login identity, education, work history, credential set, Evidence
  Passport theme, discovery explanation, Credit account, and immutable Resume Snapshot.
- The demo issuer now signs the selected allowlisted `actor_ref`; it rejects unknown actors and
  role/actor mismatches. Legacy Candidate 42 and Sarah callers remain compatible. The login UI uses
  one accessible `Start as` dropdown and clearly labels it as demo-operator tooling outside the
  Recruiter pre-answer projection.
- Candidate routes now use the signed actor rather than hard-coded Candidate 42 hard-fact refs or
  headings. The app breadcrumb shows the active actor, for example
  `OnlyBoth / Candidate 17 · Maya Patel`, and changes to `Recruiter · Sarah Chen` after switching.
- The functional reset creates six independent Candidate Credit accounts, Passport Drafts and
  Snapshots, Candidate-only preloaded discovery signals, and Resume Snapshots. Candidate 42 retains
  the first backed Offer for existing regressions; Candidate 17 receives the second Slot only after
  Puppeteer records Interest and the real queue Worker processes it.
- Added `puppeteer-core@25.3.0` and a repeatable acceptance driver. It starts a Web child without
  `OPENAI_API_KEY`, signs in as Maya, consumes Credit `3→2`, records a large delete/rewrite and one
  disclosed focus departure, submits an immutable Answer, runs the Worker-only Luna Analyst, signs
  out, signs in as Sarah, opens the `READY` AI panel, records an independent `ADVANCE_ELIGIBLE`
  Review, and verifies Maya's pinned Resume appears only afterward.
- The persisted behavior profile recorded `REVISION_VOLATILITY=RED` from one shrink and a 692-character
  maximum change. The UI retains the rule and caveat: this is disclosed session context, not proof
  of cheating, intent, or Candidate-wide quality.
- Puppeteer saved nine synthetic screenshots covering the actor picker, Candidate feed, sealed Job,
  backed Offer, Answer/focus warning, immutable process summary, Recruiter AI evidence, Human Review
  settlement, and post-review Resume Reveal.

### Verification and report

- Puppeteer LIVE vertical: passed with Candidate 17, Candidate Credit 2, Analyst `READY`, one Worker
  `EMPLOYER_ANALYSIS_PROCESSED`, Human Review `ADVANCE_ELIGIBLE`, and red revision volatility.
- `pnpm check`: passed — 232 Unit, 38 environment-neutral Integration with 2 conditional skips, 25
  Security, 7 Replay, and all documentation contracts.
- PostgreSQL 16: 45/45 passed. Existing functional Playwright: 3/3 passed. Build, 45 deterministic
  evals, offline demo, formatting, lint, typecheck, and `git diff --check` passed.
- Full raw output: [test-reports/20260721T101452Z-multi-candidate-puppeteer-live.log](test-reports/20260721T101452Z-multi-candidate-puppeteer-live.log).
- Visual evidence: [test-reports/puppeteer-multi-candidate-demo](test-reports/puppeteer-multi-candidate-demo).

### Remaining boundary

- These identities and Resumes are synthetic demo data. The issuer still exists only in
  `DEMO_MODE=true`; production identity, account recovery, Candidate profile ingestion, and real
  authorization lifecycle remain future work.
- The Puppeteer run explicitly selects accepted `gpt-5.6-luna`. It does not release or validate the
  production-default `gpt-5.6-sol` configuration, and the platform kill switch remains closed by
  default.
- The recorded focus event is browser-reported and cannot establish what occurred off-page or on a
  second device. The AI output does not use it to make a cheating or hiring decision.

---

## 2026-07-21 — Required education, post-review Resume Reveal, and role-aware navigation

**Status:** Complete

### Goal

Require education in the Candidate Passport, give Candidate-side discovery a deterministic
graduation-recency evidence precedence, reveal the full pinned Resume only after a recruiter passes
the anonymous answer, isolate Resumes into their own paginated Recruiter workspace, and make the
top breadcrumb/navigation follow the active signed role.

### Actual outcome

- Passport Draft/Projection/Receipt and discovery input contracts moved to V2. Education supports
  degree records and an explicit `NO_FORMAL_DEGREE` alternative; degree records require
  institution, field, and graduation/expected date.
- Discovery Prompt 1.1.0 receives education without the institution name plus a deterministic
  policy. Through the inclusive two-year graduation boundary, education connections precede work
  and credential evidence. After two years, work/credentials precede education. The Validator
  rejects out-of-order connections, scores, rankings, and negative no-degree inference.
- Candidate acceptance now pins the latest immutable Resume Snapshot in the versioned consent row.
  `RecordFunctionalHumanReview` creates an immutable Resume Reveal only for
  `ADVANCE_ELIGIBLE`; Human Review, Reveal, Event, Receipt, Hold settlement, and Slot release share
  one PostgreSQL transaction. Other decisions and failure/withdrawal branches reveal nothing.
- Added `/employer/candidates`, which queries only reviewer-authorized Reveals and renders one full
  Resume per page. The Human Review receipt appears before identity, education, experience,
  credentials, skills, and contact data. The sequential review projection still has no Resume join.
- The sticky App Shell now renders `OnlyBoth / Candidate` or `OnlyBoth / Recruiter` from the signed
  role. Candidate navigation contains Opportunities and Evidence Passport; Recruiter navigation
  contains JobPosts, Revealed Candidates, and Audit. Logged-out navigation contains only Sign in.
- Migration 0012 safely backfills required education while preserving the Snapshot immutable
  trigger, adds immutable Resume/Reveal tables and pagination indexes, and upgrades persisted Human
  Review Receipt V2 rows to V3 with null Reveal refs.
- Product doctrine, product plan, engineering design, AI design, migration plan, AGENTS, README,
  documentation contracts, synthetic reset, and browser acceptance were updated to the new explicit
  rule: the product guarantees label-blind judgment through the anonymous Answer Review; optional
  Deep Proof is no longer the first Resume Reveal prerequisite.

### Tests added or updated

- Added education schema and exact two-year-boundary Unit tests, including no-formal-degree safety.
- Added AI Validator precedence tests for recent and older graduates.
- Added migration-contract tests for required education, immutable Resume pins, and reviewer
  Reveals.
- Expanded PostgreSQL tests for pre-Review absence, positive-review Reveal, non-positive no-Reveal,
  immutable snapshot pinning, and pagination clamping.
- Added static UI tests for role navigation/breadcrumb boundaries and pre/post-Reveal DOM contents.
- Expanded Playwright to prove role-specific breadcrumbs, required education UI, no pre-Review
  identity, explicit ADVANCE_ELIGIBLE, and the separately paginated full Resume.

### Verification and report

- `pnpm check`: passed — 229 Unit, 38 environment-neutral Integration with 2 conditional skips,
  25 Security, 7 Replay, and 172 documentation assertions.
- `pnpm build`: passed. Web component tests: 41/41. PostgreSQL 16: 45/45. Playwright: 3/3.
  Deterministic evals: 45/45.
- Candidate discovery Prompt 1.1.0 / input V2 LIVE on explicitly selected `gpt-5.6-luna` passed
  three suites covering 12 synthetic cases in 34.47 seconds, with no Golden fallback.
- Migration 0012 was applied to the local synthetic demo database and `demo:reset:functional`
  completed with Candidate Credit 3, 21 JobPosts, one backed Offer, and Employer AI review OFF.
- Full retained output and repaired-failure history:
  [test-reports/20260721T093302Z-candidate-education-resume-reveal.log](test-reports/20260721T093302Z-candidate-education-resume-reveal.log).

### Remaining boundary

- Candidate Resume editing is not a production profile product in this slice; the demo uses a
  clearly synthetic immutable Resume Snapshot. A production Resume ingestion/verification flow and
  production IdP remain future work.
- Completed-cohort Direct/Explore and Deep Proof are still not connected to the main browser
  vertical. They remain separate from the now-implemented first Resume Reveal authorization.
- The production-default `gpt-5.6-sol` Employer Analyst release gate remains unverified; the platform
  kill switch stays closed.

---

## 2026-07-21 — GPT-5.6 Luna persistent Worker and Employer READY UI vertical

**Status:** Complete for the explicitly selected Luna runtime; production-default Sol acceptance
and kill-switch authorization remain incomplete

### Goal

Move the already accepted GPT-5.6 Luna Employer Evidence Analyst beyond the isolated adapter eval:
submit one real anonymous Candidate answer, consume its Outbox work in the functional Worker,
persist auditable AI Request/Run/Output/Edge records in PostgreSQL, and render the validated result
from the Employer review projection.

### Actual outcome

- Added a fail-closed Worker runtime policy. Employer analysis remains disabled by default and
  defaults to `gpt-5.6-sol`; only `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` are accepted as
  explicit model pins.
- Added an explicit synthetic reset policy selector. The ordinary reset still seals `OFF`; the
  LIVE acceptance reset alone seals `ANSWER_PLUS_PROCESS` with disclosure version 2 so Candidate
  consent precedes process profiling.
- Added a dedicated LIVE Chromium acceptance that keeps the API key out of the Web process,
  submits Candidate 42's immutable answer, proves the Employer initially sees `ANALYZING`, runs
  the real Worker against Luna, and proves the reloaded UI shows `READY`, `GOOD ANSWER`, language
  analysis, `SUPPORTED` evidence, the deterministic behavior profile, and the independent Human
  Review form.
- PostgreSQL asserts a non-synthetic `SUCCEEDED` run with requested and resolved model
  `gpt-5.6-luna`, Prompt `2.0.2`, output `answer-evidence-edge-draft@2`, and a `READY` Employer
  projection. The final acceptance rerun leaves the test database in that demonstrable state.
- AI failure still cannot block Human Review, settle the Attention Slot, advance the Candidate, or
  fall back to Synthetic/Golden output.

### Files changed

- `apps/worker/src/employer-review-analyst-policy.ts`
- `apps/worker/src/employer-review-analyst-policy.test.ts`
- `apps/worker/src/functional-product-composition.ts`
- `scripts/functional-demo-job-fixtures.ts`
- `scripts/reset-functional-demo.ts`
- `playwright.live-analyst.config.ts`
- `tests/e2e-live/employer-review-analyst-live.spec.ts`
- `tests/integration/workspace-shape.test.ts`
- `tests/security/functional-product-boundaries.test.ts`
- `.env.example`
- `.gitignore`
- `package.json`
- `tsconfig.tests.json`
- `README.md`
- `OnlyBoth-AI工程设计.md`
- `OnlyBoth-工程设计.md`
- `test-reports/20260721T084446Z-gpt-5p6-luna-worker-ui.log`
- `HANDOFF.md`

### Verification and report

- LIVE persistent browser vertical: passed twice, one test per run; no replay fallback and no API
  key in the Web child process.
- `pnpm check`: passed with 221 Unit, 35 environment-neutral Integration plus two conditional
  skips, 25 Security, 7 Replay, and 170 documentation assertions.
- `pnpm build`: passed. `pnpm test:evals`: 45/45 passed. `pnpm demo:offline`: passed with zero
  external Web dependencies.
- `pnpm test:postgres`: 45/45 passed. Existing functional Playwright regression: 3/3 passed.
- Full actual output and the one repaired stale security-contract assertion are retained in
  [test-reports/20260721T084446Z-gpt-5p6-luna-worker-ui.log](test-reports/20260721T084446Z-gpt-5p6-luna-worker-ui.log).

### Remaining boundary

- The exact production-default `gpt-5.6-sol` 30-case release gate was not run. Luna's pass does not
  authorize Sol or open the default kill switch.
- The in-app Browser skill runtime was unavailable in this session. UI acceptance therefore uses
  the repository's real Chromium Playwright surface and persisted PostgreSQL projection; no manual
  in-app-browser visual claim is made.
- No schema migration, production IdP, post-answer allocation, Deep Proof, or résumé Reveal was
  added in this slice.

---

## 2026-07-21 — GPT-5.6 Luna LIVE Employer Analyst acceptance

**Status:** Complete for the requested isolated Luna semantic acceptance; production Sol release
and the persistent Worker vertical remain unverified

### Goal

Run the updated `answer-evidence-edge-draft@2` Employer Evidence Analyst LIVE acceptance on the
explicit `gpt-5.6-luna` target without changing the production model default or using a Synthetic,
Cached AI, or Golden fallback.

### Actual outcome

- The final full LIVE run resolved to `gpt-5.6-luna` and validated all 30 synthetic cases, all 30
  V2 bounded Good/Bad verdicts, the four required language dimensions, source/authority and
  prohibited-language hard gates, and a criterion macro-F1 of 1.0.
- The same-final-answer/different-process pair preserved criterion statuses, the bounded verdict,
  language statuses/severities, and frozen source refs. Equivalent wording and different valid
  literal spans inside the same source are correctly not treated as process-caused semantic drift.
- Two failed full runs were preserved. Prompt 2.0.0 produced an invalid exact-quote occurrence in
  injection case 19. Prompt 2.0.1 resolved that citation but echoed a prohibited rank term. Prompt
  `onlyboth.build-answer-evidence-edge@2.0.2` now requires a final literal citation check and
  explicitly forbids prohibited terms inside `exact_quote`; a focused case 19 smoke and the later
  complete suite both passed.
- Official OpenAI model guidance was checked through the developer-docs source before execution.
  It lists Luna as the efficient high-volume GPT-5.6 option, supports Responses API use, and lists
  medium reasoning as a balanced starting point. The existing adapter configuration already uses
  Responses, medium reasoning, Structured Outputs, and `store:false`.

### Files changed

- `packages/ai/src/employer-review-analyst-prompt.ts`
- `tests/unit/employer-review-analyst.test.ts`
- `tests/evals/employer-review-analyst.contract.eval.test.ts`
- `tests/evals/employer-review-analyst.live.eval.test.ts`
- `test-reports/20260721T081859Z-gpt-5p6-luna-live-acceptance.log`
- `HANDOFF.md`

### Product and engineering decisions

- This is an eval-only model override. The production Worker default remains `gpt-5.6-sol`, the
  platform kill switch remains closed, and LIVE failure never falls back to a replay adapter.
- Process invariance is semantic: process timing cannot change criterion states, Good/Bad verdict,
  language status/severity, or the source blocks that support them. It does not require stochastic
  prose or the exact valid substring chosen from one source block to be byte-identical.
- Structured schema adherence remains necessary but insufficient. Deterministic source,
  occurrence, prohibited-language, criterion, verdict, and authority validators remain hard gates.

### Tests added or updated

- Expanded the LIVE gate to require V2 output, 30 explicit bounded verdicts, complete language
  dimensions, and process-invariant bounded judgments.
- Added safe field-path diagnostics for prohibited output without logging Candidate/model text.
- Added optional eval-only `OPENAI_EVAL_CASE=1..30` focused reproduction while keeping the default
  full 30-case gate unchanged.
- Added a Unit assertion pinning Prompt 2.0.2 citation and injection no-echo instructions.

### Verification and report

- Final GPT-5.6 Luna LIVE: 2/2 tests passed; 30/30 V2 cases and verdicts validated; macro-F1 1.0;
  process invariance true; resolved model `gpt-5.6-luna`.
- Focused injection smoke: case 19 passed before the final full rerun.
- `pnpm check`: passed; 216 Unit, 34 environment-neutral Integration with 2 conditional service
  skips, 25 Security, 7 Replay, and 170 documentation assertions passed.
- `pnpm test:evals`: 45/45 passed. Production build passed. `git diff --check` passed and no
  `.only`/`.skip` occurrences were found.
- Actual report, including both preserved failed LIVE runs:
  `test-reports/20260721T081859Z-gpt-5p6-luna-live-acceptance.log`.

### Checks not run and remaining risk

- Exact production-default `gpt-5.6-sol` acceptance was not run because the user explicitly chose
  Luna for this task. Passing Luna does not authorize Sol or open the kill switch.
- The database-backed Worker `ANALYZING -> READY` and browser projection scenario was not run; the
  task accepted the direct LIVE adapter/eval surface only.
- No PostgreSQL, Object Storage, Domain Event, API, schema, or runtime environment migration was
  made. `OPENAI_EVAL_CASE` is optional and eval-only.
- Explicit next action: run the same V2 release gate on `gpt-5.6-sol`, or explicitly change the
  production model policy to Luna and then verify the persistent Worker vertical before enabling
  Employer analysis.

---

## 2026-07-21 — Consent-gated Answer behavior profile and bounded verdict UI

**Status:** Complete for contracts, deterministic collection, PostgreSQL compatibility, Employer
and Candidate UI, local evals, and persistent local acceptance; updated LIVE semantic acceptance
was not run

### Goal

Adopt the clarified product boundary that OnlyBoth promises résumé-label-blind first-round judgment,
not the absence of anonymous Answer or disclosed process assessment. Add red/yellow/green behavior
signals, a Good/Bad verdict for one sealed Answer, and source-linked language analysis to the
sequential Employer review experience without converting them into Candidate ranking or automatic
decision authority.

### Actual outcome

- Added immutable `AnswerProcessEvidence@2` with six deterministic behavior signals: first-content
  delay, revision gap, revision volatility, submission pressure, disclosed platform assistance,
  and platform reliability. Each freezes an observed value, severity, applied rule, caveat,
  attribution, and signal ref under `onlyboth.answer-behavior-severity@1`.
- V2 is produced only for `ANSWER_PLUS_PROCESS + employer-ai-review-disclosure@2`. OFF,
  ANSWER_ONLY, and historical disclosure versions continue to produce neutral V1 evidence, so no
  historical Answer is reclassified.
- Added `AnswerEvidenceEdgeDraft@2`: `GOOD_ANSWER | BAD_ANSWER` is explicitly scoped to
  `THIS_SEALED_CHALLENGE_ONLY`; language findings cover logic, clarity, consistency, and
  responsiveness. Every verdict/finding requires frozen non-PROCESS quotes. Deterministic rules
  reject inconsistent verdicts, missing dimensions, mismatched severity, invalid sources, rankings,
  hiring advice, and cheating/personality inference.
- Upgraded the Prompt to `onlyboth.build-answer-evidence-edge@2.0.0` and the output/validation
  versions to V2. Process evidence cannot alter the AI verdict or criterion states. Structured
  model output remains subject to deterministic source and authority validation.
- Rebuilt the Employer panel as an evidence control surface: a green/red bounded Answer verdict,
  color-plus-text language findings, and an always-available behavior rail in GREEN/YELLOW/RED.
  Deterministic behavior remains visible while AI is ANALYZING or FAILED. Sarah may explicitly cite
  a process signal in her independent Human Review; nothing prefills decision or comment.
- Candidate disclosures now explain the sealed-answer verdict, language analysis, process signal
  classification, intended bounded use, and limitations before Credit consumption. Candidates can
  see the same rule, severity, value, and caveat after submission.
- Updated the product doctrine, product plan, engineering and AI design, runtime migration record,
  README, and Agent contract. Consent is documented as a product/data boundary rather than a legal
  waiver; production deployment still requires jurisdictional and accessibility review.

### Files changed

- Contracts/application/AI: Employer review analyst schemas, Answer Process builder, Prompt,
  Responses Adapter, validator, and Prompt registry.
- Persistence: functional product and Employer analyst PostgreSQL stores, migration runner, and
  new `0011_answer_behavior_profile` up/down migrations.
- UI: Candidate consent/detail, Candidate post-submit process view, Employer composer, sequential
  review workspace, and shared industrial severity styling.
- Tests: analyst unit/UI tests, V2 30-case deterministic eval, migration/security/doc contracts,
  and PostgreSQL vertical expectations.
- Documentation: `AGENTS.md`, `README.md`, all four authoritative product/engineering documents,
  runtime migration plan, this handoff, and the linked report.

### Product and engineering decisions

- The core promise is label-blind first judgment. Consent-gated Answer/process assessment is an
  explicit cost of the backed blind-answer opportunity and is permitted after the Candidate sees
  the exact policy before spending Credit.
- Red/yellow/green means versioned review severity, not truth. The system does not claim a pause
  proves inactivity, disclosed GPT proves cheating, a platform failure belongs to the Candidate, or
  process metadata proves external AI use.
- Good/Bad labels only one immutable Answer. It is not a Candidate-wide Fit/Talent Score and cannot
  select Direct/Explore, release a Slot, or serve as the Human Review Receipt.

### Tests added or updated

- Added V1/V2 compatibility and six-signal classification tests, severity/verdict consistency
  tests, prompt/source authority tests, and legacy non-reclassification coverage.
- Expanded the Employer UI test to verify Good Answer, language evidence, accessible text labels
  for all severities, behavior visibility while analysis runs, and the independent required form.
- PostgreSQL tests cover fresh migration/rollback, immutable V2 evidence, source-validated V2
  output, and explicit Human Review citation of an immutable behavior signal.
- Deterministic eval now exercises V2 across the 30-case corpus, including injected content.

### Verification and report

- `pnpm check`: passed; 215 Unit, 34 environment-neutral Integration with 2 conditional service
  skips, 25 Security, 7 Replay, and 170 documentation assertions passed.
- Explicit service-backed Integration: 36/36 passed.
- PostgreSQL 16: 45/45 passed after preserving earlier migration/consent failures in the report.
- Deterministic evals: 45/45 passed. Production build passed. Playwright passed 3/3.
- `git diff --check` passed; no `.only` or `.skip` occurrences were found.
- Actual report: `test-reports/20260721T075529Z-answer-behavior-review-ui.log`.

### Checks not run and remaining risk

- Updated LIVE OpenAI smoke/eval was not run. Prompt `2.0.0` and output schema V2 invalidate prior
  semantic acceptance evidence; the production kill switch must remain closed until exact
  `gpt-5.6-sol`/medium passes the source, verdict, language, injection, and invariance gates.
- The default persistent Playwright seed remains AI policy OFF. The new UI is covered by component,
  deterministic eval, PostgreSQL, and build checks; a dedicated policy-on Playwright scenario would
  provide stronger visual regression coverage.
- Explicit next action: run the V2 30-case production-model acceptance and a database-backed
  `ANALYZING → READY` browser scenario with `ANSWER_PLUS_PROCESS` sealed before Candidate consent.

---

## 2026-07-20 — GPT-5.4 mini semantic validation

**Status:** Partial; the harness and deterministic boundaries were hardened, but GPT-5.4 mini did
not pass the Candidate discovery or Employer Analyst stability gates

### Goal

Use `gpt-5.4-mini` to exercise Candidate-owned job discovery, criterion-local anonymous Answer
findings, and Employer review assistance without enabling pre-answer Employer ranking or a
Candidate overall score. Keep production models unchanged.

### Actual outcome

- Added an eval-only model constructor option to Candidate discovery and Employer Analyst LIVE
  adapters. `OPENAI_EVAL_MODEL` is consumed only by the two LIVE eval files; the Worker composition
  still constructs both adapters without an override and therefore retains `gpt-5.6-luna`/low and
  `gpt-5.6-sol`/medium.
- Confirmed the LIVE model resolved to `gpt-5.4-mini-2026-03-17`. One Candidate discovery run passed
  all three groups after Prompt hardening; a later identical run connected one of three unrelated
  sources, while still passing 6/6 connected sources and 3/3 Prompt Injection authority gates.
  GPT-5.4 mini therefore did not pass the repeatability gate for Candidate discovery.
- Employer Analyst runs exposed four distinct deterministic failures before the final run:
  invalid exact-quote occurrence index, missing contradicting citation, PROCESS evidence used in
  an Answer/criterion field, and prohibited decision-language echo. Prompt versions were advanced
  with explicit branch, citation, evidence-array, PROCESS-separation, and no-echo rules; validators
  were not weakened.
- The final 30-case Employer run validated cases 1–20, then rejected synthetic case 21 for
  prohibited `RANK` language. The same-final-answer/different-process invariant passed. Because the
  hard gate failed before completion, no macro-F1 pass is claimed.
- SDK-side Zod refinement failures are now mapped to permanent `AI_SCHEMA_MISMATCH` instead of a
  retryable provider outage. Validator failures identify a safe prohibition code without logging
  model text.

### Files changed

- Updated Candidate discovery and Employer Analyst LIVE adapters, Prompts, deterministic error
  mapping/diagnostics, unit tests, and LIVE eval reporting.
- Updated `OnlyBoth-AI工程设计.md`, this handoff, and the redacted test report. Product semantics,
  contracts, database schema, runtime environment variables, and Worker production model policy
  did not change.

### Product and engineering decisions

- “AI matching” remains Candidate-owned discovery guidance only. It cannot hide or reorder jobs,
  affect Eligibility/Queue/Attention, or enter Employer projections.
- “Candidate answer scoring” is rejected as a product concept. The tested surface is exactly one
  four-state evidence finding per sealed criterion, with no overall score, rank, or advancement
  recommendation.
- GPT-5.4 mini remains useful for connectivity and harness debugging, but its observed failures
  disqualify it from the current semantic release gate. A passing mini run cannot authorize the
  GPT-5.6 production configuration.

### Tests added or updated

- Added default-versus-eval-model request-shape tests for both adapters.
- Added SDK Zod-refinement error-mapping tests.
- Added redacted resolved-model and aggregate metric output to the two LIVE eval suites.
- Preserved the existing source, Prompt Injection, four-state macro-F1, exact quote, Process
  separation, prohibited-language, and process-invariance gates.

### Verification and report

- Focused unit regression: 22/22 passed.
- Candidate discovery LIVE: one 12-case run passed; the final repeated run failed the unrelated
  source group while reporting 6/6 connected and 3/3 injection hard-gate passes.
- Employer Analyst LIVE: final run failed at synthetic case 21 with prohibition code `RANK`;
  process invariance passed. No macro-F1 pass is claimed.
- Full local regression and build results are recorded in the linked report.
- Actual report: `test-reports/20260720T231858Z-gpt-5p4-mini-semantic-evals.log`.

### Known issues and next action

- Prompt versions changed to Candidate discovery `1.0.2` and Employer Analyst `1.0.4`; exact
  production-model acceptance must use these versions.
- Run the Candidate discovery suite on production `gpt-5.6-luna` and the Employer Analyst 30-case
  suite on production `gpt-5.6-sol`/medium. Enable neither production semantic path solely from the
  GPT-5.4 mini results.

---

## 2026-07-20 — GPT-5.4 mini connectivity canary

**Status:** Complete for low-cost API connectivity; not a GPT-5.6 production-quality acceptance

### Goal

Use `gpt-5.4-mini` for one small link test after API quota became available, and determine whether
test environments may use GPT-5.4 mini while production uses GPT-5.6.

### Actual outcome

- Confirmed the official model ID and ran one synthetic-only Responses request with explicit
  `reasoning.effort: none`, `store:false`, no tools, and a unique request ID. It completed in 2.337
  seconds and resolved `gpt-5.4-mini` to `gpt-5.4-mini-2026-03-17`, using 11 input and 5 output
  tokens with zero reasoning tokens. Response text was not logged.
- The current ignored runtime Key does not occur in the old unreachable Git Blob, indicating the
  previously exposed value has been replaced. No Key value or fingerprint was persisted.
- Adopted a tiered testing boundary: GPT-5.4 mini is valid for cheap authentication/quota/network/
  endpoint/request-shape canaries and eval-harness debugging. It cannot stand in for GPT-5.6 on
  semantic quality, refusal behavior, exact citation/source anchoring, prompt-injection resistance,
  macro-F1, or same-answer/different-process invariance.
- Production acceptance remains pinned to the exact runtime configuration: `gpt-5.6-sol`, medium
  reasoning, current prompt/schema versions, deterministic validator, and the full 30-case corpus.

### Files changed

- Added the redacted connectivity report and updated this handoff only. No production model,
  prompt, adapter, schema, fixture, or test configuration changed.

### Verification and report

- One GPT-5.4 mini Responses request: passed, `status=completed`, resolved snapshot
  `gpt-5.4-mini-2026-03-17`.
- Current-key unreachable-Blob check: zero matches.
- Handoff formatting, `git diff --check`, secret scans, and 162 documentation assertions passed.
- Actual report: `test-reports/20260720T225319Z-gpt-5p4-mini-connectivity.log`.

### Next action

Keep GPT-5.4 mini as a non-authoritative low-cost canary. Run the source-linked smoke, calibrated
30-case suite, and database-backed Worker vertical on `gpt-5.6-sol` before enabling the production
Employer Analyst kill switch.

---

## 2026-07-20 — LIVE API quota diagnosis and retry hardening

**Status:** Partial; the key authenticated with OpenAI, but `429 insufficient_quota` blocks the
first structured Employer Analyst response and every required LIVE acceptance gate

### Goal

Continue LIVE bringup from the credential gate through a focused Employer Analyst request, the
30-case calibrated suite, and the database-backed `ANALYZING → READY` Worker vertical without any
Synthetic or Golden fallback.

### Actual outcome

- Found the supplied Key in tracked `.env.example`, where the Worker would not load it safely. It
  had also entered the Git index. The value was moved without printing to ignored `.env.local`
  with mode `0600`; `.env.example` and the index were sanitized. Reachable Git history and all
  tracked/unignored workspace files now contain zero exact-key occurrences.
- Because the old indexed Blob may remain as an unreachable local Git object, the supplied Key
  must be revoked and rotated before quota is added or real data is processed.
- A two-request synthetic source/invariance smoke reached the Provider but failed through the
  adapter's redacted error boundary. A minimal metadata-only Responses diagnostic then established
  the exact external blocker: HTTP `429`, code/type `insufficient_quota`. This proves neither model
  quality nor Structured Output correctness, so no LIVE pass is claimed.
- Fixed the surfaced retry bug: `429 insufficient_quota` is now non-retryable
  `AI_CONFIGURATION_FAILURE`, while ordinary 429 rate limits remain `AI_RATE_LIMITED` and
  retryable. Timeout, connection, 408, 5xx, and permanent request failures retain typed behavior.
  The AI engineering retry matrix now records the same distinction.

### Files changed

- `packages/ai/src/employer-review-analyst-adapter.ts`
- `packages/ai/src/employer-review-analyst-adapter.test.ts`
- `OnlyBoth-AI工程设计.md`
- `.env.example` was sanitized; ignored `.env.local` holds the temporary runtime value and is not
  an acceptance artifact.
- `test-reports/20260720T223701Z-live-ai-quota-bringup.log`
- `HANDOFF.md`

### Verification and report

- Focused provider-mapping and existing Analyst tests: 11/11 passed.
- Final `pnpm check`: formatting, zero-warning lint, all TypeScript projects, 209 Unit tests, 33
  environment-neutral Integration tests with two conditional MinIO skips, 25 Security tests, 7
  Replay tests, and 162 documentation assertions passed.
- `pnpm build`: passed; the production Next.js build compiled, typechecked, and generated routes.
- Secret scan: zero exact-key occurrences in tracked or unignored files; reachable history clean;
  `.env.local` is ignored and mode `0600`.
- Focused LIVE smoke: `BLOCKED`, exit 1. Minimal diagnostic: `429 insufficient_quota`. The 30-case
  suite and database `ANALYZING → READY` vertical were not run because repeated calls cannot
  succeed under this quota state.
- Actual report: `test-reports/20260720T223701Z-live-ai-quota-bringup.log`.

### Blockers and next action

Revoke/rotate the current Key, put the replacement only in ignored `.env.local` or a Worker secret
manager, and enable API billing/credits for its OpenAI project. Then rerun the two-request smoke,
the calibrated 30-case suite (all hard gates and macro-F1 ≥ 0.85), and the real Worker kill-switch
vertical. `store:false` remains configured but does not by itself establish organization-level
Zero Data Retention.

---

## 2026-07-20 — LIVE AI bringup preflight

**Status:** Blocked before the first provider request because no Worker-only OpenAI API key is
available; request-shape, local services, and fail-closed gates are verified

### Goal

Begin the real OpenAI bringup for the Employer AI Review Analyst, starting with a focused LIVE
request, then the calibrated 30-case suite, and finally the PostgreSQL `ANALYZING → READY` Worker
vertical with the platform kill switch explicitly enabled.

### Actual outcome

- Confirmed the process environment has no `OPENAI_API_KEY` and no repository-local environment
  file containing one. No credential was printed, persisted, or requested in chat.
- Audited the LIVE adapter against current official OpenAI guidance. It uses explicit
  `gpt-5.6-sol`, Responses, `reasoning.effort: medium`, Zod `text.format`, `store:false`, a stable
  privacy-preserving `safety_identifier`, a unique `X-Client-Request-Id`, no tools/background/
  remote conversation state, and SDK retry zero. Deterministic source and authority validation
  remains downstream of Structured Outputs.
- Verified PostgreSQL 16, MinIO, and the local Web process are healthy. The existing Golden Web /
  Worker process was not restarted or given a fake credential.
- Seven Employer Analyst tests and nine Worker configuration/runtime tests passed. The focused
  LIVE eval exited with its explicit key blocker, and a `RUNTIME_MODE=LIVE` Worker smoke refused to
  start with `synthetic:false`. No Synthetic, Cached, or Golden output was substituted.

### Files changed

- Added the redacted operational report for this bringup attempt.
- Updated this handoff only; no source, prompt, schema, migration, fixture, or test behavior changed.

### Verification and report

- `pnpm exec vitest run tests/unit/employer-review-analyst.test.ts --config vitest.unit.config.ts`:
  7/7 passed.
- `pnpm --filter @onlyboth/worker test -- src/config.test.ts src/worker-runtime.test.ts`: 9/9
  passed.
- `pnpm test:docs`: 44 Agent/English, 36 AI-design, and 82 product-spirit assertions passed.
- `pnpm exec prettier --check HANDOFF.md` and `git diff --check`: passed. The required
  `.only/.skip` scan found no matches (expected `rg` exit 1).
- The focused Employer Analyst LIVE eval: `BLOCKED`, exit 1, because the Worker-only key is absent.
- The Worker LIVE smoke: `BLOCKED`, exit 1, `WORKER_CONFIGURATION_INVALID`, `synthetic:false`.
- Actual report: `test-reports/20260720T221605Z-live-ai-bringup.log`.

### Blocker and next action

Securely export `OPENAI_API_KEY` into the Worker/eval process environment (not the repository and
not the handoff). Then run one source-linked LIVE smoke, the 30-case Employer Analyst suite with
hard gates and macro-F1 ≥ 0.85, and the database-backed `ANALYZING → READY` vertical. Do not enable
Synthetic fallback. Organization/project data controls must be confirmed separately; `store:false`
does not by itself establish Zero Data Retention.

---

## 2026-07-20 — Employer AI Review Analyst

**Status:** Complete for contracts, PostgreSQL/Object Storage workflow, explicit synthetic
acceptance, role UI, deterministic evals, and keyless fail-closed behavior; LIVE OpenAI evaluation
is explicitly blocked without a Worker-only key

### Goal

Add an optional post-submission evidence analyst that summarizes immutable anonymous answers,
maps source-linked evidence to sealed review criteria, and presents neutral server process context
without producing an overall score, ranking, hiring/advancement advice, or behavioral integrity
inference. Keep the named Human Review independent and nonblocking in every AI state.

### Actual outcome

- Added strict `EmployerAiReviewPolicy`, `ReviewCriterion`, `AnswerProcessEvidence@1`,
  `build-answer-evidence-edge-input@1`, `answer-evidence-edge-draft@1`, and Employer Review
  Projection contracts. JobPost publish seals `OFF | ANSWER_ONLY | ANSWER_PLUS_PROCESS`, the
  disclosure version, and one to eight criteria; existing contracts remain `OFF`.
- Candidate Application consent is now `start-backed-application-command@3` and must match the
  sealed Employer analysis policy/disclosure. The Backed Offer describes the exact analysis scope.
  A submitted Candidate can read their own process summary.
- Submission atomically freezes immutable Process Evidence, its hash, the Submission manifest,
  the initial analysis projection, Event, and Outbox message. Process Evidence uses database time,
  revision refs/hashes/lengths, disclosed platform GPT/Voice counts, submit source, remaining time,
  and known platform failures. It never reads Focus events, intermediate draft bodies, keystrokes,
  clipboard, camera, or biometrics.
- Added `EmployerReviewAnalystPort`, deterministic assembler, Outbox Worker, request/run/source/
  output audit records, source-authority validator, and explicit LIVE/Synthetic adapters. LIVE uses
  `gpt-5.6-sol`, medium reasoning, Responses Structured Outputs, `store:false`, SDK retry zero, no
  tools or remote conversation state, and a unique client request ID. Worker retries are bounded;
  LIVE never falls back.
- Validator requires every sealed criterion exactly once, uniquely resolvable exact quotes, and
  strict source classes. Process sources can create only neutral timeline/questions; they cannot
  support or contradict criteria. Scores, ranks, hiring/advancement advice, inactivity claims,
  personality/emotion/integrity/cheating inference, and executable content are rejected.
- Employer Review now exposes `DISABLED | ANALYZING | READY | NEEDS_HUMAN | FAILED |
SUPERSEDED` in a collapsible Evidence Analyst panel with source-linked summary, criterion
  coverage, quotes, unknowns, questions, and optional neutral process context. The panel never
  prefills the Human Review form. `consulted_ai_output_ref` is audit metadata, not Evidence.
- Refusal, incomplete, schema/source, and output-policy errors become `NEEDS_HUMAN`; provider or
  configuration failures become `FAILED`. Human Review remains available in all cases. If it
  commits first, in-flight or queued analysis becomes `SUPERSEDED` and late content is not shown.
- Migration `0010` adds immutable Process Evidence and analysis projections, consulted-output
  linkage, and safe deletion of only non-final rich-text bodies after 24 hours. Final evidence,
  hashes, and Process Manifest remain immutable.
- Updated the product doctrine, product plan, engineering design, AI design, runtime migration
  record, English README, Agent invariants, and executable documentation contracts.

### Verification and report

- `pnpm check` passed formatting, zero-warning lint, all TypeScript projects, 205 Unit tests, 33
  environment-neutral Integration tests with two conditional MinIO skips, 25 Security tests, 7
  Replay tests, and 162 documentation assertions.
- Explicit MinIO integration passed 35/35. PostgreSQL 16 passed 45/45, including fresh/rollback
  migration, immutable Process/AI Output/Edge, explicit OFF, source-validated synthetic READY,
  semantic `NEEDS_HUMAN`, consulted-output audit, queued and in-flight `SUPERSEDED` races, and
  24-hour non-final draft-body cleanup.
- Production `pnpm build` passed. Playwright passed 3/3 and now verifies the Candidate's own Process
  Summary plus the default-OFF Employer Analyst while preserving the complete two-role review
  flow. Deterministic evals passed 45/45; offline Demo verification reported zero external Web
  dependencies.
- `pnpm test:evals:live` is `BLOCKED`: no Worker-only `OPENAI_API_KEY` is present. Five LIVE suites
  ran no cases and substituted no synthetic, cached, or Golden result. The Employer Analyst LIVE
  suite contains 30 calibrated cases, macro-F1 and hard gates, injection cases, and same-answer /
  different-process invariance.
- Actual report: `test-reports/20260720T220156Z-employer-ai-review-analyst.log`.

### Remaining boundary

- No claim of LIVE model quality is made until the 30-case suite runs with a securely supplied
  Worker-only key and meets every hard gate plus macro-F1 ≥ 0.85.
- This feature is review assistance, not an automated employment decision tool. Real hiring use
  still requires legal review, notice/accommodation procedures, retention policy, bias audit, and
  organization-level OpenAI data-control confirmation.
- Completed-cohort advancement, Deep Proof attention, authorized Resume Reveal, production IdP,
  payments, and real Docker Sandbox remain outside this handoff.

---

## 2026-07-20 — Persistent Candidate Answer Sandbox and Focus Policy

**Status:** Complete for the keyless persistent runtime and local acceptance; LIVE OpenAI suites
remain explicitly blocked without a Worker-only key

### Goal

Require complete versioned Candidate consent before Credit consumption, open the real Answer
Session as a full-screen JobPost dialog, support rich text/Voice/platform GPT, record only disclosed
browser focus signals, and automatically seal persisted work after the fixed Focus threshold.

### Actual outcome

- Upgraded Application start to `start-backed-application-command@2`. The Candidate must separately
  accept real intent, one-Credit consumption, server timing and immutability, artifact/GPT
  disclosure, conditional Resume Reveal, focus telemetry, and the warning/automatic-submit rule.
  Only a successful PostgreSQL Answer Session creation consumes Credit and opens the dialog.
- Rebuilt the Answer workspace as a semantic full-screen dialog inside the JobPost, with a fixed
  server timer/Focus rail, sealed multimodal Critical Challenge, TipTap workbench, Voice station,
  disclosed GPT sidecar, focus trap, body scroll lock, responsive single-column layout, and no
  Escape close while active. The deep-link route remains a persistent crash/reload recovery path.
- Added `sandbox-focus-policy@1` as a pure deterministic state reducer and migration `0009`.
  Append-only Activity events contain only visibility/focus/system-dialog type, server receive
  time, diagnostic client sequence/monotonic time, and policy ref. URLs, application names,
  keystrokes, pointer paths, camera, and inferred integrity are absent and rejected by strict DTOs.
- The two-second grace, first warning, second departure, fifteen cumulative seconds, and one
  thirty-second microphone permission suppression are enforced using database receive time.
  Blur/hidden reports merge into one away interval. The separate Focus Projection changes without
  incrementing the Answer Session version, so focus traffic cannot race two-second autosave.
- Worker settlement detects a continuously hidden page without relying on a throttled browser
  timer. It freezes Draft/Upload/GPT commands, waits at most thirty seconds for queued platform
  work, and reuses the immutable Submission transaction with source `FOCUS_POLICY_AUTO`.
- Empty Focus termination creates no placeholder answer or ability conclusion, keeps the already
  consumed Candidate Credit, returns Employer Attention, releases the Slot and Candidate lease,
  closes the accepted Invitation, opens the Cohort Seat, and schedules the next queued Interest.
- Voice chooses a supported Opus WebM/MP4/OGG browser format. The original audio remains the
  authoritative private Artifact. Successful transcripts are separately retained and enter rich
  text only through an explicit Candidate action; transcription failure leaves text and audio
  submission available.
- Candidate projections expose their count and cumulative duration. Recruiter review receives only
  `focus_policy_auto_submitted`; the raw Activity timeline remains internal. The UI states plainly
  that browser focus is not secure proctoring and cannot detect a second device.
- Acceptance uncovered and fixed two supporting defects: PostgreSQL had allowed `focus.version` to
  shadow `session.version` in Candidate projections, and empty Answer settlement had not moved an
  accepted Invitation to a terminal state before Cohort Seat reuse. Next.js cross-chunk typed error
  mapping now also preserves the fixed 409/422/503 semantics without trusting a supplied status.

### Verification and report

- `pnpm check` passed formatting, zero-warning lint, workspace/test typecheck, 196 Unit tests, 32
  environment-neutral Integration tests with two conditional MinIO skips, 24 Security tests, 7
  Replay tests, and 151 documentation assertions.
- PostgreSQL 16 passed 6 files and 40/40 tests. The explicit MinIO run passed 34/34 with no skips.
- The production Next.js build passed. Playwright passed 3/3, including the persistent two-role
  flow, full-screen dialog at 1440px and 390px, active Escape lock, internal-operation no-away
  state, first warning, and second-departure automatic seal. Deterministic evals passed 14/14 and
  offline Demo verification found zero external Web dependencies.
- All four LIVE suites are `BLOCKED` because no Worker-only `OPENAI_API_KEY` is present. They ran no
  case and substituted no Replay result.
- Actual report: `test-reports/20260720T210915Z-candidate-answer-sandbox-focus-policy.log`.

### Remaining boundary

- Browser focus telemetry is disclosure and workflow policy, not secure proctoring. It cannot show
  what site or device a Candidate used, and it must never become an integrity or ability score.
- Production identity, payments, real document verification, camera/screen capture, arbitrary code
  execution, and LIVE model validation remain outside this handoff.

---

## 2026-07-20 — Cross-domain JobPosts and multimodal Critical Challenges

**Status:** Complete for persistent synthetic seed, Contract/projection support, Candidate and
Recruiter rendering, category navigation, and regression verification

### Goal

Add twenty roles owned by Sarah Chen outside the primary engineering scenario, define each role's
key problem as a role-specific Critical Challenge, allow text/audio/image/file Parts to form one
ordered Challenge, and present the temporary Employer identity as `Recruiter` at login.

### Actual outcome

- Added twenty distinct synthetic JobPosts covering financial reporting, FP&A, business
  development, enterprise partnerships, brand illustration, product design, sales leadership,
  enterprise sales, growth, customer success, supply chain, people operations, legal/privacy,
  healthcare, construction, sourcing, content, game art, and sustainability. The deterministic
  functional reset publishes them through the same PostgreSQL Draft/Publish service as the primary
  job; it does not prewrite projections.
- Replaced the text-only role-task assumption with strict `critical-challenge@1` and ordered
  `TEXT | AUDIO | IMAGE | FILE` Part contracts. Part refs must be unique; text and media payloads
  are mutually exclusive; audio/image MIME is checked; images require alt text; assets carry
  source kind, filename, bytes, SHA-256, and same-origin synthetic URLs. Existing records retain a
  parsed legacy text fallback.
- The entire manifest is included in the sealed Contract and Answer question hash. Candidate Job
  Detail, active Answer Sandbox, and the earliest-only anonymous Recruiter Review all render the
  same version. Candidate feed cards disclose Part kinds before Interest or Credit use.
- Added local synthetic CSV, TXT, SVG, and generated WAV fixtures. The WAV is truthfully described
  as a transport tone; its semantic content is an accessible synthetic transcript excerpt rather
  than a fabricated recording.
- Candidate and Recruiter dashboards now support search and role-category filters so 21 seeded
  roles remain navigable. Every open role remains present; filtering is local UI state and does
  not alter Eligibility, discovery, Queue, Attention, or Employer selection.
- Changed the temporary login CTA from `Continue as Sarah Chen` to `Continue as Recruiter` and the
  primary navigation to `Recruiter workspace`. Sarah Chen remains the named synthetic reviewer on
  backed obligations and receipts. Recruiter-published dates now use deterministic UTC rendering,
  eliminating a pre-existing locale hydration mismatch.
- Updated the normative product doctrine, product plan, engineering design, English README, and
  Agent contract. New documentation assertions preserve the one-whole Challenge semantics and
  pre-commit Candidate disclosure boundary.

### Verification and report

- `pnpm check` passed formatting, zero-warning lint, all TypeScript projects, 187 Unit tests, 30
  environment-neutral Integration tests with two conditional MinIO skips, 24 Security tests, 7
  Replay tests, and the documentation contracts. The post-update doc rerun passed 41 + 31 + 79
  assertions.
- The explicit MinIO run passed 32/32; PostgreSQL 16 passed 37/37; production `pnpm build` passed;
  deterministic evals passed 14/14; and the offline Demo still reports zero external Web
  dependencies.
- Functional reset returned `job_post_count: 21`. Read-only database inspection confirmed 21/21
  Contracts have Critical Challenges across twelve role categories, with audio, image, and file
  examples present.
- The first E2E run exposed an overbroad privacy assertion: it matched `Direct` inside the valid
  title `Director of Content Strategy`. The assertion now rejects only exact standalone allocation
  labels. Final Playwright passed 2/2, including category filtering, image asset rendering, 21/22
  role counts, and the complete Candidate/Recruiter sequential-review loop.
- Actual report: `test-reports/20260720T195952Z-cross-domain-critical-challenges.log`.
- The development Web and continuous Worker are running at `http://localhost:3000`; local smoke
  confirmed the Recruiter login CTA and 200 responses for the synthetic SVG, WAV, and CSV assets.

### Remaining boundary

- The current Recruiter composer creates a text-only Critical Challenge manifest. The versioned
  Contract, PostgreSQL projections, Candidate/Recruiter surfaces, and synthetic corpus support all
  four Part kinds, but a verified Recruiter media upload/presign flow is not implemented yet.
- The cross-domain fixtures demonstrate workflow and information-boundary portability; they do not
  establish real-world hiring validity for each profession.
- No AI prompt or operation changed. LIVE OpenAI verification was not run and remains blocked by
  the absent replacement Worker-only key; no LIVE result is reported as passed.

---

## 2026-07-20 — Candidate Evidence Passport and Candidate-only job discovery

**Status:** Complete for the synthetic persistent Passport, keyless preloaded discovery Snapshot,
strict LIVE adapter, and Candidate Feed integration; LIVE model validation remains blocked by the
missing replacement Worker key

### Goal

Give the Candidate a private, evidence-led way to describe synthetic GitHub work, certifications,
work samples, online work proof, and redacted employment verification. Generate GPT-readable job
discovery hypotheses for the Candidate without recreating an Employer-side profile filter or
hiding any open Job.

### Actual outcome

- Added the Candidate-only `/candidate/evidence-passport` Evidence Ledger with synthetic source
  disclosure, Draft versioning, unsaved-change state, immutable Snapshot history, generation
  status, explicit refresh, keyboard focus treatment, reduced motion, and a responsive 390px
  layout. P45-like material is represented only as redacted synthetic employment verification;
  the contract rejects tax, salary, address, contact, school, prior-employer, real URL, and similar
  sensitive source text.
- Added strict `candidate-job-discovery-input@1` and `candidate-job-discovery-output@1` contracts.
  Outputs are limited to `EVIDENCE_CONNECTED`, `ADJACENT`, or `INSUFFICIENT_SOURCE`, legal Evidence
  and Capability refs, bounded reasons, and `still_unknown`. Score, rank, fit percentage,
  Hire/Reject, Direct/Explore, queue control, attention decisions, executable content, and upgraded
  “verified” claims fail deterministic validation.
- Added `SaveCandidateEvidencePassportDraft`, `PublishCandidateEvidencePassport`,
  `RequestCandidateDiscoveryRefresh`, and Worker completion paths. Publish atomically seals a
  canonical Snapshot, creates a generating Signal Set, appends the domain Event, enqueues the
  Outbox message, updates the Candidate projection, and stores an idempotent Receipt. Candidate
  advisory locks serialize competing first-Draft writes.
- Added migration `0008_candidate_evidence_passport` and `PostgresCandidateDiscoveryStore`.
  Snapshot, AI Output, and per-Job signal rows are immutable. Job-set or Snapshot changes mark
  in-flight results `SUPERSEDED`; repeated Worker delivery uses Inbox/lease semantics and a stable
  input hash that excludes the per-attempt request ref.
- Added the separate LIVE `deriveCandidateJobSignals` adapter using `gpt-5.6-luna`, low reasoning,
  Responses Structured Outputs, strict Zod format, `store:false`, no tools or provider-side
  conversation state, SDK retries disabled, and unique client request correlation. The Worker owns
  bounded retries. Missing configuration and LIVE failure never switch to a Golden fixture.
- Upgraded the Candidate Opportunity Feed to V2. Backed/active Application state remains first;
  other Jobs are grouped by discovery band and deterministically ordered by publish order and
  Opportunity ref. Every open Job remains accessible, and every reason is labeled discovery
  guidance rather than eligibility or Employer ranking.
- Candidate 42's synthetic Demo seed contains four Evidence items and one clearly marked preloaded
  Signal Snapshot for offline presentation. Editing and refreshing require LIVE AI. Employer APIs,
  DOM, projections, Queue, Eligibility, Invitations, and Attention allocation do not receive the
  Passport or discovery signals.
- Updated the product doctrine, product plan, engineering design, AI design, migration plan,
  English README, and Agent contract to preserve this Candidate-side boundary.

### Verification and report

- `pnpm check` passed: formatting, zero-warning lint, all TypeScript projects, 185 Unit tests, 29
  environment-neutral Integration tests with 2 conditional MinIO skips, 24 Security tests, 7
  Replay tests, and 144 documentation assertions.
- The explicit MinIO run passed 31/31 with no skips. PostgreSQL 16 passed 6 files and 37 tests,
  including atomic Publish, isolation, immutable Snapshot/AI Output, idempotency, and concurrent
  first-Draft serialization.
- Production `pnpm build` passed and includes the Passport page and four versioned APIs.
  Deterministic evals passed 14/14, including the 12-case discovery corpus. Offline Demo reported
  zero external Web dependencies.
- Playwright passed 2/2: the persistent two-role Application/review chain plus Passport/Feed
  behavior, and the 390px Passport layout. The development database accepted migration `0008`,
  deterministic functional reset, and a normally composed idle Worker run.
- `env -u OPENAI_API_KEY pnpm test:evals:live` is explicitly `BLOCKED` across four suites. The new
  12-case discovery LIVE eval ran no case and substituted neither the preloaded Snapshot nor a
  Golden result.
- No `.only`, `.skip`, or `.todo` test declaration and no OpenAI-shaped credential remains in
  repository files. The unstaged change set passes `git diff --check`.
- Final report: `test-reports/20260720T185437Z-candidate-evidence-passport.log`.

### Security incident and required action

- During implementation, a real-format OpenAI credential was found in `.env.example`. It was
  removed immediately and replaced with a commented empty placeholder; repository scanning now
  passes. Treat the exposed credential as compromised: revoke it in the OpenAI dashboard before
  any further LIVE work, issue a replacement, and inject that replacement only into the Worker
  environment. Do not restore it to `.env.example`, source, reports, or chat.

### Remaining boundary and next action

- Evidence is synthetic and source-attached, not actually verified. GitHub OAuth, certificate
  verification, employment verification, document upload, and real PII handling remain outside
  this MVP.
- The Passport remains separate from the later Resume Reveal Snapshot. Discovery signals cannot
  become pre-answer Employer selection evidence or alter Queue service.
- After credential rotation, run `pnpm test:evals:live` with the replacement key in a Worker-only
  environment and retain the new report. The product's larger next slice remains post-answer
  Evidence Edges, completed-cohort allocation, Deep Proof attention, and authorized Resume Reveal.

---

## 2026-07-20 — Runnable functional product vertical

**Status:** Complete for the bounded persistent slice through strict sequential Human Review;
LIVE Candidate GPT and transcription validation is blocked only by the missing Worker key

### Goal

Replace the browser-memory prototype as the primary experience with a restart-safe, dual-role
product: persistent temporary sessions, real JobPosts and funded Attention Slots, Candidate Credit,
a timed rich/voice/GPT answer workspace, immutable private Artifacts, and an Employer review gate
that cannot reveal the next answer until the current human obligation settles.

### Actual outcome

- Added a replaceable `SessionActorPort` and a demo-only one-year signed HttpOnly, Secure,
  SameSite=Strict Candidate/Sarah cookie issuer with explicit logout. It fails closed outside
  `DEMO_MODE` and every mutation preserves CSRF, idempotency, role authorization, and expected
  versions.
- Replaced the primary Candidate and Employer browser mocks with PostgreSQL projections and
  versioned APIs. Candidate 42 receives three non-transferable Application Credits; free Interest
  never consumes Credit, while accepting a genuinely backed invitation atomically consumes one
  Credit and starts the database-timed Answer Session.
- Added Employer JobPost Draft/Update/Publish. Publish seals the question, assumptions, terms, AI
  policy, SLA, WIP, and Attention commitment while reserving the configured Employer wallet and
  creating reusable slots in one transaction.
- Built the Candidate answer workspace with TipTap JSON, two-second and blur autosave, a displayed
  server deadline, MediaRecorder Voice Memo, disclosed platform GPT polling and insertion, explicit
  final submit, and immutable submitted state after reload. Deadline settlement auto-submits a
  persisted non-empty draft or releases an entirely empty session without a capability conclusion.
- Added the private `ObjectStorePort`, local MinIO/S3 adapter, short-lived Presigned PUT, server-side
  ownership/MIME/bytes/SHA-256 verification, private reviewer reads, create-only object semantics,
  immutable Artifact manifests, and 24-hour orphan cleanup. Rich text, original audio, transcripts,
  assistant turns, and the independent complete `GPT_TRACE` are objects rather than PostgreSQL
  bodies.
- Added Worker-only Candidate assistant and Voice transcription ports. Missing keys produce typed,
  visible failures without Replay fallback or Candidate blame. Voice and assistant jobs progress
  independently; final Seal waits until each completes or fails explicitly, and a failed transcript
  never invalidates the original Voice Memo.
- Added an earliest-only anonymous Employer Review Projection. The required form binds a finite
  decision, current-Submission Evidence refs, a substantive comment, and `still_unknown`; only the
  atomic `RecordFunctionalHumanReview` transaction settles the hold, releases the Slot, emits the
  Receipt, and schedules the next queued Interest.
- Added database-time Employer Review SLA settlement. It returns consumed Candidate Credit,
  forfeits the Employer hold, reduces the backed wallet, records a reliability penalty and immutable
  breach, retires the affected Slot, and deliberately emits no Candidate Failure or hiring outcome.
- Removed `/prototype` and `/demo` from primary navigation while retaining both as clearly bounded
  reference surfaces. Updated the English README and all product, doctrine, engineering, AI,
  migration, and Agent invariants to describe the same runnable boundary.

### Verification and report

- `pnpm check` passed: 174 Unit, 26 default Integration, 23 Security, 7 Replay, and 133 documentation
  assertions, plus formatting, lint, and all workspace TypeScript checks. The two MinIO assertions
  are conditionally excluded from the default keyless aggregate and passed in the explicit service
  run.
- Real MinIO integration passed 28/28, including private download and atomic same-key overwrite
  rejection. PostgreSQL 16 passed 6 files and 36 tests, including fresh migration/rollback,
  immutable Submission, concurrency, Credit/Slot races, and Employer SLA breach settlement.
- Production `pnpm build` completed without warnings. The final isolated-role Playwright chain
  passed 1/1 in 5.0 seconds with real PostgreSQL and MinIO, no browser OpenAI key, no external web
  request, Credit `3→2`, voice upload, typed GPT/transcription failures, `GPT_TRACE`, immutable
  reload, strict one-at-a-time review, Slot release, and logout.
- `pnpm demo:offline`, 2/2 deterministic evals, and a normally composed `pnpm worker:once` passed.
- The first offline verification correctly exposed an over-broad local-HTTP rule; the first final
  E2E attempt exposed a Voice/GPT UI dependency and was interrupted. Both were fixed and neither is
  represented as passed evidence.
- `env -u OPENAI_API_KEY pnpm test:evals:live` is explicitly `BLOCKED` across three suites,
  including the new Candidate assistant/transcription LIVE smoke. No Replay result was substituted.
- Final report: `test-reports/20260720T132133Z-functional-product-vertical.log`.

### Remaining boundary

- This delivery intentionally stops after anonymous Human Review and rolling Slot settlement.
  `AnswerEvidenceEdge`, completed-cohort Direct/Explore, Deep Proof Holds, Resume Reveal, and the
  existing Challenge chain are not yet connected to the new browser vertical.
- The demo identity issuer, local credentials, synthetic seed, and MinIO adapter are development
  infrastructure, not production identity or deployment guidance.
- LIVE Candidate tools require a securely supplied Worker-only key before their two synthetic
  requests can be called and passed. Until then the product fails explicitly and remains runnable for
  all non-LIVE behavior.

---

## 2026-07-20 — No-backend dual-role UI prototype and target Reveal boundary

**Status:** Complete for the static UI prototype; target backend Reveal semantics remain explicitly
unimplemented

### Goal

Create a judge-ready `/prototype` walkthrough that makes the product's causal bargain visible in
one browser: Candidate Interest receives backed attention before labor, Sarah must review the
anonymous work with Evidence, and Resume labels appear only after Sarah commits the next-stage
attention. Keep the prototype independent of PostgreSQL, OpenAI, authentication, and existing
Demo/runtime state.

### Actual outcome

- Added a static `/prototype` route with persistent `UI Prototype — local simulated state, no
backend connected` disclosure, Candidate/Employer semantic Tabs, a journey rail, Reset, live
  status feedback, synthetic-only fixtures, responsive layouts, focus treatment, and
  reduced-motion behavior.
- Implemented a strict browser-memory reducer for Interest, Queue, backed Offer, six-minute Answer,
  visible-test simulation, Review pending, completed Cohort, post-answer Advancement, atomic Deep
  Proof backing plus Resume Reveal, neutral Decline, and full Reset. Refresh starts from the
  initial state and no Local Storage is used.
- Candidate surfaces now cover the public Opportunity, `WAITING_FOR_BACKED_SLOT`, Sarah's named
  24-hour Review promise, the sealed work packet, conditional Reveal consent, Answer Receipt, and
  the final backed conversation. Candidate DOM never receives Cohort membership or Direct/Explore
  allocation labels.
- Employer surfaces show eight reusable concurrent Review Slots, Queue operations without
  Candidate cards, one anonymous Answer at a time, GPT Evidence Map plus `still_unknown`, and a
  required decision/Evidence/unknown Review form. No bulk Reject, Skip, scroll-to-complete, profile
  sorting, or pre-answer Candidate selector exists.
- Recording Sarah's Review releases the Answer Slot and moves the synthetic Cohort from 7/8 to
  8/8. The Advancement Board then shows only anonymous Evidence Cards. A separate confirmation
  commits the answer-only Direct and public-seed Explore choices, two Deep Proof Holds, fixed
  Challenge scope, and an Advancement Receipt before any Resume fixture appears.
- The Reveal screen pins the selected Evidence Card before the synthetic Resume and shows the
  Attention Receipt. Candidate sees only that their work earned a backed next conversation;
  Employer-only Direct/Explore labels do not cross the role boundary.
- Added the Prototype entry to global navigation and the home hero without changing `/demo`,
  `/employer/matching`, `/employer`, `/candidate`, or any API implementation.

### Product and engineering decisions

- The target Reveal boundary is now: recorded anonymous Answer, completed Human Review, committed
  post-answer Direct/Explore Allocation, held Deep Proof attention, and Candidate conditional
  consent recorded at the backed Offer. `ADVANCE_ELIGIBLE` is a Review result only and cannot
  Reveal a Resume.
- Product doctrine, product plan, engineering design, migration plan, and the Agent invariant now
  agree on this boundary. Documentation contract tests make the distinction executable.
- Direct and deterministic Explore both require next-stage Slot/Credit backing before Reveal.
  Close, Decline, Withdraw, expiry, or unallocated Answers remain sealed.
- The local reducer expresses interaction semantics only. The running backend still gates Reveal
  on final Outcome plus Candidate Continue; Domain, Contracts, SQL migrations, projections, and
  Reveal APIs were deliberately not modified in this UI batch.

### Tests and acceptance evidence

- Added six focused Vitest assertions for legal reducer progression, Reset, Review and Cohort
  barriers, pre-Advancement sealing, role DOM boundaries, and post-Reveal Evidence/Resume/Attention
  presence.
- Added a dedicated backend-free Playwright configuration and three scenarios: the complete
  dual-role flow with no API/Fetch/XHR traffic, 390px no-overflow behavior, and 1024px keyboard
  operation. Visual snapshots at 1440px and 390px were inspected after motion settled.
- `pnpm check` passed: 164 Unit, 23 Integration, 19 Security, 7 Replay, and 124 documentation
  assertions, with formatting, lint, and all TypeScript checks successful.
- `pnpm build` passed and statically prerendered `/prototype`; PostgreSQL passed 5 files and 34
  tests; the two existing browser verticals, offline Demo, and 2/2 deterministic evals passed.
- `git diff --check` returned 0 and no `.only` or `.skip` markers were found.
- Failing-first evidence:
  `test-reports/20260720T084209Z-no-backend-ui-prototype-initial.log`.
- Final report: `test-reports/20260720T090622Z-no-backend-ui-prototype.log`.

### Known boundary and next action

- Do not describe the synthetic Resume being absent from a pre-Reveal DOM as a production privacy
  guarantee: all prototype fixtures ship in the client bundle.
- The next backend slice must make Advancement Allocation the authority for Deep Proof Holds and
  Resume Reveal authorization, persist the Candidate's versioned conditional consent, and replace
  the old final-Outcome Reveal trigger without weakening the existing role projections.
- No LIVE OpenAI verification was required or claimed for this local-only prototype.

---

## 2026-07-19 — Candidate Interest and Answer Invitation Decisions Batch 2b

**Status:** Partial — the target command, PostgreSQL, and Worker lifecycle is complete; target
HTTP routes, Candidate UI, and Answer workspace consumption are not yet wired

### Goal

Continue the Answer-first runtime migration with a real Candidate Interest command and a fully
backed Answer Invitation Accept/Decline/Expiry lifecycle. Preserve the rule that pre-answer
eligibility and Queue service cannot use Profiles, Claims, MatchEdges, Employer preference, or
OpenAI.

### Actual outcome

- Added `SubmitCandidateInterestHandler` and its PostgreSQL Unit of Work. The transaction derives
  Candidate identity from the authenticated actor, pins the sealed Contract and required consent
  version, persists typed hard facts, evaluates only finite hard predicates, creates an immutable
  Eligibility Edge, emits Events and a durable eligibility notification, updates only the
  Candidate projection, and stores an idempotent Receipt.
- Added durable reconciliation for `CandidateInterestEligibilityDetermined`. The Queue Worker
  Inbox-deduplicates the notification before scheduling an AVAILABLE funded Slot; it does not
  invoke the legacy `CandidateInterestSubmitted` MatchEdge path.
- Tightened Invitation decision contracts so Accept receipts and Candidate projections require
  an Answer Session reference and database-time deadline, while Decline and released projections
  cannot expose either field.
- Added `DecideAnswerInvitationHandler` and `ExpireAnswerInvitationHandler`. Both lock and validate
  the exact Obligation, Invitation, Slot, Reservation, Hold, Credit Account, Activity Lease,
  Candidate, Opportunity, and version bindings before mutation.
- Accept changes the Invitation, Obligation, Slot, and Candidate Interest to active Answer state,
  creates exactly one six-minute Answer Session, retains the HELD Hold, BOUND Reservation, held
  Credit, and active Candidate lease, then emits `AnswerSessionStarted`.
- Decline and database-time Expiry are neutral dispositions. They terminalize the Invitation,
  return the Hold to the Slot Reservation, move held Credit back to reserved Credit, append a
  return-ledger entry, release the Candidate lease, reopen the reusable Slot and Cohort Seat, and
  emit `OfferNextQueuedInterestRequested` without an ability or hiring inference.
- Added PostgreSQL advisory locking and common lock order so concurrent Candidate decisions and
  Expiry produce exactly one terminal mutation. Events, Outbox, role projections, Answer Session,
  financial settlement, and user Receipt are atomic; Expiry correctly has no user-command
  Receipt.
- Added migration `0005_candidate_interest_and_answer_invitation_decisions` with an explicit down
  migration and registered it in the migration runner. The migration pins the Opportunity's
  required Interest consent version and target Interest Contract version.
- Composed the Expiry handler into the Worker before Queue reconciliation and scheduling. The
  active Web routes remain unchanged; the existing `/candidate` and Matching E2E are compatibility
  checks, not evidence that the new Candidate commands are browser-accessible.

### Product and engineering decisions

- Candidate Interest is registration, not a formal Application. It records an explicit interest
  and deterministic hard-eligibility result but creates no pre-answer Employer card, Candidate
  ranking, or AI job.
- Missing typed hard facts fail the named hard predicate explicitly; GPT cannot fill, infer, or
  override them. A hard-eligibility outcome is not a general capability judgment.
- A Candidate may Accept only before the database-time Invitation deadline and only while the
  complete attention backing remains consistent. Browser time cannot extend an Offer.
- Accept keeps the Employer's attention collateral locked until later Human Answer Review and
  settlement. Decline and Expiry return capacity immediately and do not penalize the Candidate.
- `AnswerSessionStarted` is a durable boundary for the next slice. No Sandbox, verifier, or OpenAI
  work runs before Candidate Accept.
- The pre-answer LIVE `buildMatchEdge` operation remains quarantined legacy evaluation material;
  it has no authority in this target Interest/Queue/Invitation path.

### Tests and acceptance evidence

- Added Unit coverage for Candidate authentication, consent and Contract pins, typed hard
  eligibility, duplicate Interest, idempotency, rollback, Accept, Decline, Expiry, stale versions,
  cross-bound backing corruption, exact database-time deadlines, finance preservation/return, and
  neutral projections.
- Added PostgreSQL coverage for concurrent same-Opportunity Interests, durable notification
  reconciliation, exactly-once Answer Session creation, Slot/Seat reuse, DB-time Expiry,
  Accept/Decline-versus-Expiry races, immutable financial transitions, and Outbox rollback.
- Expanded Security tests to prove the target pre-answer sources and projections exclude OpenAI,
  MatchEdge, Claim Snapshot, Private Label, profile identity fields, score/rank, and Direct/Explore
  authority.
- `pnpm check` passed: 158 Unit, 23 Integration, 19 Security, 7 Replay, and 116 documentation
  assertions, with formatting, lint, and all TypeScript checks successful.
- `pnpm build` passed and generated 8/8 static pages. PostgreSQL 16 passed 5 files and 34 tests.
  The existing two Playwright E2E scenarios, offline Demo, and 2/2 deterministic evals passed.
- `git diff --check` returned 0, and no `.only` or `.skip` markers were found. The repository still
  has no HEAD, so normal tracked-diff attribution is unavailable.
- Failing-first evidence:
  `test-reports/20260719T223731Z-blind-review-attention-batch2b-initial.log`.
- Final report: `test-reports/20260719T230248Z-blind-review-attention-batch2b.log`.

### LIVE verification

- The LIVE Responses adapter was checked against the current official OpenAI model and Structured
  Outputs guidance: Responses API, `gpt-5.6-sol`, explicit medium reasoning, strict Zod text
  format, `store:false`, no tools, and provider request correlation remain compatible.
- Post-change `pnpm live:smoke` and `pnpm test:evals:live` both failed closed because no
  Worker-only `OPENAI_API_KEY` exists in this environment. They are recorded as **BLOCKED**, not
  passed or replaced by Golden Replay. No LIVE model result is claimed.

### Known issues, risks, and next action

- No authenticated Candidate Interest or Answer Invitation decision HTTP route is wired yet.
  Route actors must come from signed Candidate sessions with CSRF and server-generated
  idempotency context; browser payloads cannot supply identity.
- `AnswerSessionStarted` has no consumer. The next runtime slice should initialize the bounded
  Answer workspace, record the submission, create post-answer evidence structure, and preserve
  mandatory named Human Review before any advancement.
- Deployments must explicitly set each Opportunity's required Interest consent version; the
  migration default is only a compatibility baseline.
- LIVE smoke/evals require the user to provide a Worker-only OpenAI API key securely. Golden must
  not become a fallback for a failed LIVE run.

---

## 2026-07-19 — Blind Review Attention PostgreSQL and Worker Batch 2a

**Status:** Partial — activation and deterministic backed-Offer transactions are complete; target
Interest/Invitation HTTP commands and the Answer lifecycle are not yet cut over

### Goal

Continue the runtime migration with a real PostgreSQL causal slice from a named Employer's
rolling Blind Review activation to funded reusable Slots and deterministic, non-profile Queue
Offers, while using an independent review/fix/retest agent loop to expose failures hidden by the
in-memory foundation.

### Actual outcome

- Added the additive `0003_blind_answer_first` persistence model and explicit down migration, then
  stabilized already-applied `0003` semantics by moving later runtime pins, per-Slot Credit
  reservations, and reusable Cohort Invitation uniqueness into
  `0004_blind_review_runtime_pins`.
- Implemented `ActivateBlindReviewCommitmentHandler`. One transaction authenticates the named
  Reviewer supplied by the caller, validates expected versions and Credit capacity, advances an
  absent Commitment from version 0 to Active version 1, reserves Credit for every configured
  Slot, appends the Event, creates one dispatch per Slot, writes the Employer projection, and
  stores the idempotent Receipt.
- Implemented `OfferNextQueuedInterestHandler`, `InterestQueueWorker`, the PostgreSQL Unit of Work,
  and Worker runtime composition. A successful Offer atomically binds one AVAILABLE Slot and its
  reserved Credit to the public Queue head, creates the Obligation, Invitation, Cohort Seat,
  `CreditHold=HELD`, Candidate Activity Lease, Events, Outbox/Inbox records, and role projections.
- Made the rolling Queue read current target `candidate_interests` on every locked Offer rather
  than freezing the activation-time list. The scheduler creates a generation-unique dispatch when
  a later eligible Interest can use an AVAILABLE funded Slot and suppresses duplicate pending
  work, candidates with another active obligation, and unresolved terminal dispatch failures.
- Corrected the real Worker hash to canonical `sha256:<64 lowercase hex>` and enforced that shape
  in the Offer contract. Inbox idempotency now hashes and verifies the fixed message type/version
  and parsed payload; the public Queue seed is read from the locked Commitment and compared with
  the message pin before selection.
- Terminal Queue failure now produces an explicit `InterestQueueOfferFailed` platform Event and
  dead-letter Inbox record instead of silently marking the Outbox row processed. Automatic
  redrive is suppressed until a later remediation mechanism resolves that failure.
- Extended the legacy Deep Proof allocation/release adapters to share Candidate advisory locks
  and `candidate_activity_leases` with the target Answer path. This preserves MVP `Q_i=1` during
  the additive migration and releases the legacy lease on Decline, Expiry, or Platform Abort.
- Made rollback fail closed with an explicit explanation when Answer-first Deep Proof Windows
  exist, and repaired the `0003` down path so the `0002` immutable Eligibility trigger does not
  block legitimate removal of target-only Eligibility rows.
- Left the active HTTP/UI Matching path unchanged. The legacy E2E remains green, but its
  pre-answer selection behavior is still a migration input rather than target product behavior.

### Files changed

- Contracts and Domain: `packages/contracts/src/blind-answer.ts`, contract/domain exports, and
  `packages/domain/src/blind-answer/`.
- Application: `packages/application/src/ports/blind-review.ts`,
  `packages/application/src/commands/activate-blind-review-commitment.ts`,
  `packages/application/src/commands/offer-next-queued-interest.ts`,
  `packages/application/src/workflows/interest-queue-worker.ts`, and exports.
- Persistence: `packages/db/migrations/0003_blind_answer_first.sql`, its down migration,
  `packages/db/migrations/0004_blind_review_runtime_pins.sql`, its down migration,
  `packages/db/src/postgres-interest-queue-worker-store.ts`, migration/DB exports, and the legacy
  matching, proof-decision, and Stage A stores used for shared Activity Lease behavior.
- Runtime: `apps/worker/src/interest-queue-composition.ts`, its tests, and
  `apps/worker/src/worker-runtime.ts`.
- Test support: `packages/testkit/src/in-memory-blind-review.ts` and its export.
- Tests: Blind Answer contract/domain/Application Unit tests; migration Integration contracts;
  Queue boundary Security tests; PostgreSQL migration, Attention, matching, and challenge tests.
- Evidence: `test-reports/20260719T221158Z-blind-review-attention-initial.log` and
  `test-reports/20260719T221902Z-blind-review-attention-batch2a.log`.
- Handoff: this file.

### Product and engineering decisions

- An absent Blind Review Commitment has expected version 0; activation creates Active version 1.
  Hydrating separate Candidate Interest aggregates does not advance the Commitment version.
- Activating eight reusable Slots reserves all eight Credits immediately. Creating an Offer
  converts exactly one Slot reservation into one HELD Answer Review Hold; capacity cannot be
  advertised without durable backing.
- A Queue dispatch attempt, not an unchanged AVAILABLE Slot version, owns the Inbox idempotency
  key. This lets a later Interest reuse the same Slot after an earlier
  `NO_WAITING_INTEREST` receipt without replaying the empty result.
- Public seed, Queue policy, Commitment version, Slot version, canonical payload hash, and current
  SQL Interest state are server-side pins. Browser, stale Outbox, legacy matching, GPT, Claims,
  Profile, or Employer preference cannot choose the pre-answer Candidate.
- `0003` is treated as an immutable migration baseline. New runtime columns and constraints use
  `0004`; changing a previously recorded migration is not an accepted upgrade strategy.
- A terminal Queue platform failure remains visible and stops automatic dispatch on that Slot.
  It is not a Candidate failure or Employer Breach. A future explicit remediation command must
  clear or supersede it.

### Tests added or updated

- Added Application tests for atomic activation, idempotency conflicts, Reviewer/version/Credit
  failures, rollback, active-Candidate exclusion, empty Queue, late-Interest reconciliation,
  public-seed tampering, payload-hash conflicts, duplicate delivery, and Offer rollback.
- Added PostgreSQL Attention tests for same-key and separate-key activation concurrency,
  all-or-nothing rollback, concurrent two-Slot Offers, durable Credit conversion, canonical
  hashes, redelivery, late Interest scheduling, seed/payload tampering, target and legacy `Q_i=1`,
  terminal failure visibility, and redrive suppression.
- Updated migration tests for fresh `0001 → 0002 → 0003 → 0004`, `0003 → 0004` upgrade,
  explicit rollback behavior, immutable artifacts, reusable Hold/Invitation constraints, and
  PostgreSQL 16.
- Added/updated Security checks proving the Queue Store and Offer handler have no pre-answer
  Claim, Profile, Private Label, MatchEdge, AI, score, rank, Direct, or Explore input.

### Verification and report

- Failing-first evidence is retained in
  `test-reports/20260719T221158Z-blind-review-attention-initial.log`.
- `pnpm check` passed: 129 Unit, 20 Integration, 17 Security, 7 Replay, and 116 documentation
  assertions, with formatting, lint, and all TypeScript checks successful.
- `pnpm build` passed; Next.js generated 8/8 static pages.
- `pnpm test:postgres` passed on PostgreSQL 16.14: 4 files and 27 tests, including 10 real
  rolling Attention transaction scenarios.
- `pnpm test:e2e` passed both existing Challenge and legacy Matching browser scenarios.
- `pnpm demo:offline` passed with zero external Web dependencies; `pnpm test:evals` passed 2/2
  deterministic evals.
- `git diff --check` returned 0. The repository still has no HEAD and all workspace files are
  untracked, so it cannot provide normal tracked-diff coverage.
- `rg -n "\.(only|skip)\(" tests apps packages` returned 1 with no matches, the expected
  ripgrep no-match result.
- Final report: `test-reports/20260719T221902Z-blind-review-attention-batch2a.log`.

### Checks not run and why

- LIVE OpenAI smoke/evals were not run because no Worker-only OpenAI API key is available. This
  slice has no AI operation and no LIVE result is claimed.

### Known issues, risks, and blockers

- `SubmitCandidateInterest`, target Invitation Accept/Decline/Expiry, Answer Session/Submission,
  Human Answer Review, per-Slot settlement/recycling, Closure Receipt, Breach/Remediation, and
  post-answer Cohort Allocation remain outside this Batch 2a slice.
- No target activation, Interest, or Invitation HTTP route is wired. The Application handler's
  actor must later come from signed session/CSRF middleware; callers must not construct it from a
  browser payload.
- Terminal Queue failure has durable Event/dead-letter evidence and blocks silent redrive, but
  there is no Employer projection state, operator remediation command, or UI for clearing it yet.
- The active Employer/Candidate UI and Demo Matching path remain the legacy Claim-first path.
  Their passing E2E tests prove compatibility, not conformance with the Answer-first doctrine.
- `0003` rollback intentionally refuses to proceed while Answer-first Deep Proof Windows exist;
  an operator must settle/archive them or perform an explicit data migration first.
- No OpenAI key, real Docker Sandbox/Verifier, production IdP, or complete runtime-mode parity
  suite is available.

### Migration and environment compatibility

- PostgreSQL migration map is now `0001`, `0002`, `0003_blind_answer_first`, then
  `0004_blind_review_runtime_pins`. The dedicated `onlyboth_test` database is healthy on
  PostgreSQL 16.14 and has all four versions registered.
- No environment variable was added. PostgreSQL tests still require a dedicated
  `TEST_DATABASE_URL`; runtime code still uses `DATABASE_URL`.
- Contracts, tables, and Worker composition are additive. No legacy API route was removed in this
  slice.

### Next action

Implement `SubmitCandidateInterest` plus `AcceptAnswerInvitation`, `DeclineAnswerInvitation`, and
database-time Expiry through the same PostgreSQL Unit-of-Work pattern. Prove that Decline/Expiry
atomically return the Answer Hold to the Slot reservation, release `Q_i`, reopen the Cohort Seat,
and emit a fresh Queue dispatch before wiring the authenticated role APIs.

---

## 2026-07-19 — Rolling blind-review executable foundation

**Status:** Partial — the Batch 0/1 contract and pure-domain slice is complete; active runtime
cutover has not occurred

### Goal

Start the documented runtime migration with executable, failing-first contracts and pure domain
behavior for the Interest/Application boundary, reusable Answer Review Slots, deterministic
non-profile Queue service, pinned Advancement Cohort Seats, and the Cohort review barrier.

### Actual outcome

- Added strict versioned contracts for public Opportunity discovery, lightweight Candidate
  Interest, Blind Review Commitment activation, backed Answer offers, invitation decisions,
  Answer submission, evidence-linked Human Review, per-Slot settlement, Employer blind-review
  projection, Candidate Queue projection, and Advancement Cohort projection.
- Made pre-answer Candidate cards structurally invalid in the Employer projection. Candidate
  Interest rejects Answer and résumé/profile fields, while Answer submission requires a backed
  Invitation reference.
- Added a pure rolling review aggregate with `onlyboth.interest-queue@1`. Queue order uses hard
  eligibility time, Interest time, a public hash tie-break, and Candidate ref; it accepts no
  Profile, Claim, model result, Employer preference, score, or rank input.
- Separated eight reusable concurrent review Slots from fixed eight-Answer Cohort Seats. The
  first eight offers pin Cohort 1; after the first Human Review settles, its Slot becomes
  `AVAILABLE` immediately and Candidate 09 is offered Cohort 2 Seat 1 while Cohort 1 remains 1/8.
- Implemented the backed Offer → Accept → submitted Application → evidence-linked Human Review
  → Obligation settlement path. Unbacked Answer submission fails closed.
- Implemented a server-side Cohort assertion that rejects post-answer advancement at 7/8 and
  succeeds only at 8/8 reviewed. Slot settlement is deliberately independent from this barrier.
- Preserved the active legacy runtime unchanged. No new contract is served by a route yet, and no
  user-visible flow should be described as migrated.

### Files changed

- Contracts: `packages/contracts/src/blind-answer.ts` and `packages/contracts/src/index.ts`.
- Domain: `packages/domain/src/blind-answer/errors.ts`,
  `packages/domain/src/blind-answer/types.ts`,
  `packages/domain/src/blind-answer/rolling-blind-review.ts`,
  `packages/domain/src/blind-answer/index.ts`, and `packages/domain/src/index.ts`.
- Tests: `tests/unit/blind-answer-contracts.test.ts` and
  `tests/unit/blind-answer-domain.test.ts`.
- Evidence: `test-reports/20260719T211229Z-rolling-review-domain-initial.log` and
  `test-reports/20260719T212033Z-rolling-blind-review-foundation.log`.
- Handoff: this file.

### Product and engineering decisions

- Interest remains low-cost registration; it does not become an Application until a Candidate
  accepts a backed offer and submits an Answer under a named review obligation.
- `answerReviewWip` and `advancementCohortSize` are independent fields even when both equal eight
  in the Demo. A settled Slot is reusable and never becomes a lifetime applicant quota.
- Cohort membership is pinned when an Offer is created, not when asynchronous work finishes.
  This prevents completion order from moving Candidate 09 into the first comparison group.
- Human Review requires at least one unique Evidence ref. GPT, a page view, a default choice, or
  Queue scheduling cannot settle the obligation.
- This slice is additive. Existing matching contracts and legacy runtime behavior remain for
  compatibility until the single-path cutover gate is reached.

### Tests added or updated

- Added five strict contract tests for Interest/Application separation, WIP/Cohort separation,
  backed Answer submission, mandatory Human Review evidence, no pre-answer Candidate cards, and
  Candidate Queue messaging.
- Added four pure domain scenarios for deterministic Queue tie-breaks, first-settlement Slot
  reuse to Candidate 09/Cohort 2, the 7/8 versus 8/8 advancement barrier, and rejection of an
  unbacked Answer.

### Verification and report

- The intentional failing-first run is preserved in
  `test-reports/20260719T211229Z-rolling-review-domain-initial.log`.
- Focused contract/domain run passed: 2 files and 9 tests.
- The first `pnpm typecheck` exposed one readonly-array mismatch. It was corrected by preserving
  the Cohort collection's readonly type; the complete rerun passed across all workspace packages.
- `pnpm check` passed: formatting, lint, all TypeScript checks, 109 unit tests, 8 integration
  tests, 13 security tests, 7 Replay tests, and all 116 documentation assertions.
- `pnpm build` passed with a successful Next.js production build and 8/8 static pages generated.
- `git diff --check` returned 0. The repository still has no HEAD and all workspace files are
  untracked, so it cannot provide normal tracked-diff coverage.
- `rg -n "\\.(only|skip)\\(" tests apps packages` returned 1 with no matches, which is the
  expected ripgrep result when no focused or skipped tests exist.
- Final report: `test-reports/20260719T212033Z-rolling-blind-review-foundation.log`.

### Checks not run and why

- PostgreSQL tests were not run because this slice adds no SQL migration, repository,
  transaction, or Application Command.
- Playwright E2E was not run because no API route, role UI, browser behavior, or runtime
  composition changed.
- Offline Demo and deterministic/LIVE evals were not run because no Replay fixture, prompt, AI
  adapter, Sandbox adapter, or Demo behavior changed. LIVE verification also remains blocked on
  a Worker-only OpenAI key.

### Known issues, risks, and blockers

- Active Web and Worker composition still uses the legacy Claim-first MatchEdge and pre-answer
  Direct selection path. Passing tests for the new pure domain do not remove this mismatch.
- Candidate Activity Lease, persistent Credit Hold, Decline/Expiry, pause/closure receipts,
  breach/remediation, immutable Answer storage, Answer Evidence AI, post-answer allocation, and
  role UI remain unimplemented.
- The current aggregate checks state alignment but does not replace PostgreSQL optimistic
  concurrency, idempotency keys, unique constraints, transactional Outbox, or cross-Opportunity
  `Q_i = 1`; those belong to the next persistence/Application slice.

### Migration and environment compatibility

- No database migration, API route, event, environment variable, prompt, Replay manifest,
  fixture, or runtime-mode behavior changed.
- The new schema exports are additive. No existing contract or Domain export was removed.

### Next action

Implement the first Batch 2 transaction slice: additive `0003` tables and constraints plus
`ActivateBlindReviewCommitment` and `OfferNextQueuedInterest`, including Slot Credit Holds,
Candidate Activity Leases, optimistic versions, idempotent Events/Outbox/Receipts, and tests that
prove one Slot cannot be offered twice and `Q_i = 1` holds across Opportunities.

---

## 2026-07-19 — Rolling review capacity and public Interest Queue correction

**Status:** Complete for product doctrine and architecture documentation; runtime implementation
not changed

### Goal

Correct the answer-first design so that eight funded review Slots cannot become a hidden
eight-person applicant cap. Maximize the chance that Candidate Interest and formal Applications
are actually seen while preserving bounded Employer WIP and the no-unbacked-labor invariant.

### Actual outcome

- Replaced the target one-shot `20 Interests → 8 Invitations → 12 capacity waitlisted` model with
  reusable Answer Review Slots serving a public, deterministic, non-profile Interest Queue.
- Defined Interest as low-cost registration with queue and closure receipts, not a formal
  Application or a claim of individual human review. A formal Application exists only when a
  funded named-review Slot reaches the Candidate and an Answer is submitted.
- Made each submitted Application require an individual evidence-linked Human Review Receipt or
  visible Employer Breach. Each successful Review Settlement releases only its own Slot and
  requests the next queued Interest; it does not wait for a job-wide or Cohort barrier.
- Separated rolling WIP from post-answer comparison. `AdvancementCohort` gates Direct/Explore,
  while `AdvancementCohortSeat` pins membership at Offer time. The first eight Offers enter Cohort
  1; the ninth Candidate can receive a recycled Slot into Cohort 2 before Cohort 1 reaches 8/8.
- Defined `onlyboth.interest-queue@1`: hard Eligibility, eligibility/Interest timestamps, a public
  hash tie-break, and no Employer reorder or skip authority. GPT has no Queue, Slot Settlement,
  Human Review, Cohort, or allocation authority.
- Rewrote the temporary runtime migration plan around rolling Slot activation, Queue offers,
  per-Slot Credit/Settlement, Cohort Seats, Opportunity pause/closure receipts, Candidate 09
  handoff, API/projection changes, migration tables, Workers, Replay, and acceptance gates.
- Updated the Demo story to show both `8/8 cohort reviewed` and the first settled Slot already
  serving the ninth Interest. The number eight is now explicitly concurrent WIP and Cohort size,
  never the total number of Candidates who may be seen.

### Files changed

- Product authority: `OnlyBoth-产品精神.md`, `OnlyBoth-产品方案.md`.
- Engineering authority: `OnlyBoth-工程设计.md`, `OnlyBoth-AI工程设计.md`.
- Implementation planning and evaluation: `OnlyBoth-运行代码迁移计划-TEMP.md`,
  `OnlyBoth-赛事评估与竞品研究.md`.
- Repository guidance: `AGENTS.md`, `README.md`, `apps/worker/README.md`, and this handoff.
- Documentation contracts: `tests/docs/agents-contract.sh` and
  `tests/docs/product-spirit-contract.sh`.
- Test evidence:
  `test-reports/20260719T205725Z-rolling-review-docs-initial.log` and
  `test-reports/20260719T205827Z-rolling-review-docs.log`.

### Product and engineering decisions

- Bounded WIP is necessary; a bounded total applicant pool is not the target product. Eight
  reusable Slots can review more than eight Applications over the Opportunity lifetime.
- The system does not promise that every Interest will receive a Slot before an Opportunity
  closes. It promises that no formal Application is accepted without a named funded Review, that
  every accepted Application receives a Receipt or Breach, and that an active Opportunity keeps
  recycling settled Slots through its public Queue.
- Opportunity closure requires explicit Employer awareness of the waiting count and one Closure
  Receipt per waiting Interest. Closure does not create a Reject or ability conclusion.
- Slot recycling and Advancement allocation are independent consistency boundaries. Cohort
  membership is pinned by a Seat at Offer time so asynchronous review completion cannot alter the
  comparison group.
- This task changed documentation and documentation contract tests only. No runtime code,
  migration, API, event schema, prompt, fixture, Replay manifest, or UI behavior was changed.

### Tests added or updated

- Expanded the AGENTS contract from 31 to 34 assertions for reusable WIP, Interest/Application
  separation, per-Slot backpressure, and rolling Queue service.
- Expanded the product/migration contract from 41 to 60 assertions for the public Queue,
  per-Application Review guarantee, Slot recycling, Cohort separation, Cohort Seat pinning,
  Candidate 09 handoff, AI non-authority, and removal of the one-shot Batch design.
- Added forbidden-string checks for the old `WAITLISTED_CAPACITY`, one-shot eight-person cap, and
  target `BlindReviewBatch` aggregate.

### Verification and report

- Initial `pnpm test:docs` correctly failed on one missing explicit doctrine sentence and two
  shell command-substitution defects in new assertions. The failure is preserved in
  `test-reports/20260719T205725Z-rolling-review-docs-initial.log` and was fixed without weakening
  the intended checks.
- Final `pnpm test:docs` passed: 34 AGENTS, 22 AI-design, and 60 product/migration assertions.
- `pnpm format:check` passed.
- `pnpm check` passed: formatting, lint, all TypeScript checks, 100 unit tests, 8 integration
  tests, 13 security tests, 7 Replay tests, and all documentation contracts.
- `git diff --check` returned 0; because the repository has no HEAD and all files are untracked,
  Prettier and Markdown contracts provide the meaningful changed-file checks.
- The focused/skipped-test scan found no `.only` or `.skip` usage.
- Final report: `test-reports/20260719T205827Z-rolling-review-docs.log`.

### Checks not run and why

- PostgreSQL, Playwright E2E, build, offline Demo, and deterministic/LIVE evals were not rerun
  because this was a documentation-only architecture correction with no runtime, schema, prompt,
  fixture, or Replay behavior change.

### Known issues, risks, and blockers

- The running `/employer/matching` path remains the legacy Claim-first, pre-answer Direct flow.
- No rolling Blind Review Commitment, public Interest Queue, reusable Answer Review Slot,
  per-Slot settlement handoff, Advancement Cohort Seat, Closure Receipt, or Candidate 09 runtime
  behavior exists yet.
- A public Queue improves procedural access but cannot guarantee that every Interest reaches a
  Slot before an Employer legitimately closes the Opportunity. The UI must not overstate this.
- LIVE model verification remains blocked on a Worker-only OpenAI key.
- The repository has no HEAD commit and all workspace files remain untracked.

### Migration and environment compatibility

- No database migration, API, event, environment variable, or runtime-mode change occurred.
- The proposed `0003` design now supersedes the earlier one-shot Batch proposal. It must create
  rolling Commitments, reusable Slots, Queue state, Cohort Seats, and Closure Receipts rather
  than a finite `blind_review_batches` invitation cap.

### Next action

Implement Batch 0 from temporary plan v0.2: freeze the Queue/Cohort event and contract version
map and add failing-first runtime tests for no unbacked Application, no pre-answer Candidate
payload/AI call, first Review Settlement to Candidate 09 Offer, Cohort 1/2 Seat pinning, the 7/8
allocation barrier, and the legacy endpoint cutover.

---

## 2026-07-19 — Temporary blind-answer runtime migration plan

**Status:** Complete for migration planning; no runtime implementation changed

### Goal

Persist an implementation-ready temporary plan for replacing the active pre-answer Claim-first
selection path with the blind-answer-first architecture, including the previously underspecified
Candidate Opportunity discovery and staged work-visibility boundary.

### Actual outcome

- Added a temporary cutover document that maps the legacy runtime to the target causal chain,
  defines scope and deletion conditions, and resolves the migration through Contracts, Domain,
  PostgreSQL, Application Commands, Workers, AI adapters, APIs, role projections, UI, Replay,
  legacy retirement, and acceptance gates.
- Added a five-layer Candidate visibility model: public Opportunity discovery, lightweight
  Interest/capacity waitlist, funded Answer Invitation, submitted/reviewed Answer, and selected
  Deep Proof. The exact sealed work packet is available before Candidate acceptance only after a
  named reviewer, SLA, Answer Review Slot, and held Credit already exist.
- Added public Candidate Opportunity query/Interest API targets. Candidate job discovery is
  deterministic and non-personalized in the MVP; it does not use GPT, résumé labels, Claims, or
  Candidate ranking.
- Defined an additive `0003_blind_answer_first` database direction, cross-table Candidate activity
  leases for `Q_i = 1`, atomic first- and second-stage Credit flows, strict role projections, and
  a single-active-path cutover that disables the legacy mutation endpoint.
- Recorded the required Direct Answer 42 / Explore Answer 17 target, facts-only Demo reset,
  real per-answer human Commands, two Challenge branches, and final verification matrix.
- Identified one wording conflict in the AI design: `buildAnswerEvidenceEdge` must run while the
  obligation is `REVIEW_PENDING`, before the Human Answer Review, not after a completed review.
  Correcting that wording is Batch 0 of implementation.

### Files changed

- Added `OnlyBoth-运行代码迁移计划-TEMP.md`.
- Updated `tests/docs/product-spirit-contract.sh` with migration-plan existence, authority,
  Candidate visibility, review barrier, AI timing, consistency, legacy cutover, target allocation,
  facts-only reset, and acceptance-gate assertions.
- Updated this handoff.

### Product and engineering decisions

- The temporary document is an execution aid, not a new source of product authority. It must be
  deleted or archived only after the target vertical passes all specified runtime gates.
- Candidate discovery exposes public job facts and a Proof preview, but not the exact sealed
  question or work artifacts. A funded Invitation exposes the complete work packet before
  acceptance so the Candidate can decline without penalty or unbacked labor.
- Interests may span multiple Opportunities; `Q_i = 1` applies to active Answer/Deep Proof work,
  not browsing or lightweight Interests.
- Database migration is additive and legacy storage remains temporarily readable, but the final
  Web and Worker runtime has exactly one active product path.
- This task changed planning documentation and its contract test only. It did not change source,
  migrations, prompts, fixtures, APIs, UI behavior, or runtime composition.

### Tests added or updated

- Expanded the product-spirit documentation suite from 28 to 41 assertions.
- Added a Markdown fence check for the temporary plan and twelve plan-specific contract checks,
  plus its existence assertion.

### Verification and report

- `pnpm exec prettier --check OnlyBoth-运行代码迁移计划-TEMP.md HANDOFF.md` → Passed before
  the final handoff update.
- `pnpm test:docs` → Passed: 31 agent-contract, 22 AI-design, and 41 product/migration assertions.
- Final repository checks and their actual output are stored in:
  `test-reports/20260719T194059Z-runtime-migration-plan-fix.log`.
- The first final-check attempt correctly failed because the English-prose validator did not yet
  exempt the temporary plan's Chinese filename when it appeared in the English handoff. That
  failure is preserved in `test-reports/20260719T193631Z-runtime-migration-plan.log`; the exact
  filename exception was added before the final rerun.

### Checks not run and why

- PostgreSQL, Playwright E2E, Replay fixture execution, offline Demo, and LIVE model suites were
  not required for this documentation-only planning change because runtime behavior and fixtures
  did not change. The root regression check still exercises existing compile-time, unit,
  integration, security, Replay-contract, and documentation gates.

### Known issues, risks, and blockers

- The migration plan is not implementation. The active Employer UI and API still allow the
  legacy pre-answer Direct path until the planned cutover is built and accepted.
- The AI-design wording conflict is recorded but not edited in this task; Batch 0 must correct it
  together with the failing-first contract test.
- LIVE model verification remains blocked on a Worker-only OpenAI key.
- The repository has no HEAD commit and all workspace files remain untracked.

### Migration and environment compatibility

- No database migration, API, event, environment variable, or runtime-mode change occurred.
- The proposed `0003` schema and API changes are plans only; they must not be reported as present.

### Next action

Implement Batch 0 from the temporary plan: correct the AI operation-order wording, add the
failing-first no-pre-answer-payload/no-pre-answer-AI-call/review-barrier/legacy-endpoint tests,
and freeze the version map before adding runtime behavior.

---

## 2026-07-19 — Blind-answer-first product doctrine and architecture correction

**Status:** Complete for product doctrine and architecture documents; runtime migration not
implemented

### Goal

Make the agreed product spirit normative: an Employer cannot choose a candidate from a résumé,
Candidate Claim, or GPT-generated pre-answer rationale. The Employer must first fund and accept
a named obligation to review real answers, and Candidate advancement can occur only after the
required anonymous answers have been recorded and individually reviewed.

### Actual outcome

- Added `OnlyBoth-产品精神.md` as the highest-level product doctrine. It fixes the causal order
  and defines five non-negotiable invariants covering pre-funded review, recorded work,
  mandatory review completion, delayed pedigree reveal, and settlement backpressure.
- Reframed attention as two separate commitments: a pre-answer Blind Answer Review obligation
  and a later deep-proof Review Window. Capacity can limit invitations, but cannot be presented
  as an ability judgment.
- Replaced the target pre-answer `Choose as Direct` flow with deterministic, non-profile Answer
  Invitations. Direct and Explore are target post-answer allocation modes, available only after
  the full human-review barrier closes.
- Assigned GPT a bounded post-answer role: structure recorded answer evidence into an
  `AnswerEvidenceEdge`; never decide who is allowed to answer, infer hidden pedigree, rank or
  reject candidates, or substitute for the named human review.
- Aligned the product plan, engineering architecture, AI design, competition analysis, agent
  contract, root README, and Worker README with that doctrine.
- Explicitly quarantined the current Claim-first `buildMatchEdge` pipeline as legacy and
  nonconforming. Golden Replay may verify deterministic causality, but cannot establish product
  validity unless it replays real Blind Review commands and human-review receipts.

### Files changed

- New doctrine: `OnlyBoth-产品精神.md`.
- Product and evaluation: `OnlyBoth-产品方案.md` and
  `OnlyBoth-赛事评估与竞品研究.md`.
- Engineering and AI architecture: `OnlyBoth-工程设计.md` and
  `OnlyBoth-AI工程设计.md`.
- Repository guidance: `AGENTS.md`, `README.md`, `apps/worker/README.md`, and this handoff.
- Documentation contracts: `tests/docs/agents-contract.sh`,
  `tests/docs/ai-engineering-design-contract.sh`, and the new
  `tests/docs/product-spirit-contract.sh`; `package.json` now runs all three.

### Product and engineering decisions

- `CandidateInterest` and hard Eligibility may exist before an answer, but Candidate Claims,
  résumé labels, and model-generated fit rationales are not Employer selection surfaces.
- No held Blind Review obligation means no Candidate answer invitation. No recorded answer means
  no selection. No completed required reviews means no Direct or Explore allocation.
- Every answer review produces a named `HumanAnswerReview` receipt. A list view, impression,
  scroll event, GPT summary, or batch acknowledgement is not review completion.
- The target AI operation is `buildAnswerEvidenceEdge`. The implemented `buildMatchEdge`
  operation remains documented only as a migration boundary and must not gain new product
  authority.
- This task intentionally changed documents and document tests only. It did not modify source,
  migrations, prompts, fixtures, APIs, UI behavior, or existing runtime tests.

### Tests added or updated

- Added 28 doctrine assertions covering all five invariants, cross-document links, target
  aggregates, post-answer GPT timing, legacy quarantine, and removal of Profile-first Direct
  authority.
- Updated the agent contract to 31 assertions and the AI design contract to 22 assertions.
- Added all three documentation suites to the repository-level `test:docs` command.

### Verification and report

- `pnpm format:check` → Passed.
- `pnpm test:docs` → Passed: 31 agent-contract, 22 AI-design, and 28 product-doctrine
  assertions.
- `pnpm check` → Passed: formatting, lint, all TypeScript checks, 100 unit tests, 8 integration
  tests, 13 security tests, 7 Replay tests, and all 81 documentation assertions.
- `git diff --check` and the focused/skipped-test scan → Passed.
- One diagnostic Prettier command that explicitly included shell scripts returned exit 2 because
  Prettier has no shell parser. The configured repository `pnpm format:check` passed; the report
  records both outcomes rather than hiding the diagnostic failure.
- An intermediate post-handoff documentation check caught that the English-prose validator did
  not yet exempt the competition-research document's Chinese filename; its log wrapper also used
  a zsh-reserved variable. The filename exception and wrapper were corrected, and the final
  documentation/format recheck passed.
- Test report:
  `test-reports/20260719T190542Z-blind-answer-doctrine.log`.

### Checks not run and why

- PostgreSQL, Playwright E2E, offline-demo, and LIVE model suites were not rerun because this was
  a documentation-only architecture correction and no runtime behavior changed. Existing
  runtime acceptance remains historical evidence for the legacy flow, not acceptance of the
  new doctrine.

### Known issues, risks, and blockers

- The current `/employer/matching` UI still exposes pre-answer `Choose as Direct`, and the
  current allocator still selects from Claim-based MatchEdges. This is the primary product
  conformance gap.
- No Blind Review Batch, per-answer review obligation/receipt, recorded-answer selection barrier,
  or post-answer `AnswerEvidenceEdge` exists in runtime code yet.
- The repository has no HEAD commit and all workspace files remain untracked.

### Migration and environment compatibility

- No database migration or environment change was made in this task.
- Existing Golden and LIVE MatchEdge paths continue to compile and pass their historical tests,
  but they are explicitly deprecated as product-selection paths.
- The future migration must preserve Challenge-only Replay and current Stage B behavior while
  moving invitation, review, and allocation authority ahead of that boundary.

### Next action

Implement the Blind Answer Review vertical slice: create review obligations before invitation,
record anonymous answers, require one human receipt per answer, and allow Direct/Explore only
after the review barrier closes. Remove or rename pre-answer `Choose as Direct` in the same
runtime change.

---

## 2026-07-19 — Matching-to-Challenge vertical slice

**Status:** Complete for Golden Replay; LIVE model acceptance blocked on a missing key

### Goal

Implement the real causal chain from a sealed synthetic Capability Contract and twenty
Candidate Interests through deterministic Eligibility, validated GPT MatchEdges or abstain,
Sarah's Direct selection, deterministic Explore, two attention-backed Review Windows,
Candidate 42 acceptance, Recorded Stage A, and the existing Sarah Challenge/Stage B path.

### Actual outcome

- Added V2 `buildMatchEdge` contracts with immutable Matching Cycle, Contract, and Claim
  Snapshot pins; typed hard facts; versioned Proof Templates; source coverage; and structured
  `propose | abstain` results.
- Added pure Matching, Eligibility, Attention, Credit, allocation, and pre-start release Domain
  behavior. The allocator is `onlyboth.direct-explore@1` and hashes
  `seed | opportunity_ref | candidate_ref | match_edge_ref`, sorting by hash and then candidate
  ref. Seed `onlyboth-explore-v1-00024` selects Candidate 42 when Sarah selects Candidate 17.
- Added SQL migration `0002_matching_vertical` with physically separate claims/private labels,
  immutable sealed artifacts, Matching Cycles and MatchEdges, Slots, Credit ledger/Holds,
  Allocation Runs/Decisions, role projections, and command receipts. Database constraints
  enforce one active Window per candidate and one unsettled Window per Slot.
- Added a guarded `demo:reset:matching` that writes only starting facts and twenty
  `CandidateInterestSubmitted` Outbox messages. The Worker derives 20 eligible results,
  8 MatchEdges, and 12 legal abstains; it does not infer ability from abstain.
- Added exact-key `matching-v1` Golden fixtures and
  `onlyboth.build-match-edge@1.0.0` LIVE Responses support with strict Zod format,
  `gpt-5.6-sol`, medium reasoning, `store: false`, no tools or remote conversation state,
  unique request IDs, SDK retries disabled, and no fallback to Golden.
- Added source/ref/capability/policy validation, stale-pin supersession, bounded retry,
  explicit human handling, truthful Golden model-run metadata, and duplicate Job
  short-circuiting through Inbox completion.
- Added `ReserveMatchedAttention`. One PostgreSQL transaction locks Cycle, Commitment, Credit
  Account, and Slots, then commits two Windows, two Holds, ledger entries, allocation records,
  Events, Outbox messages, projections, and a Receipt or rolls all of them back.
- Added Candidate 42 Accept and explicit Decline Commands plus database-time 24-hour Expiry.
  Decline/Expiry return Credit and Slot without negative inference. The continuous Worker now
  runs the Expiry command.
- Added Recorded Stage A through the existing Replay `SandboxPort`. Exhausted Sandbox retries
  execute Platform Abort, restore resources, and never record Candidate Failure or Employer
  Breach.
- Added authenticated role APIs and UI. Sarah sees 20/8/12, opaque cards, source-bounded proof
  paths, two attention slots, the public seed, and allocation Receipt. Candidate 42 sees only
  `INTEREST_RECEIVED` before allocation and, afterward, named Sarah, SLA, AI policy, six-minute
  limit, and Accept/Decline—not the pool, MatchEdges, or allocation kind.
- Candidate 42 acceptance now reaches `CHECKPOINT_PENDING`; Sarah's real Redis authorization
  then drives the existing Candidate and Replay Sandbox into the exact Redis Stage B branch.
  The original three-branch Challenge-only path and static offline `/demo` remain intact.

### Files changed

- Contracts/Domain: `packages/contracts/src/hiring-intelligence.ts`,
  `packages/contracts/src/matching-review.ts`, `packages/domain/src/matching/`, and the
  `ReviewWindow` pre-start release/Platform Abort transitions.
- Application: Matching Worker, allocation, proof decision, Expiry, and Stage A ports/commands
  under `packages/application/src/`.
- AI/Replay: `packages/ai/src/build-match-edge-prompt.ts`, MatchEdge validator, Golden/LIVE
  adapters, prompt registry, and `packages/demo-replay/src/fixtures/matching-v1.ts`.
- PostgreSQL: `packages/db/migrations/0002_matching_vertical*.sql`, Matching/decision/Stage A
  stores, and guarded seed/reset changes.
- Runtime/UI: Matching and Stage A Worker compositions/runtime, five role APIs, separate Demo
  Employer issuer, `/employer/matching`, Candidate mode selection, two interactive panels, and
  responsive CSS.
- Acceptance: Matching unit, security, deterministic eval, PostgreSQL, and Playwright tests;
  existing Challenge tests and migration expectations were updated for the new schema.
- Documentation: `README.md`, `OnlyBoth-工程设计.md`, `OnlyBoth-AI工程设计.md`, and this handoff.

### Product and engineering decisions

- GPT creates only a source-bounded `uncertainty ↔ claims ↔ proof template` draft. It does not
  rank candidates, decide Direct/Explore, allocate attention, or make a hiring decision.
- The twenty synthetic candidates all pass deterministic hard predicates. Eight have a valid
  evidence connection; twelve abstain. Refusal, incomplete output, invalid refs, and platform
  failure are `NEEDS_HUMAN` and block allocation rather than silently excluding a candidate.
- Sarah makes the only Direct choice. Explore is deterministic, public-seed auditable, and
  limited to eligible validated MatchEdges after excluding Direct and candidates with another
  active Window.
- Candidate 17 remains `RESERVED` in the main browser demo. Decline and Expiry are verified in
  isolated database tests so the demo does not expand into a second Challenge chain.
- Stable `review-window-17` and `review-window-42` IDs exist only in guarded Demo mode; other
  environments use cycle/candidate-scoped UUID identifiers.
- No Agent, vector database, linear-programming library, microservice, or generic browser AI
  endpoint was introduced.

### Tests added or updated

- Unit coverage for typed Eligibility, missing facts, V2 schemas, MatchEdge policy gates,
  Golden miss, tool-free LIVE request shape, duplicate/retry/human error mapping, public-seed
  allocation, tie-breaks, WIP/Credit/Slot/Q_i, release, and illegal post-start release.
- PostgreSQL coverage for facts-only seed, 20 Worker leases, duplicate Job Inbox handling,
  immutable outputs and sealed artifacts, physical label isolation, concurrent duplicate
  Reserve, stale Reserve, injected second-Window transaction rollback, Accept/Decline/Expiry,
  Stage A/Challenge handoff, and Platform Abort resource restoration.
- Security coverage for strict Candidate projections, Employer/Candidate endpoint separation,
  Worker-only OpenAI access, unreachable Private Label Vault, and Prompt Injection remaining
  untrusted user data.
- Two 12-case deterministic eval corpora: Challenge recommendations and MatchEdges. The latter
  covers six proposals, three abstains, and three injection cases with 12/12 hard-gate passes.
- Playwright coverage with isolated Sarah/Candidate sessions for exact Direct 17/Explore 42,
  idempotent duplicate Reserve, stale 409, Candidate privacy and polling, real Accept, Stage A,
  Redis Challenge, exact Stage B, and zero external browser requests.

### Verification and report

- `pnpm check` → Passed: formatting, lint, all TypeScript checks, 100 unit tests, 8
  integration tests, 13 security tests, 7 Replay tests, and both documentation contracts
  (28 repository/agent assertions plus 19 AI-design assertions).
- `pnpm build` → Passed without warnings; `/demo` remains static while the matching and
  role-specific API surfaces remain dynamic.
- `TEST_DATABASE_URL=<redacted> pnpm test:postgres` → Passed, 14/14 against PostgreSQL 16.
- `TEST_DATABASE_URL=<redacted> pnpm test:e2e` → Passed, 2/2 isolated-role Playwright
  scenarios, including all three legacy Challenge branches and the complete matching chain.
- `pnpm test:evals` → Passed both 12-case deterministic corpora.
- `pnpm demo:offline` → Passed with zero external Web dependencies.
- `pnpm test:evals:live` → `BLOCKED` before model invocation because no Worker-only
  `OPENAI_API_KEY` is present; Golden Replay did not substitute for LIVE.
- Test report:
  [test-reports/20260719T150335Z-matching-vertical.log](test-reports/20260719T150335Z-matching-vertical.log).

### Checks not run and why

- `pnpm live:smoke` and `pnpm test:evals:live` are `BLOCKED` because no Worker-only
  `OPENAI_API_KEY` is present. No LIVE case was skipped and Golden did not substitute for LIVE.

### Known issues, risks, and blockers

- The real Docker Sandbox/Verifier remains outside this milestone; Golden uses the existing
  Replay Sandbox and LIVE Stage A fails closed.
- `compileContract`, `compressEvidence`, `CACHED_AI`, production identity, settlement/reveal,
  and full runtime-parity recording remain future work.
- The repository still has no HEAD commit and all workspace files remain untracked.

### Migration and environment compatibility

- Migration `0002_matching_vertical` requires PostgreSQL 16 and has an explicit down migration.
  It preserves old Challenge-only Review Window rows through nullable all-or-none matching refs.
- Matching reset requires exactly `DEMO_MODE=true`, `RUNTIME_MODE=GOLDEN_REPLAY`, and
  `REPLAY_ID=matching-v1`; it is destructive and has no production API.
- Existing Challenge reset remains independently guarded by `REPLAY_ID=payment-retry-v1`.

### Next action

Provide an OpenAI API key only to the Worker shell and run both LIVE model-eval files. Do not
change the passing Golden database, browser, Replay, or offline-demo gates while doing so.

---

## 2026-07-19 — PostgreSQL test database and real vertical acceptance

**Status:** Complete

### Goal

Start an available PostgreSQL 16 service, create the dedicated `onlyboth_test` database, and
remove the environment blocker from the Candidate 42 database and browser acceptance gates.

### Actual outcome

- Started the already-installed Docker Desktop and the repository's `postgres:16-alpine`
  Compose service. The healthy container binds only `127.0.0.1:5432`; the data is retained in
  `onlyboth-dev_onlyboth-postgres-data`.
- Created `onlyboth_test`, owned by the local `onlyboth` role, and verified PostgreSQL 16.14.
- Installed the Playwright 1.61.1 Chromium runtime after the database gate exposed that missing
  test dependency.
- Real PostgreSQL execution exposed and fixed the reserved SQL alias `window` in every affected
  Worker query and in the acceptance assertion.
- Browser execution exposed and fixed same-host Demo session redirects, the narrowly scoped
  `127.0.0.1` Next.js development origin, a committed Receipt versus lagging-projection race,
  and typed stale-error mapping across the Next.js server bundle boundary.
- The full Golden vertical now passes all three Catalog branches in isolated Sarah/Candidate
  browser contexts. The Candidate sees Sarah's exact Challenge and matching Replay Sandbox
  branch within the E2E deadline.

### Files changed

- `packages/db/src/postgres-challenge-worker-store.ts`
- `tests/postgres/challenge-vertical.postgres.test.ts`
- `apps/web/app/api/v1/demo/session/candidate/route.ts`
- `apps/web/app/api/v1/demo/session/employer/route.ts`
- `apps/web/app/api/v1/review-windows/[id]/challenge/select/route.ts`
- `apps/web/src/components/employer-challenge-panel.tsx`
- `apps/web/next.config.ts`
- `packages/application/src/commands/select-human-challenge.ts`
- `tests/unit/select-human-challenge.test.ts`
- `OnlyBoth-工程设计.md`
- `test-reports/20260719T085150Z-postgres-test-database.log`
- `HANDOFF.md`

### Product and engineering decisions

- No in-memory or PGlite substitute was introduced. Acceptance uses the required PostgreSQL 16
  server and destructive work remains confined to a database whose name contains `test`.
- Demo identity redirects use relative `Location` headers so HttpOnly host-only cookies cannot
  be lost through `localhost`/`127.0.0.1` drift or redirected through an untrusted Host value.
- `allowedDevOrigins` permits only `127.0.0.1`; it is not a wildcard authorization change.
- A committed Human Authorization Receipt is immutable UI truth. A temporarily lagging
  projection may replace it only with a non-null persisted authorization, never erase it.
- API error normalization accepts only the fixed Challenge-selection code/status allowlist. It
  remains reliable when `instanceof` identity is split by a server bundle without accepting an
  arbitrary caller-supplied status.

### Tests added or updated

- Updated the real PostgreSQL acceptance SQL to avoid the reserved alias and exercised all
  Worker query paths against PostgreSQL 16.
- Added two unit assertions for cross-bundle Challenge-selection error normalization and
  rejection of a mismatched code/status pair.
- Reused the existing non-skipped Playwright scenario as the regression for login host
  continuity, client hydration, committed Receipt visibility, stale 409 behavior, three
  Challenge branches, Candidate polling, and Replay Sandbox parity.

### Verification and report

- `pnpm check` → Passed: formatting, lint, all TypeScript checks, 85 unit tests, 8 integration
  tests, 9 security tests, 7 Replay tests, and 47 documentation assertions.
- `pnpm build` → Passed; `/demo` remains static and the interactive/API routes remain dynamic.
- `TEST_DATABASE_URL=<redacted> pnpm test:postgres` → Passed, 7/7.
- `TEST_DATABASE_URL=<redacted> pnpm test:e2e` → Passed, 1/1 three-branch scenario in 6.3s.
- `pnpm demo:offline` → Passed with zero external Web dependencies.
- `pnpm test:evals` → Passed the aggregate 12-case deterministic contract corpus.
- `git diff --check` → Passed; the no-focused/no-skipped-test search returned no matches.
- Test report:
  [test-reports/20260719T085150Z-postgres-test-database.log](test-reports/20260719T085150Z-postgres-test-database.log).

### Checks not run and why

- `pnpm live:smoke` and `pnpm test:evals:live` were not run because no Worker-only
  `OPENAI_API_KEY` was provided. Golden Replay did not substitute for either LIVE gate.

### Known issues, risks, and blockers

- Docker Desktop and `onlyboth-dev-postgres-1` must be running for PostgreSQL and Playwright
  acceptance. The named volume persists data, but the container may need `docker compose up -d`
  after Docker is stopped.
- The repository still has no HEAD commit and all workspace files remain untracked.
- LIVE model acceptance remains blocked by its key; the Docker Sandbox/Verifier and other
  previously documented future milestones remain out of scope.

### Migration and environment compatibility

- No new migration or environment variable was added.
- The existing Compose definition and `.env.example` values were used. No database URL,
  password, session token, cookie, or private label was written to the report or handoff.
- The Playwright Chromium, Headless Shell, and FFmpeg artifacts were installed in the user's
  standard Playwright cache, outside the repository.

### Next action

Provide an OpenAI API key only to the Worker shell, then run `pnpm live:smoke` and
`pnpm test:evals:live`; keep the passing Golden Replay database and browser gates unchanged.

---

## 2026-07-19 — Candidate 42 Challenge recommendation vertical slice

**Status:** Partial

### Goal

Implement the real causal chain from Candidate 42 Stage A Evidence through validated
Challenge recommendations, Sarah's authenticated Catalog authorization, the
`HumanChallengeSelected` Event and Outbox, Candidate `STAGE_B_ACTIVE`, and the exact selected
Golden Replay Sandbox branch. Preserve the existing network-independent `/demo` Cold Open.

### Actual outcome

- Moved all four AI DTO schemas to `packages/contracts` and the four-method
  `HiringIntelligencePort` to `packages/application`; `packages/ai` retains compatibility
  exports and owns implementations.
- Added `onlyboth.recommend-challenges@1.1.0`, canonical SHA-256 hashing, an exact six-part
  Candidate 42 Golden key, three equal-weight Catalog recommendations, and deterministic
  source/Catalog/capability/no-decision/no-executable/no-label validation.
- Implemented the tool-free LIVE Responses adapter with `responses.parse`, Zod `text.format`,
  `gpt-5.6-sol`, medium reasoning, `store: false`, unique `X-Client-Request-Id`, SDK retries
  disabled, and typed refusal/incomplete/provider failures. LIVE never falls back to Golden.
- Added a pure SQL PostgreSQL 16 migration for Review Windows, Proof Sessions, Stage A
  Evidence, AI request/run/source/immutable-output records, Event/Outbox/Inbox, output
  consumption, and physically separate Employer/Candidate projections.
- Added a guarded synthetic Candidate 42 migration/seed/reset CLI. It exists only in the
  Worker and refuses to run without the exact Demo/Golden/Replay guards; there is no Reset API.
- Implemented Stage A Outbox consumption, veiled request assembly, input-hash deduplication,
  90-second leases, persisted retry attempts, stale-result handling, immutable completion,
  role projection updates, and duplicate Stage-job protection.
- Implemented `SelectHumanChallenge` with AI and manual command unions, reserved-reviewer
  authorization, database time, Catalog/output/Evidence validation, advisory-lock idempotency,
  compare-and-swap, Domain Event, Outbox, output consumption, and Receipt in one transaction.
- Added explicit `PlatformAborted` behavior. Exhausted Sandbox failures cannot become Candidate
  failure or Employer Breach.
- Added signed, role-specific, HttpOnly, SameSite=Strict synthetic sessions; CSRF and
  Idempotency headers; three public Review Window APIs; a three-card Proof Analyst Panel; and a
  Candidate panel that polls every 600 ms without ever receiving the recommendation list.
- Added a selected-Challenge Replay adapter that rebuilds the recorded Stage A boundary and
  loads the exact Redis, webhook, or cross-region branch chosen by Sarah.
- Kept `/demo` static and unchanged in its data path. Offline verification still reports zero
  external Web dependencies.

### Files changed

- Contracts and Domain: `packages/contracts/src/`, `packages/domain/src/review-window/`.
- Application: `packages/application/src/commands/`, `packages/application/src/ports/`, and
  `packages/application/src/workflows/challenge-recommendation-worker.ts`.
- AI: `packages/ai/src/`, including the versioned prompt, validator, Golden fixture/adapter,
  LIVE adapter, hashes, errors, and tests.
- Persistence: `packages/db/migrations/0001_challenge_recommendation_vertical*.sql` and the new
  PostgreSQL Command/Worker/seed adapters under `packages/db/src/`.
- Runtime/UI: `apps/worker/src/`, `apps/web/app/api/v1/`, Employer/Candidate pages and panels,
  authentication/services, CSS, and runtime documentation.
- Replay: `packages/sandbox/src/selected-challenge-replay.ts` and three-branch tests.
- Acceptance: new/updated unit, integration, security, Replay, PostgreSQL, Playwright, and eval
  files under `tests/`, plus their Vitest/Playwright configs.
- Workspace/docs: `package.json`, lockfile, `.env.example`, `tsconfig.tests.json`, root/Worker
  READMEs, the engineering and AI designs, this handoff, and the retained report.

### Product and engineering decisions

- The milestone is Candidate 42 only. Candidate 17, `CACHED_AI`, the other three AI operations,
  and full Docker execution remain out of scope and fail closed.
- Recommendation output is one strict top-level object with a `recommend | needs_human`
  discriminator because Responses Structured Outputs requires an object root. Semantic
  refinement still enforces one-to-three options or a structured human state.
- GPT produces immutable, evidence-linked options only. Sarah remains the sole Challenge
  authority; no generic browser AI endpoint or AI mutation tool was added.
- The Golden full vertical path is the default interactive Demo. LIVE is an independent
  synthetic smoke/eval path and can never fall back to Golden after failure.
- PostgreSQL 16 remains a completion requirement. Test and production code do not substitute
  an in-memory business store when it is unavailable.
- The existing Replay Sandbox is the selected-branch implementation for this milestone. LIVE
  Docker Sandbox exhaustion explicitly invokes Platform Abort.

### Tests added or updated

- AI Schema, exact Golden key/miss, prompt hash, locked Catalog/input parity, source/capability
  validation, prohibited content, structured human result, tool-free LIVE request shape,
  unique request IDs, refusal/incomplete/schema mapping, and single-layer retry tests.
- Application/Domain tests for all three Catalog branches, AI/manual Evidence authority,
  reviewer mismatch, stale version, idempotency, rollback, Stage job assembly, transient and
  permanent AI handling, Sandbox retry/exhaustion, and Platform Abort.
- Static PostgreSQL migration contracts plus a real, non-skipped PostgreSQL acceptance suite
  for fresh migration, rollback, optimistic concurrency, immutable output, duplicate jobs,
  concurrent duplicate clicks, transaction atomicity, and three branch projections.
- Role-session, strict Candidate payload, Web key isolation, prompt-injection authority,
  equal-card UI, pending privacy, exact selected branch, and offline Replay tests.
- A real two-context Playwright scenario for role cookies, CSRF/RBAC, all three reset branches,
  repeated receipt, stale 409, exact Candidate/Sandbox parity within two seconds, and no
  external browser requests.
- A 12-case deterministic contract corpus and a separate, non-skipped LIVE model-eval entry.

### Verification and report

- `pnpm install --frozen-lockfile` → Passed across 13 workspace projects.
- Final `pnpm check` → Passed: formatting, lint, all workspace and root test/config type checks,
  83 unit tests, 8 integration-contract tests, 9 security tests, 7 Replay tests, and 47
  documentation assertions.
- `pnpm build` → Passed after retaining and fixing two Turbopack integration failures; `/demo`
  remains static and all five new APIs are dynamic.
- `pnpm test:evals` → Passed the aggregate 12-case contract corpus.
- `pnpm demo:offline` → Passed with zero external Web dependencies.
- Golden Worker smoke → Passed without an OpenAI key and returned the Redis verification ref.
- Built localhost route smoke → `/demo`, `/employer`, and `/candidate` returned 200; the
  synthetic Employer issuer returned 303.
- Test report:
  [test-reports/20260719T082854Z-challenge-recommendation-vertical.log](test-reports/20260719T082854Z-challenge-recommendation-vertical.log).

### Checks blocked by the environment

- `env -u TEST_DATABASE_URL pnpm test:postgres` → **Blocked**, exit 1. No PostgreSQL 16 test
  database was available; zero database tests were executed.
- `env -u TEST_DATABASE_URL pnpm test:e2e` → **Blocked**, exit 1 before browser startup for the
  same required database. No Playwright scenario was executed.
- `env -u OPENAI_API_KEY pnpm test:evals:live` → **Blocked**, exit 1. No LIVE case was executed
  or replaced.
- LIVE smoke without the key → **Blocked**, exit 1 with `WORKER_CONFIGURATION_INVALID`.
- `psql`, Docker, and Podman are unavailable, and localhost PostgreSQL port 5432 is unreachable.

### Known issues, risks, and blockers

- The real SQL has static contracts and compiles, but migration syntax, trigger behavior,
  leases, concurrent transactions, and the full browser path are not claimed as executed until
  the PostgreSQL suite runs.
- The LIVE adapter and 12-case harness compile and have deterministic fake-client coverage, but
  no remote Responses request was made without a user-provided key.
- Playwright browser availability was not reached because its configuration correctly failed on
  the earlier database prerequisite.
- Full Replay Manifest hashing/event parity, Docker isolation, production authentication, and
  the remaining AI operations are still future milestones.
- The repository still has no HEAD commit and all workspace files remain untracked.

### Migration and environment compatibility

- Added pure SQL migration `0001_challenge_recommendation_vertical` and its rollback.
- Added runtime variables `DEMO_MODE` and `DEMO_SESSION_SECRET`; the existing `DATABASE_URL`,
  `RUNTIME_MODE`, `SANDBOX_ADAPTER`, and `REPLAY_ID` now drive the interactive path.
- Added `TEST_DATABASE_URL` for destructive acceptance against a database name containing a
  `test` segment.
- `OPENAI_API_KEY` remains absent from the keyless default environment and belongs only in a
  LIVE Worker shell.
- Added `openai@6.48.0`, `pg@8.22.0`, `@types/pg@8.20.0`, and
  `@playwright/test@1.61.1`.
- Added the three public APIs specified by the milestone; this is a new API surface, not a
  compatibility-preserving no-op.

### Next action

Provide a dedicated PostgreSQL 16 database through `TEST_DATABASE_URL`; run
`pnpm test:postgres` and `pnpm test:e2e` to resolve the hard blocker. Then inject an OpenAI key
only into the Worker shell and run `pnpm live:smoke` plus `pnpm test:evals:live`. Mark this
milestone Complete only if those acceptance gates pass.

---

## 2026-07-19 — AI engineering design

**Status:** Complete

### Goal

Create a standalone implementation blueprint for the bounded Hiring Intelligence service,
aligned with the current hiring product, modular-monolith architecture, four approved AI
operations, Label Veil, human authority, and truthful Golden Replay.

### Actual outcome

- Added a complete Chinese AI engineering design subordinate to the authoritative product
  and engineering documents.
- Defined the Worker-hosted asynchronous architecture, target dependency ownership, the
  four operation contracts, AI request lifecycle, Veiled Input Assembler, versioned prompt
  registry, Responses Structured Output adapter, deterministic post-validation, persistence,
  failure semantics, retry policy, idempotency, stale-result handling, runtime parity,
  employer UI contract, threat model, telemetry, eval gates, implementation phases, and
  Definition of Done.
- Kept the MVP explicitly non-agentic and tool-free. AI produces immutable, evidence-linked
  drafts; only human-authorized Application Commands may mutate business state.
- Added discoverability links from the authoritative engineering design and root README.
- Added a dedicated documentation contract and made `pnpm test:docs` part of `pnpm check`.

### Files changed

- `OnlyBoth-AI工程设计.md`
- `OnlyBoth-工程设计.md`
- `README.md`
- `package.json`
- `tests/docs/ai-engineering-design-contract.sh`
- `tests/docs/agents-contract.sh`
- `test-reports/20260719T063043Z-ai-engineering-design.log`
- `HANDOFF.md`

### Product and engineering decisions

- The AI capability is a logical service but remains deployed inside the Background Worker
  for the MVP; no microservice or autonomous Agent was introduced.
- GPT drafts `uncertainty ↔ claim ↔ proof template`; deterministic allocation owns
  Eligibility, Direct/Explore, WIP, Attention, Credit, and ReviewWindow creation.
- All four operations remain single, tool-free Responses calls with strict Structured
  Outputs, `store: false`, no remote conversation state, deterministic source/Catalog/policy
  validation, and explicit human handling for refusals or invalid output.
- The Worker/Outbox is the sole asynchronous and retry owner; Background Mode is not part of
  the initial design.
- LIVE failures cannot silently fall back to synthetic adapters. LIVE, CACHED_AI,
  GOLDEN_REPLAY, and UNCONFIGURED use the same normalized contracts and validators.
- The current port/schema placement in `packages/ai` is documented as a scaffold gap. The
  target direction places contracts in `packages/contracts`, the port in
  `packages/application`, and implementations in `packages/ai`.

### Tests added or updated

- Added `tests/docs/ai-engineering-design-contract.sh` with 19 assertions covering the four
  operations, no-tools policy, Responses settings, request correlation, typed failures,
  stale results, human authority, private-label boundary, Replay parity, non-agentic MVP,
  cross-links, and balanced Markdown fences.
- Updated the existing English README checker to permit the new Chinese source-document
  filename without permitting Chinese README prose.
- Added `test:docs` and included it in the aggregate `pnpm check` command.

### Verification and report

- Initial `pnpm test:docs` → Failed: 27 passed, 1 failed because the English README checker
  did not yet exempt the new Chinese filename. The checker was fixed; the failure is retained
  in the report.
- Final `pnpm test:docs` → Passed: 28 repository/agent assertions and 19 AI-design assertions.
- `pnpm check` → Passed: formatting, lint, all project type checks, 51 unit tests, 4
  integration tests, 6 security tests, 3 Replay tests, and both documentation contracts.
- `git diff --check` → Passed.
- `.only/.skip` scan → no matches.
- Test report:
  [test-reports/20260719T063043Z-ai-engineering-design.log](test-reports/20260719T063043Z-ai-engineering-design.log).

### Checks not run

- `pnpm build` and `pnpm demo:offline` were not run because this was a documentation and
  documentation-contract change with no runtime implementation change.
- `pnpm test:e2e` and `pnpm test:evals` were not run; the scaffold still has no implemented
  test files in those future suites, and they are not reported as passed.
- No LIVE OpenAI, PostgreSQL, Docker Sandbox, or remote network call was made.

### Known issues and risks

- The document is an implementation blueprint; the Responses adapter, AI persistence,
  Veiled Input Assembler, deterministic post-validators, continuous Worker, model evals,
  and employer Proof Analyst Panel remain unimplemented.
- The repository still has no HEAD commit and all current files are untracked.
- This change introduced no API, Domain Event, AI Schema, Prompt, Catalog, Replay-format,
  migration, or environment-variable compatibility change.

### Next action

Implement the first vertical slice from Stage A Evidence through validated Golden Replay
Challenge recommendations, Sarah's real `SelectHumanChallenge` Command, and the resulting
Candidate Stage B projection change.

---

## 2026-07-18 — Build Week engineering scaffold

**Status:** Complete

### Goal

Create the repository scaffold described by the current OnlyBoth engineering plan, including the two-process monorepo, privacy-separated role views, Golden Replay cold open, core Domain boundaries, adapter ports, tests, retained verification output, and handoff.

### Actual outcome

- Created a 13-project pnpm workspace with stable formatting, lint, type, test, Replay, build, and offline-demo commands.
- Added a Next.js Web application with `/demo`, `/employer`, `/candidate`, and `/audit` role views plus the landing page.
- Built the local 30-second synthetic cold open from the shared Golden Replay fixture; it clearly labels recorded external inputs and recorded candidate work.
- Added strict Employer, Candidate, and Synthetic Judge projection schemas. Employer and Candidate projection/security tests reject synthetic private-label leakage.
- Added the ReviewWindow state-machine skeleton and Application handlers for reviewer-backed reservation and conditional Reveal, including version pins and optimistic repository writes.
- Added the four-operation Hiring Intelligence port, strict Zod schemas, versioned prompt registry, and fail-closed unconfigured adapter. No OpenAI key or live model call is required by the scaffold.
- Added the versioned payment-retry Challenge Catalog, three selected-challenge branches, Sandbox port, deterministic Replay adapter, and fail-closed Docker adapter.
- Added database repository, Domain Event, transaction, and transactional Outbox ports without exposing generic business-state mutation.
- Added a Worker `--smoke` path that executes a deterministic Stage A/selected Stage B Replay flow and emits a structured success event. Continuous, `LIVE`, and `CACHED_AI` composition remain fail-closed.
- Added local PostgreSQL Compose configuration, environment examples, a lockfile, and supply-chain build allowlisting for required native dependencies.
- Added an English root README and Worker README with accurate run instructions and limitations.

### Files and modules added

- Root workspace/configuration: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, ESLint/Prettier/Vitest configuration, `.env.example`, and repository ignores.
- Runtime applications: `apps/web/` and `apps/worker/`.
- Core packages: `packages/contracts/`, `packages/domain/`, `packages/application/`, `packages/projections/`, `packages/demo-replay/`, and `packages/testkit/`.
- Adapter boundaries: `packages/ai/`, `packages/challenge-catalog/`, `packages/sandbox/`, and `packages/db/`.
- Local fixtures/infrastructure: `challenges/payment-retry/v1/`, `infra/`, and `scripts/verify-offline-demo.ts`.
- Automated checks: `tests/unit/`, `tests/integration/`, `tests/security/`, `tests/replay/`, plus package-local Worker, AI, Catalog, Sandbox, timeline, and role-rendering tests.

### Product and engineering decisions

- The scaffold implements the current hiring product only; it does not restore the overridden dating/social direction.
- Golden Replay fixes external inputs but uses shared schemas, projections, Catalog IDs, and Sandbox ports. The cold-open timer controls presentation only and is not represented as Domain truth.
- Employer and Candidate UI models are created from physically separate projections; the Synthetic Judge projection is the only path containing the counterfactual private profile.
- Common Verifier counts are the comparable baseline. Scenario findings remain descriptive and are not ranked across different challenges.
- The AI surface remains limited to `compileContract`, `buildMatchEdge`, `recommendChallenges`, and `compressEvidence`; the unconfigured adapter never fabricates a business decision.
- Next.js Turbopack is pinned to the repository root because an unrelated parent lockfile otherwise caused incorrect workspace inference.
- Next-generated declaration files are excluded from the offline runtime-source scan because documentation URLs in comments are not runtime network dependencies.

### Tests added or updated

- Domain reservation, transition, evidence, Ask Back, settlement, and Reveal invariants.
- Application handler persistence, duplicate reservation, optimistic version, and missing-Window behavior.
- Employer/Candidate projection key and value leakage checks.
- AI strict-schema, abstention, prompt-authority, and fail-closed adapter checks.
- Catalog manifest/lock/allowlist checks and Replay Sandbox determinism/branch checks.
- Web timeline boundaries and role-specific server-rendering privacy checks.
- Workspace shape, Turbopack root, keyless environment, Golden Replay/Catalog, and offline-source checks.

### Verification and report

- `pnpm install --frozen-lockfile` → Passed across 13 workspace projects.
- `pnpm check` → Passed: format, lint, all project type checks, 51 unit tests, 4 integration tests, 6 security tests, and 3 Replay tests.
- `pnpm build` → Passed; seven static Next.js pages generated.
- `pnpm demo:offline` → Passed; zero external Web dependencies reported.
- Golden Replay Worker smoke → Passed without an OpenAI key or database connection.
- Built route smoke → `/`, `/demo`, `/employer`, `/candidate`, and `/audit` returned HTTP 200.
- Documentation contract → 28 passed, 0 failed before this handoff update; rerun below after the final handoff/report link.
- Test report: [test-reports/20260718T220445Z-scaffold.log](test-reports/20260718T220445Z-scaffold.log).

Intermediate integration failures and their fixes are retained in the report, including the Vitest symlink glob, missing root workspace dependencies, Turbopack root inference, and generated declaration-file offline false positive.

### Not implemented or environment-blocked

- `pnpm test:e2e` ran but found no test files. Playwright demo scenarios are not implemented and are not reported as passed.
- `pnpm test:evals` ran but found no test files. Model evals are not implemented and are not reported as passed.
- Docker is unavailable in the current environment, so PostgreSQL Compose, Docker Sandbox isolation, and Docker Verifier checks were blocked.
- The PostgreSQL adapter, migrations, API authentication/authorization, transactional Event/Outbox composition, and continuous Worker are not implemented.
- The current Replay validates schemas, projections, Catalog IDs, and deterministic branches but does not yet implement the complete hash-pinned Replay Manifest from the engineering design.
- Sarah's live Challenge click and Candidate projection transition are the next vertical slice; the current role pages display completed synthetic Replay projections.

### Environment and compatibility

- Node.js: v22.14.0.
- pnpm: 11.9.0.
- Runtime mode verified: `GOLDEN_REPLAY`.
- No OpenAI API key was used or added.
- No database migration was created.
- The repository is on `main` and has no HEAD commit; all current files are untracked, so no commit hash is available.

### Next safe step

Implement one real local interaction end to end:

```text
Sarah selects a versioned Catalog Challenge
→ authenticated SelectHumanChallenge Route Handler
→ Application Command with expected aggregate version
→ Domain event + aggregate + Outbox in one transaction
→ Employer and one authorized Candidate projection update
→ Candidate polling observes the exact selected Challenge ID
```

Keep Replay differences inside adapters, add API/RBAC/concurrency tests, and start the full Replay Manifest before claiming the interactive demo path is complete.

---

## 2026-07-18 — English documentation standardization

**Status:** Complete

### Goal

Convert `AGENTS.md`, `HANDOFF.md`, and every existing `README.md` to English while preserving the previously established engineering and delivery requirements.

### Actual outcome

- Replaced the Chinese `AGENTS.md` with an English execution contract.
- Converted the full handoff history to English and added this entry.
- Converted `test-reports/README.md` to English.
- Updated the Agent Contract test to assert the English clauses.
- Added an explicit repository rule that `AGENTS.md`, `HANDOFF.md`, and every `README.md` must remain in English.

### Files changed

- `AGENTS.md`
- `HANDOFF.md`
- `test-reports/README.md`
- `tests/docs/agents-contract.sh`

### Product and engineering decisions

- No product behavior, architecture, state-machine, AI boundary, Catalog format, or Replay format changed.
- The documentation language changed; Chinese product and engineering source filenames remain unchanged.

### Tests added or updated

- Updated `tests/docs/agents-contract.sh` to validate English policy text and the English-only documentation requirement.

### Verification and report

- `bash tests/docs/agents-contract.sh` → 23 passed, 0 failed.
- `bash -n tests/docs/agents-contract.sh` → Passed.
- `git diff --check` → Passed.
- `.only/.skip` scan → no matches.
- Changed-file trailing-whitespace scan → no matches.
- Test report: [test-reports/20260718T212318Z-english-docs.log](test-reports/20260718T212318Z-english-docs.log).

The first language-check run reported a Unicode middle-dot separator as Han-script-compatible punctuation. That run remained a failure. The separator was replaced with an em dash and the entire Contract Test then passed 23/23. Both runs are preserved in the report.

### Not run

- Application lint, typecheck, unit, integration, security, eval, E2E, Replay, and offline demo suites cannot run because the application scaffold and root `package.json` do not exist.

### Environment and compatibility

- No environment variable changes.
- No database migrations.
- No API, Domain Event, AI schema, Catalog, or Replay compatibility impact.

### Next safe step

- Scaffold Engineering Design Day 1 after reading `AGENTS.md` and this handoff.

---

## 2026-07-18 — Agent development contract

**Status:** Complete

### Goal

Create the repository-level agent contract and make tests, persisted test logs, and `HANDOFF.md` updates mandatory completion gates for every development task.

### Actual outcome

- Added the root `AGENTS.md`.
- Added the root `HANDOFF.md` and current-state section.
- Added `test-reports/README.md` with the report-retention policy.
- Added `tests/docs/agents-contract.sh` to validate required files and critical contract clauses.

### Files changed

- `AGENTS.md`
- `HANDOFF.md`
- `test-reports/README.md`
- `tests/docs/agents-contract.sh`

### Key decisions

- Every behavior change must add or update tests.
- Actual test output must be retained under `test-reports/`.
- Every development task must update this handoff.
- Not Run, failed, and environment-blocked checks must never be reported as Passed.
- Documentation-only changes still require proportionate automated validation.

### Tests added or updated

- `tests/docs/agents-contract.sh`

### Verification and report

- `bash tests/docs/agents-contract.sh` → 19 passed, 0 failed.
- `bash -n tests/docs/agents-contract.sh` → Passed.
- `git diff --check` → Passed.
- `.only/.skip` scan → no matches.
- New-file trailing-whitespace scan → no matches.
- Test report: [test-reports/20260718T211451Z-agents-contract.log](test-reports/20260718T211451Z-agents-contract.log).

The first Contract Test had exit code 0 but emitted Bash command-substitution warnings because Markdown backticks appeared inside double-quoted strings. That run was not accepted as a clean pass. The test was corrected to use single-quoted patterns and then passed without warnings. Both outputs are retained in the report.

### Not run

- Application lint, typecheck, unit, integration, security, eval, E2E, Replay, and offline demo suites did not run because the application scaffold and root `package.json` did not exist. They were not reported as Passed.

### Environment and compatibility

- No environment variable changes.
- No database migrations.
- No API, Domain Event, AI schema, Catalog, or Replay-format changes.

### Known issues and next step

- Only a documentation Contract Test was possible before the application scaffold existed.
- The next agent should read `AGENTS.md` and this file, then create the Day 1 application scaffold.
