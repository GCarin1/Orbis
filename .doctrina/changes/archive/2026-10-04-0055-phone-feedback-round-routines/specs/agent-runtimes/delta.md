# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement unwanted: The system shall not let Claude Code schedule work with its own schedulers (`RemoteTrigger`, `CronCreate`, `CronDelete`, `CronList`, `ScheduleWakeup`): every `claude-code` run denies them with `--disallowedTools`, so a bot schedules work as Orbis routines the user sees, tests and stops.
append-criterion [verified] The claude-code argv denies Claude Code's own schedulers with `--disallowedTools`, and a flag, never the prompt, follows that list — verified by `packages/hub/test/runtimes/claude-code.test.ts`
```
