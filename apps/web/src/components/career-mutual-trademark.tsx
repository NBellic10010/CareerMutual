export function CareerMutualTrademark({ className }: { readonly className?: string }) {
  const classes = ["career-mutual-trademark", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <span className="career-mutual-name">CareerMutual</span>
      <span className="career-mutual-hire-signal" aria-label="Hired">
        <svg aria-hidden="true" viewBox="0 0 18 18">
          <path d="M5.5 5V3.75c0-.7.55-1.25 1.25-1.25h4.5c.7 0 1.25.55 1.25 1.25V5" />
          <path d="M3.25 5h11.5c.7 0 1.25.55 1.25 1.25v7.5c0 .7-.55 1.25-1.25 1.25H3.25C2.55 15 2 14.45 2 13.75v-7.5C2 5.55 2.55 5 3.25 5Z" />
          <path className="career-mutual-hire-check" d="m6 10 2 2 4-4" />
        </svg>
        <span>Hired</span>
      </span>
    </span>
  );
}
