// The Orbis cloud (change 0068-cloud-relay, specs/cloud, ADR 0024): the Worker and its Durable Object class.
import { handle, type Env } from "./worker.js";

export { Account } from "./account.js";

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env);
  },
};
