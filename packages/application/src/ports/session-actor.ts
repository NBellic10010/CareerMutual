export interface SessionActor {
  readonly role: "CANDIDATE" | "EMPLOYER";
  readonly actorId: string;
  readonly csrfToken: string;
}

/** Replaceable identity boundary. Production composition must supply a real IdP adapter. */
export interface SessionActorPort<TContext> {
  resolve(context: TContext): Promise<SessionActor | null>;
}
