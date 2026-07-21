"use client";

import { useEffect, useRef, useState } from "react";

import type { ColdOpenProjectionModel } from "../lib/demo-view-model";
import {
  COLD_OPEN_DURATION_SECONDS,
  COLD_OPEN_SCENES,
  formatColdOpenTime,
  getColdOpenProgress,
  getColdOpenScene,
  type ColdOpenSceneId,
} from "../lib/demo-timeline";

type ColdOpenStoryboardProps = Readonly<{
  projection: ColdOpenProjectionModel;
}>;

export function ColdOpenStoryboard({ projection }: ColdOpenStoryboardProps) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playbackOrigin = useRef(0);
  const scene = getColdOpenScene(elapsed);
  const progress = getColdOpenProgress(elapsed);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let animationFrame = 0;

    const tick = (now: number) => {
      const nextElapsed = Math.min(
        COLD_OPEN_DURATION_SECONDS,
        (now - playbackOrigin.current) / 1000,
      );
      setElapsed(nextElapsed);

      if (nextElapsed >= COLD_OPEN_DURATION_SECONDS) {
        setPlaying(false);
        return;
      }

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [playing]);

  const startPlayback = () => {
    const nextElapsed = elapsed >= COLD_OPEN_DURATION_SECONDS ? 0 : elapsed;
    setElapsed(nextElapsed);
    playbackOrigin.current = performance.now() - nextElapsed * 1000;
    setPlaying(true);
  };

  const resetPlayback = () => {
    setPlaying(false);
    setElapsed(0);
  };

  const jumpToScene = (start: number) => {
    setPlaying(false);
    setElapsed(start);
  };

  return (
    <section className="storyboard" aria-labelledby="storyboard-heading">
      <header className="storyboard-header">
        <div>
          <p className="eyebrow">Outcome-first cold open</p>
          <h1 id="storyboard-heading">A 30-second prediction reversal</h1>
        </div>
        <div className="storyboard-clock" aria-label="Storyboard elapsed time">
          <span>{formatColdOpenTime(elapsed)}</span>
          <small>/ 0:30</small>
        </div>
      </header>

      <div className="storyboard-stage" data-scene={scene.id} aria-live="polite">
        <div className="stage-meta">
          <span>{scene.label}</span>
          <strong>
            {formatColdOpenTime(scene.start)}–{formatColdOpenTime(scene.end)}
          </strong>
        </div>
        <h2>{scene.title}</h2>
        <SceneBody sceneId={scene.id} projection={projection} elapsed={elapsed} />
      </div>

      <div className="playback-controls">
        <button
          className="primary-control"
          onClick={playing ? () => setPlaying(false) : startPlayback}
          type="button"
        >
          {playing
            ? "Pause"
            : elapsed >= COLD_OPEN_DURATION_SECONDS
              ? "Play again"
              : elapsed > 0
                ? "Continue"
                : "Start cold open"}
        </button>
        <button className="secondary-control" onClick={resetPlayback} type="button">
          Reset
        </button>
        <span className="offline-note">Offline · no external requests</span>
      </div>

      <div className="timeline-track" aria-label="Cold-open scenes">
        <div className="timeline-progress" style={{ width: `${progress}%` }} />
        {COLD_OPEN_SCENES.map((cue) => (
          <button
            aria-label={`Jump to ${cue.label} at ${formatColdOpenTime(cue.start)}`}
            className={cue.id === scene.id ? "active" : undefined}
            key={cue.id}
            onClick={() => jumpToScene(cue.start)}
            style={{ left: `${getColdOpenProgress(cue.start)}%` }}
            title={cue.label}
            type="button"
          >
            <span>{formatColdOpenTime(cue.start)}</span>
          </button>
        ))}
      </div>
      <p className="storyboard-disclosure">
        Storyboard clock only. It has no authority over Review Window state. Day 2 commands will
        drive the same role-specific UI through persisted events.
      </p>
    </section>
  );
}

type SceneBodyProps = Readonly<{
  sceneId: ColdOpenSceneId;
  projection: ColdOpenProjectionModel;
  elapsed: number;
}>;

function SceneBody({ sceneId, projection, elapsed }: SceneBodyProps) {
  switch (sceneId) {
    case "counterfactual":
      return (
        <div>
          <div className="judge-overlay-label">
            COUNTERFACTUAL — conventional résumé ranking
            <small>Judge overlay only · never shown to Sarah</small>
          </div>
          <div className="stage-card-grid">
            {projection.counterfactualCandidates.map((candidate) => (
              <article className="profile-rank-card" key={candidate.counterfactualAlias}>
                <span>{candidate.counterfactualAlias}</span>
                <strong>{candidate.profileSignal}</strong>
                <div>
                  Traditional rank <b>{candidate.traditionalRank}</b>
                </div>
                <small>→ {candidate.traditionalOutcome}</small>
              </article>
            ))}
          </div>
        </div>
      );

    case "veil":
      return (
        <div>
          <div className="sarah-view-label">Sarah&apos;s first-round projection</div>
          <div className="stage-card-grid">
            {projection.veiledCandidates.map((candidate) => (
              <article className="veiled-stage-card" key={candidate.alias}>
                <span>{candidate.allocation}</span>
                <strong>{candidate.alias}</strong>
                <small>{candidate.eligibility} · hard qualifications retained</small>
                <div>Pedigree labels sealed before reviewer access</div>
              </article>
            ))}
          </div>
        </div>
      );

    case "attention": {
      const reservationShown = elapsed >= 15;
      return (
        <div className="attention-sequence">
          <div className={reservationShown ? "attention-step complete" : "attention-step"}>
            <span>Before</span>
            <strong>Candidate work locked</strong>
            <small>No named review, no costly proof</small>
          </div>
          <div className="attention-arrow" aria-hidden="true">
            →
          </div>
          <div className={reservationShown ? "attention-step active" : "attention-step"}>
            <span>Reservation</span>
            <strong>
              {reservationShown ? `${projection.reviewer} reserved 2 reviews` : "Pending"}
            </strong>
            <small>{projection.checkpointSla}</small>
          </div>
          <div className="attention-arrow" aria-hidden="true">
            →
          </div>
          <div className={reservationShown ? "attention-step unlocked" : "attention-step"}>
            <span>After</span>
            <strong>{reservationShown ? "Proof windows unlocked" : "Still locked"}</strong>
            <small>Next candidate access remains backpressured</small>
          </div>
        </div>
      );
    }

    case "proof":
      return (
        <div>
          <p className="recorded-input-note">
            Accelerated playback of recorded candidate work — not happening live
          </p>
          <div className="stage-card-grid">
            {projection.counterfactualCandidates.map((candidate) => (
              <article className="proof-result-card" key={candidate.veiledAlias}>
                <span>{candidate.veiledAlias}</span>
                <strong>Sarah authorized: {candidate.challenge}</strong>
                <div className="test-result">
                  <b>{candidate.verification}</b>
                  <small>Common Verifier</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      );

    case "reversal":
      return (
        <div className="reversal-stage">
          <div className="reversal-comparison">
            {projection.counterfactualCandidates.map((candidate) => (
              <article key={candidate.counterfactualAlias}>
                <span>{candidate.profileSignal}</span>
                <strong>{candidate.disagreement}</strong>
                <small>
                  {candidate.counterfactualAlias} → {candidate.veiledAlias} →{" "}
                  {candidate.verification} tests
                </small>
              </article>
            ))}
          </div>
          <blockquote>{projection.finalLine}</blockquote>
        </div>
      );
  }
}
