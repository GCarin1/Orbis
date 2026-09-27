# Design — Change 0009-templates-and-settings

## Approach

A `TemplateService` builds a plain object and serializes it with the
`yaml` package:

```yaml
apiVersion: orbis/v1
kind: BotTemplate
metadata: { name, role, description, avatarColor }
spec:
  brain: { kind, model?, baseUrl?, command?, args?, maxSteps?, timeoutSec? }  # no apiKeySecret
  policy: { rules, grants }
  computer: { enabled, provider?, image?, cpus?, memoryMb?, hibernateAfterMin? }
  tools: [...]            # allowlist globs
  skills: [...]           # account skill allowlist globs
  ownSkills: [ "<SKILL.md text>", ... ]
  spendCapUsd, capIncludesSubscription
  routines: [ { name, trigger, instruction, approval } ]
```

Only an allowlist of fields is copied, so memory, history, computer state,
browser profiles and secrets cannot slip in. Before returning the text, a
scanner runs line by line with the patterns the spec names and throws with
every finding (line number and kind, never the matched value); the route
answers 422 `secrets_found`. `{{secret:NAME}}` placeholders are not
findings.

Import parses the YAML, checks `apiVersion` and `kind` (400 naming the
field), then creates the bot through the bot service (a fresh handle when
the name is taken), saves each skill at the bot's scope and creates each
routine through the routine service, which always starts disabled and
posts its card.

The web settings panel edits the bot through `PATCH /bots/:id`: identity,
description, brain, a rule list for the policy, computer settings, the
allowlists as comma-separated globs, and the spend cap. Export downloads
the YAML; the new-bot dialog imports a file.

## Alternatives considered

1. JSON templates — rejected: the spec asks for YAML that lives in Git and
   reads well in review.
2. Scanning only string fields — rejected: a credential in any field (a
   rule name, a routine instruction) must be caught; the whole document is
   scanned.

## Trade-offs and risks

- The generic assignment pattern can flag an innocent long word after
  `token:`; the finding names the line so the user can rephrase it.

## Decisions to record as ADRs

- None.
