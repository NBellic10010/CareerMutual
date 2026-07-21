export type {
  CreateUploadUrlInput,
  ObjectMetadata,
  ObjectStorePort,
  PutObjectInput,
} from "@onlyboth/application";

export class ObjectStoreError extends Error {
  public override readonly name = "ObjectStoreError";

  public constructor(
    public readonly code:
      | "OBJECT_NOT_FOUND"
      | "OBJECT_ALREADY_EXISTS"
      | "OBJECT_TOO_LARGE"
      | "CHECKSUM_MISMATCH"
      | "STORE_UNAVAILABLE",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
