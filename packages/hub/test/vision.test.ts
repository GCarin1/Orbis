// specs/agent-runtimes — brains that see (change 0081-vision): the images the user sends with a message reach
// the Anthropic and OpenAI brains as images, a few and not too large; a local server's model and the CLI
// brains keep the files' paths.
import { afterEach, describe, expect, it } from "vitest";
import type { BrainContext, BrainInput } from "../src/brains/types.js";
import { buildAnthropicRequest } from "../src/brains/anthropic.js";
import { chatMessages } from "../src/brains/openai.js";
import { MAX_IMAGES } from "../src/files/service.js";
import { createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const input = (images: BrainInput["images"]) =>
  ({
    runId: "r",
    bot: { name: "Ana", handle: "ana", brain: { kind: "anthropic", model: "claude-sonnet-5" } },
    conversationId: null,
    task: "O que tem na foto?",
    skill: null,
    images,
    context: { identity: "You are Ana", memories: [], history: [{ role: "user", author: "user", text: "oi" }, { role: "assistant", author: "ana", text: "olá" }] },
  }) as unknown as BrainInput;
const ctx = { tools: { list: () => [], call: async () => ({ output: "", isError: false }) } } as unknown as BrainContext;
const image = { name: "praia.png", mime: "image/png", data: PNG.toString("base64") };

describe("images for brains that see", () => {
  it("are the message's images, a few, not too large, never another kind of file", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Ana" });
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const upload = async (name: string, type: string, body: Buffer) =>
      JSON.parse(
        (
          await t!.hub.app.inject({
            method: "POST",
            url: `/api/v1/conversations/${conv.id}/files`,
            headers: { authorization: `Bearer ${TOKEN}`, "x-file-name": name, "content-type": type },
            payload: body,
          })
        ).body,
      ).id as string;
    const ids = [
      ...(await Promise.all(Array.from({ length: MAX_IMAGES + 1 }, (_, i) => upload(`f${i}.png`, "image/png", PNG)))),
      await upload("logo.svg", "image/svg+xml", Buffer.from("<svg/>")),
      await upload("nota.txt", "text/plain", Buffer.from("oi")),
    ];
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "veja", attachments: ids.slice(0, 8) });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    const images = t.hub.files.imagesFor(run);
    expect(images).toHaveLength(MAX_IMAGES);
    expect(images[0]).toEqual({ name: "f0.png", mime: "image/png", data: PNG.toString("base64") });
    // A run not started by a message has none.
    expect(t.hub.files.imagesFor({ ...run, trigger: { type: "routine", ref: null } })).toEqual([]);
  });

  it("go to Anthropic with the message of the moment, before its text", () => {
    const req = buildAnthropicRequest(input([image]), ctx);
    expect(req.messages[0]).toEqual({ role: "user", content: "oi" });
    expect(req.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: image.data } },
        { type: "text", text: "O que tem na foto?" },
      ],
    });
    expect(buildAnthropicRequest(input([]), ctx).messages.at(-1)).toEqual({ role: "user", content: "O que tem na foto?" });
  });

  it("go to a remote OpenAI-compatible model as data URLs, and not to a local one", () => {
    expect(chatMessages(input([image]), true).at(-1)).toEqual({
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/png;base64,${image.data}` } },
        { type: "text", text: "O que tem na foto?" },
      ],
    });
    expect(chatMessages(input([image]), false).at(-1)).toEqual({ role: "user", content: "O que tem na foto?" });
  });
});
