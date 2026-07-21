import {
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
  EmployerAiReviewPolicySchema,
  JobPostDraftInputSchema,
  type CriticalChallenge,
  type CriticalChallengePart,
  type JobPostDraftInput,
  type RoleCategory,
} from "@onlyboth/contracts";

export function resolveFunctionalDemoEmployerReviewPolicy(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const parsed = EmployerAiReviewPolicySchema.safeParse(
    environment.DEMO_EMPLOYER_AI_REVIEW_POLICY ?? "OFF",
  );
  if (!parsed.success) {
    throw new Error(
      "DEMO_EMPLOYER_AI_REVIEW_POLICY must be OFF, ANSWER_ONLY, or ANSWER_PLUS_PROCESS.",
    );
  }
  return {
    policy: parsed.data,
    disclosureVersion:
      parsed.data === "OFF" ? "employer-ai-review-disclosure@1" : "employer-ai-review-disclosure@2",
  } as const;
}

type AssetKey = "accounting" | "audio" | "creative" | "operations" | "pipeline";

const ASSETS = {
  accounting: {
    asset_ref: "challenge-asset:accounting-close@1",
    file_name: "accounting-close.csv",
    content_type: "text/csv",
    content_length: 308,
    sha256: "sha256:fb5b1d83ef706af4aea7803804b7e58a82c585ebc5c803b45cc9ac276d6f5458",
    download_url: "/synthetic-challenges/accounting-close.csv",
  },
  audio: {
    asset_ref: "challenge-asset:discovery-call-tone@1",
    file_name: "discovery-call-tone.wav",
    content_type: "audio/wav",
    content_length: 12_844,
    sha256: "sha256:81addac00b13fb35829fe61c186e8e53aacdd1d290fc60fdf91854d0faa91f4b",
    download_url: "/synthetic-challenges/discovery-call-tone.wav",
  },
  creative: {
    asset_ref: "challenge-asset:creative-direction-board@1",
    file_name: "creative-direction-board.svg",
    content_type: "image/svg+xml",
    content_length: 1_838,
    sha256: "sha256:c8c89a40995a653306ebc7a681669b8a798d434777ba216ac8b53b7e4d8c8566",
    download_url: "/synthetic-challenges/creative-direction-board.svg",
  },
  operations: {
    asset_ref: "challenge-asset:operations-incident@1",
    file_name: "operations-incident.txt",
    content_type: "text/plain",
    content_length: 377,
    sha256: "sha256:2b28fd609c21f5269be25a3fe220c549ca52b141c58892237308ee026eda1143",
    download_url: "/synthetic-challenges/operations-incident.txt",
  },
  pipeline: {
    asset_ref: "challenge-asset:revenue-pipeline@1",
    file_name: "revenue-pipeline.csv",
    content_type: "text/csv",
    content_length: 373,
    sha256: "sha256:0b9de5df2c5f95eb2001fca92311793c4371bab8a5e69ba07aad388440393e4c",
    download_url: "/synthetic-challenges/revenue-pipeline.csv",
  },
} as const;

function textPart(
  slug: string,
  title: string,
  instructions: string,
  text: string,
): CriticalChallengePart {
  return {
    part_ref: `challenge-part:${slug}:text`,
    kind: "TEXT",
    title,
    instructions,
    text_content: text,
    asset: null,
  };
}

function assetPart(
  slug: string,
  kind: "AUDIO" | "IMAGE" | "FILE",
  key: AssetKey,
  title: string,
  instructions: string,
  options?: { readonly altText?: string; readonly transcript?: string },
): CriticalChallengePart {
  const asset = ASSETS[key];
  return {
    part_ref: `challenge-part:${slug}:${kind.toLowerCase()}`,
    kind,
    title,
    instructions,
    text_content: null,
    asset: {
      ...asset,
      source_kind: "SYNTHETIC_SEED",
      alt_text:
        kind === "IMAGE"
          ? (options?.altText ?? "Synthetic visual source attached to this Challenge.")
          : null,
      transcript_excerpt:
        kind === "AUDIO"
          ? (options?.transcript ??
            "Synthetic audio transport fixture. The source is a tone and contains no real voice data.")
          : null,
    },
  };
}

function challenge(
  slug: string,
  title: string,
  objective: string,
  parts: readonly CriticalChallengePart[],
): CriticalChallenge {
  return {
    schema_version: "critical-challenge@1",
    challenge_ref: `critical-challenge:${slug}@1`,
    title,
    objective,
    parts: [...parts],
  };
}

type JobFixtureInput = Readonly<{
  slug: string;
  organization: string;
  title: string;
  category: RoleCategory;
  summary: string;
  compensation: string;
  capabilities: readonly string[];
  challenge: CriticalChallenge;
  proofFormat: string;
  minutes?: number;
  aiPolicy?: "PROHIBITED" | "PLATFORM_ASSISTANT_ALLOWED";
  reviewCriteria?: JobPostDraftInput["review_criteria"];
  openToAll?: boolean;
  eligibilityTagNames?: readonly string[];
}>;

const TAGS_BY_CATEGORY: Readonly<Record<RoleCategory, readonly string[]>> = {
  TECHNOLOGY: [
    "Computer Science",
    "Information Systems",
    "Backend Engineering",
    "Data Engineering",
  ],
  FINANCE: ["Accounting", "Finance", "Accounting Operations", "Financial Planning and Analysis"],
  BUSINESS_DEVELOPMENT: [
    "Business Administration",
    "Business Development",
    "Enterprise Partnerships",
  ],
  CREATIVE: [
    "Illustration",
    "Graphic Design",
    "Brand Illustration",
    "Illustration and Visual Development",
  ],
  SALES: [
    "Sales Management",
    "Enterprise Sales",
    "Regional Sales Leadership",
    "Revenue Operations",
  ],
  MARKETING: ["Marketing", "Growth Marketing", "Demand Generation", "Marketing Operations"],
  PRODUCT: ["Product Design", "Product Management", "User Experience Research"],
  OPERATIONS: ["Operations Management", "Operations Strategy", "Supply Chain Operations"],
  PEOPLE: ["Human Resources Management", "People Operations", "Recruiting Operations"],
  LEGAL: ["Law", "Legal Studies", "Legal Operations", "Data Privacy"],
  HEALTHCARE: ["Public Health", "Healthcare Administration", "Healthcare Operations"],
  SUSTAINABILITY: ["Environmental Science", "Sustainability", "Sustainability Programs"],
};

function job(input: JobFixtureInput): JobPostDraftInput {
  return JobPostDraftInputSchema.parse({
    organization_public_name: input.organization,
    title: input.title,
    role_category: input.category,
    public_role_summary: input.summary,
    employment_type: "FULL_TIME",
    seniority_band: "SENIOR",
    compensation_range: input.compensation,
    location_and_work_mode: "Remote · United States time zones",
    public_hard_requirements: [
      "Authorized to work in the hiring region",
      "English working proficiency",
    ],
    hard_predicates: [
      {
        predicate_ref: `hard-work-auth-${input.slug}`,
        fact_type: "work_authorization",
        operator: "EQUALS",
        expected: true,
      },
      {
        predicate_ref: `hard-language-${input.slug}`,
        fact_type: "required_language",
        operator: "EQUALS",
        expected: "English",
      },
    ],
    capability_areas: input.capabilities,
    eligibility_match_policy: input.openToAll
      ? {
          schema_version: "eligibility-match-policy@1",
          access_mode: "OPEN_TO_ALL",
          open_reasons: ["NO_BACKGROUND_REQUIRED"],
        }
      : {
          schema_version: "eligibility-match-policy@1",
          access_mode: "EVIDENCE_MATCH_REQUIRED",
          taxonomy_version: "eligibility-background-tags@1",
          accepted_tags: ELIGIBILITY_BACKGROUND_TAG_CATALOG.filter((tag) =>
            (input.eligibilityTagNames ?? TAGS_BY_CATEGORY[input.category]).includes(
              tag.public_name,
            ),
          ),
        },
    critical_question: input.challenge.objective,
    critical_challenge: input.challenge,
    allowed_assumptions: [
      "All companies, records, calls, and files in this Challenge are synthetic.",
      "State any additional assumption before relying on it.",
    ],
    proof_format: input.proofFormat,
    maximum_candidate_minutes: input.minutes ?? 8,
    answer_review_sla_hours: 24,
    offer_expiry_hours: 24,
    answer_review_wip: 1,
    advancement_cohort_size: 8,
    credit_per_answer_review: 1,
    candidate_ai_policy: input.aiPolicy ?? "PLATFORM_ASSISTANT_ALLOWED",
    review_criteria: input.reviewCriteria,
    terms_version: "candidate-application-terms@1",
    ai_disclosure_version: "candidate-ai-disclosure@1",
    conditional_reveal_consent_version: "resume-reveal-consent@1",
  });
}

export const ADDITIONAL_SYNTHETIC_JOB_POSTS: readonly JobPostDraftInput[] = [
  job({
    slug: "financial-reporting-accountant",
    organization: "Meridian Ledger Co.",
    title: "Senior Financial Reporting Accountant",
    category: "FINANCE",
    summary:
      "Own month-end reporting quality, reconcile material differences, and communicate judgment under a compressed close timetable.",
    compensation: "$105k–$135k + bonus",
    capabilities: ["Financial reporting", "Account reconciliation", "Materiality judgment"],
    challenge: challenge(
      "financial-reporting-accountant",
      "Close the books without hiding uncertainty",
      "Review the synthetic reconciliation file, identify the two entries that deserve immediate investigation, and draft the controller note you would send before close.",
      [
        textPart(
          "financial-reporting-accountant",
          "Close instruction",
          "Separate accounting judgment from missing evidence and name the first control you would run.",
          "The close deadline is in three hours. You may adjust only entries supported by the attached synthetic ledger extract.",
        ),
        assetPart(
          "financial-reporting-accountant",
          "FILE",
          "accounting",
          "Reconciliation extract",
          "Use the CSV as source evidence; do not assume a difference is an error solely because it is large.",
        ),
      ],
    ),
    proofFormat:
      "A short investigation order, proposed entries, and a controller note with explicit unknowns.",
  }),
  job({
    slug: "fp-and-a-manager",
    organization: "Arcfield Consumer",
    title: "FP&A Manager",
    category: "FINANCE",
    summary:
      "Translate changing commercial signals into an accountable forecast and decision narrative for operating leaders.",
    compensation: "$130k–$165k + bonus",
    capabilities: ["Forecasting", "Scenario planning", "Executive communication"],
    challenge: challenge(
      "fp-and-a-manager",
      "Reforecast a missed quarter",
      "Revenue is tracking eight percent below plan while gross margin is improving. Propose a reforecast range, the two assumptions that dominate it, and the decision you need from the COO today.",
      [
        textPart(
          "fp-and-a-manager",
          "Planning memo",
          "Do not invent precision; show a bounded range and what would move it.",
          "The board pack freezes tomorrow. Sales capacity cannot change this quarter, but discretionary marketing can move by up to 15 percent.",
        ),
      ],
    ),
    proofFormat:
      "A five-bullet reforecast memo with range, sensitivities, action, and one disconfirming signal.",
  }),
  job({
    slug: "business-development-manager",
    organization: "Northline Climate",
    title: "Business Development Manager",
    category: "BUSINESS_DEVELOPMENT",
    summary:
      "Build partner-led growth without confusing logo collection, activity volume, and durable commercial leverage.",
    compensation: "$120k–$155k + variable",
    capabilities: ["Partner strategy", "Commercial qualification", "Deal design"],
    challenge: challenge(
      "business-development-manager",
      "Choose the partnership worth testing",
      "Three potential channel partners offer reach but require different exclusivity and enablement costs. Define a first-pass qualification framework and the smallest reversible test for the best option.",
      [
        textPart(
          "business-development-manager",
          "Partner brief",
          "Expose the trade-off between distribution, control, and learning speed.",
          "Partner A has reach but asks for category exclusivity. Partner B is smaller and will co-sell. Partner C offers data access but no committed pipeline.",
        ),
        assetPart(
          "business-development-manager",
          "AUDIO",
          "audio",
          "Partner discovery excerpt",
          "Treat the audio transport as synthetic; use the provided transcript excerpt as the content source.",
          {
            transcript:
              "Partner B: We can put two account executives into a 30-day co-sell pilot, but we need a shared definition of qualified pipeline before kickoff.",
          },
        ),
      ],
    ),
    proofFormat:
      "A qualification table, selected reversible pilot, success boundary, and walk-away condition.",
  }),
  job({
    slug: "enterprise-partnerships-director",
    organization: "Civic Grid Systems",
    title: "Director of Enterprise Partnerships",
    category: "BUSINESS_DEVELOPMENT",
    summary:
      "Structure multi-party enterprise partnerships where product, policy, revenue, and implementation incentives diverge.",
    compensation: "$170k–$215k + variable",
    capabilities: ["Enterprise partnerships", "Stakeholder alignment", "Commercial governance"],
    challenge: challenge(
      "enterprise-partnerships-director",
      "Repair a partnership before launch",
      "A strategic integration is six weeks from launch, but sales promised custom reporting that product never approved. Draft the reset conversation and a governance mechanism that preserves the relationship without accepting open-ended scope.",
      [
        textPart(
          "enterprise-partnerships-director",
          "Escalation packet",
          "Name the commitment you will honor, the one you will renegotiate, and who owns the new decision gate.",
          "The partner represents 14 percent of next year's pipeline. Engineering estimates the custom reporting request at twelve weeks, not four.",
        ),
      ],
    ),
    proofFormat: "A partner-facing reset script plus a one-page decision and escalation model.",
  }),
  job({
    slug: "senior-brand-illustrator",
    organization: "Lumen House",
    title: "Senior Brand Illustrator",
    category: "CREATIVE",
    summary:
      "Turn an ambiguous brand strategy into a coherent visual system that survives multiple channels and stakeholders.",
    compensation: "$110k–$145k",
    capabilities: ["Visual concepting", "Brand systems", "Creative rationale"],
    challenge: challenge(
      "senior-brand-illustrator",
      "Choose and evolve a visual direction",
      "Use the synthetic direction board to select one route for a trust-sensitive product launch. Explain what you would preserve, what you would redraw, and how the system would adapt from a landing page to a small social placement.",
      [
        textPart(
          "senior-brand-illustrator",
          "Creative brief",
          "Ground the response in visual decisions rather than adjectives alone.",
          "Audience: operations leaders buying unfamiliar automation. Avoid stock futurism and claims of magical autonomy.",
        ),
        assetPart(
          "senior-brand-illustrator",
          "IMAGE",
          "creative",
          "Direction board",
          "Inspect the composition, shape language, contrast, and channel risks in the attached board.",
          {
            altText:
              "Three synthetic campaign panels labelled Trust, Momentum, and Human, using teal circles, coral arrows, and warm organic shapes.",
          },
        ),
      ],
    ),
    proofFormat:
      "A selected direction, annotated change list, channel adaptation, and one rough text-described composition.",
    reviewCriteria: [
      {
        criterion_ref: "criterion:brand-direction-choice",
        capability_ref: "capability:visual-concepting",
        statement:
          "The answer selects one coherent direction and grounds that choice in specific evidence from the sealed direction board and audience brief.",
        support_indicators: [
          "Names one route and connects composition, shape, or contrast decisions to audience trust.",
        ],
        contradiction_indicators: [
          "Refuses to choose one direction or proposes combining every route without a governing visual rule.",
        ],
        bounded_limitations: [
          "The text response cannot establish hands-on illustration craft or production speed.",
        ],
      },
      {
        criterion_ref: "criterion:brand-system-adaptation",
        capability_ref: "capability:brand-systems",
        statement:
          "The answer explains what to preserve, what to redraw, and how the system changes between a landing page and a small social placement.",
        support_indicators: [
          "Provides channel-specific hierarchy, crop, contrast, or simplification decisions.",
        ],
        contradiction_indicators: [
          "Says the same composition should be reused unchanged at every size.",
        ],
        bounded_limitations: ["The task does not test a complete production-ready asset suite."],
      },
      {
        criterion_ref: "criterion:creative-rationale",
        capability_ref: "capability:creative-rationale",
        statement:
          "The answer provides a concrete rough composition and a falsifiable visual rationale instead of relying only on subjective adjectives.",
        support_indicators: [
          "Describes placement, focal hierarchy, shape language, and a review condition that could fail.",
        ],
        contradiction_indicators: [
          "Uses preference language alone and dismisses the need for a concrete composition or review check.",
        ],
        bounded_limitations: [
          "The response cannot confirm stakeholder collaboration outside this bounded brief.",
        ],
      },
    ],
  }),
  job({
    slug: "product-designer",
    organization: "Harbor Care",
    title: "Senior Product Designer",
    category: "PRODUCT",
    summary:
      "Design high-stakes workflows that expose system status, preserve user agency, and recover gracefully from partial failure.",
    compensation: "$145k–$185k + equity",
    capabilities: ["Interaction design", "Workflow recovery", "Design rationale"],
    challenge: challenge(
      "product-designer",
      "Design a recoverable intake failure",
      "A clinician submits a long intake form and the document upload fails after the text has saved. Describe the recovery state, information hierarchy, and minimum usability test that would falsify your design.",
      [
        textPart(
          "product-designer",
          "Failure-state brief",
          "Preserve saved work and make uncertainty legible without blaming the user.",
          "The browser may be offline for up to two minutes. The uploaded document contains sensitive health information and cannot be cached indefinitely.",
        ),
      ],
    ),
    proofFormat:
      "A state sequence, text wireframe, key copy, accessibility note, and falsifying test.",
  }),
  job({
    slug: "regional-sales-director",
    organization: "Vector Industrial",
    title: "Regional Sales Director",
    category: "SALES",
    summary:
      "Lead an enterprise revenue organization through forecast ambiguity, deal inspection, and repeatable coaching.",
    compensation: "$175k–$220k + variable",
    capabilities: ["Forecast judgment", "Sales coaching", "Pipeline inspection"],
    challenge: challenge(
      "regional-sales-director",
      "Call the quarter without sandbagging",
      "Use the synthetic pipeline and discovery excerpt to make a commit forecast, identify the deal you would remove from rep confidence, and run the next coaching question.",
      [
        assetPart(
          "regional-sales-director",
          "FILE",
          "pipeline",
          "Regional pipeline",
          "Use stage, recency, champion strength, and category as evidence; do not sum the sheet blindly.",
        ),
        assetPart(
          "regional-sales-director",
          "AUDIO",
          "audio",
          "Discovery-call excerpt",
          "Treat the audio transport as synthetic and use the transcript excerpt as its semantic content.",
          {
            transcript:
              "Atlas Health buyer: Security is not the blocker. We still do not have an executive owner willing to sign the process change this quarter.",
          },
        ),
        textPart(
          "regional-sales-director",
          "Forecast constraint",
          "Separate commit, best case, and pipeline. Explain one action that changes evidence rather than CRM hygiene.",
          "The regional target is $520k in new ARR. Finance needs one commit number and a bounded upside case by 4 p.m.",
        ),
      ],
    ),
    proofFormat:
      "A commit/upside table, one deal correction, a coaching question, and the evidence needed to change the call.",
  }),
  job({
    slug: "enterprise-account-executive",
    organization: "Clearpath Security",
    title: "Enterprise Account Executive",
    category: "SALES",
    summary:
      "Navigate enterprise buying risk by connecting discovery evidence to a credible mutual action plan.",
    compensation: "$150k–$190k OTE",
    capabilities: ["Enterprise discovery", "Mutual action planning", "Commercial communication"],
    challenge: challenge(
      "enterprise-account-executive",
      "Recover a stalled enterprise deal",
      "A six-figure deal has gone silent after technical validation. Write the message that reopens the business problem without discounting, and outline the next three mutual milestones if the buyer responds.",
      [
        textPart(
          "enterprise-account-executive",
          "Stalled-deal facts",
          "Use only the known buying signals and name what you still need to learn.",
          "The technical champion attended every evaluation. Procurement has not engaged. The economic buyer missed the final validation call.",
        ),
      ],
    ),
    proofFormat:
      "A buyer message, three mutual milestones, and one qualification risk that could close the deal out.",
  }),
  job({
    slug: "growth-marketing-manager",
    organization: "Fieldnote Learning",
    title: "Growth Marketing Manager",
    category: "MARKETING",
    summary:
      "Diagnose funnel changes and design experiments that distinguish channel effects from measurement artifacts.",
    compensation: "$125k–$160k + equity",
    capabilities: ["Funnel diagnosis", "Experiment design", "Measurement judgment"],
    challenge: challenge(
      "growth-marketing-manager",
      "Diagnose conversion before buying more traffic",
      "Trial starts fell 18 percent after a landing-page launch while qualified traffic increased. Give the first three checks, the experiment you would run, and the metric that prevents a false win.",
      [
        textPart(
          "growth-marketing-manager",
          "Funnel context",
          "Distinguish instrumentation, audience mix, and product friction before recommending spend.",
          "Pricing and onboarding did not intentionally change. Mobile traffic share increased from 41 to 58 percent during the same week.",
        ),
      ],
    ),
    proofFormat: "A diagnostic order, experiment design, guardrail metric, and decision rule.",
  }),
  job({
    slug: "customer-success-lead",
    openToAll: true,
    organization: "Relay Commerce",
    title: "Customer Success Lead",
    category: "OPERATIONS",
    summary:
      "Protect retention by separating product risk, adoption risk, and relationship risk in complex customer accounts.",
    compensation: "$120k–$155k + variable",
    capabilities: ["Account risk", "Escalation management", "Adoption strategy"],
    challenge: challenge(
      "customer-success-lead",
      "Turn an escalation into an accountable recovery",
      "A strategic customer reports repeated workflow failures and threatens non-renewal. Draft the first response, the internal fact-finding plan, and the recovery milestone you will not promise before engineering confirms it.",
      [
        textPart(
          "customer-success-lead",
          "Escalation facts",
          "Acknowledge impact without inventing root cause or offering an unsafe deadline.",
          "Three failures occurred in two weeks. Support has workarounds for two. Engineering has not reproduced the third.",
        ),
      ],
    ),
    proofFormat:
      "A customer response, internal owner map, evidence checklist, and bounded recovery plan.",
  }),
  job({
    slug: "supply-chain-manager",
    organization: "Juniper Goods",
    title: "Supply Chain Operations Manager",
    category: "OPERATIONS",
    summary:
      "Stabilize multi-node operations by establishing source-of-truth decisions under time and service pressure.",
    compensation: "$115k–$150k + bonus",
    capabilities: ["Incident command", "Inventory control", "Operational prioritization"],
    challenge: challenge(
      "supply-chain-manager",
      "Stabilize a distribution incident",
      "Use the incident packet to define the first thirty minutes of command, the source of truth for inventory, and the customer promise you will explicitly withhold.",
      [
        assetPart(
          "supply-chain-manager",
          "FILE",
          "operations",
          "Incident packet",
          "Treat timestamps as authoritative but identify where the packet lacks causal evidence.",
        ),
        textPart(
          "supply-chain-manager",
          "Operating constraint",
          "Protect reversibility and name the trigger for escalating beyond the regional team.",
          "Orders continue to arrive during the incident. A full network pause costs $90k per hour.",
        ),
      ],
    ),
    proofFormat:
      "A timed action sequence, owner table, source-of-truth decision, and escalation trigger.",
  }),
  job({
    slug: "people-operations-manager",
    organization: "Common Thread Labs",
    title: "People Operations Manager",
    category: "PEOPLE",
    summary:
      "Design fair, operationally clear people processes while protecting confidentiality and manager accountability.",
    compensation: "$120k–$155k",
    capabilities: ["People process design", "Manager enablement", "Confidentiality judgment"],
    challenge: challenge(
      "people-operations-manager",
      "Respond to an inconsistent promotion process",
      "Employees report that promotion expectations differ by manager. Propose the smallest process correction for this cycle, the evidence you would audit, and what must remain confidential.",
      [
        textPart(
          "people-operations-manager",
          "Process facts",
          "Do not infer discrimination from the sparse facts; design a check capable of surfacing inconsistent application.",
          "Calibration begins in ten days. Current level guidelines exist, but managers do not document evidence in a common format.",
        ),
      ],
    ),
    proofFormat:
      "A current-cycle intervention, audit sample, confidentiality boundary, and longer-term control.",
  }),
  job({
    slug: "legal-operations-counsel",
    organization: "Aster Works",
    title: "Legal Operations Counsel",
    category: "LEGAL",
    summary:
      "Translate contractual risk into practical operating decisions without turning every uncertainty into a business stop.",
    compensation: "$165k–$205k",
    capabilities: ["Contract risk", "Business counseling", "Escalation design"],
    challenge: challenge(
      "legal-operations-counsel",
      "Bound a launch-contract risk",
      "A launch partner requests broad audit rights and uncapped confidentiality damages forty-eight hours before signature. Frame the actual risk, propose fallback language, and identify the business owner who must accept residual exposure.",
      [
        textPart(
          "legal-operations-counsel",
          "Negotiation context",
          "Separate legal drafting from the commercial decision and avoid claiming jurisdiction-specific certainty.",
          "The partner will not move the launch date. No regulated personal data is in scope, but proprietary model outputs are shared.",
        ),
      ],
    ),
    proofFormat:
      "A risk statement, fallback position, escalation owner, and explicit residual risk.",
  }),
  job({
    slug: "healthcare-operations-analyst",
    organization: "Signal Clinic Network",
    title: "Senior Healthcare Operations Analyst",
    category: "HEALTHCARE",
    summary:
      "Find operational bottlenecks without confusing throughput gains with safe and equitable patient access.",
    compensation: "$105k–$140k",
    capabilities: ["Operational analytics", "Healthcare workflow", "Safety guardrails"],
    challenge: challenge(
      "healthcare-operations-analyst",
      "Reduce wait time without hiding clinical risk",
      "A clinic's median wait time improved while the 90th percentile worsened. Give the segmentation you would request, one workflow hypothesis, and the balancing measure that stops an unsafe optimization.",
      [
        textPart(
          "healthcare-operations-analyst",
          "Access snapshot",
          "Do not make a clinical diagnosis. Focus on operational evidence and safety escalation.",
          "The clinic added same-day slots two months ago. Staffing hours are unchanged. No reliable acuity field is present in the extract.",
        ),
      ],
    ),
    proofFormat:
      "A segmentation plan, workflow hypothesis, balancing measure, and one data-quality limitation.",
  }),
  job({
    slug: "privacy-program-manager",
    organization: "Plainview Data",
    title: "Data Privacy Program Manager",
    category: "LEGAL",
    summary:
      "Operationalize privacy commitments across product, security, legal, and vendor workflows with auditable ownership.",
    compensation: "$145k–$185k",
    capabilities: ["Privacy operations", "Data mapping", "Cross-functional governance"],
    challenge: challenge(
      "privacy-program-manager",
      "Contain an undocumented data flow",
      "A product review finds that support attachments are copied into an analytics workspace. Define immediate containment, the fact pattern needed for legal assessment, and the control that prevents recurrence.",
      [
        textPart(
          "privacy-program-manager",
          "Discovery note",
          "Avoid declaring a reportable breach from incomplete evidence; preserve the investigation trail.",
          "Access logs exist for ninety days. The analytics workspace has broader access than the support system. Data residency is not yet confirmed.",
        ),
      ],
    ),
    proofFormat:
      "A containment sequence, evidence request, decision owner, and durable process control.",
  }),
  job({
    slug: "construction-project-manager",
    organization: "Foundry Build Group",
    title: "Senior Construction Project Manager",
    category: "OPERATIONS",
    summary:
      "Coordinate schedule, cost, safety, and owner communication when field conditions invalidate the plan.",
    compensation: "$125k–$165k + bonus",
    capabilities: ["Project controls", "Field coordination", "Risk communication"],
    challenge: challenge(
      "construction-project-manager",
      "Recover a critical-path disruption",
      "A structural inspection stops work on a critical path while a major delivery is already in transit. Set the next four actions, name what cannot proceed, and write the owner update without inventing a recovery date.",
      [
        textPart(
          "construction-project-manager",
          "Field condition",
          "Prioritize safety and reversible logistics before schedule optimization.",
          "The inspector will return within twenty-four hours. Off-site storage is available for two days at additional cost. The subcontractor crew is scheduled elsewhere next week.",
        ),
      ],
    ),
    proofFormat: "A four-action sequence, hold points, cost/schedule unknowns, and owner update.",
  }),
  job({
    slug: "strategic-sourcing-lead",
    organization: "Orbit Manufacturing",
    title: "Strategic Sourcing Lead",
    category: "OPERATIONS",
    summary:
      "Make supplier decisions that balance landed cost, resilience, quality evidence, and switching risk.",
    compensation: "$120k–$155k + bonus",
    capabilities: ["Supplier strategy", "Total cost analysis", "Risk negotiation"],
    challenge: challenge(
      "strategic-sourcing-lead",
      "Choose a supplier under incomplete evidence",
      "An incumbent raises price twelve percent while a lower-cost entrant has limited quality history. Define the comparison, the pilot or negotiation move, and the condition that prevents a false economy.",
      [
        textPart(
          "strategic-sourcing-lead",
          "Sourcing facts",
          "Include switching cost and continuity risk; do not equate quoted unit price with total cost.",
          "The component has a sixteen-week qualification cycle. Current defect cost is material but stable. Dual sourcing is technically possible.",
        ),
      ],
    ),
    proofFormat:
      "A decision table, immediate commercial move, validation plan, and stop condition.",
  }),
  job({
    slug: "content-strategy-director",
    organization: "Morrow Media",
    title: "Director of Content Strategy",
    category: "MARKETING",
    summary:
      "Build an editorial system that connects audience need, channel behavior, brand trust, and measurable business action.",
    compensation: "$135k–$175k",
    capabilities: ["Editorial strategy", "Audience judgment", "Measurement design"],
    challenge: challenge(
      "content-strategy-director",
      "Stop publishing volume from masquerading as strategy",
      "Organic traffic is up but qualified product actions are flat. Reframe the editorial objective, identify what you would stop, and propose one content test with a credible causal measure.",
      [
        textPart(
          "content-strategy-director",
          "Channel context",
          "Separate reach metrics from intended reader action and state the audience assumption.",
          "Most growth comes from broad glossary pages. Product comparison pages have lower traffic but higher assisted conversion.",
        ),
      ],
    ),
    proofFormat:
      "A revised objective, stop/start choice, test design, and leading plus lagging measures.",
  }),
  job({
    slug: "game-art-director",
    organization: "Ember Arcade",
    title: "Game Art Director",
    category: "CREATIVE",
    summary:
      "Hold a coherent visual bar while turning narrative, gameplay, production, and technical constraints into actionable direction.",
    compensation: "$150k–$195k",
    capabilities: ["Art direction", "Visual systems", "Production critique"],
    challenge: challenge(
      "game-art-director",
      "Resolve a visual direction conflict",
      "The environment team favors atmospheric detail while gameplay reports poor objective readability. Use the visual board as a reference and give a direction that preserves world identity while restoring play clarity.",
      [
        assetPart(
          "game-art-director",
          "IMAGE",
          "creative",
          "Visual direction reference",
          "Use the board as a composition reference, not as final game art.",
          {
            altText:
              "Three synthetic visual direction panels showing distinct contrast, shape, and emotional strategies.",
          },
        ),
        textPart(
          "game-art-director",
          "Production constraint",
          "Name a visual rule the team can apply repeatedly and a review shot that will reveal failure.",
          "The milestone is in two weeks. Lighting can change globally; environment geometry cannot be rebuilt at scale.",
        ),
      ],
    ),
    proofFormat:
      "A direction statement, three repeatable rules, one annotated review shot description, and a production check.",
  }),
  job({
    slug: "sustainability-program-lead",
    organization: "Terra Loop Foods",
    title: "Sustainability Program Lead",
    category: "SUSTAINABILITY",
    summary:
      "Turn sustainability claims into measurable operating changes with transparent boundaries and supplier accountability.",
    compensation: "$125k–$165k",
    capabilities: ["Sustainability metrics", "Supplier programs", "Claims governance"],
    challenge: challenge(
      "sustainability-program-lead",
      "Make a climate claim auditable",
      "Marketing wants to announce a thirty-percent packaging footprint reduction based on a supplier estimate. Define what evidence is sufficient, the claim you can support now, and the operating control needed before scaling it.",
      [
        textPart(
          "sustainability-program-lead",
          "Claim facts",
          "Distinguish measured change, modeled estimate, and boundary exclusions.",
          "The estimate covers material production but excludes transport and end-of-life. One supplier represents sixty percent of the new packaging volume.",
        ),
      ],
    ),
    proofFormat:
      "An evidence threshold, bounded claim language, missing boundary list, and supplier control.",
  }),
];

if (ADDITIONAL_SYNTHETIC_JOB_POSTS.length !== 20) {
  throw new Error("The cross-domain Demo fixture must contain exactly 20 JobPosts.");
}

export const MATCHING_LAB_SYNTHETIC_JOB_POSTS: readonly JobPostDraftInput[] = [
  job({
    slug: "payment-workflow-backend-engineer",
    organization: "QuantaPay Systems",
    title: "Payment Workflow Backend Engineer",
    category: "TECHNOLOGY",
    summary:
      "Build retry-safe payment workflows where provider acknowledgements, durable state, and reconciliation can disagree.",
    compensation: "$155k–$195k + equity",
    capabilities: ["Payments engineering", "Idempotent workflows", "Failure recovery"],
    eligibilityTagNames: [
      "Computer Science",
      "Software Engineering",
      "Backend Engineering",
      "Payments Engineering",
    ],
    challenge: challenge(
      "payment-workflow-backend-engineer",
      "Recover an ambiguous provider charge",
      "A provider times out after accepting a charge request while the local worker retries. Define the durable state transitions, reconciliation path, and tests that prevent a duplicate charge.",
      [
        textPart(
          "payment-workflow-backend-engineer",
          "Ambiguous charge boundary",
          "Separate what the service knows from what it must discover before retrying.",
          "The provider supports idempotency keys, PostgreSQL is available, and delivery is at least once. The provider status endpoint may lag by thirty seconds.",
        ),
      ],
    ),
    proofFormat:
      "A state-transition sketch, retry and reconciliation rules, and three falsifying tests.",
  }),
  job({
    slug: "payments-reliability-incident-lead",
    organization: "LedgerRail",
    title: "Payments Reliability Incident Lead",
    category: "TECHNOLOGY",
    summary:
      "Lead payment incidents, preserve an auditable ledger, and turn ambiguous recovery actions into bounded operating controls.",
    compensation: "$165k–$205k + equity",
    capabilities: ["Reliability engineering", "Incident command", "Payment reconciliation"],
    eligibilityTagNames: [
      "Information Systems",
      "Cloud Infrastructure",
      "Payments Engineering",
      "Reliability Engineering",
    ],
    challenge: challenge(
      "payments-reliability-incident-lead",
      "Choose the first safe incident action",
      "Payment success events are delayed while duplicate retry volume rises. Write the first ten-minute incident plan, the invariant that forbids a risky shortcut, and the evidence required before recovery.",
      [
        textPart(
          "payments-reliability-incident-lead",
          "Incident snapshot",
          "Prioritize containment and observability without declaring every delayed event a failure.",
          "Provider success rate appears normal, consumer lag is growing, and the internal ledger is missing acknowledgements for six percent of recent requests.",
        ),
      ],
    ),
    proofFormat:
      "A sequenced incident plan with decision gates, owner handoffs, and one unsafe action explicitly rejected.",
  }),
  job({
    slug: "partner-event-integration-engineer",
    organization: "RouteMesh Logistics",
    title: "Partner Event Integration Engineer",
    category: "TECHNOLOGY",
    summary:
      "Harden partner integrations against duplicate delivery, schema drift, and partial acknowledgement across operational systems.",
    compensation: "$135k–$170k + equity",
    capabilities: ["Systems integration", "Event delivery", "Reconciliation design"],
    eligibilityTagNames: [
      "Information Systems",
      "Software Engineering",
      "Backend Engineering",
      "Information Technology Operations",
    ],
    challenge: challenge(
      "partner-event-integration-engineer",
      "Contain a duplicate partner-event storm",
      "A partner begins replaying two hours of shipment events with a changed optional field. Propose the smallest safe ingestion change and the reconciliation evidence needed before normal processing resumes.",
      [
        textPart(
          "partner-event-integration-engineer",
          "Replay boundary",
          "Keep schema compatibility, deduplication, and business reconciliation as separate concerns.",
          "Event IDs are stable, delivery order is not guaranteed, and downstream shipment notifications must not be emitted twice.",
        ),
      ],
    ),
    proofFormat:
      "An ingestion decision tree, deduplication key, replay plan, and bounded reconciliation query.",
  }),
  job({
    slug: "cloud-recovery-platform-engineer",
    organization: "Nimbus Forge",
    title: "Cloud Recovery Platform Engineer",
    category: "TECHNOLOGY",
    summary:
      "Build observable regional recovery automation for stateful services without turning a runbook into an unsafe one-click failover.",
    compensation: "$160k–$200k + equity",
    capabilities: ["Cloud recovery", "Workflow orchestration", "Operational observability"],
    eligibilityTagNames: [
      "Computer Engineering",
      "Cloud Infrastructure",
      "Reliability Engineering",
      "Information Technology Operations",
    ],
    challenge: challenge(
      "cloud-recovery-platform-engineer",
      "Gate a stateful regional failover",
      "A regional database is reachable but producing stale replicas while application error rates climb. Define the automated checks, human decision gate, and rollback receipt for a failover workflow.",
      [
        textPart(
          "cloud-recovery-platform-engineer",
          "Recovery constraints",
          "Name the evidence that authorizes each irreversible step.",
          "The secondary region is healthy, replication lag is ninety seconds, and the last failover rehearsal completed three weeks ago.",
        ),
      ],
    ),
    proofFormat:
      "A checkpointed recovery workflow with preconditions, abort conditions, and operator-visible receipts.",
  }),
  job({
    slug: "financial-data-reconciliation-engineer",
    organization: "ClearLedger Analytics",
    title: "Financial Data Reconciliation Engineer",
    category: "TECHNOLOGY",
    summary:
      "Make incomplete and duplicated financial event streams measurable through reproducible reconciliation controls.",
    compensation: "$140k–$180k + equity",
    capabilities: ["Data engineering", "Ledger reconciliation", "Control design"],
    eligibilityTagNames: [
      "Economics",
      "Data Science",
      "Accounting Operations",
      "Data Engineering",
      "Data Science and Analytics",
    ],
    challenge: challenge(
      "financial-data-reconciliation-engineer",
      "Explain a ledger mismatch without hiding missing data",
      "The warehouse reports fewer settled transactions than the provider ledger. Define a reconciliation query plan, classify the mismatch states, and state what cannot yet be concluded.",
      [
        textPart(
          "financial-data-reconciliation-engineer",
          "Reconciliation facts",
          "Distinguish late, duplicated, missing, and semantically inconsistent records.",
          "Provider exports arrive hourly, internal events are at least once, and one ingestion partition was unavailable for twenty minutes.",
        ),
      ],
    ),
    proofFormat:
      "A source-of-truth table, mismatch taxonomy, query sequence, and two data-quality assertions.",
  }),
  job({
    slug: "distributed-systems-verification-engineer",
    organization: "Beacon Consensus Lab",
    title: "Distributed Systems Verification Engineer",
    category: "TECHNOLOGY",
    summary:
      "Turn distributed-systems failure assumptions into reproducible experiments and falsifiable correctness claims.",
    compensation: "$145k–$185k + equity",
    capabilities: ["Distributed systems", "Fault injection", "Verification strategy"],
    eligibilityTagNames: [
      "Computer Science",
      "Mathematics",
      "Software Engineering",
      "Distributed Systems",
      "Quality Assurance Engineering",
    ],
    challenge: challenge(
      "distributed-systems-verification-engineer",
      "Falsify a replicated-state safety claim",
      "A replicated service claims that replayed messages cannot produce two committed values for one logical operation. Design the smallest experiment that could falsify that claim.",
      [
        textPart(
          "distributed-systems-verification-engineer",
          "Experiment boundary",
          "Specify controllable faults, observable evidence, and a result that would refute the claim.",
          "You can delay, duplicate, or reorder messages and crash one replica between persistence and acknowledgement.",
        ),
      ],
    ),
    proofFormat:
      "A fault matrix, event trace, safety assertion, and a minimal counterexample condition.",
  }),
];

if (MATCHING_LAB_SYNTHETIC_JOB_POSTS.length !== 6) {
  throw new Error("The Candidate Eligibility Match Lab must contain exactly six JobPosts.");
}

export const SIX_CANDIDATE_MATCH_LAB_REFS = Object.freeze([
  "candidate-42",
  "candidate-17",
  "candidate-03",
  "candidate-08",
  "candidate-11",
  "candidate-19",
] as const);

export type SyntheticEligibilityDemoTarget = Readonly<{
  title: string;
  tag: string;
  source: "EDUCATION" | "WORK_SAMPLE";
}>;

export const SYNTHETIC_ELIGIBILITY_DEMO_TARGETS: Readonly<
  Record<string, readonly SyntheticEligibilityDemoTarget[]>
> = Object.freeze({
  "candidate-42": [
    { title: "Senior Backend Reliability Engineer", tag: "Computer Science", source: "EDUCATION" },
    {
      title: "Payment Workflow Backend Engineer",
      tag: "Payments Engineering",
      source: "WORK_SAMPLE",
    },
    {
      title: "Payments Reliability Incident Lead",
      tag: "Payments Engineering",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-17": [
    {
      title: "Senior Backend Reliability Engineer",
      tag: "Information Systems",
      source: "EDUCATION",
    },
    {
      title: "Payment Workflow Backend Engineer",
      tag: "Payments Engineering",
      source: "WORK_SAMPLE",
    },
    {
      title: "Payments Reliability Incident Lead",
      tag: "Reliability Engineering",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-03": [
    {
      title: "Payment Workflow Backend Engineer",
      tag: "Backend Engineering",
      source: "WORK_SAMPLE",
    },
    {
      title: "Partner Event Integration Engineer",
      tag: "Backend Engineering",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-08": [
    {
      title: "Payments Reliability Incident Lead",
      tag: "Reliability Engineering",
      source: "WORK_SAMPLE",
    },
    {
      title: "Cloud Recovery Platform Engineer",
      tag: "Cloud Infrastructure",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-11": [
    {
      title: "Financial Data Reconciliation Engineer",
      tag: "Data Engineering",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-19": [
    { title: "Senior Backend Reliability Engineer", tag: "Computer Science", source: "EDUCATION" },
    {
      title: "Distributed Systems Verification Engineer",
      tag: "Distributed Systems",
      source: "WORK_SAMPLE",
    },
  ],
  "candidate-27": [{ title: "Senior Brand Illustrator", tag: "Illustration", source: "EDUCATION" }],
});
