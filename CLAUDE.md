# CLAUDE.md

@AGENTS.md

`AGENTS.md` is canonical — it has the commands, the 12 hard constraints, the session ritual,
and the `docs/agent/` topic map. Read a topic doc only when the task touches that subsystem.

Claude Code specifics:

- Topic docs are not auto-loaded — open them from `docs/agent/` when relevant (see the map in
  `AGENTS.md`).
- If a rule must be enforced every time (not just advised), that's a hook or permission in
  `.claude/settings.json`, not another line here.
