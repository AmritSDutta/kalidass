# AGENTS.md — Amrit Journal

Canonical guide and hard operational invariants for AI coding agents in this repository.

---

## 1. Operational Invariants & Hard Rules

- **Token Efficiency**: Work in a strictly token-efficient manner. Keep responses concise, direct, and technical without conversational filler or repetition.
- **Git Restrictions**: `git status` (and read-only `git diff` / `git log` when strictly necessary) only. Never execute `git commit`, `git push`, `git stash`, or destructive commands (`git reset --hard`, `git checkout .`, `git clean -f`).
- **No Subagents**: Do not invoke or spawn subagents (`invoke_subagent`, `manage_subagents`) unless explicitly instructed by the user.
- **Hermetic Testing**: All tests, verification steps, and mocks must be hermetic with zero unmocked network or filesystem side-effects.

---

## 2. Documentation Hierarchy & References

- **Commands, Workflows & Gotchas**: Refer to [`CLAUDE.md`](./CLAUDE.md) for quick-reference toolchain commands, package layouts, and runtime invariants.
- **Architecture, Setup & Deployment**: Refer to [`README.md`](./README.md) for full stack architecture, local execution (frontend + worker), Upstash Blob configuration, and Cloudflare deployment runbooks.
- **Agent Server-to-Server Publishing**: Refer to [`AI_AGENT_PUBLISH.md`](./AI_AGENT_PUBLISH.md) for automated `POST /api/articles` payload specifications.
- **Zero Trust Deployment**: Refer to [`ZERO_TRUST_DEPLOY.md`](./ZERO_TRUST_DEPLOY.md) for Cloudflare Access and Pages Function proxy details.
