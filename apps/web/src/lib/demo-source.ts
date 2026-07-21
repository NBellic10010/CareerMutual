import { buildGoldenReplayViews, loadGoldenReplay } from "@onlyboth/demo-replay";

import type {
  AuditProjectionModel,
  CandidateProjectionModel,
  ColdOpenProjectionModel,
  CounterfactualCandidate,
  EmployerProjectionModel,
  VeiledCandidate,
} from "./demo-view-model";
import { SYNTHETIC_REPLAY_LABEL } from "./demo-view-model";

const replay = loadGoldenReplay();
const views = buildGoldenReplayViews(replay);

const SEALED_FIELDS = [
  "Name and photo",
  "School name",
  "Previous employer name",
  "Referral source",
] as const;

function titleCaseAllocation(value: "DIRECT" | "EXPLORE"): "Direct" | "Explore" {
  return value === "DIRECT" ? "Direct" : "Explore";
}

function buildEmployerModel(): EmployerProjectionModel {
  const candidates: VeiledCandidate[] = views.employer.candidates.map((candidate) => ({
    alias: candidate.candidate.opaqueId,
    allocation: titleCaseAllocation(candidate.allocationKind),
    eligibility: "Eligible",
    hardFacts: candidate.candidate.hardFacts.map(({ label, value }) => ({ label, value })),
    claims: candidate.candidate.claims.map(({ id, capabilityRef, statement }) => ({
      claimId: id,
      capability: capabilityRef.replaceAll("_", " "),
      statement,
    })),
    sealedFields: SEALED_FIELDS,
    reviewWindowState: candidate.reviewWindow.state,
    selectedChallenge: candidate.proof.selectedChallenge,
    commonVerifier: candidate.proof.commonVerifier,
    scenarioFinding: candidate.proof.scenarioFinding,
    outcome: candidate.outcome,
    revealAuthorized: candidate.revealAuthorized,
  }));

  return {
    runtimeLabel: SYNTHETIC_REPLAY_LABEL,
    reviewer: views.employer.reviewer.displayName,
    opportunity: views.employer.opportunity.title,
    criticalFailure: "Duplicate charge after retry",
    decisionUncertainty: "Can reason about atomicity and failure boundaries",
    activeWindows: views.employer.attention.activeReviews,
    nextCandidateAccess: views.employer.attention.nextCandidateAccess,
    checkpointSla: "90 seconds after Stage A",
    candidates,
  };
}

function buildCandidateModel(candidateId = "candidate-42"): CandidateProjectionModel {
  const candidate = views.candidates[candidateId];
  if (candidate === undefined) {
    throw new Error(`Golden Replay has no Candidate Projection for '${candidateId}'.`);
  }

  const replayCandidate = replay.candidates.find((entry) => entry.candidateId === candidateId);
  if (replayCandidate === undefined) {
    throw new Error(`Golden Replay has no candidate fixture for '${candidateId}'.`);
  }

  return {
    runtimeLabel: SYNTHETIC_REPLAY_LABEL,
    alias: replayCandidate.veiledCandidate.opaqueId,
    opportunity: candidate.opportunity.title,
    status: candidate.reviewWindow.state,
    statusLabel: candidate.message,
    reviewer: candidate.reviewer.displayName,
    checkpointSla: "90 seconds after Stage A",
    proofDuration: "6 minutes of recorded candidate input",
    candidateAiPolicy: "Candidate-side AI unavailable; external AI prohibited",
    sealedFields: SEALED_FIELDS,
    selectedChallenge: candidate.selectedChallenge,
    outcome: candidate.outcome,
    labelsRevealedToEmployer: candidate.labelsRevealedToEmployer,
  };
}

function buildCounterfactualCandidates(): readonly CounterfactualCandidate[] {
  return views.judge.candidates.map((candidate, index) => {
    const replayCandidate = replay.candidates.find(
      (entry) => entry.candidateId === candidate.candidateId,
    );
    if (replayCandidate === undefined) {
      throw new Error(`Golden Replay has no proof fixture for '${candidate.candidateId}'.`);
    }

    return {
      counterfactualAlias: `Candidate ${String.fromCharCode(65 + index)}`,
      veiledAlias: replayCandidate.veiledCandidate.opaqueId,
      profileSignal: `${candidate.privateProfile.schoolName} · ${candidate.privateProfile.previousEmployerName}`,
      traditionalRank: `#${candidate.counterfactual.resumeRank}`,
      traditionalOutcome:
        candidate.counterfactual.conventionalDecision === "INTERVIEW"
          ? "30-minute interview"
          : "Auto-rejected",
      challenge: replayCandidate.proof.selectedChallengeLabel,
      verification: `${replayCandidate.proof.commonVerifier.passed} / ${replayCandidate.proof.commonVerifier.total}`,
      disagreement:
        candidate.evidence.profileSignalRisk === "FALSE_POSITIVE_RISK_EXPOSED"
          ? "False-positive risk exposed"
          : "False-negative risk surfaced",
    };
  });
}

const employerProjection = buildEmployerModel();
const counterfactualCandidates = buildCounterfactualCandidates();

export async function loadEmployerProjection(): Promise<EmployerProjectionModel> {
  return structuredClone(employerProjection);
}

export async function loadCandidateProjection(): Promise<CandidateProjectionModel> {
  return structuredClone(buildCandidateModel());
}

export async function loadSyntheticAuditProjection(): Promise<AuditProjectionModel> {
  return {
    runtimeLabel: SYNTHETIC_REPLAY_LABEL,
    accessBoundary: "Counterfactual access is restricted to explicitly synthetic replay data.",
    candidates: structuredClone(counterfactualCandidates),
    invariants: [
      "No reserved reviewer → No costly candidate proof",
      "No work evidence → No pedigree reveal",
      "No settled human review window → No next candidate unlock",
    ],
    timeline: [
      { at: "0:00", event: "Traditional resume prediction", source: "Judge fixture" },
      { at: "0:07", event: "Label policy applied", source: "Employer projection" },
      { at: "0:12", event: "Two reviews reserved", source: "Attention fixture" },
      { at: "0:18", event: "Recorded proof branches replayed", source: "Replay adapter" },
      { at: "0:27", event: "Profile-evidence disagreement shown", source: "Judge projection" },
    ],
  };
}

export async function loadColdOpenProjection(): Promise<ColdOpenProjectionModel> {
  return {
    runtimeLabel: SYNTHETIC_REPLAY_LABEL,
    counterfactualCandidates: structuredClone(counterfactualCandidates),
    veiledCandidates: employerProjection.candidates.map(({ alias, allocation, eligibility }) => ({
      alias,
      allocation,
      eligibility,
    })),
    reviewer: employerProjection.reviewer,
    checkpointSla: employerProjection.checkpointSla,
    finalLine: "Resume picked A. Work evidence surfaced B.",
  };
}
