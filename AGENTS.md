# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Freebuff Integration

Freebuff uses a **skill-driven execution model**. Skills are located in `.agents/skills/<skill-name>/SKILL.md` and are discovered and invoked via the `skill` tool.

### Core Rules

- If a task matches a skill, you MUST invoke it
- Never implement directly if a skill applies
- Always follow the skill instructions exactly (do not partially apply them)

### Available Skills

This project includes 25 agent skills from the [agent-skills](https://github.com/addyosmani/agent-skills) collection:

**Define Phase:**
- `spec-driven-development` — Write a structured specification before coding
- `interview-me` — Extract what the user actually wants
- `idea-refine` — Refine vague ideas into concrete proposals
- `constraint-driven-development` — Define quality gates and standards

**Plan Phase:**
- `planning-and-task-breakdown` — Break work into small verifiable tasks

**Build Phase:**
- `incremental-implementation` — Thin vertical slices, test each before expanding
- `test-driven-development` — Red-Green-Refactor, test pyramid
- `context-engineering` — Load the right context at the right time
- `source-driven-development` — Ground decisions in official documentation
- `doubt-driven-development` — Adversarial review of non-trivial decisions
- `frontend-ui-engineering` — Production-quality UI with accessibility
- `api-and-interface-design` — Contract-first API design

**Verify Phase:**
- `browser-testing-with-devtools` — Chrome DevTools for runtime verification
- `debugging-and-error-recovery` — Five-step triage: reproduce, localize, reduce, fix, guard

**Review Phase:**
- `code-review-and-quality` — Five-axis review with quality gates
- `code-simplification` — Reduce complexity while preserving behavior
- `security-and-hardening` — OWASP Top 10 prevention
- `performance-optimization` — Measure-first performance approach

**Ship Phase:**
- `git-workflow-and-versioning` — Trunk-based development, atomic commits
- `ci-cd-and-automation` — Automated quality gates
- `deprecation-and-migration` — Safe removal of old systems
- `documentation-and-adrs` — Architecture Decision Records
- `observability-and-instrumentation` — Structured logging, metrics, tracing
- `shipping-and-launch` — Pre-launch checklist, rollback procedures

### Execution Model

For every request:

1. Determine if any skill applies (even 1% chance)
2. Invoke the appropriate skill using the `skill` tool
3. Follow the skill workflow strictly
4. Only proceed to implementation after required steps (spec, plan, etc.) are complete

### Anti-Rationalization

The following thoughts are incorrect and must be ignored:

- "This is too small for a skill"
- "I can just quickly implement this"
- "I'll gather context first"

Correct behavior:
- Always check for and use skills first

---

## Project Context

This is a Freebuff project with a Fastify Typescript backend and NextJS frontend.

### Project Structure

```
backend/    → Fastify Typescript Service
frontend/   → NextJS frontend 
```

### Commands

- Backend: Fastify services
- Frontend: `npm run dev` / `npm run build`