import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

let app: typeof import("../src/index.js").app;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const module = await import("../src/index.js");
  app = module.app;
  server = app.listen(0);
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("SSE transport", () => {
  it("establishes session and returns tool response", async () => {
    const response = await fetch(`${baseUrl}/sse?sessionId=test-client`, {
      headers: { Accept: "text/event-stream" }
    });

    expect(response.ok).toBe(true);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const decoder = new TextDecoder();
    let buffer = "";

    let resolveEndpoint: ((value: string) => void) | undefined;
    const endpointPromise = new Promise<string>((resolve) => {
      resolveEndpoint = resolve;
    });

    let resolveMessage: ((value: any) => void) | undefined;
    const messagePromise = new Promise<any>((resolve) => {
      resolveMessage = resolve;
    });

    const parseChunk = (chunk: string) => {
      buffer += chunk;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const separatorIndex = buffer.indexOf("\n\n");
        if (separatorIndex === -1) {
          break;
        }
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        if (!rawEvent.trim()) {
          continue;
        }

        let eventType = "message";
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        const payload = dataLines.join("\n");
        if (eventType === "endpoint" && resolveEndpoint) {
          resolveEndpoint(payload);
          resolveEndpoint = undefined;
        } else if (eventType === "message" && resolveMessage) {
          try {
            resolveMessage(JSON.parse(payload));
          } catch {
            resolveMessage({ raw: payload });
          }
          resolveMessage = undefined;
        }
      }
    };

    const readLoop = async () => {
      if (!reader) {
        return;
      }
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done || !value) {
          break;
        }
        parseChunk(decoder.decode(value, { stream: true }));
      }
    };

    const loopPromise = readLoop();
    const endpointPath = await endpointPromise;

    const callResponse = await fetch(`${baseUrl}${endpointPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "tools/call",
        params: { name: "system.health", arguments: {} }
      })
    });

    expect(callResponse.status).toBe(202);

    const message = await messagePromise;
    expect(message.id).toBe("1");
    expect(message.result).toBeDefined();
    const [content] = message.result.content;
    expect(content.type).toBe("text");
    const payload = JSON.parse(content.text);
    expect(payload.ok).toBe(true);

    await reader?.cancel();
    await loopPromise;
  });
});
