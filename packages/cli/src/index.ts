#!/usr/bin/env node
import { main } from "./main.js";
import { processIo } from "./io.js";

const code = await main(process.argv.slice(2), processIo());
// `serve` never returns; everything else exits with its status.
process.exitCode = code;
