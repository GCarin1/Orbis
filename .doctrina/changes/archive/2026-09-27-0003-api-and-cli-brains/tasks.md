# Tasks — Change 0003-api-and-cli-brains

- [x] Price table and cost computation per model.
- [x] Message history mapping (user, you, other bots) shared by API brains.
- [x] anthropic brain on the SDK: streaming loop, thinking, tools, stop reasons, fallbacks, usage; test against a fake SSE server.
- [x] openai brain: streaming Chat Completions with function calling; test against a fake server.
- [x] codex brain: argv, JSONL mapping, thread resume; gemini-cli brain: settings file, stream-json and json fallback; tests with fake executables.
- [x] Runtimes health check route and `orbis runtimes check`; test.
- [x] OpenAI-compatible `/v1/models` and `/v1/chat/completions` (non-stream and SSE); test.
- [x] Docs, CHANGELOG, contract updates; land ADR 0003.
