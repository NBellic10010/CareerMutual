import { createHash, randomUUID } from "node:crypto";

import { S3ObjectStore } from "../../packages/storage/src/index";
import type { ObjectStoreError } from "../../packages/storage/src/object-store";
import { describe, expect, it } from "vitest";

const endpoint = process.env.OBJECT_STORE_ENDPOINT;
const describeMinio = endpoint === undefined ? describe.skip : describe;

describeMinio("private MinIO adapter", () => {
  it("supports checked server writes and short-lived presigned private object access", async () => {
    const store = new S3ObjectStore({
      endpoint: endpoint!,
      region: process.env.OBJECT_STORE_REGION ?? "us-east-1",
      bucket: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
      accessKeyId: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
      secretAccessKey:
        process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
      forcePathStyle: true,
    });
    // Local MinIO receives CORS through MINIO_API_CORS_ALLOW_ORIGIN because its
    // S3-compatible API does not implement PutBucketCors.
    await store.initializePrivateBucket([]);
    const objectKey = `integration/${randomUUID()}.txt`;
    const body = new TextEncoder().encode("OnlyBoth private Artifact");
    const checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    try {
      const written = await store.putObject({
        objectKey,
        contentType: "text/plain",
        body,
        checksumSha256: checksum,
      });
      expect(written).toEqual({
        contentType: "text/plain",
        contentLength: body.byteLength,
        checksumSha256: checksum,
      });
      expect(await store.headObject(objectKey)).toMatchObject({
        contentType: "text/plain",
        contentLength: body.byteLength,
      });
      expect(new TextDecoder().decode(await store.getObject(objectKey))).toBe(
        "OnlyBoth private Artifact",
      );
      await expect(
        store.putObject({
          objectKey,
          contentType: "text/plain",
          body,
          checksumSha256: checksum,
        }),
      ).rejects.toMatchObject({
        code: "OBJECT_ALREADY_EXISTS",
      } satisfies Partial<ObjectStoreError>);
      const downloadUrl = await store.createDownloadUrl(objectKey, 30);
      expect(downloadUrl).toContain("X-Amz-Expires=30");
      const response = await fetch(downloadUrl);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("OnlyBoth private Artifact");
    } finally {
      await store.deleteObject(objectKey);
    }
    expect(await store.headObject(objectKey)).toBeNull();
  });

  it("makes a presigned upload key write-once", async () => {
    const store = new S3ObjectStore({
      endpoint: endpoint!,
      region: process.env.OBJECT_STORE_REGION ?? "us-east-1",
      bucket: process.env.OBJECT_STORE_BUCKET ?? "onlyboth-private",
      accessKeyId: process.env.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
      secretAccessKey:
        process.env.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
      forcePathStyle: true,
    });
    const objectKey = `integration/${randomUUID()}.webm`;
    const body = new TextEncoder().encode("one immutable upload");
    try {
      const url = await store.createUploadUrl({
        objectKey,
        contentType: "audio/webm",
        contentLength: body.byteLength,
        expiresInSeconds: 30,
      });
      const first = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm", "If-None-Match": "*" },
        body,
      });
      expect(first.status).toBe(200);
      const second = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "audio/webm", "If-None-Match": "*" },
        body,
      });
      expect([409, 412]).toContain(second.status);
    } finally {
      await store.deleteObject(objectKey);
    }
  });
});
