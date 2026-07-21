import type { CSSProperties } from "react";

export type RoleHomeArtworkRole = "CANDIDATE" | "EMPLOYER";

export const ROLE_HOME_ARTWORK = {
  CANDIDATE: {
    src: "/brand/candidate-intent-hero.webp",
    label: "Candidate moving toward an opportunity signal with a sealed work proof",
  },
  EMPLOYER: {
    src: "/brand/employer-attention-hero.webp",
    label: "Recruiter reviewing anonymous work evidence with committed attention",
  },
} as const satisfies Record<RoleHomeArtworkRole, { readonly src: string; readonly label: string }>;

export function RoleHomeArtwork({ role }: { readonly role: RoleHomeArtworkRole }) {
  const artwork = ROLE_HOME_ARTWORK[role];
  return (
    <div
      aria-hidden="true"
      className="role-home-artwork"
      data-role-artwork={role.toLowerCase()}
      data-role-artwork-label={artwork.label}
      style={{ backgroundImage: `url("${artwork.src}")` } as CSSProperties}
    />
  );
}
