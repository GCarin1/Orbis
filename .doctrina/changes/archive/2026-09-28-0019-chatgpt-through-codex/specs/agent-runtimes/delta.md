# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement event: When the user asks from the settings screen, the system shall install the Codex CLI with `npm install -g @openai/codex@latest`, start its sign-in with the user's ChatGPT account — `codex login` in the browser of the hub's machine, or `codex login --device-auth` with a link and a one-time code for any device — report the link and the code as Codex prints them, report the account from `codex login status`, cancel a sign-in, and sign out with `codex logout`.
append-requirement unwanted: The system shall not read, store or relay the ChatGPT password or tokens (Codex keeps them), nor drive the chatgpt.com website.
append-criterion [verified] With fake `npm` and `codex` executables, the hub reports Codex missing, installs it, starts a device sign-in whose link and code it reports, then the ChatGPT account, signs out, gives the browser sign-in link and reports a cancelled sign-in; the parsers read the output the real Codex CLI prints — verified by `packages/hub/test/runtimes/codex-account.test.ts`.
```
