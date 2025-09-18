import nock from "nock";
import { beforeAll, describe, expect, it } from "vitest";
import {
  getUpdatesSchema,
  sendDocumentSchema,
  sendMessageSchema
} from "../src/mcp/schemas.js";

let TelegramServiceClass: typeof import("../src/services/telegram.js").TelegramService;

beforeAll(async () => {
  const serviceModule = await import("../src/services/telegram.js");
  TelegramServiceClass = serviceModule.TelegramService;
});

const createService = () =>
  new TelegramServiceClass({
    token: "TEST_TOKEN",
    allowedChatIds: new Set(["42"]),
    timeoutMs: 15_000,
    maxRetries: 0,
    rateLimitPerSecond: 25,
    maxDocumentBytes: 1024 * 1024
  });

describe("Schemas", () => {
  it("fills defaults for sendMessage", () => {
    const parsed = sendMessageSchema.parse({ chat_id: "1", text: "ping" });
    expect(parsed.parse_mode).toBe("HTML");
    expect(parsed.disable_web_page_preview).toBe(true);
    expect(parsed.disable_notification).toBe(false);
  });

  it("limits getUpdates payload", () => {
    const parsed = getUpdatesSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.timeout).toBe(0);
  });

  it("accepts default filename for documents", () => {
    const parsed = sendDocumentSchema.parse({ chat_id: "1", file: "data:text/plain;base64,aGVsbG8=" });
    expect(parsed.filename).toBe("document.pdf");
  });
});

describe("Tool flow", () => {
  it("resolves chat then sends message", async () => {
    const service = createService();

    const scope = nock("https://api.telegram.org")
      .post("/botTEST_TOKEN/getChat")
      .reply(200, {
        ok: true,
        result: { id: 42, type: "channel", title: "News" }
      })
      .post("/botTEST_TOKEN/sendMessage")
      .reply(200, {
        ok: true,
        result: {
          message_id: 11,
          date: 1000,
          chat: { id: 42, type: "channel" }
        }
      });

    const chat = await service.getChat("@news", { requestId: "flow" });
    expect(chat.id).toBe(42);

    const message = await service.sendMessage({ chat_id: chat.id.toString(), text: "Flow" }, { requestId: "flow" });
    expect(message.message_id).toBe(11);
    scope.done();
  });
});
