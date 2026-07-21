import { z } from "zod";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const CatalogIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const ChallengeIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const CapabilityRefSchema = z.string().regex(/^[a-z][a-z0-9_]*$/u);
const VersionedRefSchema = z.string().regex(/^[a-z0-9][a-z0-9/-]*@[1-9][0-9]*$/u);
const SafeRelativeRefSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[a-zA-Z0-9._/-]+$/u)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), {
    message: "Reference must be a normalized relative path without traversal segments.",
  });

export const ChallengeManifestEntrySchema = z
  .object({
    id: ChallengeIdSchema,
    version: z.number().int().positive(),
    capability_refs: z.array(CapabilityRefSchema).min(1).max(30),
    difficulty_band: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    base_snapshot_version: VersionedRefSchema,
    scenario_fixture: SafeRelativeRefSchema,
    hidden_test_bundle: SafeRelativeRefSchema,
    time_limit_seconds: z.number().int().min(1).max(900),
    candidate_notice: z.string().min(1).max(1_000),
    hash: Sha256Schema,
  })
  .strict();

export const ChallengeCatalogManifestSchema = z
  .object({
    schema_version: z.literal("challenge-catalog@1"),
    catalog_id: CatalogIdSchema,
    catalog_version: z.number().int().positive(),
    base_snapshot_version: VersionedRefSchema,
    manifest_hash: Sha256Schema,
    challenges: z.array(ChallengeManifestEntrySchema).min(1).max(100),
  })
  .strict()
  .superRefine((manifest, context) => {
    const seen = new Set<string>();

    manifest.challenges.forEach((challenge, index) => {
      const key = `${challenge.id}@${challenge.version}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate challenge key '${key}'.`,
          path: ["challenges", index, "id"],
        });
      }
      seen.add(key);

      if (challenge.base_snapshot_version !== manifest.base_snapshot_version) {
        context.addIssue({
          code: "custom",
          message: "Challenge base snapshot must match the catalog base snapshot.",
          path: ["challenges", index, "base_snapshot_version"],
        });
      }
    });
  });

export const ChallengeCatalogLockSchema = z
  .object({
    schema_version: z.literal("challenge-catalog-lock@1"),
    catalog_ref: VersionedRefSchema,
    manifest_hash: Sha256Schema,
    challenge_hashes: z.record(VersionedRefSchema, Sha256Schema),
  })
  .strict();

export type ChallengeManifestEntry = z.infer<typeof ChallengeManifestEntrySchema>;
export type ChallengeCatalogManifest = z.infer<typeof ChallengeCatalogManifestSchema>;
export type ChallengeCatalogLock = z.infer<typeof ChallengeCatalogLockSchema>;
