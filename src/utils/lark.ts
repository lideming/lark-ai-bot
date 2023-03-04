import * as lark from "npm:@larksuiteoapi/node-sdk";
import { Middleware } from "../dep.ts";

export { lark };

export function createEventHandler(options: { verificationToken: string }) {
  const eventDispatcher = new lark.EventDispatcher({
    verificationToken: options.verificationToken,
  });

  const eventHandler: Middleware = async (ctx, _next) => {
    const { request } = ctx;

    const data = {
      headers: request.headers,
      ...(await ctx.request.body({ type: "json" }).value),
    };

    if (data["challenge"]) {
      ctx.response.type = "json";
      ctx.response.body = { challenge: data["challenge"] };
      return;
    }

    // no await
    eventDispatcher
      .invoke(data)
      .catch((e) => console.error("error in event handler", e));

    ctx.response.type = "json";
    ctx.response.body = {};
  };

  return { eventHandler, eventDispatcher };
}
