import type { CriticalChallenge } from "@onlyboth/contracts";

function bytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  return `${(value / 1_024).toFixed(value < 10_240 ? 1 : 0)} KB`;
}

export function CriticalChallengeView({
  challenge,
  compact = false,
}: {
  readonly challenge: CriticalChallenge;
  readonly compact?: boolean;
}) {
  return (
    <section className={`critical-challenge ${compact ? "challenge-compact" : ""}`}>
      <header className="challenge-heading">
        <div>
          <p className="section-kicker">Sealed Critical Challenge</p>
          <h2>{challenge.title}</h2>
          <p>{challenge.objective}</p>
        </div>
        <span>{challenge.parts.length} part manifest</span>
      </header>
      <div className="challenge-part-list">
        {challenge.parts.map((part, index) => (
          <article className={`challenge-part part-${part.kind.toLowerCase()}`} key={part.part_ref}>
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>{part.kind}</small>
                <h3>{part.title}</h3>
              </div>
            </header>
            <p>{part.instructions}</p>
            {part.kind === "TEXT" ? (
              <blockquote>{part.text_content}</blockquote>
            ) : part.asset === null ? null : (
              <div className="challenge-asset">
                {part.kind === "AUDIO" && part.asset.download_url !== null ? (
                  <audio controls preload="metadata" src={part.asset.download_url}>
                    Your browser cannot play this synthetic audio fixture.
                  </audio>
                ) : null}
                {part.kind === "IMAGE" && part.asset.download_url !== null ? (
                  <img src={part.asset.download_url} alt={part.asset.alt_text ?? part.title} />
                ) : null}
                <div className="challenge-asset-meta">
                  <strong>{part.asset.file_name}</strong>
                  <span>
                    {part.asset.content_type} · {bytes(part.asset.content_length)}
                  </span>
                  <code>{part.asset.sha256.slice(0, 24)}…</code>
                  {part.asset.download_url === null ? (
                    <span>Sealed source unavailable in this projection</span>
                  ) : part.kind === "FILE" ? (
                    <a href={part.asset.download_url} download>
                      Download sealed source file
                    </a>
                  ) : (
                    <a href={part.asset.download_url} target="_blank" rel="noreferrer">
                      Open source asset
                    </a>
                  )}
                </div>
                {part.asset.transcript_excerpt === null ? null : (
                  <details>
                    <summary>Accessible transcript excerpt</summary>
                    <p>{part.asset.transcript_excerpt}</p>
                  </details>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      <footer>
        <code>{challenge.challenge_ref}</code>
        <span>Ordered parts are sealed together; they are not separate interview questions.</span>
      </footer>
    </section>
  );
}
