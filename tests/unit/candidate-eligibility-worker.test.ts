import {
  CandidateEligibilityWorker,
  type CandidateEligibilityIdFactory,
  type CandidateEligibilityWorkerStore,
  type ClaimedCandidateEligibilityMessage,
} from "../../packages/application/src/index";
import {
  CandidateEligibilityMatchInputSchema,
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
} from "../../packages/contracts/src/index";
import { CandidateEligibilityMatchValidator } from "../../packages/ai/src/index";
import { describe, expect, it, vi } from "vitest";

const educationTag = ELIGIBILITY_BACKGROUND_TAG_CATALOG.find(
  (tag) => tag.public_name === "Computer Science",
)!;

const message: ClaimedCandidateEligibilityMessage = {
  messageId: "outbox:eligibility-1",
  eventId: "event:passport-published-1",
  correlationId: "correlation:eligibility-1",
  matchSetRef: "eligibility-match-set:1",
  candidateRef: "candidate-42",
  snapshotRef: "passport-snapshot:42:1",
  attempt: 1,
  leaseOwner: "worker:test",
};

const input = CandidateEligibilityMatchInputSchema.parse({
  schema_version: "candidate-eligibility-match-input@1",
  request_ref: "ai-request:eligibility-1",
  candidate_ref: "candidate-42",
  passport_snapshot_ref: "passport-snapshot:42:1",
  passport_snapshot_hash: `sha256:${"1".repeat(64)}`,
  education: {
    education_ref: "education:candidate-42:1",
    level: "BACHELOR",
    status: "GRADUATED",
    field_of_study: "Computer science",
    graduation_date: "2025-05-15",
    source_sha256: `sha256:${"2".repeat(64)}`,
    verification_state: "SYNTHETIC_SOURCE_ATTACHED",
  },
  evidence: [
    {
      evidence_ref: "evidence:sample-1",
      kind: "WORK_SAMPLE",
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      sanitized_summary:
        "A synthetic backend work sample with bounded retry analysis and failure checks.",
      sanitized_contribution:
        "The Candidate states that they authored the analysis and failure checklist.",
      occurred_from: null,
      occurred_to: null,
      source_sha256: `sha256:${"3".repeat(64)}`,
    },
  ],
  opportunities: [
    {
      opportunity_ref: "opportunity:backend",
      opportunity_version: 1,
      contract_hash: `sha256:${"4".repeat(64)}`,
      capabilities: [{ capability_ref: "capability:retry", statement: "Backend retry analysis" }],
      accepted_tags: [educationTag],
    },
  ],
});

function memoryStore() {
  let claimed = false;
  return {
    claimNext: vi.fn(async () => {
      if (claimed) return null;
      claimed = true;
      return message;
    }),
    loadInput: vi.fn(async () => input),
    startRequest: vi.fn(async () => undefined),
    completeRequest: vi.fn(async () => "SUCCEEDED" as const),
    failRequest: vi.fn(async () => undefined),
    retryRequest: vi.fn(async () => undefined),
    markProcessed: vi.fn(async () => undefined),
  } satisfies CandidateEligibilityWorkerStore;
}

const ids = {
  nextId: (kind: Parameters<CandidateEligibilityIdFactory["nextId"]>[0]) => `${kind}:unit`,
} satisfies CandidateEligibilityIdFactory;

const prompt = {
  promptId: "onlyboth.derive-candidate-eligibility-matches" as const,
  promptVersion: "1.0.0" as const,
  promptHash: `sha256:${"5".repeat(64)}`,
  inputSchemaVersion: "candidate-eligibility-match-input@1" as const,
  outputSchemaVersion: "candidate-eligibility-match-output@1" as const,
};

describe("Candidate Eligibility Worker failure ownership", () => {
  it("fails explicitly without a configured LIVE adapter and never fabricates a match", async () => {
    const store = memoryStore();
    const worker = new CandidateEligibilityWorker(
      store,
      null,
      new CandidateEligibilityMatchValidator(),
      { hash: () => `sha256:${"6".repeat(64)}` },
      ids,
      prompt,
    );
    await expect(worker.runOnce("worker:no-key")).resolves.toBe("PROCESSED");
    expect(store.failRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED_PERMANENT",
        errorCode: "AI_CONFIGURATION_FAILURE",
      }),
    );
    expect(store.completeRequest).not.toHaveBeenCalled();
  });

  it("keeps transient retries in the Worker", async () => {
    const store = memoryStore();
    const worker = new CandidateEligibilityWorker(
      store,
      {
        async deriveMatches() {
          throw { code: "AI_PROVIDER_UNAVAILABLE", retryable: true };
        },
      },
      new CandidateEligibilityMatchValidator(),
      { hash: () => `sha256:${"7".repeat(64)}` },
      ids,
      prompt,
      3,
      () => new Date("2026-07-21T12:00:00.000Z"),
    );
    await expect(worker.runOnce("worker:retry")).resolves.toBe("RETRY_SCHEDULED");
    expect(store.retryRequest).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AI_PROVIDER_UNAVAILABLE" }),
    );
  });

  it("routes invented evidence refs to human handling", async () => {
    const store = memoryStore();
    const worker = new CandidateEligibilityWorker(
      store,
      {
        async deriveMatches() {
          return {
            output: {
              schema_version: "candidate-eligibility-match-output@1" as const,
              matches: [
                {
                  opportunity_ref: "opportunity:backend",
                  state: "POSITIVE_EVIDENCE" as const,
                  connections: [
                    {
                      tag_ref: educationTag.tag_ref,
                      evidence_refs: ["evidence:invented"],
                      connection_type: "EDUCATION" as const,
                      bounded_reason:
                        "The attached source has a bounded connection to this education field.",
                      still_unknown: ["Whether the source describes the Candidate's own work."],
                    },
                  ],
                },
              ],
            },
            providerResponseId: "response:invalid-ref",
            resolvedModel: "gpt-5.6-sol",
          };
        },
      },
      new CandidateEligibilityMatchValidator(),
      { hash: () => `sha256:${"8".repeat(64)}` },
      ids,
      prompt,
    );
    await expect(worker.runOnce("worker:invalid-ref")).resolves.toBe("PROCESSED");
    expect(store.failRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "NEEDS_HUMAN", errorCode: "AI_SOURCE_REF_INVALID" }),
    );
  });
});
