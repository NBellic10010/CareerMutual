import { randomUUID } from "node:crypto";

import {
  CandidateEducationRecordSchema,
  CandidateEligibilityMatchInputSchema,
  CandidateEvidenceItemSchema,
  EvidenceRequiredEligibilityMatchPolicySchema,
} from "@onlyboth/contracts";
import { createPostgresPool } from "@onlyboth/db";
import {
  CandidateEligibilityMatchValidator,
  LiveCandidateEligibilityMatchAdapter,
} from "../packages/ai/src/index";

import {
  MATCHING_LAB_SYNTHETIC_JOB_POSTS,
  SIX_CANDIDATE_MATCH_LAB_REFS,
} from "./functional-demo-job-fixtures";

if (process.env.DEMO_MODE !== "true") {
  throw new Error("REFUSED: the Candidate Match Lab is limited to synthetic DEMO_MODE data.");
}
if (process.env.OPENAI_API_KEY === undefined || process.env.OPENAI_API_KEY.length === 0) {
  throw new Error("BLOCKED: the Candidate Match Lab requires a Worker-only OPENAI_API_KEY.");
}
if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.length === 0) {
  throw new Error("BLOCKED: the Candidate Match Lab requires the seeded demo DATABASE_URL.");
}

type PassportRow = Readonly<{
  candidate_ref: string;
  snapshot_ref: string;
  snapshot_hash: string;
  education_json: unknown;
  evidence_json: unknown;
}>;

type JobRow = Readonly<{
  opportunity_ref: string;
  opportunity_version: number;
  title: string;
  contract_hash: string;
  contract_json: unknown;
  accepted_tags_json: unknown;
}>;

const pool = createPostgresPool(process.env.DATABASE_URL);
const adapter = new LiveCandidateEligibilityMatchAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-5.6-sol",
  timeoutMs: 180_000,
});
const validator = new CandidateEligibilityMatchValidator();

try {
  const passports = await pool.query<PassportRow>(
    `SELECT DISTINCT ON (candidate_ref)
            candidate_ref, snapshot_ref, snapshot_hash, education_json, evidence_json
       FROM candidate_evidence_passport_snapshots
      WHERE candidate_ref = ANY($1::text[])
      ORDER BY candidate_ref, snapshot_version DESC`,
    [[...SIX_CANDIDATE_MATCH_LAB_REFS]],
  );
  const labTitles = MATCHING_LAB_SYNTHETIC_JOB_POSTS.map(({ title }) => title);
  const jobs = await pool.query<JobRow>(
    `SELECT opportunity.id AS opportunity_ref, opportunity.version AS opportunity_version,
            opportunity.title, contract.contract_hash, contract.contract_json,
            policy.accepted_tags_json
       FROM opportunities AS opportunity
       JOIN sealed_capability_contracts AS contract
         ON contract.contract_version_ref = opportunity.current_contract_version_ref
       JOIN job_eligibility_match_policies AS policy
         ON policy.opportunity_ref = opportunity.id
      WHERE opportunity.status = 'OPEN'
        AND opportunity.title = ANY($1::text[])
        AND policy.access_mode = 'EVIDENCE_MATCH_REQUIRED'
      ORDER BY opportunity.title`,
    [labTitles],
  );
  if (passports.rows.length !== SIX_CANDIDATE_MATCH_LAB_REFS.length) {
    throw new Error("Run demo:reset:functional before the Match Lab evaluation.");
  }
  if (jobs.rows.length !== MATCHING_LAB_SYNTHETIC_JOB_POSTS.length) {
    throw new Error("The seeded database does not contain the complete six-Job Match Lab.");
  }

  const titleByOpportunity = new Map(
    jobs.rows.map(({ opportunity_ref, title }) => [opportunity_ref, title]),
  );
  const results: Array<{
    candidate_ref: string;
    resolved_model: string;
    positive_roles: readonly string[];
    no_positive_evidence_roles: readonly string[];
  }> = [];

  for (const candidateRef of SIX_CANDIDATE_MATCH_LAB_REFS) {
    const passport = passports.rows.find((row) => row.candidate_ref === candidateRef);
    if (passport === undefined) throw new Error(`Missing synthetic Passport '${candidateRef}'.`);
    const education = CandidateEducationRecordSchema.parse(passport.education_json);
    const evidence = CandidateEvidenceItemSchema.array().parse(passport.evidence_json);
    const input = CandidateEligibilityMatchInputSchema.parse({
      schema_version: "candidate-eligibility-match-input@1",
      request_ref: `match-lab-request:${randomUUID()}`,
      candidate_ref: candidateRef,
      passport_snapshot_ref: passport.snapshot_ref,
      passport_snapshot_hash: passport.snapshot_hash,
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
      opportunities: jobs.rows.map((job) => {
        const contract = job.contract_json as { readonly capability_areas?: readonly string[] };
        return {
          opportunity_ref: job.opportunity_ref,
          opportunity_version: job.opportunity_version,
          contract_hash: job.contract_hash,
          capabilities: (contract.capability_areas ?? []).map((statement, index) => ({
            capability_ref: `capability:${job.opportunity_ref}:${index + 1}`,
            statement,
          })),
          accepted_tags: EvidenceRequiredEligibilityMatchPolicySchema.parse({
            schema_version: "eligibility-match-policy@1",
            access_mode: "EVIDENCE_MATCH_REQUIRED",
            taxonomy_version: "eligibility-background-tags@1",
            accepted_tags: job.accepted_tags_json,
          }).accepted_tags,
        };
      }),
    });
    const response = await adapter.deriveMatches(
      input,
      `onlyboth-match-lab-${candidateRef}-${randomUUID()}`,
    );
    const output = validator.validate(input, response.output);
    const positiveRoles = output.matches.flatMap((match) =>
      match.state === "POSITIVE_EVIDENCE"
        ? [titleByOpportunity.get(match.opportunity_ref) ?? match.opportunity_ref]
        : [],
    );
    const noPositiveEvidenceRoles = output.matches.flatMap((match) =>
      match.state === "NO_POSITIVE_EVIDENCE"
        ? [titleByOpportunity.get(match.opportunity_ref) ?? match.opportunity_ref]
        : [],
    );
    results.push({
      candidate_ref: candidateRef,
      resolved_model: response.resolvedModel,
      positive_roles: positiveRoles.sort(),
      no_positive_evidence_roles: noPositiveEvidenceRoles.sort(),
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        schema_version: "candidate-match-lab-result@1",
        synthetic: true,
        persisted: false,
        job_count: jobs.rows.length,
        candidate_count: results.length,
        results,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
