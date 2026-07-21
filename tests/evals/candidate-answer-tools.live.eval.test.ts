import {
  LiveCandidateAnswerAssistantAdapter,
  LiveVoiceTranscriptionAdapter,
} from "../../packages/ai/src/index";
import { describe, expect, it } from "vitest";

const apiKey = process.env.OPENAI_API_KEY;
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error(
    "BLOCKED: LIVE Candidate assistant and Voice Memo transcription require a Worker-only OPENAI_API_KEY. No Replay response was substituted.",
  );
}

function syntheticWave(): Uint8Array {
  const sampleRate = 16_000;
  const samples = sampleRate;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) =>
    [...value].forEach((character, index) =>
      view.setUint8(offset + index, character.charCodeAt(0)),
    );
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    view.setInt16(
      44 + index * 2,
      Math.round(Math.sin((index * 2 * Math.PI * 440) / sampleRate) * 800),
      true,
    );
  }
  return bytes;
}

describe("LIVE disclosed Candidate answer tools", () => {
  it("returns bounded Candidate drafting help without a Replay fallback", async () => {
    const result = await new LiveCandidateAnswerAssistantAdapter({ apiKey }).answer({
      candidateRef: "synthetic-live-candidate",
      question: "How would you make payment retry idempotent across a crash boundary?",
      allowedAssumptions: ["PostgreSQL is available", "The provider accepts idempotency keys"],
      currentDraft: "Persist one attempt row before calling the provider.",
      priorTurns: [],
      message: "Name one missing failure case in this draft.",
    });
    expect(result.providerResponseId).toMatch(/^resp_/u);
    expect(result.text.trim().length).toBeGreaterThan(10);
  });

  it("accepts a synthetic original-audio Artifact through the LIVE transcription port", async () => {
    const result = await new LiveVoiceTranscriptionAdapter({ apiKey }).transcribe({
      audio: syntheticWave(),
      fileName: "synthetic-tone.wav",
      contentType: "audio/wav",
    });
    expect(typeof result.text).toBe("string");
    expect(result.providerResponseId).toBeNull();
  });
});
