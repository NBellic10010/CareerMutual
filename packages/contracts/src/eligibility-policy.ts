import { z } from "zod";

import { AiOpaqueRefSchema } from "./hiring-intelligence";

export const ELIGIBILITY_BACKGROUND_TAXONOMY_VERSION = "eligibility-background-tags@1" as const;

export const EligibilityBackgroundTagKindSchema = z.enum(["EDUCATION_FIELD", "WORK_DOMAIN"]);

export const EligibilityBackgroundTagSchema = z
  .object({
    tag_ref: AiOpaqueRefSchema,
    tag_kind: EligibilityBackgroundTagKindSchema,
    public_name: z.string().trim().min(2).max(120),
    capability_ref: AiOpaqueRefSchema,
    source: z.enum(["STANDARD", "RECRUITER_CUSTOM"]),
  })
  .strict();

export type EligibilityBackgroundTag = z.infer<typeof EligibilityBackgroundTagSchema>;

const EDUCATION_FIELDS = [
  "Accounting",
  "Animation",
  "Architecture",
  "Biology",
  "Business Administration",
  "Chemical Engineering",
  "Civil Engineering",
  "Communications",
  "Computer Engineering",
  "Computer Science",
  "Construction Management",
  "Cybersecurity",
  "Data Science",
  "Economics",
  "Electrical Engineering",
  "English",
  "Environmental Science",
  "Film and Media Studies",
  "Finance",
  "Fine Arts",
  "Game Design",
  "Graphic Design",
  "Healthcare Administration",
  "Human Resources Management",
  "Illustration",
  "Industrial Design",
  "Information Systems",
  "Journalism",
  "Law",
  "Legal Studies",
  "Logistics",
  "Marketing",
  "Mathematics",
  "Mechanical Engineering",
  "Nursing",
  "Operations Management",
  "Organizational Psychology",
  "Physics",
  "Product Design",
  "Psychology",
  "Public Health",
  "Public Relations",
  "Sales Management",
  "Sociology",
  "Software Engineering",
  "Statistics",
  "Supply Chain Management",
  "Sustainability",
  "Technical Writing",
  "Urban Planning",
] as const;

const WORK_DOMAINS = [
  "Accounting Operations",
  "Animation Production",
  "Backend Engineering",
  "Brand Illustration",
  "Business Development",
  "Cloud Infrastructure",
  "Compliance Operations",
  "Construction Project Management",
  "Content Strategy",
  "Corporate Finance",
  "Customer Success",
  "Cybersecurity Operations",
  "Data Engineering",
  "Data Privacy",
  "Data Science and Analytics",
  "Demand Generation",
  "Distributed Systems",
  "Enterprise Partnerships",
  "Enterprise Sales",
  "Environmental Programs",
  "Financial Planning and Analysis",
  "Game Art",
  "Growth Marketing",
  "Healthcare Operations",
  "Human Resources Operations",
  "Illustration and Visual Development",
  "Information Technology Operations",
  "Legal Operations",
  "Logistics Operations",
  "Machine Learning Engineering",
  "Marketing Operations",
  "Mobile Engineering",
  "Operations Strategy",
  "Payments Engineering",
  "People Operations",
  "Product Design",
  "Product Management",
  "Program Management",
  "Quality Assurance Engineering",
  "Recruiting Operations",
  "Regional Sales Leadership",
  "Reliability Engineering",
  "Revenue Operations",
  "Sales Enablement",
  "Strategic Sourcing",
  "Supply Chain Operations",
  "Sustainability Programs",
  "Technical Program Management",
  "User Experience Research",
  "Visual Identity Design",
] as const;

function slug(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

export const ELIGIBILITY_BACKGROUND_TAG_CATALOG = Object.freeze([
  ...EDUCATION_FIELDS.map((publicName) =>
    EligibilityBackgroundTagSchema.parse({
      tag_ref: `eligibility-tag:education:${slug(publicName)}@1`,
      tag_kind: "EDUCATION_FIELD",
      public_name: publicName,
      capability_ref: `background-capability:education:${slug(publicName)}@1`,
      source: "STANDARD",
    }),
  ),
  ...WORK_DOMAINS.map((publicName) =>
    EligibilityBackgroundTagSchema.parse({
      tag_ref: `eligibility-tag:work:${slug(publicName)}@1`,
      tag_kind: "WORK_DOMAIN",
      public_name: publicName,
      capability_ref: `background-capability:work:${slug(publicName)}@1`,
      source: "STANDARD",
    }),
  ),
]);

export const OpenEligibilityMatchPolicySchema = z
  .object({
    schema_version: z.literal("eligibility-match-policy@1"),
    access_mode: z.literal("OPEN_TO_ALL"),
    open_reasons: z
      .array(z.enum(["NO_EXPERIENCE_REQUIRED", "NO_BACKGROUND_REQUIRED"]))
      .min(1)
      .max(2),
  })
  .strict();

const PROTECTED_OR_PROXY_TAG =
  /(?:age|race|ethni|relig|gender|sex|pregnan|disab|marital|nationality|citizenship|postcode|zip code|surname|family|health|genetic|politic|union)/iu;

export const EvidenceRequiredEligibilityMatchPolicySchema = z
  .object({
    schema_version: z.literal("eligibility-match-policy@1"),
    access_mode: z.literal("EVIDENCE_MATCH_REQUIRED"),
    taxonomy_version: z.literal(ELIGIBILITY_BACKGROUND_TAXONOMY_VERSION),
    accepted_tags: z.array(EligibilityBackgroundTagSchema).min(1).max(20),
  })
  .strict()
  .superRefine((policy, context) => {
    const refs = policy.accepted_tags.map((tag) => tag.tag_ref);
    const normalizedNames = policy.accepted_tags.map(
      (tag) => `${tag.tag_kind}:${tag.public_name.trim().toLowerCase()}`,
    );
    if (
      new Set(refs).size !== refs.length ||
      new Set(normalizedNames).size !== normalizedNames.length
    ) {
      context.addIssue({ code: "custom", message: "Eligibility tags must be unique." });
    }
    if (policy.accepted_tags.filter((tag) => tag.source === "RECRUITER_CUSTOM").length > 5) {
      context.addIssue({
        code: "custom",
        message: "A JobPost may contain at most five custom tags.",
      });
    }
    const standardRefs = new Set(ELIGIBILITY_BACKGROUND_TAG_CATALOG.map((tag) => tag.tag_ref));
    for (const tag of policy.accepted_tags) {
      if (tag.source === "STANDARD" && !standardRefs.has(tag.tag_ref)) {
        context.addIssue({ code: "custom", message: `Unknown standard tag '${tag.tag_ref}'.` });
      }
      if (tag.source === "RECRUITER_CUSTOM") {
        if (!tag.tag_ref.startsWith("eligibility-tag:custom:")) {
          context.addIssue({
            code: "custom",
            message: "Custom tag refs require the custom namespace.",
          });
        }
        if (PROTECTED_OR_PROXY_TAG.test(`${tag.public_name} ${tag.capability_ref}`)) {
          context.addIssue({
            code: "custom",
            message:
              "Custom eligibility tags cannot encode protected attributes or identity proxies.",
          });
        }
      }
    }
  });

export const EligibilityMatchPolicySchema = z.discriminatedUnion("access_mode", [
  OpenEligibilityMatchPolicySchema,
  EvidenceRequiredEligibilityMatchPolicySchema,
]);

export const EligibilityBackgroundTagCatalogSchema = z
  .object({
    schema_version: z.literal("eligibility-background-tag-catalog@1"),
    taxonomy_version: z.literal(ELIGIBILITY_BACKGROUND_TAXONOMY_VERSION),
    tags: z.array(EligibilityBackgroundTagSchema).length(100),
  })
  .strict();

export type EligibilityMatchPolicy = z.infer<typeof EligibilityMatchPolicySchema>;
