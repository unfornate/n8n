import nock from "nock";
import { beforeAll, describe, expect, it } from "vitest";

let TelegramServiceClass: typeof import("../src/services/telegram.js").TelegramService;
let AppErrorClass: typeof import("../src/utils/errors.js").AppError;

beforeAll(async () => {
  const serviceModule = await import("../src/services/telegram.js");
  TelegramServiceClass = serviceModule.TelegramService;
  const errorModule = await import("../src/utils/errors.js");
  AppErrorClass = errorModule.AppError;
});

const createService = (allowedChatIds: string[] = []) =>
  new TelegramServiceClass({
    token: "TEST_TOKEN",
    allowedChatIds: new Set(allowedChatIds),
    timeoutMs: 15_000,
    maxRetries: 0,
    rateLimitPerSecond: 25,
    maxDocumentBytes: 1024 * 1024
  });

describe("Telegram service", () => {
  it("sends messages with sanitized defaults", async () => {
    const service = createService();
    const scope = nock("https://api.telegram.org")
      .post("/botTEST_TOKEN/sendMessage", (body) => {
        expect(body).toMatchObject({
          chat_id: "123",
          parse_mode: "HTML",
          disable_web_page_preview: true,
          disable_notification: false
        });
        return true;
      })
      .reply(200, {
        ok: true,
        result: {
          message_id: 42,
          date: 123,
          chat: { id: 123, type: "private" }
        }
      });

    const result = await service.sendMessage(
      { chat_id: "123", text: "Hello" },
      { requestId: "test" }
    );

    expect(result.message_id).toBe(42);
    scope.done();
  });

  it("resolves usernames through getChat before sending", async () => {
    const service = createService(["42"]);

    const scope = nock("https://api.telegram.org")
      .post("/botTEST_TOKEN/getChat", (body) => {
        expect(body).toMatchObject({ chat_id: "@channel" });
        return true;
      })
      .reply(200, {
        ok: true,
        result: { id: 42, type: "channel", title: "Test" }
      })
      .post("/botTEST_TOKEN/sendMessage", (body) => {
        expect(body.chat_id).toBe(42);
        return true;
      })
      .reply(200, {
        ok: true,
        result: {
          message_id: 7,
          date: 999,
          chat: { id: 42, type: "channel" }
        }
      });

    const result = await service.sendMessage(
      { chat_id: "@channel", text: "Test" },
      { requestId: "chain" }
    );

    expect(result.chat.id).toBe(42);
    scope.done();
  });

  it("rejects messages to disallowed chats", async () => {
    const service = createService(["1"]);

    await expect(
      service.sendMessage({ chat_id: "2", text: "Nope" }, { requestId: "denied" })
    ).rejects.toBeInstanceOf(AppErrorClass);
  });
});
