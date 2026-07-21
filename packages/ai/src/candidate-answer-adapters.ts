import { createHash, randomUUID } from "node:crypto";

import type { CandidateAnswerAssistantPort, VoiceTranscriptionPort } from "@onlyboth/application";
import OpenAI, { toFile } from "openai";

const CANDIDATE_ANSWER_DEVELOPER_PROMPT = `You are the disclosed OnlyBoth answer-side assistant.
Help the candidate reason about the one sealed bounded question. You may critique, clarify,
propose alternatives, and identify missing tests. Never claim to have executed code, never infer
identity or résumé labels, and never submit or describe an answer as final. The entire conversation
will be disclosed verbatim to the human reviewer.`;

export interface CandidateAnswerAdapterOptions {
  readonly apiKey?: string;
  readonly client?: Pick<OpenAI, "responses">;
  readonly requestId?: () => string;
}

export class LiveCandidateAnswerAssistantAdapter implements CandidateAnswerAssistantPort {
  readonly #client: Pick<OpenAI, "responses">;
  readonly #requestId: () => string;

  public constructor(options: CandidateAnswerAdapterOptions) {
    if (options.client === undefined && options.apiKey === undefined) {
      throw new Error("OPENAI_API_KEY is required for the Candidate answer assistant.");
    }
    this.#client =
      options.client ?? new OpenAI({ apiKey: options.apiKey, maxRetries: 0, timeout: 30_000 });
    this.#requestId = options.requestId ?? randomUUID;
  }

  public async answer(
    input: Parameters<CandidateAnswerAssistantPort["answer"]>[0],
  ): Promise<{ readonly text: string; readonly providerResponseId: string }> {
    const response = await this.#client.responses.create(
      {
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        store: false,
        safety_identifier: createHash("sha256").update(input.candidateRef).digest("hex"),
        input: [
          { role: "developer", content: CANDIDATE_ANSWER_DEVELOPER_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              sealed_question: input.question,
              allowed_assumptions: input.allowedAssumptions,
              current_candidate_draft: input.currentDraft,
              disclosed_prior_turns: input.priorTurns,
              candidate_message: input.message,
            }),
          },
        ],
      },
      { headers: { "X-Client-Request-Id": this.#requestId() } },
    );
    if (response.status !== "completed" || response.output_text.trim().length === 0) {
      throw new Error("OPENAI_CANDIDATE_ASSISTANT_INCOMPLETE");
    }
    return { text: response.output_text, providerResponseId: response.id };
  }
}

export interface VoiceTranscriptionAdapterOptions {
  readonly apiKey?: string;
  readonly client?: Pick<OpenAI, "audio">;
}

export class LiveVoiceTranscriptionAdapter implements VoiceTranscriptionPort {
  readonly #client: Pick<OpenAI, "audio">;

  public constructor(options: VoiceTranscriptionAdapterOptions) {
    if (options.client === undefined && options.apiKey === undefined) {
      throw new Error("OPENAI_API_KEY is required for Voice Memo transcription.");
    }
    this.#client =
      options.client ?? new OpenAI({ apiKey: options.apiKey, maxRetries: 0, timeout: 45_000 });
  }

  public async transcribe(
    input: Parameters<VoiceTranscriptionPort["transcribe"]>[0],
  ): Promise<{ readonly text: string; readonly providerResponseId: string | null }> {
    const result = await this.#client.audio.transcriptions.create({
      model: "gpt-4o-mini-transcribe",
      file: await toFile(input.audio, input.fileName),
      response_format: "json",
    });
    return { text: result.text, providerResponseId: null };
  }
}
