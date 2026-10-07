# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The system shall keep each file sent in a conversation — by the user, or by a bot that made it — with its name, type, size, author and message, its bytes in the data directory and never in the database, and list a conversation's files newest first.
append-requirement ubiquitous: The system shall accept files of up to 25 MB and up to 10 files per message, take a name without folders or control characters, and take the file's type from the upload or else from its name.
append-requirement ubiquitous: The system shall serve a file's content to a request with the hub's token in its header or its address, showing images, audio, video, PDF and plain text in place and sending every other type as a download, always with a sandboxing content security policy and `nosniff`.
append-requirement event: When the user sends a message carrying files, the system shall copy them into the workspace of each bot it wakes, under `orbis-files/`, and tell each bot their names, kinds, sizes and paths, with the text of the text files up to 20,000 bytes as untrusted content.
append-requirement event: When a bot calls `files.send` with a file of its workspace, the system shall post it in the run's conversation as a message of that bot with the caption it gave.
append-requirement event: When a bot calls `files.list` or `files.get`, the system shall list the conversation's files or copy the one named (by id or name) into the bot's workspace.
append-requirement event: When a conversation is cleared or deleted, or an upload stays unsent for a day, the system shall delete its files and their bytes.
append-requirement unwanted: The system shall not accept as an attachment a file of another conversation or one already sent, nor send with `files.send` a file outside the bot's workspace.
append-criterion [verified] An uploaded JSON stays the bytes it is; files sent with no text reach the bot's workspace and its task (the text of a small text file as untrusted content), are listed and named in the message; a message of files alone shows them in the list of chats; another conversation's file, one already sent, an empty one and one over 25 MB are refused; images show in place, a page is downloaded and never runs, the token works in the address only for a file's content; a bot sends a file of its workspace with its caption, is refused one outside it or missing, lists the files and copies one back; a day-old unsent upload and a cleared conversation's files are deleted — verified by `packages/hub/test/files.test.ts`
```
