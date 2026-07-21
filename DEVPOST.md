# Career Mutual

> Fund the review. Test the work. Reveal the résumé only after the evidence earns it.

## Inspiration

Hiring often makes its first expensive decision using the signals that are easiest to polish. A candidate with a famous school, a recognizable employer, warm referrals, and a talent for self-promotion can collect interview invitations almost effortlessly. Another candidate may have an ordinary background and much stronger role-specific ability, yet never get the interview in which that ability could become visible.

The first candidate is a résumé false positive. The second is a résumé false negative. The painful part is not merely that recruiters sometimes make the wrong prediction. It is that the person who is denied an interview is also denied the chance to produce better evidence.

We started Career Mutual with a question: what if we changed the order?

Instead of letting a résumé decide who deserves a test, a named recruiter first commits a reusable unit of review attention to a sealed, role-specific challenge. A candidate starts working only after that review obligation exists. The recruiter sees the anonymous answer before seeing the résumé, and every accepted application must end with an evidence-linked human review receipt.

This idea became much more ambitious once Codex and GPT-5.6 joined the process. Codex helped us keep asking whether each product decision preserved the causal promise. GPT-5.6 showed us that AI could do far more than summarize a résumé: it could connect private work evidence to a relevant opportunity and later analyze a frozen answer against sealed criteria, while remaining outside the final hiring decision.

## What it does

Career Mutual is a mutual-intent, blind-answer-first hiring system.

A recruiter publishes a JobPost with hard requirements, a sealed Critical Challenge, review criteria, an AI disclosure policy, and a limited number of reusable review slots. Those slots represent real attention. If no slot is backed by a named reviewer and an SLA, the platform does not ask a candidate to perform application work.

On the candidate side, GPT-5.6 can connect references from an optional private Evidence Passport to recruiter-sealed eligibility tags. This can surface a role that résumé-first discovery might have buried. The result stays candidate-only: GPT-5.6 cannot score people, rank them, alter the public queue, spend a review slot, or expose the Passport to the recruiter. Legal, language, and time-zone requirements remain deterministic checks.

Once a backed slot reaches a candidate, the candidate sees the reviewer, time limit, review policy, credit cost, process policy, and conditional résumé consent before accepting. They then answer the exact sealed challenge in a server-timed workspace. Rich text, voice, files, and a disclosed GPT-5.6 assistant can be used where the JobPost permits them. The answer is ultimately sealed as one immutable submission.

After submission, GPT-5.6 becomes an Employer Evidence Analyst. It reads one anonymous frozen answer and the sealed criteria, then produces source-linked findings: a bounded `GOOD_ANSWER` or `BAD_ANSWER` verdict, language analysis, criterion coverage, contradictions, remaining unknowns, and questions the reviewer may still need to ask. If the candidate consented to answer-plus-process review, GPT-5.6 can also organize disclosed, deterministic process evidence with its rules and caveats. It never infers personality, intent, cheating, or overall candidate quality.

The named recruiter still makes the decision. A positive human review atomically authorizes the pre-consented résumé snapshot; any other decision keeps the résumé sealed. The completed review releases the slot to the next person waiting. In other words, GPT-5.6 makes relevant work discoverable and makes complex answer evidence reviewable, but humans remain accountable for what happens next.

## How we built it

Codex was present from the first product argument, not just the first line of code. We used it to turn an uncomfortable observation about hiring into explicit product doctrine: no funded review, no candidate work; no work evidence, no résumé reveal; no completed human review, no reuse of the slot. Codex helped us challenge earlier versions of the idea whenever they accidentally reintroduced profile-first selection under a new name.

From there, Codex worked with us across the whole build. It helped shape the domain model, privacy-separated Candidate and Recruiter projections, PostgreSQL transactions, migrations, API contracts, queue workers, UI states, synthetic data, test strategy, evaluation harnesses, technical diagrams, documentation, and the final browser-driven demo. When a flow looked right but violated the causal promise underneath, Codex helped us trace it back to the command or data boundary that needed to change. When the product was correct but the demo was unclear, it helped us rewrite the story and refine the interface.

The application is a TypeScript monorepo with a Next.js web surface, a separate asynchronous Worker, PostgreSQL 16, and private S3-compatible object storage. Versioned contracts sit between the domain, application, persistence, UI, and AI adapters. Candidate and Recruiter views are deliberately different projections of the same state, so sensitive data cannot leak merely because a component forgot to hide it.

GPT-5.6 runs only in the Worker through the OpenAI Responses API. The API key never reaches the browser. Calls use strict Structured Outputs, `store: false`, no tools, pinned prompt and contract versions, and deterministic validation of every referenced source. Model output is treated as a typed proposal, never as a business-state transition. PostgreSQL transactions—not model prose—control queue order, credits, review obligations, immutable submissions, human receipts, slot settlement, and résumé reveal.

We use different GPT-5.6 family members for different bounded jobs: candidate discovery, Evidence Passport eligibility matching, the disclosed candidate assistant, and post-answer employer analysis. That separation let us use the model's intelligence where it was genuinely valuable without quietly turning it into an autonomous recruiter.

## Challenges we ran into

The hardest challenge was making “this answer will be reviewed” a system property instead of reassuring copy. We had to model recruiter attention as a transactional, reusable obligation with backpressure, versions, deadlines, breach handling, and atomic settlement. A page view or an AI summary could never count as a review.

The second challenge was giving GPT-5.6 a large role without giving it illegitimate authority. Matching is useful, but candidate ranking would recreate the original problem. Answer analysis is useful, but advancement advice would let the model become the hidden decision-maker. We repeatedly narrowed inputs, outputs, schemas, and permissions until GPT-5.6 could do the hard cognitive work—connecting and analyzing evidence—without being able to allocate attention or decide a person's future.

Strict AI output was another real engineering problem. A response could be insightful and still be unusable because a citation was not a literal source span, a prohibited ranking phrase appeared, or the output missed the schema. We built source validators, authority gates, prompt-injection tests, process-invariance checks, and visible fail-closed states. A failed LIVE run never silently becomes a synthetic success.

Privacy also had to survive the entire stack. The résumé, Evidence Passport, intermediate drafts, voice recordings, assistant trace, and recruiter analysis do not all belong in the same view. We learned to treat privacy as projection design, transaction design, and storage design—not as a late UI filter.

Finally, we had to make the demo honest. The positive candidate needed a real `GOOD_ANSWER` analysis, an independent human advance, and an authorized résumé reveal. The counterexample needed real poor answer evidence, disclosed behavior records, a `BAD_ANSWER` analysis, an independent no-further-proof decision, and zero résumé reveals. Codex helped us debug that journey end to end, including the Puppeteer recording, narration, exact subtitles, retained database checks, and a failure path that never pretended to pass.

## Accomplishments that we're proud of

- We built the complete causal path from candidate-only GPT-5.6 discovery to public Interest, funded attention, versioned consent, immutable answer, anonymous GPT-5.6 analysis, mandatory human review, slot recycling, and conditional résumé reveal.
- Our demo proves both sides of the thesis. Strong work from a modestly packaged candidate earns a `GOOD_ANSWER`, an independent `ADVANCE_ELIGIBLE`, and one authorized résumé reveal. A polished but weak response earns a source-linked `BAD_ANSWER`; the recruiter independently records `NO_FURTHER_PROOF`, and the résumé remains sealed.
- The GPT-5.6 Employer Evidence Analyst passed a 30-case LIVE evaluation with 30/30 bounded verdicts validated, all required language dimensions present, process-invariant judgments, and a criterion macro-F1 of 1.0 on that evaluation set.
- The product contains a synthetic corpus of 27 JobPosts, seven independent candidate identities, multimodal Critical Challenges, Candidate Evidence Passports, a six-candidate Match Lab, and real persisted Candidate and Recruiter journeys rather than a client-side demo simulation.
- We made AI provenance visible. `LIVE`, `RECORDED_LIVE`, and `SYNTHETIC_PRELOADED` have different meanings, and the product never swaps one for another behind the user's back.
- Codex helped us turn a large product thesis into a coherent working system: architecture, migrations, commands, tests, UX, evals, documentation, browser automation, and the final narrative all came from the same continuously examined set of principles.

## What we learned

We learned that the most important hiring bias may not be a bad score. It may be the order in which information is revealed. Once prestige enters the room, later evidence is interpreted through it. Delaying the résumé is therefore not cosmetic anonymity; it changes what can cause the first decision.

We also learned that AI becomes more impressive, not less, when its boundaries are precise. GPT-5.6 did not need permission to rank an entire candidate pool to be transformative. Given well-formed evidence and a sealed contract, it could find connections a keyword filter would miss, explain why they mattered, identify exact strengths and failures in an answer, preserve unknowns, and prepare a much better surface for human judgment.

Codex changed how we built. It felt less like autocomplete and more like keeping a technically fluent product partner in the room for every decision. It could follow a principle from a paragraph of product doctrine into a database invariant, a React state, a security test, an eval, and finally a line in the demo narration. We still made the judgments, but we were able to examine and implement them at a speed and level of completeness that would otherwise have been difficult to imagine during a Build Week.

We learned to trust failure when it is honest. A schema mismatch should become `NEEDS_HUMAN`, not a fabricated AI result. A model outage should not reject a candidate. A browser-focus signal should describe an observation and caveat, not accuse someone of cheating. These limitations made the product more credible and, surprisingly, made GPT-5.6's legitimate contribution feel even larger.

## What's next for Career Mutual

The next step is to move from a synthetic Build Week environment into carefully bounded pilots. That means production identity, organization controls, real reviewer SLAs, audit and deletion workflows, accessibility testing, adversarial privacy review, and a much larger calibration program across roles and candidate populations.

We also want to complete the deeper evidence stage: production code sandboxes, richer multimodal work, cohort-level Direct and transparent Explore allocation, and a second funded interaction for candidates whose anonymous work earns it. GPT-5.6 can help recommend bounded challenge templates and organize post-answer evidence, while Codex can continue helping us evolve the product, implementation, tests, and operational playbooks as one system.

Most importantly, we want to learn from real candidates and recruiters whether this exchange feels genuinely more mutual: less unpaid work sent into a black hole, less résumé theater, more accountable attention, and more chances for quiet ability to become visible.

We began with a sharp contrast between one person who could sell the labels and another who could do the work. We finished with a functioning product that changes which of those facts gets to speak first. The team is astonished by what GPT-5.6 can do. We are just as astonished that, with Codex and GPT-5.6 participating beside us through product decisions, development, debugging, evaluation, and the demo itself, we were able to complete this great idea together.
