# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement optional: Where a `chat-http` bot has plain chat on, the system shall send only the conversation — the bot's name, role and description, its memories and the messages — without Orbis's instructions and tool list, and shall offer that bot no tools.
append-requirement event: When a firewall blocks a `chat-http` message, the system shall say that a firewall reading the message takes Orbis's tool instructions for an attack, and point to the connection test and to plain chat.
append-requirement ubiquitous: The system shall accept a `chat-http` curl program whose file name is curl or curl.exe in any letter case.
append-criterion [verified] A firewall that reads the message blocks Orbis's instructions with an error that points to plain chat, and lets a plain chat through carrying the bot's name, role and description and none of the instructions, tools, shell, placeholder or tag; a plain chat that is still blocked is told so; `C:\\WINDOWS\\system32\\curl.EXE` is accepted and a program not named curl is not — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
