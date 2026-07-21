import {
  ChallengeCatalogLockSchema,
  ChallengeCatalogManifestSchema,
  type ChallengeCatalogLock,
  type ChallengeCatalogManifest,
  type ChallengeManifestEntry,
} from "./schemas";

export interface PublicChallengeOption {
  readonly challenge_id: string;
  readonly version: number;
  readonly capability_refs: readonly string[];
  readonly difficulty_band: string;
  readonly candidate_notice: string;
}

export interface CatalogVersionPin {
  readonly catalog_ref: string;
  readonly manifest_hash: string;
}

export class CatalogSelectionError extends Error {
  override readonly name = "CatalogSelectionError";

  constructor(
    readonly code:
      | "CATALOG_LOCK_MISMATCH"
      | "CHALLENGE_NOT_ALLOWLISTED"
      | "INVALID_RECOMMENDATION_COUNT"
      | "DUPLICATE_RECOMMENDATION",
    message: string,
  ) {
    super(message);
  }
}

function challengeKey(challenge: Pick<ChallengeManifestEntry, "id" | "version">): string {
  return `${challenge.id}@${challenge.version}`;
}

function copyChallenge(challenge: ChallengeManifestEntry): ChallengeManifestEntry {
  return {
    ...challenge,
    capability_refs: [...challenge.capability_refs],
  };
}

export class ChallengeCatalogRegistry {
  readonly catalogRef: string;
  readonly manifestHash: string;
  readonly baseSnapshotVersion: string;

  readonly #entries: ReadonlyMap<string, ChallengeManifestEntry>;

  private constructor(manifest: ChallengeCatalogManifest) {
    this.catalogRef = `${manifest.catalog_id}@${manifest.catalog_version}`;
    this.manifestHash = manifest.manifest_hash;
    this.baseSnapshotVersion = manifest.base_snapshot_version;
    this.#entries = new Map(
      manifest.challenges.map((challenge) => [challengeKey(challenge), copyChallenge(challenge)]),
    );
  }

  static fromUnknown(manifestInput: unknown, lockInput: unknown): ChallengeCatalogRegistry {
    const manifest = ChallengeCatalogManifestSchema.parse(manifestInput);
    const lock = ChallengeCatalogLockSchema.parse(lockInput);
    ChallengeCatalogRegistry.assertLockMatchesManifest(manifest, lock);
    return new ChallengeCatalogRegistry(manifest);
  }

  static fromJson(manifestJson: string, lockJson: string): ChallengeCatalogRegistry {
    return ChallengeCatalogRegistry.fromUnknown(
      JSON.parse(manifestJson) as unknown,
      JSON.parse(lockJson) as unknown,
    );
  }

  getVersionPin(): CatalogVersionPin {
    return Object.freeze({
      catalog_ref: this.catalogRef,
      manifest_hash: this.manifestHash,
    });
  }

  listRecommendationOptions(capabilityRefs?: readonly string[]): readonly PublicChallengeOption[] {
    const required = capabilityRefs === undefined ? undefined : new Set(capabilityRefs);

    return Object.freeze(
      [...this.#entries.values()]
        .filter(
          (entry) =>
            required === undefined ||
            entry.capability_refs.some((capabilityRef) => required.has(capabilityRef)),
        )
        .map((entry) =>
          Object.freeze({
            challenge_id: entry.id,
            version: entry.version,
            capability_refs: Object.freeze([...entry.capability_refs]),
            difficulty_band: entry.difficulty_band,
            candidate_notice: entry.candidate_notice,
          }),
        ),
    );
  }

  resolveExecutableChallenge(challengeRef: string, pin: CatalogVersionPin): ChallengeManifestEntry {
    this.assertVersionPin(pin);
    const challenge = this.#entries.get(challengeRef);
    if (challenge === undefined) {
      throw new CatalogSelectionError(
        "CHALLENGE_NOT_ALLOWLISTED",
        `Challenge '${challengeRef}' is not present in pinned catalog '${this.catalogRef}'.`,
      );
    }
    return Object.freeze(copyChallenge(challenge));
  }

  validateRecommendations(
    challengeRefs: readonly string[],
    pin: CatalogVersionPin,
  ): readonly ChallengeManifestEntry[] {
    if (challengeRefs.length < 1 || challengeRefs.length > 3) {
      throw new CatalogSelectionError(
        "INVALID_RECOMMENDATION_COUNT",
        "Challenge recommendations must contain between one and three allowlisted IDs.",
      );
    }

    if (new Set(challengeRefs).size !== challengeRefs.length) {
      throw new CatalogSelectionError(
        "DUPLICATE_RECOMMENDATION",
        "Challenge recommendations must be unique.",
      );
    }

    return Object.freeze(
      challengeRefs.map((challengeRef) => this.resolveExecutableChallenge(challengeRef, pin)),
    );
  }

  private assertVersionPin(pin: CatalogVersionPin): void {
    if (pin.catalog_ref !== this.catalogRef || pin.manifest_hash !== this.manifestHash) {
      throw new CatalogSelectionError(
        "CATALOG_LOCK_MISMATCH",
        `Catalog pin does not match active catalog '${this.catalogRef}'.`,
      );
    }
  }

  private static assertLockMatchesManifest(
    manifest: ChallengeCatalogManifest,
    lock: ChallengeCatalogLock,
  ): void {
    const catalogRef = `${manifest.catalog_id}@${manifest.catalog_version}`;
    if (lock.catalog_ref !== catalogRef || lock.manifest_hash !== manifest.manifest_hash) {
      throw new CatalogSelectionError(
        "CATALOG_LOCK_MISMATCH",
        "Catalog lock does not match the manifest version and hash.",
      );
    }

    const manifestHashes = new Map(
      manifest.challenges.map((challenge) => [challengeKey(challenge), challenge.hash]),
    );
    const lockEntries = Object.entries(lock.challenge_hashes);
    if (lockEntries.length !== manifestHashes.size) {
      throw new CatalogSelectionError(
        "CATALOG_LOCK_MISMATCH",
        "Catalog lock and manifest contain different challenge sets.",
      );
    }

    for (const [key, hash] of lockEntries) {
      if (manifestHashes.get(key) !== hash) {
        throw new CatalogSelectionError(
          "CATALOG_LOCK_MISMATCH",
          `Catalog lock hash mismatch for '${key}'.`,
        );
      }
    }
  }
}
