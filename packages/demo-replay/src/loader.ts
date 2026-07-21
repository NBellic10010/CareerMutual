import { GoldenReplaySchema, type GoldenReplay } from "@onlyboth/contracts";

import { paymentRetryV1Fixture } from "./fixtures/payment-retry-v1";

export type GoldenReplayId = "payment-retry-v1";

export function loadGoldenReplay(replayId: GoldenReplayId = "payment-retry-v1"): GoldenReplay {
  if (replayId !== "payment-retry-v1") {
    throw new Error(`Unknown Golden Replay: ${String(replayId)}`);
  }

  return GoldenReplaySchema.parse(structuredClone(paymentRetryV1Fixture));
}
