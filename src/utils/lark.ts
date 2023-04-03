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

export async function uploadFile(
  larkClient: lark.Client,
  options: {
    file_type: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
    file_name: string;
    duration?: number | undefined;
    file: string | Blob;
  },
) {
  const token = await larkClient.tokenManager.getTenantAccessToken();
  const form = new FormData();
  form.append("file_type", options.file_type);
  form.append("file_name", options.file_name);
  if (options.duration !== undefined) {
    form.append("duration", String(options.duration));
  }
  form.append(
    "file",
    options.file instanceof Blob ? options.file : new Blob([options.file]),
  );
  const resp = await fetch(
    "https://open.feishu.cn/open-apis/im/v1/files",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
      body: form,
    },
  );
  const json = await resp.json();
  if (json.code) {
    throw new Error("File upload error: " + JSON.stringify(json));
  }
  return json.data.file_key as string;
}
