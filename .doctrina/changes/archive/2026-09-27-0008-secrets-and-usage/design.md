# Design — Change 0008-secrets-and-usage

## Approach

**Vault.** One 32-byte key: ORBIS_MASTER_KEY (64 hex characters) or a
random key generated once into `<data>/master.key` with mode 0600. Each
value is encrypted with AES-256-GCM under a fresh 12-byte IV, with
`<botId>\0<name>` as additional authenticated data, and stored as
`base64(iv | tag | ciphertext)` in the existing `secrets` table. Binding
the bot and the name means a row copied to another bot or name no longer
decrypts. The vault registers itself as the engine's secret resolver, so an
API brain's `apiKeySecret` keeps working.

**Placeholders (ADR 0008).** Tool definitions opt in with `secrets: true`.
After the allowlist, the schema and the policy gate — so an approval card
shows the placeholder, never the value — the gateway replaces
`{{secret:NAME}}` in every string of the input with the calling bot's
value; an unknown name fails the call with a hint to use `secret.request`.
The tool's output is then redacted: every value the bot holds (and the
values it just used) becomes `••••`. The engine also redacts step texts,
tool inputs and outputs, and the reply with the bot's values before they
are stored or published, and the timeline redacts items a bot authors —
defence in depth for a CLI brain that reads a value back from a file.

**secret.request.** The tool posts a `secret-request` card (`pending`,
data: name, reason), marks the run waiting and awaits the card's answer.
`POST /cards/:itemId/secret` with `{ value }` stores the value and sets the
card `fulfilled`; `{ decline: true }` sets it `declined`. The value never
enters the card, the response or an event. A run that ends first sets the
card `expired`.

**Usage.** Aggregates come from the `runs` table (tokens, cost,
subscription flag) grouped by bot for `[from, to)`, the current UTC month by
default. Capped cost = cost of runs not covered by a subscription, plus
subscription runs when `capIncludesSubscription`. A `beforeStart` hook
refuses a run once month-to-date capped cost reaches the cap (the engine
fails it, the bot turns `blocked`, the event names the cap); an
`afterUsage` hook stops a run as soon as its usage takes the month over the
cap. `<data>/prices.json` (`{ "model-prefix": { "input": …, "output": … } }`,
USD per million tokens) overrides and extends the shipped table.

## Alternatives considered

1. One vault key per bot — rejected: nothing to protect it with but the
   master key anyway; bound data gives the per-bot separation.
2. Resolving placeholders for every tool — rejected: a draft or a
   conversation post would carry the value into the timeline.
3. Metering in a separate usage table — rejected: runs already carry the
   numbers; one source of truth.

## Trade-offs and risks

- Redaction is by exact value: a value transformed by a command (base64,
  reversed) is not caught. Documented.
- The generated `master.key` sits next to the database: a copy of the whole
  data directory carries both. ORBIS_MASTER_KEY keeps them apart.

## Decisions to record as ADRs

- None new: ADR 0008 decides placeholders and gateway-only resolution; this
  change lands it.
