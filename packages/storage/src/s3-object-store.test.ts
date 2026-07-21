import { describe, expect, it } from "vitest";

import { resolveObjectStoreAllowedOrigins, resolveS3ForcePathStyle } from "./s3-object-store";

describe("S3 deployment configuration", () => {
  it("uses path-style URLs for local MinIO unless explicitly disabled", () => {
    expect(resolveS3ForcePathStyle(undefined)).toBe(true);
    expect(resolveS3ForcePathStyle("true")).toBe(true);
    expect(resolveS3ForcePathStyle("false")).toBe(false);
    expect(() => resolveS3ForcePathStyle("sometimes")).toThrow(/OBJECT_STORE_FORCE_PATH_STYLE/u);
  });

  it("normalizes and deduplicates the explicit browser-upload origins", () => {
    expect(
      resolveObjectStoreAllowedOrigins(
        "https://careermutual.example, https://careermutual.example,https://preview.example",
      ),
    ).toEqual(["https://careermutual.example", "https://preview.example"]);
    expect(resolveObjectStoreAllowedOrigins("")).toEqual([]);
    expect(resolveObjectStoreAllowedOrigins(undefined)).toContain("http://localhost:3000");
  });
});
