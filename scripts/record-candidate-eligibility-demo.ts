import { createHash, randomUUID } from "node:crypto";

import {
  CandidateEligibilityMatchInputSchema,
  CandidateEducationRecordSchema,
  CandidateEvidenceItemSchema,
  EvidenceRequiredEligibilityMatchPolicySchema,
} from "@onlyboth/contracts";
import {
  CANDIDATE_ELIGIBILITY_PROMPT_HASH,
  CandidateEligibilityMatchValidator,
  LiveCandidateEligibilityMatchAdapter,
} from "../packages/ai/src/index";
import { createPostgresPool } from "@onlyboth/db";

if (process.env.DEMO_MODE !== "true") {
  throw new Error("REFUSED: recorded Eligibility output is limited to synthetic DEMO_MODE.");
}
if (process.env.OPENAI_API_KEY === undefined || process.env.OPENAI_API_KEY.length === 0) {
  throw new Error("BLOCKED: recording requires a Worker-only OPENAI_API_KEY.");
}
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
  throw new Error("BLOCKED: recording requires the seeded demo DATABASE_URL.");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

const pool = createPostgresPool(process.env.DATABASE_URL);
try {
  const passport = await pool.query<{
    snapshot_ref: string;
    snapshot_hash: string;
    education_json: unknown;
    evidence_json: unknown;
  }>(
    `SELECT snapshot_ref, snapshot_hash, education_json, evidence_json
       FROM candidate_evidence_passport_snapshots
      WHERE candidate_ref = 'candidate-42'
      ORDER BY snapshot_version DESC LIMIT 1`,
  );
  const job = await pool.query<{
    opportunity_ref: string;
    opportunity_version: number;
    contract_hash: string;
    contract_json: unknown;
    accepted_tags_json: unknown;
  }>(
    `SELECT opportunity.id AS opportunity_ref, opportunity.version AS opportunity_version,
            contract.contract_hash, contract.contract_json, policy.accepted_tags_json
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
       JOIN job_eligibility_match_policies AS policy
         ON policy.opportunity_ref = opportunity.id
      WHERE opportunity.title = 'Senior Backend Reliability Engineer'
        AND policy.access_mode = 'EVIDENCE_MATCH_REQUIRED'
      ORDER BY opportunity.created_at LIMIT 1`,
  );
  const passportRow = passport.rows[0];
  const jobRow = job.rows[0];
  if (passportRow === undefined || jobRow === undefined) {
    throw new Error("Run demo:reset:functional before recording Eligibility output.");
  }
  const education = CandidateEducationRecordSchema.parse(passportRow.education_json);
  const evidence = CandidateEvidenceItemSchema.array().parse(passportRow.evidence_json);
  const contract = jobRow.contract_json as { readonly capability_areas?: readonly string[] };
  const acceptedTags = EvidenceRequiredEligibilityMatchPolicySchema.parse({
    schema_version: "eligibility-match-policy@1",
    access_mode: "EVIDENCE_MATCH_REQUIRED",
    taxonomy_version: "eligibility-background-tags@1",
    accepted_tags: jobRow.accepted_tags_json,
  }).accepted_tags;
  const input = CandidateEligibilityMatchInputSchema.parse({
    schema_version: "candidate-eligibility-match-input@1",
    request_ref: `recorded-live-request:${randomUUID()}`,
    candidate_ref: "candidate-42",
    passport_snapshot_ref: passportRow.snapshot_ref,
    passport_snapshot_hash: passportRow.snapshot_hash,
    education: {
      education_ref: education.education_ref,
      level: education.level,
      status: education.status,
      field_of_study: education.field_of_study,
      graduation_date: education.graduation_date,
      source_sha256: education.source_sha256,
      verification_state: education.verification_state,
    },
    evidence: evidence.map((item) => ({
      evidence_ref: item.evidence_ref,
      kind: item.kind,
      verification_state: item.verification_state,
      sanitized_summary: item.bounded_summary,
      sanitized_contribution: item.contribution_summary,
      occurred_from: item.occurred_from,
      occurred_to: item.occurred_to,
      source_sha256: item.source_sha256,
    })),
    opportunities: [
      {
        opportunity_ref: jobRow.opportunity_ref,
        opportunity_version: jobRow.opportunity_version,
        contract_hash: jobRow.contract_hash,
        capabilities: (contract.capability_areas ?? []).map((statement, index) => ({
          capability_ref: `capability:${jobRow.opportunity_ref}:${index + 1}`,
          statement,
        })),
        accepted_tags: acceptedTags,
      },
    ],
  });
  const adapter = new LiveCandidateEligibilityMatchAdapter({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-5.6-sol",
    timeoutMs: 120_000,
  });
  const response = await adapter.deriveMatches(input, `onlyboth-recorded-live-${randomUUID()}`);
  const output = new CandidateEligibilityMatchValidator().validate(input, response.output);
  if (output.matches[0]?.state !== "POSITIVE_EVIDENCE") {
    throw new Error("The recorded Candidate 42 Backend fixture did not produce positive evidence.");
  }
  console.log(
    JSON.stringify(
      {
        schema_version: "candidate-eligibility-recorded-live@1",
        operation: "deriveCandidateEligibilityMatches",
        prompt_version: "onlyboth.derive-candidate-eligibility-matches@1.0.0",
        prompt_hash: CANDIDATE_ELIGIBILITY_PROMPT_HASH,
        requested_model: "gpt-5.6-sol",
        resolved_model: response.resolvedModel,
        provider_response_id: response.providerResponseId,
        recorded_at: new Date().toISOString(),
        input_hash: hash({ ...input, request_ref: null }),
        output_hash: hash(output),
        pins: {
          candidate_ref: input.candidate_ref,
          passport_snapshot_ref: input.passport_snapshot_ref,
          passport_snapshot_hash: input.passport_snapshot_hash,
          opportunity_ref: jobRow.opportunity_ref,
          opportunity_version: jobRow.opportunity_version,
          contract_hash: jobRow.contract_hash,
        },
        output,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
