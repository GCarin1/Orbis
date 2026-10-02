# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement event: When the event stream has not answered a ping within 10 seconds (sent every 25 seconds, when the network comes back and when the app is shown again), the web app shall close it, connect again and reload what it may have missed.
append-requirement event: When the hub refuses an answer to an approval or a draft, the web app shall say why on the card and show the approval as the hub has it now.
append-requirement ubiquitous: The approvals inbox shall say what each approval would do (the command, file, address or recipient) and open the conversation the approval waits in, a group included.
append-requirement ubiquitous: The web app shall show the conversation list's last message and read replies aloud without Markdown marks.
append-criterion [verified] A stream that stops answering its ping is closed and replaced and the app reloads; a refused approval answer shows the hub's reason and the expired state; the inbox shows "npm run build" for a Claude Bash approval and opens its conversation; Markdown marks are dropped from a preview — verified by `packages/web/test/audit-cycle2.test.tsx`.
```
