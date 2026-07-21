export type SyntheticDemoRole = "CANDIDATE" | "EMPLOYER";

export type SyntheticDemoActor = Readonly<{
  actor_ref: string;
  role: SyntheticDemoRole;
  display_name: string;
  start_label: string;
  descriptor: string;
}>;

export type SyntheticCandidateFixture = Readonly<{
  actor: SyntheticDemoActor;
  headline: string;
  location: string;
  contact_email: string;
  summary: string;
  education: Readonly<{
    level: "BACHELOR" | "MASTER" | "PROFESSIONAL";
    institution: string;
    credential: string;
    field_of_study: string;
    graduation_date: string;
  }>;
  experience: readonly Readonly<{
    organization: string;
    title: string;
    started_on: string;
    ended_on: string | null;
    highlights: readonly string[];
  }>[];
  certifications: readonly string[];
  skills: readonly string[];
  evidence_theme: string;
  discovery_target_title?: string;
  discovery_reason: string;
  discovery_unknown: string;
}>;

export const SYNTHETIC_RECRUITER: SyntheticDemoActor = Object.freeze({
  actor_ref: "reviewer-sarah-chen",
  role: "EMPLOYER",
  display_name: "Sarah Chen",
  start_label: "Recruiter · Sarah Chen",
  descriptor: "Named reviewer and Attention Slot owner",
});

export const SYNTHETIC_CANDIDATES: readonly SyntheticCandidateFixture[] = Object.freeze([
  {
    actor: {
      actor_ref: "candidate-42",
      role: "CANDIDATE",
      display_name: "Jordan Lee",
      start_label: "Candidate 42 · Jordan Lee",
      descriptor: "Recent CS graduate · local-commerce backend",
    },
    headline: "Backend reliability engineer",
    location: "New York, NY · Remote",
    contact_email: "jordan.lee.synthetic@example.com",
    summary:
      "Synthetic backend engineer focused on payment reliability, durable state transitions, and operational failure analysis.",
    education: {
      level: "BACHELOR",
      institution: "Lakeview State University",
      credential: "Bachelor of Science",
      field_of_study: "Computer science",
      graduation_date: "2025-05-15",
    },
    experience: [
      {
        organization: "Cedar Local Commerce",
        title: "Backend Engineer",
        started_on: "2022-02-01",
        ended_on: "2025-02-28",
        highlights: [
          "Built retry-safe payment workflows around durable idempotency records and reconciliation.",
          "Led incident reviews that converted acknowledgement-loss failures into falsifiable tests.",
        ],
      },
      {
        organization: "Harbor Systems Cooperative",
        title: "Software Engineering Fellow",
        started_on: "2021-06-01",
        ended_on: "2022-01-31",
        highlights: [
          "Maintained event-driven services and documented operational runbooks for bounded failures.",
        ],
      },
    ],
    certifications: ["Synthetic cloud architecture certification · 2025"],
    skills: [
      "Distributed systems",
      "Payment idempotency",
      "PostgreSQL",
      "TypeScript",
      "Incident analysis",
    ],
    evidence_theme: "payment-retry-reference",
    discovery_reason:
      "Recent systems education and a synthetic payment-retry work sample connect to this public reliability capability.",
    discovery_unknown: "How the Candidate handles the exact acknowledgement-loss boundary.",
  },
  {
    actor: {
      actor_ref: "candidate-17",
      role: "CANDIDATE",
      display_name: "Maya Patel",
      start_label: "Candidate 17 · Maya Patel",
      descriptor: "Payments SRE · production incident lead",
    },
    headline: "Site reliability engineer · payments",
    location: "Austin, TX · Remote",
    contact_email: "maya.patel.synthetic@example.com",
    summary:
      "Synthetic reliability engineer who has operated payment event pipelines, designed reconciliation controls, and led incident recovery exercises.",
    education: {
      level: "MASTER",
      institution: "Western Plains Institute",
      credential: "Master of Science",
      field_of_study: "Information systems",
      graduation_date: "2018-05-20",
    },
    experience: [
      {
        organization: "Bramble Fintech",
        title: "Site Reliability Engineer",
        started_on: "2021-03-01",
        ended_on: null,
        highlights: [
          "Designed reconciliation alarms for payment states stranded between provider and internal ledgers.",
          "Ran failure drills covering queue replay, cache loss, and provider acknowledgement ambiguity.",
        ],
      },
      {
        organization: "Juniper Billing Labs",
        title: "Platform Engineer",
        started_on: "2018-07-01",
        ended_on: "2021-02-28",
        highlights: [
          "Implemented durable idempotency records for at-least-once billing workflows.",
        ],
      },
    ],
    certifications: ["Synthetic production SRE certificate · 2023"],
    skills: ["SRE", "Payment ledgers", "Incident command", "PostgreSQL", "Kafka"],
    evidence_theme: "payment-incident-command",
    discovery_reason:
      "Synthetic production-incident and payment-ledger records connect to the role's recovery and idempotency scope.",
    discovery_unknown: "Whether the proposed recovery remains safe during concurrent queue replay.",
  },
  {
    actor: {
      actor_ref: "candidate-03",
      role: "CANDIDATE",
      display_name: "Theo Brooks",
      start_label: "Candidate 03 · Theo Brooks",
      descriptor: "Enterprise integration engineer · career changer",
    },
    headline: "Integration engineer",
    location: "Chicago, IL · Hybrid",
    contact_email: "theo.brooks.synthetic@example.com",
    summary:
      "Synthetic career-changing engineer with deep integration operations experience and a recent record of building bounded failure simulations.",
    education: {
      level: "PROFESSIONAL",
      institution: "Metro Technical College",
      credential: "Professional Diploma",
      field_of_study: "Software systems",
      graduation_date: "2022-12-16",
    },
    experience: [
      {
        organization: "Maple Route Logistics",
        title: "Integration Engineer",
        started_on: "2023-01-09",
        ended_on: null,
        highlights: [
          "Hardened partner event ingestion against duplicate delivery and partial acknowledgements.",
        ],
      },
      {
        organization: "Maple Route Logistics",
        title: "Operations Analyst",
        started_on: "2018-04-01",
        ended_on: "2023-01-06",
        highlights: [
          "Mapped cross-system failure handoffs and wrote reconciliation playbooks for operations teams.",
        ],
      },
    ],
    certifications: ["Synthetic distributed applications diploma · 2022"],
    skills: ["Systems integration", "Event delivery", "Reconciliation", "Python", "SQL"],
    evidence_theme: "integration-replay-lab",
    discovery_reason:
      "A synthetic event-replay lab connects to the public role's at-least-once delivery boundary.",
    discovery_unknown: "Depth of experience with payment-provider idempotency contracts.",
  },
  {
    actor: {
      actor_ref: "candidate-08",
      role: "CANDIDATE",
      display_name: "Elena Garcia",
      start_label: "Candidate 08 · Elena Garcia",
      descriptor: "Cloud platform engineer · recovery automation",
    },
    headline: "Cloud platform engineer",
    location: "Denver, CO · Remote",
    contact_email: "elena.garcia.synthetic@example.com",
    summary:
      "Synthetic cloud-platform engineer focused on recovery automation, durable workflows, and observable service ownership.",
    education: {
      level: "BACHELOR",
      institution: "Front Range University",
      credential: "Bachelor of Engineering",
      field_of_study: "Computer engineering",
      graduation_date: "2013-06-07",
    },
    experience: [
      {
        organization: "Alpine Cloud Tools",
        title: "Senior Platform Engineer",
        started_on: "2019-08-01",
        ended_on: null,
        highlights: [
          "Built regional recovery automation with durable workflow checkpoints and operator-visible receipts.",
        ],
      },
      {
        organization: "Mesa Hosting Cooperative",
        title: "Systems Engineer",
        started_on: "2014-01-13",
        ended_on: "2019-07-31",
        highlights: [
          "Operated stateful data services and tested failover runbooks under controlled faults.",
        ],
      },
    ],
    certifications: ["Synthetic cloud reliability professional · 2024"],
    skills: ["Cloud reliability", "Workflow orchestration", "Observability", "Go", "PostgreSQL"],
    evidence_theme: "cloud-recovery-runbook",
    discovery_reason:
      "Synthetic recovery automation evidence connects to durable state transitions and operational reasoning.",
    discovery_unknown:
      "How the Candidate adapts cloud recovery patterns to provider charge semantics.",
  },
  {
    actor: {
      actor_ref: "candidate-11",
      role: "CANDIDATE",
      display_name: "Sam Okafor",
      start_label: "Candidate 11 · Sam Okafor",
      descriptor: "Data engineer · ledger reconciliation",
    },
    headline: "Data and reconciliation engineer",
    location: "Atlanta, GA · Remote",
    contact_email: "sam.okafor.synthetic@example.com",
    summary:
      "Synthetic data engineer who specializes in reconciling incomplete event streams and making ambiguous state measurable.",
    education: {
      level: "BACHELOR",
      institution: "Piedmont City College",
      credential: "Bachelor of Arts",
      field_of_study: "Economics",
      graduation_date: "2016-05-14",
    },
    experience: [
      {
        organization: "Cobalt Market Data",
        title: "Data Engineer",
        started_on: "2020-02-03",
        ended_on: null,
        highlights: [
          "Designed reconciliation jobs that surface missing, duplicated, and out-of-order financial events.",
        ],
      },
      {
        organization: "Southern Metrics Studio",
        title: "Analytics Engineer",
        started_on: "2017-03-01",
        ended_on: "2020-01-31",
        highlights: ["Converted manual finance controls into testable data-quality assertions."],
      },
    ],
    certifications: ["Synthetic data systems certificate · 2020"],
    skills: ["Data reconciliation", "SQL", "Python", "Event streams", "Control design"],
    evidence_theme: "ledger-reconciliation",
    discovery_reason:
      "Synthetic ledger reconciliation evidence connects to the role's stranded-state and falsification requirements.",
    discovery_unknown: "Experience owning low-latency application retry code.",
  },
  {
    actor: {
      actor_ref: "candidate-27",
      role: "CANDIDATE",
      display_name: "Avery Stone",
      start_label: "Candidate 27 · Avery Stone",
      descriptor: "Brand illustrator · campaign portfolio",
    },
    headline: "Brand illustrator and visual storyteller",
    location: "Portland, OR · Remote",
    contact_email: "avery.stone.synthetic@example.com",
    summary:
      "Synthetic brand illustrator with agency campaign experience, a polished portfolio narrative, and cross-channel launch credits.",
    education: {
      level: "BACHELOR",
      institution: "North Coast College of Art",
      credential: "Bachelor of Fine Arts",
      field_of_study: "Illustration",
      graduation_date: "2019-05-24",
    },
    experience: [
      {
        organization: "Mica Street Studio",
        title: "Brand Illustrator",
        started_on: "2022-04-01",
        ended_on: null,
        highlights: [
          "Produced synthetic campaign illustration systems for software and consumer launches.",
          "Presented visual routes to creative and marketing stakeholders across web and social placements.",
        ],
      },
      {
        organization: "Paper Kite Agency",
        title: "Junior Illustrator",
        started_on: "2019-07-01",
        ended_on: "2022-03-31",
        highlights: [
          "Adapted synthetic editorial concepts into a family of campaign compositions.",
        ],
      },
    ],
    certifications: ["Synthetic accessible visual communication workshop · 2024"],
    skills: ["Brand illustration", "Visual systems", "Campaign composition", "Figma", "Procreate"],
    evidence_theme: "brand-system-portfolio",
    discovery_target_title: "Senior Brand Illustrator",
    discovery_reason:
      "A synthetic brand-system portfolio record connects to the role's public visual concepting and cross-channel adaptation scope.",
    discovery_unknown:
      "Whether the Candidate can ground a direction choice in the sealed board and adapt it under the stated constraints.",
  },
  {
    actor: {
      actor_ref: "candidate-19",
      role: "CANDIDATE",
      display_name: "Priya Shah",
      start_label: "Candidate 19 · Priya Shah",
      descriptor: "Recent distributed-systems graduate · research systems",
    },
    headline: "Distributed systems engineer",
    location: "Boston, MA · Remote",
    contact_email: "priya.shah.synthetic@example.com",
    summary:
      "Synthetic early-career engineer with recent distributed-systems research and practical fault-injection work.",
    education: {
      level: "MASTER",
      institution: "Commonwealth Technical University",
      credential: "Master of Science",
      field_of_study: "Computer science",
      graduation_date: "2026-05-22",
    },
    experience: [
      {
        organization: "Commonwealth Systems Lab",
        title: "Graduate Research Engineer",
        started_on: "2024-09-01",
        ended_on: "2026-05-15",
        highlights: [
          "Built fault-injection experiments for replicated state machines under message replay.",
        ],
      },
      {
        organization: "Beacon Software Studio",
        title: "Engineering Intern",
        started_on: "2023-06-05",
        ended_on: "2023-08-25",
        highlights: ["Added idempotency tests to a synthetic webhook-processing service."],
      },
    ],
    certifications: ["Synthetic cloud developer credential · 2025"],
    skills: ["Distributed systems", "Fault injection", "Rust", "TypeScript", "Testing"],
    evidence_theme: "replicated-state-research",
    discovery_reason:
      "Recent distributed-systems education and fault-injection work connect to the public failure-recovery capability.",
    discovery_unknown: "Production ownership outside a research environment.",
  },
]);

export const SYNTHETIC_DEMO_ACTORS: readonly SyntheticDemoActor[] = Object.freeze([
  ...SYNTHETIC_CANDIDATES.map(({ actor }) => actor),
  SYNTHETIC_RECRUITER,
]);

export function findSyntheticDemoActor(actorRef: string): SyntheticDemoActor | null {
  return SYNTHETIC_DEMO_ACTORS.find(({ actor_ref }) => actor_ref === actorRef) ?? null;
}

export function findSyntheticCandidate(actorRef: string): SyntheticCandidateFixture | null {
  return SYNTHETIC_CANDIDATES.find(({ actor }) => actor.actor_ref === actorRef) ?? null;
}
