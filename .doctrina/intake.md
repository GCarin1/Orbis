# Intake — Orbis

- **Status:** converted
- **Date:** 2026-09-27
- **Source:** ../../../tmp/claude-0/-home-user-Orbis/23bb4a79-d27f-5121-aa33-e707ef06f349/scratchpad/intake.md

<!-- Raw project intent, stored verbatim. The bootstrap playbook
     (doctrina intake) converts it into product.md and capability
     specs. Close it with `doctrina intake --converted`; after that the
     specs are the only source of truth; never edit this file to
     change requirements. -->

---

Orbis is a self-hosted, open-source platform of persistent AI bots — durable AI colleagues with a name, a role, their own memory and their own computer (browser, terminal and files) — that work end to end, collaborate with each other and ask for approval before risky actions; users reach them through a web app, a desktop app, a CLI and an HTTP API, and each bot's "brain" runs either on a paid model API or, with no API key at all, on an agent CLI the user already pays for through a subscription (Claude Code, Codex, Gemini CLI and similar).

## Request (from the project owner, verbatim, pt-BR)

Hoje o Grok Bot é essencialmente um sistema de agentes persistentes: cada bot tem identidade, função,
memória/contexto, computador próprio, navegador, terminal e pode executar tarefas de ponta a ponta. A xAI
também permite que bots cooperem entre si.

A ideia aqui é criar um clone/versão opensource com as mesmas capacidades, contando que tenha opção de se
comunicar de forma de API e de forma cli sem usar a api apenas pelo modo agent sem ter necessidade de uso de
APIs pagas se você já paga uma assinatura, não precisa utilizar python por ser algo que uso com frequência
utilize o que for mais eficiente para o trabalho, quero modo app e modo web, a única exigência é utilize o
Doctrina framework para sdd e utilize ele com rigorosidade.

## Owner's research (summary of "Grok Bot — pesquisa para a versão open source", 2026-09-27)

What the reference product is: persistent bots with name, label, description (durable rules such as "never
send without approval") and avatar. They work on a persistent cloud computer with browser, files and terminal,
talk to each other, learn by demonstration and run routines. The product is organised around bots, not around
conversations; the vocabulary is five primitives: Bots, Chats, Prompts (used once, saved as skills or fired as
routines), Tools and Artifacts.

Feature catalogue to reach parity with:
- Persistent bots: name, label, description, avatar; pin, hide, duplicate; about 50 per account.
- Rich chat: text, links, images, attachments; dictation, live voice and bot voice memos.
- Groups: 2 to 6 bots in one conversation, @mention and @everyone, threaded replies, reactions.
- Handoff: asynchronous message from one bot to another; the receiver wakes, works and answers later; the
  handoff is visible in the conversation.
- Draft before send: editable email/Slack card with Send and Discard.
- Computer: browser, terminal and /workspace; one screen per bot; live preview in three levels (status icon,
  side panel, full screen) and user takeover for passwords, 2FA or CAPTCHA.
- Connectors: MCP plugins; OAuth tokens stay in the backend, never on the computer.
- Skills: private library of reusable procedures invoked with "/".
- Teach a task: record up to 10 minutes of browser navigation and turn it into a draft skill.
- Routines: schedule or event (Slack, GitHub, Linear, webhooks); test before enabling; up to 50 per bot; keep
  the last 20 runs; pause after a long absence.
- Approvals and auto review: allow once, always, or deny; an independent reviewer model judges risky actions;
  deterministic "ask before" rules always win.
- Secrets: masked secret request outside the transcript and outside the model.
- Execution on the user's own machine with per-command approval.
- Delegation of coding tasks to coding agents.
- Templates: shareable copy of a bot (identity, description, skills, routines — never computer, logins or
  history).
- Administration: SSO, SCIM, audit log, OpenTelemetry (enterprise).
- Structured replies: cards and widgets inside the conversation (draft, approval, routine created, group
  summary); events (routine created, settings changed, bot-to-bot messages) appear in the same history.
- State of each bot shown to the user: idle, thinking, working, waiting, blocked, done; progress as a
  collapsible list of steps fed by normalized events.
- Coordination: a "chief of staff" lead bot coordinates specialists.
- Architecture rule: capabilities (tools and skills) belong to the account, context (memory and routines)
  belongs to the bot.

Where the open-source version must beat the reference (gaps its own documentation admits):
- Isolation: the reference shares one computer, files and logins across all bots of an account. Orbis gives
  each bot its own sandbox, browser profile and credential vault; one bot failing does not stop the others.
- Model choice: the reference has no model picker and no bring-your-own-key. Orbis lets each bot pick its
  runtime and model, including local models and subscription-backed agent CLIs.
- Data control: the reference is cloud-only. Orbis is self-hosted by default with a local mode.
- Per-bot tool policy and per-bot spend cap with a visible usage meter (the reference has opaque quotas).
- Deleting a bot destroys its sandbox, browser profile and secrets (the reference needs six manual steps).
- Deterministic rules always beat the model reviewer.

Parity roadmap from the research (phase 1 = MVP, 4 = parity): phase 1 — persistent bots, per-bot memory, chat
and groups, handoff, drafts, connectors with tokens outside the computer, execution on the user's machine,
delegation to coding agents, usage and spend caps; phase 2 — persistent computer per bot (browser, terminal,
volume), three-level screen, takeover, masked secrets, skills, routines; phase 3 — mobile with push, voice,
auto review, templates and marketplace; phase 4 — teach a task, network through the desktop, X integration,
administration (OIDC, SCIM, audit, OpenTelemetry).

Proposed per-bot configuration fields from the research (role file):

    spec:
      computer:
        enabled: true
        runtime: gvisor              # docker | gvisor | firecracker
        image: orbis/desktop:1.0     # Xvfb + Chromium + tools
        resources: { cpu: 2, memory: 4Gi, disk: 10Gi }
        egress: { mode: allowlist, domains: [github.com, "*.atlassian.net"] }
        hibernate_after: 30m
      routines:
        - name: daily-report
          schedule: "0 8 * * 1-5"
          timezone: America/Sao_Paulo
          instruction: Run the qa-report skill and post in the qa channel. No data, say so, never invent.
          approval: draft_only

Risks and constraints from the research: never use the reference product's name, logo, texts or visual
identity; do not import third-party marketplace templates; bots hand CAPTCHAs and verifications to the user and
never try to bypass them; Firecracker needs KVM, so Docker/gVisor are the fallbacks on common machines; the
cost of one desktop per bot is contained by mandatory hibernation and per-bot resource caps; personal data in
sandboxes (LGPD) is handled by configurable retention, real deletion and self-hosting by default; the UI ships
in pt-BR and English.

## Delivery constraints

- Language and stack: free choice of the most efficient stack for the job (the owner does not require Python).
- Clients: a web mode and an app (desktop) mode, plus a CLI and an HTTP API.
- Brains: an API mode (Anthropic, OpenAI-compatible endpoints including local Ollama) and a subscription/CLI
  agent mode that drives already-paid agent CLIs with no API key.
- Process: spec-driven development with the Doctrina framework, used rigorously (every behaviour change goes
  through a Doctrina change and closes through `doctrina close`).
