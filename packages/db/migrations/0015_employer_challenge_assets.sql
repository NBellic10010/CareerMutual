CREATE TABLE employer_challenge_assets (
  asset_ref text PRIMARY KEY,
  owner_ref text NOT NULL,
  draft_ref text REFERENCES job_post_drafts(draft_ref),
  opportunity_ref text REFERENCES opportunities(id),
  part_kind text NOT NULL CHECK (part_kind IN ('IMAGE', 'AUDIO', 'FILE')),
  file_name text NOT NULL CHECK (
    char_length(file_name) BETWEEN 1 AND 240
    AND file_name !~ '[/\\]'
    AND file_name !~ '[[:cntrl:]]'
  ),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL,
  content_length integer NOT NULL CHECK (
    content_length > 0 AND content_length <= 20971520
  ),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^sha256:[a-f0-9]{64}$'),
  alt_text text CHECK (alt_text IS NULL OR char_length(alt_text) BETWEEN 3 AND 500),
  transcript_excerpt text CHECK (
    transcript_excerpt IS NULL OR char_length(transcript_excerpt) BETWEEN 3 AND 2000
  ),
  state text NOT NULL CHECK (state IN ('UPLOAD_ISSUED', 'VERIFIED', 'SEALED', 'FAILED')),
  verified_at timestamptz,
  sealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (part_kind = 'IMAGE' AND content_type LIKE 'image/%'
      AND alt_text IS NOT NULL AND transcript_excerpt IS NULL)
    OR (part_kind = 'AUDIO' AND content_type LIKE 'audio/%'
      AND alt_text IS NULL AND transcript_excerpt IS NOT NULL)
    OR (part_kind = 'FILE' AND content_type NOT LIKE 'image/%'
      AND content_type NOT LIKE 'audio/%' AND content_type NOT LIKE 'video/%'
      AND alt_text IS NULL AND transcript_excerpt IS NULL)
  ),
  CHECK (
    (state = 'UPLOAD_ISSUED' AND sha256 IS NULL AND verified_at IS NULL AND sealed_at IS NULL
      AND draft_ref IS NULL AND opportunity_ref IS NULL)
    OR (state = 'VERIFIED' AND sha256 IS NOT NULL AND verified_at IS NOT NULL
      AND sealed_at IS NULL AND opportunity_ref IS NULL)
    OR (state = 'SEALED' AND sha256 IS NOT NULL AND verified_at IS NOT NULL
      AND sealed_at IS NOT NULL AND draft_ref IS NOT NULL AND opportunity_ref IS NOT NULL)
    OR state = 'FAILED'
  )
);

CREATE INDEX employer_challenge_assets_owner_state_idx
  ON employer_challenge_assets(owner_ref, state, created_at, asset_ref);

CREATE INDEX employer_challenge_assets_draft_idx
  ON employer_challenge_assets(draft_ref, asset_ref)
  WHERE draft_ref IS NOT NULL;

CREATE INDEX employer_challenge_assets_opportunity_idx
  ON employer_challenge_assets(opportunity_ref, asset_ref)
  WHERE opportunity_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_sealed_employer_challenge_asset_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'SEALED' THEN
    RAISE EXCEPTION 'sealed employer Challenge Assets are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employer_challenge_assets_sealed_immutable
BEFORE UPDATE OR DELETE ON employer_challenge_assets
FOR EACH ROW EXECUTE FUNCTION reject_sealed_employer_challenge_asset_mutation();
