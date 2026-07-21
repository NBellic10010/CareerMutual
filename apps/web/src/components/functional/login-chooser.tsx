"use client";

import type { SyntheticDemoActor } from "@onlyboth/demo-fixtures";
import { useState } from "react";

import { CareerMutualTrademark } from "../career-mutual-trademark";
import { LoginRolePortraits } from "./login-role-portraits";

export function LoginChooser({ actors }: { readonly actors: readonly SyntheticDemoActor[] }) {
  const [actorRef, setActorRef] = useState(actors[0]?.actor_ref ?? "");
  const [error, setError] = useState<string | null>(null);
  const selected = actors.find(({ actor_ref }) => actor_ref === actorRef) ?? null;

  async function signIn() {
    if (selected === null) return;
    setError(null);
    const response = await fetch("/api/v1/dev/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_ref: selected.actor_ref }),
    });
    if (!response.ok) {
      setError("Temporary sign-in is unavailable. DEMO_MODE must be enabled.");
      return;
    }
    window.location.assign(selected.role === "CANDIDATE" ? "/candidate" : "/employer");
  }

  return (
    <main className="login-stage">
      <LoginRolePortraits />
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow login-brandline">
          <CareerMutualTrademark />
          <span>/ temporary identity</span>
        </p>
        <h1 id="login-title">Let performance talk first!</h1>
        <p>
          Select a synthetic actor. Each Candidate receives a distinct signed Session, Evidence
          Passport, Credit account, and immutable résumé; production identity remains out of scope.
        </p>
        <div className="actor-picker">
          <label htmlFor="demo-actor">
            <span>Start as</span>
            <select
              aria-label="Start as"
              id="demo-actor"
              value={actorRef}
              onChange={(event) => setActorRef(event.target.value)}
            >
              <optgroup label="Candidates">
                {actors
                  .filter(({ role }) => role === "CANDIDATE")
                  .map((actor) => (
                    <option value={actor.actor_ref} key={actor.actor_ref}>
                      {actor.start_label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Demand side">
                {actors
                  .filter(({ role }) => role === "EMPLOYER")
                  .map((actor) => (
                    <option value={actor.actor_ref} key={actor.actor_ref}>
                      {actor.start_label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <div className="actor-preview" aria-live="polite">
            <span>{selected?.role === "EMPLOYER" ? "Demand side" : "Candidate session"}</span>
            <strong>{selected?.display_name}</strong>
            <small>{selected?.descriptor}</small>
          </div>
          <button type="button" className="primary-button" onClick={() => void signIn()}>
            Start as {selected?.display_name ?? "selected actor"}
          </button>
        </div>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <p className="synthetic-note">
          Demo operator only · identity choices never enter the Recruiter&apos;s pre-review
          projection
        </p>
      </section>
    </main>
  );
}
