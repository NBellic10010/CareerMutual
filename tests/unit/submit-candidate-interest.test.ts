import { createHash } from "node:crypto";

import {
  SubmitCandidateInterestHandler,
  type CandidateInterestIdFactory,
  type SubmitCandidateInterestRequest,
} from "../../packages/application/src/index";
import {
  InMemoryCandidateInterestUnitOfWork,
  type InMemoryCandidateInterestFailurePoint,
} from "../../packages/testkit/src/index";
import type { CandidateInterestCommand } from "../../packages/contracts/src/index";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-07-19T22:00:00.000Z");

function canonicalHash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function ids(): CandidateInterestIdFactory {
  let sequence = 0;
  return { nextId: (kind) => `${kind}-${++sequence}` };
}

function command(
  overrides: {
    readonly expectedOpportunityVersion?: number;
    readonly authorization?: string;
    readonly timezoneOverlap?: number;
    readonly language?: string;
  } = {},
) {
  return {
    schema_version: "candidate-interest-command@2" as const,
    background_access_basis: "OPEN_TO_ALL" as const,
    eligibility_match_ref: null,
    eligibility_match_version: null,
    hard_facts: [
      {
        fact_ref: "fact-work-authorization",
        fact_type: "work_authorization" as const,
        value: overrides.authorization ?? "US",
      },
      {
        fact_ref: "fact-timezone-overlap",
        fact_type: "timezone_overlap" as const,
        value: overrides.timezoneOverlap ?? 6,
      },
      {
        fact_ref: "fact-required-language",
        fact_type: "required_language" as const,
        value: overrides.language ?? "SQL, TypeScript",
      },
    ],
    consent_version: "candidate-interest-consent@1",
    expected_opportunity_version: overrides.expectedOpportunityVersion ?? 1,
  };
}

function request(
  overrides: {
    readonly actorId?: string;
    readonly idempotencyKey?: string;
    readonly command?: CandidateInterestCommand;
  } = {},
) {
  return {
    opportunityRef: "opportunity-backend-1",
    actor: {
      role: "CANDIDATE" as const,
      actorId: overrides.actorId ?? "candidate-42",
    },
    idempotencyKey: overrides.idempotencyKey ?? "submit-interest-42",
    correlationId: "correlation-submit-interest-42",
    command: overrides.command ?? command(),
  };
}

function unitOfWork(
  input: {
    readonly opportunityVersion?: number;
    readonly opportunityState?: "OPEN" | "CLOSED";
    readonly commitmentState?: "ACTIVE" | "PAUSED" | "CLOSED";
    readonly requiredConsentVersion?: string;
    readonly backgroundAccess?:
      | {
          readonly basis: "OPEN_TO_ALL";
          readonly eligibilityPolicyRef: string;
        }
      | {
          readonly basis: "AI_POSITIVE_EVIDENCE";
          readonly eligibilityPolicyRef: string;
          readonly passportSnapshotRef: string;
          readonly eligibilityMatchRef: string;
          readonly eligibilityMatchVersion: number;
        };
    readonly failAt?: InMemoryCandidateInterestFailurePoint;
  } = {},
) {
  return new InMemoryCandidateInterestUnitOfWork({
    opportunityRef: "opportunity-backend-1",
    opportunityVersion: input.opportunityVersion ?? 1,
    opportunityState: input.opportunityState ?? "OPEN",
    commitmentState: input.commitmentState ?? "ACTIVE",
    contractVersionRef: "contract-payment-retry@1",
    requiredConsentVersion: input.requiredConsentVersion ?? "candidate-interest-consent@1",
    queuePolicyVersion: "onlyboth.interest-queue@1",
    publicSeed: "onlyboth-interest-v1-00001",
    runtimeMode: "GOLDEN_REPLAY",
    eligibilityPredicates: [
      {
        predicateRef: "predicate-work-authorization",
        factRef: "work_authorization",
        operator: "EQUALS",
        expected: "US",
      },
      {
        predicateRef: "predicate-timezone-overlap",
        factRef: "timezone_overlap",
        operator: "GTE",
        minimum: 6,
      },
      {
        predicateRef: "predicate-required-language",
        factRef: "required_language",
        operator: "CONTAINS",
        member: "TypeScript",
      },
    ],
    ...(input.backgroundAccess === undefined ? {} : { backgroundAccess: input.backgroundAccess }),
    now: NOW,
    failAt: input.failAt ?? null,
  });
}

describe("SubmitCandidateInterestHandler", () => {
  it("records self-authenticated Interest and deterministically queues an eligible Candidate", async () => {
    const store = unitOfWork();
    const receipt = await new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(
      request(),
    );
    const snapshot = store.snapshot();

    expect(receipt).toMatchObject({
      state: "INTEREST_RECEIVED",
      opportunity_ref: "opportunity-backend-1",
      new_opportunity_version: 1,
    });
    expect(snapshot.interest).toMatchObject({
      candidateRef: "candidate-42",
      status: "WAITING_FOR_BACKED_SLOT",
      version: 2,
      queueTieBreak: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    });
    expect(snapshot.eligibility).toMatchObject({ eligible: true });
    expect(snapshot.persistedHardFacts).toEqual(command().hard_facts);
    expect(snapshot.candidateProjection).toMatchObject({
      candidate_ref: "candidate-42",
      state: "WAITING_FOR_BACKED_SLOT",
    });
    expect(snapshot.events.map(({ eventType }) => eventType)).toEqual([
      "CandidateInterestReceived",
      "CandidateInterestEligibilityDetermined",
    ]);
    expect(snapshot.outbox).toEqual([
      expect.objectContaining({ messageType: "CandidateInterestEligibilityDetermined" }),
    ]);
    expect(snapshot.outbox[0]?.payload).toMatchObject({
      eligible: true,
      queue_reconcile_requested: true,
    });
    expect(JSON.stringify(snapshot.outbox)).not.toMatch(
      /TypeScript|work_authorization|profile|resume|claim/iu,
    );
    expect(snapshot.preselectedCandidateRef).toBeNull();
  });

  it("records a typed hard-requirement miss without a Candidate ability conclusion", async () => {
    const store = unitOfWork();
    await new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(
      request({ command: command({ timezoneOverlap: 4 }) }),
    );
    const snapshot = store.snapshot();

    expect(snapshot.interest?.status).toBe("INELIGIBLE_HARD_REQUIREMENT");
    expect(snapshot.eligibility).toMatchObject({
      eligible: false,
      predicateResults: [
        expect.objectContaining({ passed: true }),
        expect.objectContaining({
          passed: false,
          reasonRef: "eligibility:failed:predicate-timezone-overlap",
        }),
        expect.objectContaining({ passed: true }),
      ],
    });
    expect(snapshot.candidateProjection).toMatchObject({
      state: "INELIGIBLE_HARD_REQUIREMENT",
      message: expect.stringContaining("hard requirement"),
    });
    expect(snapshot.outbox[0]?.payload).toMatchObject({
      eligible: false,
      queue_reconcile_requested: false,
    });
  });

  it("pins AI-positive access and rejects a stale browser Match ref", async () => {
    const store = unitOfWork({
      backgroundAccess: {
        basis: "AI_POSITIVE_EVIDENCE",
        eligibilityPolicyRef: "eligibility-policy:backend",
        passportSnapshotRef: "passport-snapshot:candidate-42:1",
        eligibilityMatchRef: "eligibility-match:candidate-42:backend:1",
        eligibilityMatchVersion: 1,
      },
    });
    const aiCommand = {
      ...command(),
      background_access_basis: "AI_POSITIVE_EVIDENCE" as const,
      eligibility_match_ref: "eligibility-match:candidate-42:backend:1",
      eligibility_match_version: 1,
    };
    await expect(
      new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(
        request({ command: aiCommand }),
      ),
    ).resolves.toMatchObject({ state: "INTEREST_RECEIVED" });
    expect(store.snapshot().eligibility).toMatchObject({
      schemaVersion: "eligibility-edge@2",
      backgroundAccessBasis: "AI_POSITIVE_EVIDENCE",
      passportSnapshotRef: "passport-snapshot:candidate-42:1",
      eligibilityMatchRef: "eligibility-match:candidate-42:backend:1",
    });

    const staleStore = unitOfWork({
      backgroundAccess: {
        basis: "AI_POSITIVE_EVIDENCE",
        eligibilityPolicyRef: "eligibility-policy:backend",
        passportSnapshotRef: "passport-snapshot:candidate-42:1",
        eligibilityMatchRef: "eligibility-match:candidate-42:backend:2",
        eligibilityMatchVersion: 2,
      },
    });
    await expect(
      new SubmitCandidateInterestHandler(staleStore, ids(), canonicalHash).execute(
        request({ command: aiCommand }),
      ),
    ).rejects.toMatchObject({ code: "STALE_OPPORTUNITY_VERSION", httpStatus: 409 });
  });

  it("returns the same Receipt for a duplicate command and rejects key reuse", async () => {
    const store = unitOfWork();
    const handler = new SubmitCandidateInterestHandler(store, ids(), canonicalHash);
    const first = await handler.execute(request());

    await expect(handler.execute(request())).resolves.toEqual(first);
    await expect(
      handler.execute(request({ command: command({ language: "Java" }) })),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", httpStatus: 409 });
    expect(store.snapshot().events).toHaveLength(2);
  });

  it("rejects a second Interest for the same Candidate and Opportunity under another key", async () => {
    const store = unitOfWork();
    const handler = new SubmitCandidateInterestHandler(store, ids(), canonicalHash);
    await handler.execute(request());

    await expect(
      handler.execute(request({ idempotencyKey: "submit-interest-42-again" })),
    ).rejects.toMatchObject({ code: "INTEREST_ALREADY_EXISTS", httpStatus: 409 });
    expect(store.snapshot().events).toHaveLength(2);
  });

  it("runtime-checks that the authenticated actor is the Candidate submitting Interest", async () => {
    const store = unitOfWork();
    const employerRequest = {
      ...request(),
      actor: { role: "EMPLOYER", actorId: "employer-sarah" },
    } as unknown as SubmitCandidateInterestRequest;

    await expect(
      new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(employerRequest),
    ).rejects.toMatchObject({ code: "CANDIDATE_AUTH_REQUIRED", httpStatus: 403 });
    expect(store.snapshot().interest).toBeNull();
  });

  it("rejects stale Candidate consent without recording any Interest state", async () => {
    const store = unitOfWork({
      requiredConsentVersion: "candidate-interest-consent@2",
    });

    await expect(
      new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(request()),
    ).rejects.toMatchObject({ code: "STALE_CONSENT_VERSION", httpStatus: 409 });
    expect(store.snapshot()).toMatchObject({
      interest: null,
      eligibility: null,
      events: [],
      outbox: [],
    });
  });

  it.each([
    {
      name: "stale Opportunity version",
      store: unitOfWork(),
      candidateRequest: request({ command: command({ expectedOpportunityVersion: 2 }) }),
      code: "STALE_OPPORTUNITY_VERSION",
      httpStatus: 409,
    },
    {
      name: "closed Opportunity",
      store: unitOfWork({ opportunityState: "CLOSED" }),
      candidateRequest: request(),
      code: "INTEREST_INTAKE_NOT_ACTIVE",
      httpStatus: 422,
    },
    {
      name: "paused Blind Review",
      store: unitOfWork({ commitmentState: "PAUSED" }),
      candidateRequest: request(),
      code: "INTEREST_INTAKE_NOT_ACTIVE",
      httpStatus: 422,
    },
  ])(
    "rejects $name before recording Interest",
    async ({ store, candidateRequest, code, httpStatus }) => {
      await expect(
        new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(candidateRequest),
      ).rejects.toMatchObject({ code, httpStatus });
      expect(store.snapshot().interest).toBeNull();
    },
  );

  it("rejects duplicate fact types instead of silently overriding Eligibility input", async () => {
    const store = unitOfWork();
    const duplicateFacts = command();

    await expect(
      new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(
        request({
          command: {
            ...duplicateFacts,
            hard_facts: [duplicateFacts.hard_facts[0]!, duplicateFacts.hard_facts[0]!],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "HARD_FACTS_INVALID", httpStatus: 422 });
    expect(store.snapshot().interest).toBeNull();
  });

  it("rolls Interest, Eligibility, Events, Outbox, Projection, and Receipt back together", async () => {
    const store = unitOfWork({ failAt: "INTEREST_OUTBOX" });

    await expect(
      new SubmitCandidateInterestHandler(store, ids(), canonicalHash).execute(request()),
    ).rejects.toThrow("Injected Candidate Interest Outbox failure");
    expect(store.snapshot()).toMatchObject({
      interest: null,
      eligibility: null,
      persistedHardFacts: [],
      candidateProjection: null,
      events: [],
      outbox: [],
    });
  });
});
