DROP TRIGGER IF EXISTS employer_challenge_assets_sealed_immutable
  ON employer_challenge_assets;
DROP FUNCTION IF EXISTS reject_sealed_employer_challenge_asset_mutation();
DROP TABLE IF EXISTS employer_challenge_assets;
