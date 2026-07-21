import { createHash } from "node:crypto";

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CreateUploadUrlInput,
  ObjectMetadata,
  ObjectStorePort,
  PutObjectInput,
} from "@onlyboth/application";

import { ObjectStoreError } from "./object-store";

export interface S3ObjectStoreOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
}

export function resolveS3ForcePathStyle(value: string | undefined): boolean {
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("OBJECT_STORE_FORCE_PATH_STYLE must be either 'true' or 'false'.");
}

export function resolveObjectStoreAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      "http://127.0.0.1:3100",
      "http://localhost:3100",
    ];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  ];
}

function checksum(body: Uint8Array): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

function normalizeChecksum(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) return null;
  try {
    return `sha256:${Buffer.from(value, "base64").toString("hex")}`;
  } catch {
    return null;
  }
}

export class S3ObjectStore implements ObjectStorePort {
  readonly #client: S3Client;
  readonly #bucket: string;

  public constructor(options: S3ObjectStoreOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  public async createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    try {
      return await getSignedUrl(
        this.#client,
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: input.objectKey,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          IfNoneMatch: "*",
        }),
        { expiresIn: input.expiresInSeconds },
      );
    } catch (error: unknown) {
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to create an upload URL.", {
        cause: error,
      });
    }
  }

  /** Explicit provisioning operation; request handlers never create buckets. */
  public async initializePrivateBucket(allowedOrigins: readonly string[]): Promise<void> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
    } catch {
      await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }));
    }
    if (allowedOrigins.length > 0) {
      await this.#client.send(
        new PutBucketCorsCommand({
          Bucket: this.#bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [...allowedOrigins],
                AllowedMethods: ["GET", "PUT", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag", "x-amz-checksum-sha256"],
                MaxAgeSeconds: 3_600,
              },
            ],
          },
        }),
      );
    }
  }

  public async createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string> {
    try {
      return await getSignedUrl(
        this.#client,
        new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error: unknown) {
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to create a download URL.", {
        cause: error,
      });
    }
  }

  public async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    const digest = checksum(input.body);
    if (input.checksumSha256 !== undefined && input.checksumSha256 !== digest) {
      throw new ObjectStoreError("CHECKSUM_MISMATCH", "The object checksum did not match.");
    }
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: input.objectKey,
          Body: input.body,
          ContentType: input.contentType,
          IfNoneMatch: "*",
          ChecksumSHA256: Buffer.from(digest.slice("sha256:".length), "hex").toString("base64"),
        }),
      );
      return {
        contentType: input.contentType,
        contentLength: input.body.byteLength,
        checksumSha256: digest,
      };
    } catch (error: unknown) {
      if (error instanceof ObjectStoreError) throw error;
      const candidate = error as {
        readonly name?: string;
        readonly $metadata?: { httpStatusCode?: number };
      };
      if (
        candidate.name === "PreconditionFailed" ||
        candidate.$metadata?.httpStatusCode === 409 ||
        candidate.$metadata?.httpStatusCode === 412
      ) {
        throw new ObjectStoreError("OBJECT_ALREADY_EXISTS", "Objects are append-only.", {
          cause: error,
        });
      }
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to write the object.", {
        cause: error,
      });
    }
  }

  public async headObject(objectKey: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
      );
      return {
        contentType: result.ContentType ?? "application/octet-stream",
        contentLength: result.ContentLength ?? 0,
        checksumSha256: normalizeChecksum(result.ChecksumSHA256),
      };
    } catch (error: unknown) {
      const candidate = error as {
        readonly name?: string;
        readonly $metadata?: { httpStatusCode?: number };
      };
      if (candidate.name === "NotFound" || candidate.$metadata?.httpStatusCode === 404) return null;
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to inspect the object.");
    }
  }

  public async getObject(objectKey: string): Promise<Uint8Array> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
      );
      if (result.Body === undefined) {
        throw new ObjectStoreError("OBJECT_NOT_FOUND", "The object has no body.");
      }
      return await result.Body.transformToByteArray();
    } catch (error: unknown) {
      if (error instanceof ObjectStoreError) throw error;
      const candidate = error as {
        readonly name?: string;
        readonly $metadata?: { httpStatusCode?: number };
      };
      if (candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404) {
        throw new ObjectStoreError("OBJECT_NOT_FOUND", "The object does not exist.");
      }
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to read the object.");
    }
  }

  public async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: objectKey }));
    } catch {
      throw new ObjectStoreError("STORE_UNAVAILABLE", "Unable to delete the object.");
    }
  }
}
