export const PROTOTYPE_OPPORTUNITY = {
  title: "Senior Backend Engineer",
  organization: "Northstar Payments · Synthetic",
  compensation: "$185k–$225k",
  workMode: "New York overlap · Remote",
  employmentType: "Full-time",
  criticalQuestion: "Can this retry path charge the same Payment Intent twice?",
  capability: "Atomicity, idempotency, and failure-boundary reasoning",
  hardRequirements: ["US work authorization", "4h ET overlap", "Production TypeScript"],
  effortLimit: "6 minutes",
  reviewer: "Sarah Chen",
  reviewSla: "24 hours after submission",
  queuePolicy: "onlyboth.interest-queue@1",
  offerExpiry: "Today · 3:40 PM ET",
} as const;

export const SLOT_FIXTURES = [
  { slot: "01", state: "REVIEW_PENDING", deadline: "12m" },
  { slot: "02", state: "ANSWER_ACTIVE", deadline: "4m" },
  { slot: "03", state: "REVIEWED", deadline: "settled" },
  { slot: "04", state: "REVIEW_PENDING", deadline: "38m" },
  { slot: "05", state: "OFFERED", deadline: "54m" },
  { slot: "06", state: "REVIEWED", deadline: "settled" },
  { slot: "07", state: "ANSWER_ACTIVE", deadline: "2m" },
  { slot: "08", state: "AVAILABLE", deadline: "next in queue" },
] as const;

export const REVIEW_EVIDENCE = [
  {
    ref: "event-E17",
    label: "Atomic boundary identified",
    detail: "Placed the idempotency write beside the payment transition.",
  },
  {
    ref: "verification-V03",
    label: "Visible concurrency tests",
    detail: "4 / 4 synthetic checks passed after the proposed change.",
  },
  {
    ref: "artifact-D04",
    label: "Minimal patch surface",
    detail: "Changed one transaction boundary; no new retry worker introduced.",
  },
] as const;

export const ADVANCEMENT_ANSWERS = [
  {
    ref: "answer-01",
    label: "Anonymous Answer 01",
    decision: "NO_FURTHER_PROOF",
    evidence: "Retries the charge call without a durable replay record.",
    verifier: "2 / 4",
  },
  {
    ref: "answer-02",
    label: "Anonymous Answer 02",
    decision: "INCONCLUSIVE",
    evidence: "Names idempotency but leaves the commit boundary undefined.",
    verifier: "3 / 4",
  },
  {
    ref: "answer-03",
    label: "Anonymous Answer 03",
    decision: "ADVANCE_ELIGIBLE",
    evidence: "Uses a request ledger and explains acknowledgement loss.",
    verifier: "4 / 4",
  },
  {
    ref: "answer-04",
    label: "Anonymous Answer 04",
    decision: "ADVANCE_ELIGIBLE",
    evidence: "Pins the intent transition and webhook replay to one key.",
    verifier: "4 / 4",
  },
  {
    ref: "answer-05",
    label: "Anonymous Answer 05",
    decision: "NO_FURTHER_PROOF",
    evidence: "Handles duplicate requests but not the post-charge crash.",
    verifier: "2 / 4",
  },
  {
    ref: "answer-06",
    label: "Anonymous Answer 06",
    decision: "INCONCLUSIVE",
    evidence: "Safe direction; missing a recovery path for pending intents.",
    verifier: "3 / 4",
  },
  {
    ref: "answer-07",
    label: "Anonymous Answer 07",
    decision: "NO_FURTHER_PROOF",
    evidence: "Serializes workers but leaves external delivery ambiguous.",
    verifier: "2 / 4",
  },
  {
    ref: "answer-08",
    label: "Anonymous Answer 08",
    decision: "CURRENT_REVIEW",
    evidence: "Commits the replay record and payment transition atomically.",
    verifier: "4 / 4",
  },
] as const;

export const SYNTHETIC_RESUMES = {
  "answer-03": {
    version: "Resume v2",
    name: "Avery Brooks",
    headline: "Platform Engineer · Synthetic",
    school: "East Harbor Polytechnic",
    previousEmployer: "Beacon Logistics",
    experience: "7 years · distributed systems",
  },
  "answer-04": {
    version: "Resume v4",
    name: "Alex Morgan",
    headline: "Senior Software Engineer · Synthetic",
    school: "Northstar Institute of Technology",
    previousEmployer: "Atlas Systems",
    experience: "8 years · payments infrastructure",
  },
  "answer-08": {
    version: "Resume v3",
    name: "Jordan Lee",
    headline: "Backend Engineer · Synthetic",
    school: "Riverside Community College",
    previousEmployer: "Cedar Local Commerce",
    experience: "6 years · transaction platforms",
  },
} as const;

export const SYNTHETIC_PRIVATE_LABEL_VALUES = [
  "Jordan Lee",
  "Riverside Community College",
  "Cedar Local Commerce",
] as const;

export function getResumeForAnswer(answerRef: string) {
  return SYNTHETIC_RESUMES[answerRef as keyof typeof SYNTHETIC_RESUMES] ?? null;
}

export function getExploreAnswerRef(directAnswerRef: string): keyof typeof SYNTHETIC_RESUMES {
  return directAnswerRef === "answer-04" ? "answer-08" : "answer-04";
}
