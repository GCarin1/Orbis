# Bot templates

A template is a shareable copy of a bot as one YAML file you can keep in Git
([`specs/templates`](../.doctrina/specs/templates/spec.md)).

```yaml
# Orbis bot template — share it, commit it; it holds no memory, history or secrets.
apiVersion: orbis/v1
kind: BotTemplate
metadata:
  name: Ana
  role: QA
  description: |
    You are the QA analyst. Never send anything without my approval.
  avatarColor: "#0ea5e9"
spec:
  brain: { kind: claude-code }
  policy:
    rules: [{ tool: computer.shell, decision: ask, locked: true }]
    grants: []
  computer: { enabled: true, hibernateAfterMin: 30 }
  tools: ["*"]
  skills: ["release-*"]            # which account skills the bot is offered
  ownSkills:                        # the bot's own skills, as SKILL.md text
    - |
      ---
      name: triage
      description: Triage a bug report
      ---
      1. Reproduce. 2. Label. 3. Summarise.
  spendCapUsd: 20
  capIncludesSubscription: false
  routines:
    - { name: Daily QA, trigger: { type: cron, cron: "0 9 * * 1-5", timezone: America/Sao_Paulo }, instruction: Run the smoke checklist }
```

- **What never leaves:** memory, conversation history, the computer's files
  and browser profile, secrets (values and names — `apiKeySecret` is
  dropped), API keys.
- **Secret scan.** Before an export is written, the whole document is
  scanned for private key blocks, AWS access keys, GitHub, Slack and `sk-`
  tokens and literal `password`/`token`/`secret`/`api_key` assignments of 12
  or more characters. Any finding refuses the export (HTTP 422), naming each
  line and kind — never the value. Use `{{secret:NAME}}` placeholders in
  descriptions and instructions instead; they are not findings.
- **Import** creates a new bot (a fresh handle such as `@ana-2` when the name
  is taken), its own skills, and its routines — **disabled** until you test
  and enable them. A document with another `apiVersion` or `kind`, or an
  invalid skill, brain or routine, is rejected naming the field, and nothing
  is created.

```bash
orbis bots export @ana --out ana.orbis.yaml
orbis bots import ana.orbis.yaml
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/export
```

In the web app, **⚙ Settings** in a bot's conversation edits its identity,
description, brain, tool policy (rules and "always allow" grants), computer,
tool and skill allowlists and spend cap, and has **Export template**,
**Duplicate** and **Delete**; **+ New bot** imports a template file.
