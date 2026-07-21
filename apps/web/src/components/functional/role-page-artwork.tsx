import type { CSSProperties } from "react";

export type RolePageArtworkSurface = "CANDIDATE_ROLE" | "RECRUITER_OPERATIONS";

export const ROLE_PAGE_ARTWORK = {
  CANDIDATE_ROLE: {
    src: "/brand/candidate-roll-up-sleeves-v1.webp",
    label: "Candidate rolling up the sleeve of her coral shirt before starting the challenge",
  },
  RECRUITER_OPERATIONS: {
    src: "/brand/recruiter-glasses-review-v1.webp",
    label: "Recruiter eyeglasses resting over anonymous work evidence",
  },
} as const satisfies Record<
  RolePageArtworkSurface,
  { readonly src: string; readonly label: string }
>;

export function RolePageArtwork({ surface }: { readonly surface: RolePageArtworkSurface }) {
  const artwork = ROLE_PAGE_ARTWORK[surface];
  return (
    <div
      aria-hidden="true"
      className={`role-page-artwork role-page-artwork-${surface.toLowerCase().replaceAll("_", "-")}`}
      data-role-page-artwork={surface.toLowerCase().replaceAll("_", "-")}
      data-role-page-artwork-label={artwork.label}
      style={{ backgroundImage: `url("${artwork.src}")` } as CSSProperties}
    />
  );
}
