import { createHash, randomUUID } from "node:crypto";
import type {
  CreateUploadUrlInput,
  ObjectMetadata,
  ObjectStorePort,
  PutObjectInput,
} from "@onlyboth/application";

import { ObjectStoreError } from "./object-store";

interface StoredObject extends ObjectMetadata {
  readonly body: Uint8Array;
}

export class MemoryObjectStore implements ObjectStorePort {
  readonly #objects = new Map<string, StoredObject>();

  public async createUploadUrl(input: CreateUploadUrlInput): Promise<string> {
    return `memory://upload/${encodeURIComponent(input.objectKey)}?token=${randomUUID()}`;
  }

  public async createDownloadUrl(objectKey: string): Promise<string> {
    if (!this.#objects.has(objectKey)) {
      throw new ObjectStoreError("OBJECT_NOT_FOUND", "The object does not exist.");
    }
    return `memory://download/${encodeURIComponent(objectKey)}`;
  }

  public async putObject(input: PutObjectInput): Promise<ObjectMetadata> {
    if (this.#objects.has(input.objectKey)) {
      throw new ObjectStoreError("OBJECT_ALREADY_EXISTS", "Objects are append-only.");
    }
    const checksumSha256 = `sha256:${createHash("sha256").update(input.body).digest("hex")}`;
    if (input.checksumSha256 !== undefined && input.checksumSha256 !== checksumSha256) {
      throw new ObjectStoreError("CHECKSUM_MISMATCH", "The object checksum did not match.");
    }
    const stored: StoredObject = {
      body: Uint8Array.from(input.body),
      contentType: input.contentType,
      contentLength: input.body.byteLength,
      checksumSha256,
    };
    this.#objects.set(input.objectKey, stored);
    return stored;
  }

  public async headObject(objectKey: string): Promise<ObjectMetadata | null> {
    const object = this.#objects.get(objectKey);
    if (object === undefined) return null;
    return {
      contentType: object.contentType,
      contentLength: object.contentLength,
      checksumSha256: object.checksumSha256,
    };
  }

  public async getObject(objectKey: string): Promise<Uint8Array> {
    const object = this.#objects.get(objectKey);
    if (object === undefined) {
      throw new ObjectStoreError("OBJECT_NOT_FOUND", "The object does not exist.");
    }
    return Uint8Array.from(object.body);
  }

  public async deleteObject(objectKey: string): Promise<void> {
    this.#objects.delete(objectKey);
  }
}
