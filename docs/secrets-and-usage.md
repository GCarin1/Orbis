# Secrets and usage

## Secrets

Bots use credentials they never see (ADR 0008,
[`specs/secrets`](../.doctrina/specs/secrets/spec.md)).

- **Vault.** Each secret belongs to one bot and has a name like
  `GITHUB_TOKEN` (`A-Z`, `0-9`, `_`). Values are encrypted with AES-256-GCM
  under a master key: `ORBIS_MASTER_KEY` (64 hex characters) or, when it is
  unset, `~/.orbis/master.key`, generated once with mode 0600. Each value is
  authenticated together with its bot and name, so a row copied elsewhere
  does not decrypt. Keep `ORBIS_MASTER_KEY` outside the data directory if
  you back that directory up.
- **Placeholders.** A bot writes `{{secret:GITHUB_TOKEN}}` in a tool input.
  The tool gateway swaps in the value at the moment the tool runs — only for
  tools that act outside Orbis (`computer.shell`, `computer.write_file`,
  `browser.open`, `browser.type`, `http.fetch`) and only from the calling
  bot's own vault. Tools that post inside Orbis (drafts, conversation posts,
  memory, handoffs) keep the placeholder as text.
- **Redaction.** Every value the bot holds is replaced with `••••` in tool
  results, run steps, replies, the bot's timeline items and approval cards.
  Redaction matches the exact value: a value transformed by a command
  (base64, reversed) is not caught.
- **Asking.** A bot that needs a credential calls
  `secret.request {"name":"GITHUB_TOKEN","reason":"open the release PR"}`.
  A 🔑 card with a masked field appears in the conversation; what you type
  goes straight to the vault (`POST /api/v1/cards/:id/secret`) and the run
  continues. **Decline** tells the bot the secret is unavailable.
- **API brains** read their key from the vault too: set
  `brain.apiKeySecret` to the secret's name.

```bash
orbis secrets set @ana GITHUB_TOKEN          # hidden prompt; or: printf %s "$TOKEN" | orbis secrets set @ana GITHUB_TOKEN
orbis secrets list @ana                      # names only
orbis secrets rm @ana GITHUB_TOKEN
```

## Usage and spend caps

Every run records input, output and cached tokens, its cost in USD and
whether a subscription covers it ([`specs/usage`](../.doctrina/specs/usage/spec.md)).

- **API brains** are priced from the table shipped in
  `packages/hub/src/brains/pricing.ts` (USD per million tokens, by model
  prefix). Add or override prices in `~/.orbis/prices.json`:

  ```json
  { "gpt-5": { "input": 1.25, "output": 10 }, "llama3.2": { "input": 0, "output": 0 } }
  ```

  A model with no price costs zero (local models).
- **Subscription CLIs** record the cost the CLI reports (Claude Code's
  `total_cost_usd`), flagged as covered by the subscription.
- **Spend caps.** A bot's `spendCapUsd` is a monthly cap (UTC calendar
  month). When the month's capped cost has reached it, the next run is
  refused, the bot turns *blocked* and an event names the cap; a run that
  crosses it stops after the current step. Subscription cost does not count
  toward the cap unless the bot sets `capIncludesSubscription`.

```bash
orbis usage                                  # this month, every bot
orbis usage @ana --from 2026-08-01 --to 2026-09-01
orbis bots edit @ana --spend-cap 20
```

In the web app, **📊 Usage** shows runs, tokens, cost, the subscription part
and each bot's cap, for this month or the last.
