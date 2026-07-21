# OnlyBoth

OnlyBoth is an attention-backed, blind-answer-first hiring product. A candidate receives a
named review commitment before spending time on an application; an employer must record an
evidence-linked review before the same attention slot can serve the next person. Pedigree stays
sealed until anonymous work earns backed, post-answer attention.

The normative product doctrine is `OnlyBoth-产品精神.md`. The authoritative product and
engineering sources are `OnlyBoth-产品方案.md`, `OnlyBoth-工程设计.md`, and
`OnlyBoth-AI工程设计.md`.

## Runnable product slice

The main Candidate and Employer surfaces now execute this persistent causal chain:

```text
temporary persistent actor-bound session selected from seven synthetic Candidates or Sarah
→ optional Candidate-only Evidence Passport Snapshot
→ a default evidence-linked Matched feed plus Explore all jobs, where every open role remains accessible
→ PostgreSQL-backed JobPost with an ordered multimodal Critical Challenge
→ public Candidate interest
→ funded Attention Slot and backed invitation
→ versioned consent + Candidate Application Credit 3 → 2
→ six-minute server-timed Answer Session
→ full-screen rich text / Voice Memo / disclosed platform GPT Sandbox
→ disclosed browser-focus warning or deterministic automatic seal
→ immutable Answer Submission in PostgreSQL + private Object Storage
→ earliest-answer-only anonymous Employer review
→ mandatory decision, evidence refs, comment, and still-unknown statement
→ ADVANCE_ELIGIBLE atomically authorizes the pinned Resume Snapshot
→ full Resume appears only in a one-Candidate-per-page Recruiter workspace
→ atomic review settlement and Slot release
→ next queued Interest receives the recycled Slot
```

This slice enforces the following boundaries:

- Candidate Application Credit is a rate limit, never a bid or ranking signal. Registering
  Interest is free. Credit is consumed only after funded reviewer attention is reserved.
- Evidence Passport is optional Candidate-only discovery input, but its highest-education field is
  required and supports an explicit no-formal-degree pathway. Discovery puts education first for
  candidates within two years of graduation and work/credentials first afterward; this is
  deterministic precedence, not a score. Its source-linked GPT reasons never
  enter Employer views, Eligibility, queue order, Invitations, Attention, or review. The seed is
  explicitly synthetic; edits request LIVE generation and never fall back to a fixed success.
- A Critical Challenge is one sealed ordered manifest, not a text-only interview question. Its
  `TEXT`, `AUDIO`, `IMAGE`, and `FILE` parts remain identical in Candidate detail, Answer Session,
  and Recruiter review. The local seed includes one primary engineering role plus twenty
  cross-domain synthetic JobPosts.
- The Employer API returns only the earliest outstanding anonymous answer. The next answer is
  unavailable to both the API and the DOM until the current Human Review transaction commits.
- An `ADVANCE_ELIGIBLE` Review pins the pre-consented Resume version into an immutable,
  reviewer-scoped Reveal record. Full Resumes are paginated separately at `/employer/candidates`;
  other Review outcomes disclose nothing.
- The sticky top breadcrumb and navigation resolve from the active signed role session: Candidate
  and Recruiter links are never mixed in one workspace header. The demo operator can use one
  `Start as` dropdown to issue distinct year-long signed Sessions for six Candidates or Sarah;
  every Candidate has an independent Credit account, Passport, discovery projection, and résumé.
- Rich text, original audio, derived transcripts, and the complete platform-assistant trace are
  private objects. PostgreSQL stores immutable refs, ownership, MIME, size, SHA-256, and seal
  state.
- The platform assistant runs only in the Worker, uses `gpt-5.6-terra` with low reasoning and
  `store: false`, cannot submit an answer, and discloses its complete trace to the reviewer.
  Voice transcription uses `gpt-4o-mini-transcribe`; the original recording remains the source
  of truth. No OpenAI key enters the browser or a Next.js client bundle.
- If no OpenAI key is configured, assistant and transcription jobs fail explicitly. They never
  switch to Golden Replay and do not create a Candidate capability conclusion.
- Each JobPost seals an optional Employer Evidence Analyst policy (`OFF`, `ANSWER_ONLY`, or
  `ANSWER_PLUS_PROCESS`) and one to eight review criteria. After submission, the Worker can create
  a source-linked `GOOD_ANSWER | BAD_ANSWER` verdict for that sealed response, four language
  findings, criterion findings, unknowns, and reviewer questions. It never produces a
  Candidate-wide score, ranking, advancement advice, or cheating/personality inference.
- `ANSWER_PLUS_PROCESS` freezes six deterministic green/yellow/red behavior signals from
  database-recorded revision metadata, platform GPT/Voice use, submission timing, and known
  platform failures. Candidates consent before spending Credit; reviewers see the observation,
  rule, and caveat together. Severity is not proof of intent, integrity, or external AI use. The
  profile does not expose intermediate draft text or use raw focus events, keystrokes, clipboard
  data, camera data, or biometrics. Analysis never blocks Human Review or Slot settlement.
- `sandbox-focus-policy@1` records only browser visibility and window-focus signals. Departures
  up to two seconds are ignored; the first countable departure warns, and the second or fifteen
  cumulative seconds seals persisted work through the normal Submission command. This is not
  secure proctoring, does not detect a second device, and never creates an integrity score.
- A successful Voice Memo transcript can be previewed and inserted only by the Candidate. The
  original audio remains authoritative; transcription failure does not block audio submission.
- An overdue Employer review is settled using database time: the Candidate Credit is returned,
  the Employer hold is forfeited, the Slot is retired, a reliability penalty is recorded, and
  no Candidate failure is emitted.
- Refreshing the browser or restarting Web and Worker processes does not erase business state.

`/prototype` and `/demo` remain available as visual and historical references, but neither is a
functional acceptance surface and neither appears in the primary navigation. Legacy
Matching-to-Challenge code remains a regression asset; its pre-answer Claim-derived selector is
not the target product mechanism.

## Product routes

- `/login` — demo-only `Start as` actor selector for six Candidates and Sarah, plus explicit
  sign-out. The selector is operator tooling and never enters the Recruiter projection.
- `/candidate` — PostgreSQL-backed matched opportunity feed and Application Credit balance.
- `/candidate/evidence-passport` — private synthetic Evidence Ledger, immutable Snapshot publish,
  discovery status, and LIVE refresh.
- `/candidate/jobs/:opportunityRef` — sealed JobPost, backed invitation, versioned consent, Credit
  use, and the full-screen Answer Sandbox dialog.
- `/candidate/answer-sessions/:sessionRef` — TipTap rich text, Voice Memo, disclosed GPT, autosave,
  Focus activity receipt, database deadline, recovery deep link, and immutable final submission.
- `/employer` — JobPost drafts, publish-time Attention backing, wallet state, and review queue.
- `/employer/jobs/:jobPostRef/review` — one anonymous answer at a time and mandatory review.

The temporary issuer exists only when `DEMO_MODE=true`; without a production identity provider,
all other environments fail closed. Every write route requires the signed HttpOnly role cookie,
CSRF proof, an `Idempotency-Key`, and expected-version concurrency control.

## Repository map

```text
apps/
  web/                 Next.js role UI and authenticated HTTP routes
  worker/              discovery, assistant, transcription, deadlines, SLA settlement, Outbox workers
packages/
  contracts/           versioned API, command, projection, and AI schemas
  domain/              pure state transitions and invariants
  application/         commands, ports, and orchestration contracts
  db/                  SQL migrations and PostgreSQL command/worker stores
  storage/             ObjectStorePort adapters for MinIO/S3-compatible storage
  ai/                  structured hiring AI plus Candidate assistant/transcription adapters
  projections/         role-specific output schemas
  challenge-catalog/   versioned post-answer Challenge registry
  sandbox/             Replay and fail-closed Sandbox ports retained for later Deep Proof work
infra/                 local PostgreSQL 16 and MinIO Compose services
scripts/               migrations, functional seed, Object Store initialization, verification
tests/                 Unit, integration, security, PostgreSQL, Replay, eval, and Playwright suites
test-reports/          retained actual verification output
```

## Requirements

- Node.js 22.14 or newer
- pnpm 11.9 or newer
- Docker Desktop, or independently accessible PostgreSQL 16 and S3-compatible private storage
- Playwright Chromium for browser acceptance
- an optional Worker-only `OPENAI_API_KEY` for LIVE discovery, assistant, transcription, and
  Employer Evidence Analyst checks

## Install and configure

```bash
pnpm install
cp .env.example .env
```

Replace `DEMO_SESSION_SECRET` in `.env` with a private value of at least 32 characters. The checked
example contains local-only database and MinIO credentials; do not reuse them outside local
development.

Start PostgreSQL and MinIO, initialize the private bucket, apply migrations, and create the
synthetic runnable-product facts:

```bash
pnpm infra:up
set -a && source .env && set +a
pnpm db:migrate
pnpm demo:reset:functional
```

The reset is destructive and is accepted only for synthetic data while `DEMO_MODE=true`. There
is deliberately no production Reset API.

## Run

Start Web and the continuous Worker together:

```bash
set -a && source .env && set +a
pnpm dev
```

Open `http://localhost:3000/login`. Use `Start as` to select any of the seven synthetic Candidates or
Sarah. Candidate 42 begins with the seeded backed invitation; another Candidate can register free
Interest and receive the second available Slot when the Worker runs. The Recruiter can create and
publish a JobPost, then open the earliest pending anonymous answer from the Employer dashboard.

The continuous Worker consumes Candidate discovery, Candidate GPT requests, Voice Memo
transcription, Employer Evidence Analyst requests, Focus Policy and deadline
auto-submission/empty settlement, Employer review breaches, and orphan-object cleanup. For a
single diagnostic pass, run `pnpm worker:once`.

Employer analysis is doubly gated. The sealed JobPost policy must opt in, and
`EMPLOYER_REVIEW_AI_ENABLED=true` must explicitly open the platform kill switch. The default is
closed. `EMPLOYER_REVIEW_AI_MODE=LIVE` uses the Worker-only API key and never falls back; the
explicit `SYNTHETIC` mode is for local tests and disclosed synthetic demonstrations only. The
allowlisted `EMPLOYER_REVIEW_AI_MODEL` defaults to `gpt-5.6-sol`; a different family member must be
selected explicitly, is persisted in `ai_model_runs`, and requires its own exact-model acceptance.

## Verify

Keyless checks:

```bash
pnpm check
pnpm build
TEST_DATABASE_URL=postgresql://onlyboth:local-development-only@127.0.0.1:5432/onlyboth_test pnpm test:postgres
TEST_DATABASE_URL=postgresql://onlyboth:local-development-only@127.0.0.1:5432/onlyboth_test pnpm test:e2e
pnpm demo:offline
pnpm test:evals
```

MinIO integration additionally uses the `OBJECT_STORE_*` values from `.env`. LIVE verification is
explicit and never falls back to Replay:

```bash
OPENAI_API_KEY=... pnpm test:evals:live
OPENAI_API_KEY=... TEST_DATABASE_URL=... pnpm test:e2e:live-analyst
OPENAI_API_KEY=... TEST_DATABASE_URL=... pnpm test:e2e:puppeteer
OPENAI_API_KEY=... TEST_DATABASE_URL=... pnpm test:e2e:puppeteer:poor-creative
```

The poor-Creative Puppeteer witness signs in as a synthetic Brand Illustrator, follows the real
Interest and backed-Slot path, records disclosed revision/focus behavior, automatically seals the
second focus departure, and verifies a LIVE `BAD_ANSWER` analysis followed by an independent
`NO_FURTHER_PROOF` Human Review. The Candidate Resume must remain sealed.

The Puppeteer acceptance controls Candidate 17 through discovery, Interest, a backed Answer
Session, multiple server-recorded revisions, one disclosed Focus departure, immutable Submit,
LIVE Employer analysis, Sarah's independent Human Review, and the post-review résumé Reveal. It
stores synthetic screenshots under `test-reports/puppeteer-multi-candidate-demo/`; the Web child
process is launched without the OpenAI key.

Without the required secret, LIVE verification is reported as `BLOCKED`, never passed.

Candidate discovery uses `gpt-5.6-luna` with low reasoning. Employer Evidence Analyst uses
`gpt-5.6-sol` with medium reasoning by default; controlled acceptance may explicitly choose
`gpt-5.6-terra` or `gpt-5.6-luna`. Both use strict Structured Outputs, `store:false`, and no tools.
The browser never receives the key. Synthetic fixtures are not a substitute for LIVE verification.

Every development task must add or update automated tests, retain actual output under
`test-reports/`, and update `HANDOFF.md`, as required by `AGENTS.md`.

## Deliberate remaining boundary

The runnable slice includes asynchronous post-answer Evidence Analyst generation, mandatory blind
Human Review, rolling Slot settlement, and reviewer-scoped Resume Reveal for an
`ADVANCE_ELIGIBLE` answer. The Resume Snapshot is pinned at Candidate consent and appears only in
the separately paginated Recruiter Candidate workspace. Completed-cohort Direct/Explore allocation,
Deep Proof attention, production identity, payments, and a real Docker code Sandbox remain
fail-closed future work.
