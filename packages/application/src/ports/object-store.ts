export interface ObjectMetadata {
  readonly contentType: string;
  readonly contentLength: number;
  readonly checksumSha256: string | null;
}

export interface CreateUploadUrlInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
}

export interface PutObjectInput {
  readonly objectKey: string;
  readonly contentType: string;
  readonly body: Uint8Array;
  readonly checksumSha256?: string;
}

export interface ObjectStorePort {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  putObject(input: PutObjectInput): Promise<ObjectMetadata>;
  headObject(objectKey: string): Promise<ObjectMetadata | null>;
  getObject(objectKey: string): Promise<Uint8Array>;
  deleteObject(objectKey: string): Promise<void>;
}
