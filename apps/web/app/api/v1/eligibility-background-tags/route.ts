import {
  ELIGIBILITY_BACKGROUND_TAG_CATALOG,
  ELIGIBILITY_BACKGROUND_TAXONOMY_VERSION,
  EligibilityBackgroundTagCatalogSchema,
} from "@onlyboth/contracts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    EligibilityBackgroundTagCatalogSchema.parse({
      schema_version: "eligibility-background-tag-catalog@1",
      taxonomy_version: ELIGIBILITY_BACKGROUND_TAXONOMY_VERSION,
      tags: ELIGIBILITY_BACKGROUND_TAG_CATALOG,
    }),
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
