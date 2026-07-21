import type { CSSProperties } from "react";

export const LOGIN_ROLE_PORTRAITS = {
  CANDIDATE: {
    src: "/brand/login-candidate-performance-v2.webp",
    label: "Right-facing student Candidate writing on a whiteboard in coral-red comic ink",
  },
  RECRUITER: {
    src: "/brand/login-recruiter-review-v2.webp",
    label: "Left-facing Recruiter considering the Candidate's work in teal comic ink",
  },
} as const;

export function LoginRolePortraits() {
  return (
    <div aria-hidden="true" className="login-role-portraits">
      {Object.entries(LOGIN_ROLE_PORTRAITS).map(([role, portrait]) => (
        <div
          className={`login-role-portrait login-role-portrait-${role.toLowerCase()}`}
          data-login-role={role.toLowerCase()}
          data-login-role-label={portrait.label}
          key={role}
          style={{ backgroundImage: `url("${portrait.src}")` } as CSSProperties}
        />
      ))}
    </div>
  );
}
