export async function getCompletion(
  options: {
    apiKey: string;
    messages: Message[];
  },
) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + options.apiKey,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: options.messages,
    }),
  });
  const data = await resp.json();
  const text = data.choices[0].message.content;
  return text;
}

import { TextLineStream } from "https://deno.land/std@0.178.0/streams/text_line_stream.ts";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function getCompletionDelta(
  options: {
    apiKey: string;
    messages: Message[];
    onDelta: (delta: string) => void;
    onFinished?: (reason: string) => void;
  },
) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + options.apiKey,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: options.messages,
      stream: true,
    }),
  });

  if (!resp.ok) {
    const json = await resp.json();
    if (json.error) {
      throw new Error(`API error ${json.error.code}`);
    } else {
      console.error(json);
      throw new Error(`Unknown API response`);
    }
  }

  for await (const json of readStreamAsEvents(resp.body!)) {
    const { delta, finish_reason } = json.choices[0];
    const { content, role } = delta;
    if (finish_reason) {
      options.onFinished?.(finish_reason);
      break;
    }
    if (content) {
      options.onDelta(content);
    } else if (role) {
      // noop
    } else {
      console.warn("no delta content", json);
    }
  }
}

async function* readStreamAsEvents(stream: ReadableStream<Uint8Array>) {
  for await (const text of readStreamAsTextLines(stream)) {
    if (!text) continue;
    if (text === "data: [DONE]") break;
    if (!text.startsWith("data: ")) throw new Error("broken text: " + text);
    const json = JSON.parse(text.slice(6));
    yield json;
  }
}

async function* readStreamAsTextLines(stream: ReadableStream<Uint8Array>) {
  const linesReader = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream())
    .getReader();
  while (true) {
    const { value, done } = await linesReader.read();
    if (done) break;
    yield value;
  }
}
