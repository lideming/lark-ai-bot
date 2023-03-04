import { Middleware } from "../dep.ts";

export const loggingMiddleware: Middleware = async (ctx, next) => {
  const begin = Date.now();
  await next();
  const req = ctx.request;
  console.info(
    `[REQ] ${
      new Date().toLocaleString("sv")
    } | ${ctx.response.status} | ${req.method} ${req.url.toString()} | ${req.ip} | (${
      Date.now() - begin
    } ms)`,
  );
};
