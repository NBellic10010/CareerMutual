# CareerMutual

CareerMutual is a mutual-intent, blind-answer-first hiring product: Candidates signal where they want
to go, while Recruiters commit named review attention before asking them to work. An employer must
record an evidence-linked review before the same attention slot can serve the next person. Pedigree
stays sealed until anonymous work earns backed, post-answer attention.

The normative product doctrine is `CareerMutual-Product-Doctrine.md`. The authoritative product and
engineering sources are `CareerMutual-Product-Plan.md`, `CareerMutual-Engineering-Design.md`, and
`CareerMutual-AI-Engineering-Design.md`.

## How Codex and GPT-5.6 are used

Codex was the development collaborator for this Build Week project. It helped turn the product
doctrine into the monorepo architecture, PostgreSQL migrations, role-specific interfaces, synthetic
JobPosts and Candidate fixtures, demo reset and evaluation scripts, automated tests, technical
diagrams, and the English project documentation. Codex also supported iterative debugging and UX
refinement while the team reviewed the resulting behavior. It is not a runtime hiring agent: the
deployed application does not ask Codex to allocate attention, review an answer, reveal a resume, or
make a hiring decision.

GPT-5.6 is used inside narrow, versioned runtime operations rather than as a general autonomous
recruiter:

| Runtime operation             | Model policy                               | Bounded role                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate job discovery       | `gpt-5.6-luna`, low reasoning              | Produces Candidate-only, evidence-linked discovery explanations; it has no Queue or Employer authority.                                                                                |
| Candidate Eligibility Match   | `gpt-5.6-sol`, medium reasoning            | Connects Passport Evidence refs to Recruiter-sealed background tags so an evidence-gated role can become visible to that Candidate. It cannot score, rank, or order Candidates.        |
| Disclosed Candidate assistant | `gpt-5.6-terra`, low reasoning             | Helps draft an answer inside the permitted Sandbox. It cannot submit; its complete trace is sealed with the Answer and disclosed to the Reviewer.                                      |
| Employer Evidence Analyst     | `gpt-5.6-sol`, medium reasoning by default | Structures source-linked findings from one already-submitted anonymous Answer. It cannot prefill the Human Review, recommend advancement, settle a Slot, or read the Candidate resume. |

Every production GPT-5.6 call runs asynchronously in the Worker through the OpenAI Responses API
with strict Structured Outputs, `store:false`, no tools, and deterministic server-side reference and
policy validation. Model output is a typed proposal, not a business-state transition. Sessions,
Queue order, hard legal and logistical predicates, Attention and Credit ledgers, immutable Answer
submission, Human Review, Slot settlement, and Resume Reveal remain enforced by application
commands and PostgreSQL transactions.

### Role in making and running the demo

Codex helped produce the runnable demo itself: the dual-role flow, synthetic 27-JobPost corpus,
seven synthetic Candidate identities, multimodal Critical Challenges, UI copy and artwork
integration, seed/reset tooling, browser journeys, evaluation harnesses, and retained test reports.
The main demo is the real local product path through `/candidate` and `/employer`, not an
AI-generated video or a client-side state simulation.

The demo keeps AI provenance explicit:

- `LIVE` means the Worker called the configured GPT-5.6 model during that run.
- `RECORDED_LIVE` means a prior real Responses API output was schema-validated and pinned to the
  exact prompt, model, input, and contract hashes for a disclosed offline demonstration.
- `SYNTHETIC_PRELOADED` means a clearly labeled synthetic fixture; it is never presented as a live
  model result.
- Runtime LIVE failure is visible and never silently replaced with a recorded or synthetic success.

The primary Backend Eligibility example includes a disclosed `RECORDED_LIVE` GPT-5.6 output. Other
preloaded matching outcomes remain labeled synthetic, while the Match Lab and optional Employer
Analyst paths can be run LIVE for evaluation. Human actions in the functional demo—Candidate
consent and submission, Sarah's evidence-linked review, Slot settlement, and authorized Resume
Reveal—are executed through the same commands and persistence boundaries used by the application;
they are not prewritten GPT decisions.

## Runnable product slice

The main Candidate and Employer surfaces now execute this persistent causal chain:

```text
temporary persistent actor-bound session selected from seven synthetic Candidates or Sarah
→ optional Candidate-only Evidence Passport Snapshot
→ GPT-backed Candidate-only Eligibility Match against Recruiter-sealed background tags
→ a Feed containing positive Evidence matches, OPEN_TO_ALL roles, and pinned active journeys
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
- Evidence Passport is optional Candidate-only Eligibility input, but its highest-education field is
  required and supports an explicit no-formal-degree pathway. Discovery puts education first for
  candidates within two years of graduation and work/credentials first afterward; this is
  deterministic precedence, not a score. `deriveCandidateEligibilityMatches` may unlock a role
  through any validated positive education, work, credential, or work-sample connection. It never
  enters Employer views or changes queue order, Invitations, Attention, or review. Candidates with
  no Passport see only `OPEN_TO_ALL`; model failure is pending/failed, not rejection. The primary
  synthetic Backend match is a disclosed, validated `RECORDED_LIVE` Responses API output; edits
  request LIVE generation and never fall back to it.
- A Critical Challenge is one sealed ordered manifest, not a text-only interview question. Its
  `TEXT`, `AUDIO`, `IMAGE`, and `FILE` parts remain identical in Candidate detail, Answer Session,
  and Recruiter review. The local seed includes one primary engineering role, twenty cross-domain
  synthetic JobPosts, and six technology Match Lab JobPosts used to compare six Candidate-only
  Eligibility feeds.
- The Employer API returns only the earliest outstanding anonymous answer. The next answer is
  unavailable to both the API and the DOM until the current Human Review transaction commits.
- An `ADVANCE_ELIGIBLE` Review pins the pre-consented Resume version into an immutable,
  reviewer-scoped Reveal record. Full Resumes are paginated separately at `/employer/candidates`;
  other Review outcomes disclose nothing.
- The sticky top breadcrumb and navigation resolve from the active signed role session: Candidate
  and Recruiter links are never mixed in one workspace header. The demo operator can use one
  `Start as` dropdown to issue distinct year-long signed Sessions for seven Candidates or Sarah;
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

## Technical architecture

```mermaid
flowchart LR
    C["Candidate browser"] --> WEB
    R["Recruiter browser"] --> WEB

    subgraph RUNTIME["CareerMutual modular monolith"]
        WEB["Next.js Web<br/>Role UI + authenticated Command API"]
        APP["Application Commands<br/>authorization + idempotency + concurrency"]
        DOMAIN["Domain aggregates<br/>Attention, Credit, Answer, Review, Reveal"]
        WORKER["Continuous Worker<br/>Outbox jobs + deadlines + SLA settlement"]
        STORE[("Private S3-compatible Object Storage<br/>rich text + voice + transcripts + GPT traces")]

        subgraph PG["PostgreSQL 16"]
            STATE[("Aggregate state + immutable ledgers")]
            EVENTS[("Domain events + transactional outbox/inbox")]
            PROJ[("Role-scoped Candidate / Recruiter projections")]
            VAULT[("Private labels + pinned Resume snapshots")]
        end
    end

    WEB --> APP
    APP --> DOMAIN
    DOMAIN -->|"one atomic transaction"| STATE
    STATE --> EVENTS
    STATE --> PROJ
    PROJ -->|"minimum role-specific DTOs"| WEB
    EVENTS -->|"leased jobs"| WORKER
    WORKER -->|"business changes reuse Commands"| APP

    WEB <-->|"presigned upload + authorized read"| STORE
    WORKER <-->|"derived and sealed artifacts"| STORE
    VAULT -->|"authorized Reveal only"| PROJ

    WORKER -->|"Responses API / store:false / no tools"| AI["OpenAI GPT-5.6 + transcription<br/>Worker-only API key"]
```

Browsers never connect directly to PostgreSQL, the Private Label Vault, or OpenAI. Web and Worker
share the same Application Commands for business changes; PostgreSQL transactions keep aggregate
state, ledgers, events, Outbox messages, and role projections consistent. Object Storage holds
private answer bodies and media, while PostgreSQL stores their owner-bound immutable references and
hashes.

## Product routes

- `/login` — demo-only `Start as` actor selector for seven Candidates and Sarah, plus explicit
  sign-out. The selector is operator tooling and never enters the Recruiter projection.
- `/candidate` — PostgreSQL-backed Eligibility-authorized opportunity Feed and Application Credit balance.
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

## Deploy on Railway

Current synthetic Build Week deployment: [CareerMutual on Railway](https://web-production-c1a5.up.railway.app).
It is a `DEMO_MODE=true` environment with allowlisted synthetic identities and data, not a
production hiring system.

The checked `railway.json` builds the complete shared pnpm workspace once for either runtime.
Create two code services from this repository and set `SERVICE_ROLE=web` on the public Web service
and `SERVICE_ROLE=worker` on the private Worker service. The Web entrypoint runs the idempotent SQL
migrations before `next start`; the Worker entrypoint starts only the continuous background loop.

Both services require the same `DATABASE_URL`, runtime-mode settings, session secret, and private
Object Store credentials. For a Railway Bucket, map its `ENDPOINT`, `REGION`, `BUCKET`,
`ACCESS_KEY_ID`, and `SECRET_ACCESS_KEY` credentials to the corresponding `OBJECT_STORE_*`
variables, set `OBJECT_STORE_FORCE_PATH_STYLE=false`, and set `OBJECT_STORE_ALLOWED_ORIGINS` to the
public Web origin. Local MinIO continues to use path style by default.

For the synthetic Build Week deployment, set `DEMO_MODE=true`, keep
`RUNTIME_MODE=GOLDEN_REPLAY`, and run `pnpm demo:reset:functional` exactly once after the first
migration. The reset is destructive and must never be enabled for real hiring data. `OPENAI_API_KEY`
is optional and belongs only on the Worker; without it the keyless product and recorded discovery
remain available while LIVE assistant, transcription, and analysis operations fail visibly closed.

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

Candidate discovery uses `gpt-5.6-luna` with low reasoning. Candidate Eligibility Match uses
`gpt-5.6-sol` with medium reasoning. Employer Evidence Analyst also uses `gpt-5.6-sol` with medium
reasoning by default; controlled acceptance may explicitly choose `gpt-5.6-terra` or
`gpt-5.6-luna`. These Responses operations use strict Structured Outputs, `store:false`, and no
tools. The browser never receives the key. Runtime LIVE failure never switches to a recorded output
or synthetic fixture.

Every development task must add or update automated tests, retain actual output under
`test-reports/`, and update `HANDOFF.md`, as required by `AGENTS.md`.

## Deliberate remaining boundary

The runnable slice includes asynchronous post-answer Evidence Analyst generation, mandatory blind
Human Review, rolling Slot settlement, and reviewer-scoped Resume Reveal for an
`ADVANCE_ELIGIBLE` answer. The Resume Snapshot is pinned at Candidate consent and appears only in
the separately paginated Recruiter Candidate workspace. Completed-cohort Direct/Explore allocation,
Deep Proof attention, production identity, payments, and a real Docker code Sandbox remain
fail-closed future work.
