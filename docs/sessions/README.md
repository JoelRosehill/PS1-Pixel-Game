# Session archive

Claude Code does **not** store chats in the project folder — they live in the user's home
directory (`~/.claude/projects/<path-slug>/`). These copies exist so the conversation
travels with the project.

| File | What it is |
|---|---|
| `session-transcript.md` | **Read this one.** Every message in order, with tool calls as one-liners. ~42 KB. |
| `session-2c6722ce-….jsonl` | The raw Claude Code transcript, including internal reasoning and 40 embedded screenshots. ~30 MB. |
| `memory/` | The project memory notes Claude keeps between sessions. |

Covers **Jobs 1–3** (2026-09-22 → 2026-09-24): the Smart-Pixel renderer, the movement
system, and the spellblade combat core.

## Reading order for a new session

The transcript is history, not instructions. For *current* state, prefer:

1. [`../HANDOFF.md`](../HANDOFF.md) — the distilled context, kept up to date each job
2. [`../ROADMAP.md`](../ROADMAP.md) — job plan, checklists, "notes for next job"
3. [`../GDD.md`](../GDD.md) — design pillars and measured numbers
4. `session-transcript.md` — only when you need the *why* behind a decision

## Restoring the memory notes on another machine

Copy `memory/*` to that machine's project memory folder so Claude loads it automatically:

```
~/.claude/projects/<slug>/memory/
```

`<slug>` is the project's absolute path with non-alphanumeric characters replaced by
dashes. On this machine it was `c--Users-a242490JR-Documents-pixel-game`. If the folder
lands somewhere else, the slug changes to match the new path.

## Resuming the actual chat session

Put the `.jsonl` in that same `~/.claude/projects/<slug>/` folder (keep its filename) and
`claude --resume` should list it. This depends on the Claude Code version matching closely
enough, so treat it as a bonus — `HANDOFF.md` plus the transcript is the reliable path.

## Refreshing this archive

The copies are a snapshot; later messages in the live session are not included. To update,
re-copy the `.jsonl` from `~/.claude/projects/<slug>/` and regenerate the digest.
