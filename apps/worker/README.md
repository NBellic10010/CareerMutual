# CareerMutual Worker

The Claim-first MatchEdge worker and pre-answer Direct allocation are retained only as a legacy
migration/regression path. The target architecture in the root product doctrine commits Blind
Answer Reviews before Candidate work, cycles each settled Review Slot through a public
non-profile Interest Queue, and builds evidence edges only after recorded answers. The Slot WIP
limit is never a total applicant cap; Advancement Cohorts independently gate post-answer
Direct/Explore allocation.

The Worker consumes the Candidate 42 Challenge vertical slice from PostgreSQL. It owns
Outbox leases, inbox deduplication, exact-input AI execution, bounded retries, deterministic
post-validation, Employer recommendation projection, selected Replay Sandbox execution, and
Platform Abort after exhausted Sandbox failures.

## Database-backed Golden Replay

With the variables from the root `.env.example` exported:

```bash
pnpm --filter @onlyboth/worker migrate
pnpm --filter @onlyboth/worker demo:reset
pnpm --filter @onlyboth/worker start
```

`demo:reset` works only when `DEMO_MODE=true`, `RUNTIME_MODE=GOLDEN_REPLAY`, and
`REPLAY_ID=payment-retry-v1`. It seeds only synthetic Candidate 42 and drains the initial
recommendation jobs. No equivalent production HTTP reset route exists.

## Golden Replay smoke

The one-shot smoke command validates worker configuration, loads the synthetic payment-retry Replay fixture, runs the deterministic Stage A snapshot and one recorded Stage B verifier branch through `ReplaySandboxAdapter`, emits a structured `smoke_succeeded` event, and exits with status `0`.

```bash
RUNTIME_MODE=GOLDEN_REPLAY \
DATABASE_URL=postgresql://onlyboth@localhost/onlyboth \
SANDBOX_ADAPTER=replay \
REPLAY_ID=payment-retry-v1 \
pnpm --filter @onlyboth/worker smoke
```

This narrow legacy smoke does not connect to PostgreSQL, call OpenAI, or execute the human
Command. It remains useful for checking the static Stage A/Sandbox fixture without a key.

## Runtime boundaries

- `GOLDEN_REPLAY` implements the complete Candidate 42 recommendation and selected Replay
  branch path without an OpenAI key.
- `LIVE` implements only `recommendChallenges` with the Responses API. The live Docker
  Sandbox is outside this milestone, so a later selected Challenge reaches Platform Abort
  instead of being attributed to the Candidate or Employer.
- `CACHED_AI` and the other three LIVE AI operations remain fail-closed.
- LIVE failures never switch to Golden Replay.

The optional synthetic LIVE smoke is:

```bash
RUNTIME_MODE=LIVE \
DATABASE_URL=postgresql://... \
SANDBOX_ADAPTER=docker \
OPENAI_API_KEY=... \
pnpm --filter @onlyboth/worker live:smoke
```
