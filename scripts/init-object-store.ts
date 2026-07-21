import { S3ObjectStore } from "@onlyboth/storage";

const environment = process.env;
const store = new S3ObjectStore({
  endpoint: environment.OBJECT_STORE_ENDPOINT ?? "http://127.0.0.1:9000",
  region: environment.OBJECT_STORE_REGION ?? "us-east-1",
  bucket: environment.OBJECT_STORE_BUCKET ?? "onlyboth-private",
  accessKeyId: environment.OBJECT_STORE_ACCESS_KEY_ID ?? "onlyboth-local",
  secretAccessKey:
    environment.OBJECT_STORE_SECRET_ACCESS_KEY ?? "onlyboth-local-development-secret",
  forcePathStyle: true,
});

let lastError: unknown;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    await store.initializePrivateBucket(["http://127.0.0.1:3000", "http://localhost:3000"]);
    console.log(JSON.stringify({ outcome: "PRIVATE_OBJECT_BUCKET_READY" }));
    lastError = undefined;
    break;
  } catch (error: unknown) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (lastError !== undefined) throw lastError;
