// specs/hub-api — acceptance criterion 3 (OpenAI-compatible chat endpoint).
import { afterEach, describe, expect, it } from "vitest";
import { createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("OpenAI-compatible endpoint", () => {
  it("answers orbis:<handle> in the chat completion shape and posts to the bot's conversation (criterion 3)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const models = await t.api("GET", "/v1/models");
    expect(models.body).toMatchObject({ object: "list", data: [{ id: "orbis:ana", object: "model", owned_by: "orbis" }] });

    const res = await t.api("POST", "/v1/chat/completions", {
      model: "orbis:ana",
      messages: [
        { role: "system", content: "ignored: the bot has its own identity" },
        { role: "user", content: [{ type: "text", text: "status of the release?" }] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      object: "chat.completion",
      model: "orbis:ana",
      choices: [{ index: 0, message: { role: "assistant", content: "[Ana] status of the release?" }, finish_reason: "stop" }],
    });
    expect(res.body.id).toMatch(/^chatcmpl-/);
    expect(res.body.usage.total_tokens).toBe(res.body.usage.prompt_tokens + res.body.usage.completion_tokens);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const items = (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body;
    expect(items.map((i: { text: string }) => i.text)).toEqual(["status of the release?", "[Ana] status of the release?"]);
  });

  it("streams server-sent chunks ending in [DONE] (criterion 3)", async () => {
    t = await testHub();
    await createBot(t);
    const url = await t.hub.listen();
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "orbis:ana", stream: true, messages: [{ role: "user", content: "stream it" }] }),
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const events = text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6));
    expect(events.at(-1)).toBe("[DONE]");
    const chunks = events.slice(0, -1).map((e) => JSON.parse(e));
    expect(chunks.every((c) => c.object === "chat.completion.chunk")).toBe(true);
    expect(chunks.map((c) => c.choices[0].delta.content ?? "").join("")).toBe("[Ana] stream it");
    expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
  });

  it("answers 404 for an unknown model and 502 when the run fails", async () => {
    t = await testHub();
    await createBot(t);
    const missing = await t.api("POST", "/v1/chat/completions", { model: "gpt-4o", messages: [{ role: "user", content: "x" }] });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("model_not_found");
    const failed = await t.api("POST", "/v1/chat/completions", { model: "orbis:ana", messages: [{ role: "user", content: "/fail nope" }] });
    expect(failed.status).toBe(502);
    expect(failed.body.error.message).toMatch(/failed: nope/);
  });
});
