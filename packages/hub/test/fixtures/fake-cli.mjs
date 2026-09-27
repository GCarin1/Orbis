#!/usr/bin/env node
// A stand-in for any command used as a custom-cli brain: it reads the prompt
// from its first argument or from stdin and prints a reply.
import { writeFileSync } from "node:fs";

writeFileSync("fake-cli-env.json", JSON.stringify(process.env));
const fromArg = process.argv[2];
const read = async () => {
  if (fromArg !== undefined) return fromArg;
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
};
const prompt = await read();
if (prompt.includes("SILENT")) process.exit(0);
if (prompt.includes("CRASH")) {
  process.stderr.write("segfault in brain\n");
  process.exit(2);
}
const task = prompt.split("Task:\n").pop();
process.stdout.write(`custom reply (${fromArg !== undefined ? "arg" : "stdin"}): ${task}\n`);
