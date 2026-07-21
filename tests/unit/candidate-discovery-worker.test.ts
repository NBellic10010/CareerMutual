import {
  CandidateDiscoveryWorker,
  type CandidateDiscoveryIdFactory,
  type CandidateDiscoveryWorkerStore,
  type ClaimedCandidateDiscoveryMessage,
} from "../../packages/application/src/index";
import { CandidateJobDiscoveryInputSchema } from "../../packages/contracts/src/index";
import { CandidateJobDiscoveryValidator } from "../../packages/ai/src/index";
import { describe, expect, it, vi } from "vitest";

const message: ClaimedCandidateDiscoveryMessage = {
  messageId: "outbox:discovery-1",
  eventId: "event:passport-published-1",
  correlationId: "correlation:discovery-1",
  signalSetRef: "signal-set:discovery-1",
  candidateRef: "candidate-42",
  snapshotRef: "passport-snapshot:42:1",
  attempt: 1,
  leaseOwner: "worker:test",
};

const input = CandidateJobDiscoveryInputSchema.parse({
  schema_version: "candidate-job-discovery-input@2",
  request_ref: "ai-request:discovery-1",
  candidate_ref: "candidate-42",
  passport_snapshot_ref: "passport-snapshot:42:1",
  passport_snapshot_hash: `sha256:${"1".repeat(64)}`,
  job_set_hash: `sha256:${"2".repeat(64)}`,
  education: {
    education_ref: "education:candidate-42:1",
    level: "BACHELOR",
    status: "GRADUATED",
    field_of_study: "Computer science",
    graduation_date: "2025-05-15",
    source_sha256: `sha256:${"9".repeat(64)}`,
    verification_state: "SYNTHETIC_SOURCE_ATTACHED",
  },
  evidence_priority: {
    policy_version: "candidate-discovery-evidence-priority@1",
    as_of_date: "2026-07-20",
    graduation_recency: "WITHIN_TWO_YEARS",
    ordered_evidence_groups: ["EDUCATION", "WORK_AND_CREDENTIALS", "OTHER"],
  },
  evidence: [
    {
      evidence_ref: "evidence:sample-1",
      kind: "WORK_SAMPLE",
      verification_state: "SYNTHETIC_SOURCE_ATTACHED",
      sanitized_summary:
        "A synthetic work sample discussing idempotency boundaries and falsifiable failure tests.",
      sanitized_contribution:
        "The Candidate states that they wrote the analysis and the falsification checklist.",
      occurred_from: null,
      occurred_to: null,
      source_sha256: `sha256:${"3".repeat(64)}`,
    },
  ],
  opportunities: [
    {
      opportunity_ref: "opportunity:sample-1",
      opportunity_version: 1,
      contract_hash: `sha256:${"4".repeat(64)}`,
      public_role_summary:
        "Own a bounded reliability concern for a payment retry service and explain its failure boundaries.",
      capabilities: [
        { capability_ref: "capability:retry", statement: "Payment retry reliability" },
      ],
    },
  ],
});

function store() {
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
  } satisfies CandidateDiscoveryWorkerStore;
}

const ids = {
  nextId: (kind: Parameters<CandidateDiscoveryIdFactory["nextId"]>[0]) => `${kind}:unit-test`,
} satisfies CandidateDiscoveryIdFactory;

const prompt = {
  promptId: "onlyboth.derive-candidate-job-signals" as const,
  promptVersion: "1.1.0" as const,
  promptHash: `sha256:${"5".repeat(64)}`,
  inputSchemaVersion: "candidate-job-discovery-input@2" as const,
  outputSchemaVersion: "candidate-job-discovery-output@1" as const,
};

describe("Candidate discovery Worker failure ownership", () => {
  it("fails explicitly when LIVE AI is unconfigured and never fabricates a fixture", async () => {
    const memory = store();
    const worker = new CandidateDiscoveryWorker(
      memory,
      null,
      new CandidateJobDiscoveryValidator(),
      { hash: () => `sha256:${"6".repeat(64)}` },
      ids,
      prompt,
    );
    await expect(worker.runOnce("worker:no-key")).resolves.toBe("PROCESSED");
    expect(memory.failRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED_PERMANENT",
        errorCode: "AI_CONFIGURATION_FAILURE",
      }),
    );
    expect(memory.completeRequest).not.toHaveBeenCalled();
  });

  it("keeps transient retry ownership in the Worker", async () => {
    const memory = store();
    const worker = new CandidateDiscoveryWorker(
      memory,
      {
        async deriveSignals() {
          throw { code: "AI_PROVIDER_UNAVAILABLE", retryable: true };
        },
      },
      new CandidateJobDiscoveryValidator(),
      { hash: () => `sha256:${"7".repeat(64)}` },
      ids,
      prompt,
      3,
      () => new Date("2026-07-20T12:00:00.000Z"),
    );
    await expect(worker.runOnce("worker:transient")).resolves.toBe("RETRY_SCHEDULED");
    expect(memory.retryRequest).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "AI_PROVIDER_UNAVAILABLE" }),
    );
  });

  it("routes an invented source ref to explicit human handling", async () => {
    const memory = store();
    const worker = new CandidateDiscoveryWorker(
      memory,
      {
        async deriveSignals() {
          return {
            output: {
              schema_version: "candidate-job-discovery-output@1",
              status: "ready",
              opportunity_signals: [
                {
                  opportunity_ref: "opportunity:sample-1",
                  discovery_band: "EVIDENCE_CONNECTED",
                  connections: [
                    {
                      capability_ref: "capability:retry",
                      evidence_refs: ["evidence:invented"],
                      bounded_reason:
                        "The attached synthetic work sample discusses this public reliability boundary.",
                      still_unknown: ["Whether the bounded approach transfers to production."],
                    },
                  ],
                },
              ],
              reason_code: null,
              explanation: null,
            },
            providerResponseId: "response:invalid-ref",
            resolvedModel: "gpt-5.6-luna",
          };
        },
      },
      new CandidateJobDiscoveryValidator(),
      { hash: () => `sha256:${"8".repeat(64)}` },
      ids,
      prompt,
    );
    await expect(worker.runOnce("worker:invalid-ref")).resolves.toBe("PROCESSED");
    expect(memory.failRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: "NEEDS_HUMAN", errorCode: "AI_SOURCE_REF_INVALID" }),
    );
  });
});
